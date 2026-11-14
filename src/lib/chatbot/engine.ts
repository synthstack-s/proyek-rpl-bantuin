/**
 * CHATBOT+ ENGINE: AI DATABASE ASSISTANT
 * 
 * Otak utama AI Database Assistant BANTUIN:
 * 1. Filter Topik & Keamanan Darurat (guard.ts)
 * 2. Pemahaman Konteks & Resolusi Entitas Sesi (context-manager.ts)
 * 3. Otorisasi Akses Data Aktual Berbasis Peran (data-service.ts)
 * 4. Modular Prompt Builder untuk Google Gemini API (prompt-builder.ts)
 * 5. Rekomendasi Pertanyaan Dinamis Berbasis Peran (suggested-prompts.ts)
 * 6. Eksekusi Tindakan Operasional Terkontrol (action-service.ts)
 * 7. Intelligent Database Expert System Fallback jika Gemini API offline/terkendala kuota.
 */

import {
  ChatUserContext,
  ConsultationSession,
  DiagnosisCard,
  QuickSuggestion,
  ChatMessageMetadata,
} from './types';
import { validateTopicAndSafety, getStandardRefusalMessage } from './guard';
import * as DataService from './data-service';
import * as ActionService from './action-service';
import {
  resolveConversationContext,
  updateSessionMemory,
  getPendingTechnicianAction,
  setPendingTechnicianAction,
  clearPendingTechnicianAction,
  setPendingMemorySearchConfirmation,
} from './context-manager';
import { buildSystemPrompt } from './prompt-builder';
import { getRoleBasedSuggestedPrompts } from './suggested-prompts';
import { executeRoleBasedTool } from './tools';
import { getRoleFilteredSchemaSummary, getTableSchemaMetadata } from './schema-registry';
import { AIProviderManager } from '@/lib/ai/provider-manager';
import { UniversalToolDeclaration, UniversalChatMessage } from '@/lib/ai/types';
import {
  saveChatMessageDetailed,
  updateSessionDiagnosis,
  getSessionMessages,
} from './repository';
import { query } from '@/lib/db';

// Ekspor pembantu saran halaman untuk backward compatibility
export function getPageContextSuggestions(pathname?: string, role: string = 'guest'): QuickSuggestion[] {
  return getRoleBasedSuggestedPrompts(role as any, pathname);
}

// ============================================================================
// F10 — Pola jawaban penolakan aksi teknisi (langkah ke-2 two-step
// verification). Pesan yang diawali "tidak"/"batal" (dan padanannya)
// membatalkan aksi tertunda di sesi ini; pembatalan tidak memutasi apa pun
// sehingga polanya boleh longgar. Jawaban AFIRMATIF ("ya") ditangani
// isTechnicianConfirmationReply (S9g, ketat) — bukan pola awalan semata.
// ============================================================================
const TECHNICIAN_CONFIRM_NO_PATTERN =
  /^(tidak|nggak|gak|ga|batal|batalkan|jangan|tunda)\b/i;

/**
 * F10 — Menentukan jenis aksi teknisi dari teks pesan (null bila pesan tidak
 * mengandung perintah aksi). Dipakai cabang konfirmasi untuk memastikan
 * jawaban "ya, <aksi> <kode>" hanya mengonfirmasi aksi tertunda yang SAMA —
 * perintah aksi/kode yang berbeda tidak boleh mengeksekusi aksi tertunda
 * yang salah, melainkan ditangani cabang aksi sebagai permintaan baru.
 */
function detectTechnicianActionType(norm: string): 'accept' | 'on_the_way' | 'start_diagnosis' | 'start_repair' | null {
  if (!/terima\s+tugas|menuju\s+lokasi|mulai\s+diagnosa|mulai\s+perbaikan/i.test(norm)) return null;
  if (/terima/i.test(norm)) return 'accept';
  if (/diagnosa/i.test(norm)) return 'start_diagnosis';
  if (/perbaikan/i.test(norm)) return 'start_repair';
  return 'on_the_way';
}

// ============================================================================
// F6 — Lokasi penyimpanan pesan percakapan. Repository Batch 2 mengembalikan
// storedIn 'database' | 'memory' via saveChatMessageDetailed; engine memetakan
// 'database' -> 'db' sesuai kontrak hasil processChatMessage di bawah.
// 'memory' berarti pesan hanya di fallback in-memory (hilang saat restart);
// bila salah satu dari pesan pengguna/balasan hanya di memori, hasilnya
// 'memory' (tidak tahan lama).
// ============================================================================
export type MessageStoreLocation = 'db' | 'memory';

export interface ChatbotReply {
  reply: string;
  metadata: ChatMessageMetadata;
  diagnosisCard?: DiagnosisCard | null;
  /**
   * F6 — Di mana pesan percakapan ini tersimpan: 'db' (MySQL, tahan lama)
   * atau 'memory' (hanya fallback in-memory — hilang saat restart; salah
   * satu dari pesan pengguna/balasan tidak mencapai database).
   */
  storedIn: 'db' | 'memory';
}

async function saveChatMessageTracked(
  sessionId: number,
  role: 'user' | 'assistant' | 'system',
  message: string,
  metadata?: ChatMessageMetadata | null,
  tokensUsed?: number,
  responseTimeMs?: number
): Promise<MessageStoreLocation> {
  const result = await saveChatMessageDetailed(sessionId, role, message, metadata, tokensUsed, responseTimeMs);
  return result.storedIn === 'database' ? 'db' : 'memory';
}

function combineStoredIn(...locations: MessageStoreLocation[]): MessageStoreLocation {
  return locations.includes('memory') ? 'memory' : 'db';
}

// F23 — Pesan generik untuk klien saat AI tidak tersedia. Detail error mentah
// provider (nama model/endpoint, kuota, potongan respons API) HANYA dicatat
// di log server dan TIDAK PERNAH dikembalikan ke klien — baik di teks
// balasan maupun metadata.aiError.
const AI_UNAVAILABLE_MESSAGE = 'Layanan AI sedang tidak tersedia, coba lagi nanti';

/**
 * S9a/F13 — Jendela riwayat yang dikirim ke LLM: 20 pesan terakhir saja.
 * Sesi yang panjang (ratusan pesan) tidak lagi membebani token dan memori
 * di setiap pesan baru; context-manager hanya memakai 4 pesan terakhir.
 */
export const LLM_HISTORY_LIMIT = 20;

// ============================================================================
// S9e/F16 — Serialisasi pemrosesan per sesi (in-process).
//
// Dua pesan yang dikirim hampir bersamaan ke sesi yang sama tidak boleh
// diproses paralel (riwayat yang belum memuat satu sama lain, urutan simpan
// tidak dijamin, jawaban tertukar konteks). Rantai promise per sessionId:
// pemrosesan pesan berikutnya menunggu pesan sebelumnya SELESAI (termasuk
// bila sebelumnya gagal — rantai tidak pernah rejected). Entri Map dibersihkan
// saat rantai terakhir selesai dan tidak ada rantai baru yang menggantikannya.
// CATATAN: lock ini hanya berlaku dalam satu instance proses; deployment
// multi-instance tetap butuh lock terdistribusi (di luar cakupan ini).
// ============================================================================
const sessionProcessingChains = new Map<number, Promise<void>>();

function runSerializedPerSession<T>(sessionId: number, fn: () => Promise<T>): Promise<T> {
  const prev = sessionProcessingChains.get(sessionId) ?? Promise.resolve();
  const result = prev.then(fn, fn);
  const chained = result.then(
    () => undefined,
    () => undefined
  );
  sessionProcessingChains.set(sessionId, chained);
  chained.then(() => {
    if (sessionProcessingChains.get(sessionId) === chained) {
      sessionProcessingChains.delete(sessionId);
    }
  });
  return result;
}

// ============================================================================
// S9g — Konfirmasi aksi teknisi yang KETAT.
//
// Pola lama ("pesan diawali ya/iya/...") mengeksekusi aksi tertunda bahkan
// bila "ya" itu hanya awalan pesan lain ("ya, saya mau tanya soal garansi").
// Sekarang: setelah kata penegasan, pesan hanya boleh berisi (opsional)
// frasa aksi yang SAMA dengan aksi tertunda dan/atau kode order yang SAMA
// — dan tidak ada yang lain. Pesan lain jatuh ke cabang biasa (cabang aksi
// akan menampilkan prompt konfirmasi baru bila memuat perintah aksi).
// ============================================================================
const TECHNICIAN_ACTION_PHRASES: Record<string, string> = {
  accept: 'terima tugas',
  on_the_way: 'menuju lokasi',
  start_diagnosis: 'mulai diagnosa',
  start_repair: 'mulai perbaikan',
};

export function isTechnicianConfirmationReply(
  norm: string,
  pending: { orderCode: string; action: 'accept' | 'on_the_way' | 'start_diagnosis' | 'start_repair' }
): boolean {
  const match = norm.match(
    /^(ya|iya|yup|betul|benar|lanjut|lanjutkan|konfirmasi|setuju|yakin|oke|ok|silakan|silahkan)\b[,.]?\s*(.*)$/i
  );
  if (!match) return false;
  const rest = (match[2] || '')
    .toLowerCase()
    .replace(/[.,!]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (rest === '') return true;
  const code = pending.orderCode.toLowerCase();
  const phrase = TECHNICIAN_ACTION_PHRASES[pending.action] || '';
  return (
    rest === code ||
    (phrase !== '' &&
      (rest === phrase || rest === `${phrase} ${code}` || rest === `${code} ${phrase}`))
  );
}

// ============================================================================
// S9b/S9d — Deteksi permintaan eksplisit atas field PII.
//
// Proyeksi hasil tool dan ringkasan konteks membuang nomor telepon, email,
// alamat, dan UUID — KECUALI pertanyaan saat ini secara eksplisit meminta
// field itu untuk satu orang/pesanan spesifik ("berapa nomor telepon Budi?").
// Deteksi berbasis kata kunci pertanyaan, bukan tebakan.
// ============================================================================
export interface ExplicitPiiAsks {
  phone: boolean;
  email: boolean;
  address: boolean;
  uuid: boolean;
}

export function detectExplicitPiiAsks(norm: string): ExplicitPiiAsks {
  return {
    phone: /nomor|telepon|phone|no\s*hp|whatsapp|\bwa\b|kontak|hubungi/i.test(norm),
    email: /email|e-mail|surat\s+elektronik/i.test(norm),
    address: /alamat|domisili|tinggal\s+di|lokasi\s+rumah/i.test(norm),
    uuid: /uuid/i.test(norm),
  };
}

// ============================================================================
// S29/F20 — Klarifikasi target pencarian dari memori.
//
// Nilai target ditampilkan TERSAMAR di pertanyaan klarifikasi (nomor telepon
// dan email adalah PII — cukup petunjuk agar pengguna mengenali targetnya);
// kode order/invoice bukan PII dan ditampilkan penuh.
// ============================================================================
function maskPhoneForClarification(phone: string): string {
  const digits = phone.replace(/[^0-9+]/g, '');
  if (digits.length <= 6) return `${digits.slice(0, 2)}…`;
  return `${digits.slice(0, 4)}…${digits.slice(-2)}`;
}

function maskEmailForClarification(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '…';
  return `${email[0]}***${email.slice(at)}`;
}

function maskUuidForClarification(uuid: string): string {
  return `${uuid.slice(0, 8)}…`;
}

export function buildMemorySearchClarification(target: {
  kind: 'phone' | 'email' | 'uuid' | 'order' | 'invoice';
  value: string;
}): string {
  switch (target.kind) {
    case 'phone':
      return `Maksud Bos nomor ${maskPhoneForClarification(target.value)} yang tadi? Balas "ya" bila benar, atau sebutkan nomor yang dimaksud.`;
    case 'email':
      return `Maksud Bos email ${maskEmailForClarification(target.value)} yang tadi? Balas "ya" bila benar, atau sebutkan email yang dimaksud.`;
    case 'uuid':
      return `Maksud Bos pengguna dengan UUID ${maskUuidForClarification(target.value)} yang tadi? Balas "ya" bila benar, atau sebutkan UUID yang dimaksud.`;
    case 'order':
      return `Maksud Bos pesanan #${target.value} yang tadi? Balas "ya" bila benar, atau sebutkan kode pesanan yang dimaksud.`;
    case 'invoice':
      return `Maksud Bos invoice ${target.value} yang tadi? Balas "ya" bila benar, atau sebutkan nomor invoice yang dimaksud.`;
    default:
      return 'Maksud Bos data yang tadi? Balas "ya" bila benar, atau sebutkan yang dimaksud.';
  }
}

// ============================================================================
// S9d — Proyeksi hasil tool sebelum masuk ke prompt LLM.
//
// Hasil tool TIDAK LAGI di-JSON-stringify utuh: tiap alat hanya menyumbang
// kolom yang dibutuhkan jawaban, sesuai aturan LUGAS dan minimasi S9b.
// Kolom PII (telepon, email, alamat, UUID) hanya disertakan bila pertanyaan
// saat ini secara eksplisit memintanya (lihat detectExplicitPiiAsks).
// - searchDatabaseUsers / Invoices / Technicians: allowlist kolom eksplisit.
// - searchDatabaseOrders / queryDatabase / lainnya: scrub generik (buang
//   kunci PII + kunci sensitif, pertahankan sisanya) — bentuk barisnya
//   bervariasi menurut peran/tabel sehingga allowlist kaku tidak cocok.
//   queryDatabase sendiri sudah dijaga governed layer (kolom sensitif
//   ditolak, row scoping ditegakkan); scrub di sini adalah lapis kedua.
// Hasil error ({success: false}) diteruskan utuh (tidak mengandung PII).
// ============================================================================
const SENSITIVE_KEY_PATTERN = /password|otp|token|secret|api[_-]?key|hash|credential/i;

/**
 * S9d — Klasifikasi kunci PII berdasarkan NAMA KUNCI (pola, bukan daftar
 * eksak): baris queryDatabase memakai nama kolom mentah snake_case
 * (`phone_number`, `address_text`, `user_uuid`) sementara record search
 * memakai camelCase (`phoneNumber`, `customerPhone`) — keduanya harus
 * dikenali sebagai PII yang sama.
 */
function piiKeyClass(key: string): 'phone' | 'email' | 'address' | 'uuid' | null {
  if (/phone|telepon|no_hp|whatsapp/i.test(key)) return 'phone';
  if (key.toLowerCase() === 'email' || /e_mail/i.test(key)) return 'email';
  if (/address|alamat/i.test(key)) return 'address';
  if (/uuid/i.test(key)) return 'uuid';
  return null;
}

function scrubRowGenerically(row: any, asks: ExplicitPiiAsks): any {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(row)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) continue;
    const piiClass = piiKeyClass(key);
    if (piiClass === 'phone' && !asks.phone) continue;
    if (piiClass === 'email' && !asks.email) continue;
    if (piiClass === 'address' && !asks.address) continue;
    if (piiClass === 'uuid' && !asks.uuid) continue;
    // Objek bersarang (mis. technician: {name, rating, phone}) ikut di-scrub.
    out[key] =
      value && typeof value === 'object' && !Array.isArray(value)
        ? scrubRowGenerically(value, asks)
        : value;
  }
  return out;
}

function projectUserRecordForPrompt(u: any, asks: ExplicitPiiAsks): any {
  if (!u || typeof u !== 'object') return u;
  const projected: Record<string, any> = {
    name: u.fullName ?? u.name ?? null,
    role: u.role ?? null,
    status: u.status ?? null,
  };
  if (typeof u.isVerified === 'boolean') projected.isVerified = u.isVerified;
  if (u.registeredAt) projected.registeredAt = u.registeredAt;
  if (u.technicianDetails && typeof u.technicianDetails === 'object') {
    projected.technicianDetails = {
      ratingAvg: u.technicianDetails.ratingAvg ?? null,
      ratingCount: u.technicianDetails.ratingCount ?? null,
      yearsOfExperience: u.technicianDetails.yearsOfExperience ?? null,
      isAvailable: u.technicianDetails.isAvailable ?? null,
    };
  }
  if (asks.phone && u.phoneNumber) projected.phoneNumber = u.phoneNumber;
  if (asks.email && u.email) projected.email = u.email;
  if (asks.address) {
    if (u.address) projected.address = u.address;
    if (u.city) projected.city = u.city;
  }
  if (asks.uuid && u.uuid) projected.uuid = u.uuid;
  return projected;
}

function projectInvoiceRecordForPrompt(inv: any, asks: ExplicitPiiAsks): any {
  if (!inv || typeof inv !== 'object') return inv;
  const projected: Record<string, any> = {
    invoiceNumber: inv.invoiceNumber ?? null,
    orderCode: inv.orderCode ?? null,
    category: inv.category ?? null,
    customerName: inv.customerName ?? null,
    laborCost: inv.laborCost ?? null,
    partsCost: inv.partsCost ?? null,
    serviceFee: inv.serviceFee ?? null,
    totalAmount: inv.totalAmount ?? null,
    status: inv.status ?? null,
    dueDate: inv.dueDate ?? null,
  };
  if (inv.paidAt) projected.paidAt = inv.paidAt;
  if (asks.phone && inv.customerPhone) projected.customerPhone = inv.customerPhone;
  return projected;
}

function projectTechnicianRecordForPrompt(t: any, asks: ExplicitPiiAsks): any {
  if (!t || typeof t !== 'object') return t;
  const projected: Record<string, any> = {
    name: t.name ?? null,
    rating: t.rating ?? null,
    reviewsCount: t.reviewsCount ?? null,
    experienceYears: t.experienceYears ?? null,
    isAvailable: t.isAvailable ?? null,
    verifiedStatus: t.verifiedStatus ?? null,
    specializations: Array.isArray(t.specializations) ? t.specializations : [],
  };
  if (asks.phone && t.phone) projected.phone = t.phone;
  if (asks.email && t.email) projected.email = t.email;
  return projected;
}

export function projectToolResultForPrompt(
  toolName: string,
  toolResult: any,
  norm: string
): any {
  if (!toolResult || typeof toolResult !== 'object') return toolResult;
  if (toolResult.success === false) return toolResult;
  const data = (toolResult as any).data;
  if (data === undefined || data === null) return toolResult;
  const asks = detectExplicitPiiAsks(norm);

  // queryDatabase: { table, rows, rowCount } — scrub tiap baris generik.
  if (data && typeof data === 'object' && !Array.isArray(data) && Array.isArray((data as any).rows)) {
    return {
      ...toolResult,
      data: {
        ...data,
        rows: (data as any).rows.map((row: any) => scrubRowGenerically(row, asks)),
      },
    };
  }

  const projectRow = (row: any): any => {
    switch (toolName) {
      case 'searchDatabaseUsers':
      case 'searchUsers':
        return projectUserRecordForPrompt(row, asks);
      case 'searchDatabaseInvoices':
      case 'searchInvoices':
        return projectInvoiceRecordForPrompt(row, asks);
      case 'searchDatabaseTechnicians':
      case 'searchTechnicians':
        return projectTechnicianRecordForPrompt(row, asks);
      default:
        return scrubRowGenerically(row, asks);
    }
  };

  if (Array.isArray(data)) {
    return { ...toolResult, data: data.map(projectRow) };
  }
  if (typeof data === 'object') {
    return { ...toolResult, data: projectRow(data) };
  }
  return toolResult;
}

// ============================================================================
// S9f/F19 — Validasi kartu diagnosis dari AI (validasi struktural manual —
// TANPA dependensi Zod baru; periksa field yang benar-benar dipakai kode).
// Kartu yang bentuknya tidak valid DITOLAK (null) tanpa membuang balasan AI:
// kartu hanyalah pelengkap; teks jawaban tetap dikembalikan ke pengguna.
// ============================================================================
const DIAGNOSIS_CONFIDENCE_LEVELS = new Set([
  'Sangat Mungkin',
  'Kemungkinan Besar',
  'Perlu Pemeriksaan Langsung',
]);

export function isValidDiagnosisCard(value: unknown): value is DiagnosisCard {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const card = value as Record<string, unknown>;
  if (typeof card.deviceCategory !== 'string' || !card.deviceCategory.trim()) return false;
  if (typeof card.symptomsSummary !== 'string' || !card.symptomsSummary.trim()) return false;
  if (typeof card.recommendedAction !== 'string' || !card.recommendedAction.trim()) return false;
  if (
    !Array.isArray(card.possibleCauses) ||
    !card.possibleCauses.every((c) => typeof c === 'string')
  ) {
    return false;
  }
  if (
    !Array.isArray(card.safeCheckSteps) ||
    !card.safeCheckSteps.every((s) => typeof s === 'string')
  ) {
    return false;
  }
  if (
    card.confidenceLevel !== undefined &&
    (typeof card.confidenceLevel !== 'string' ||
      !DIAGNOSIS_CONFIDENCE_LEVELS.has(card.confidenceLevel))
  ) {
    return false;
  }
  if (card.categorySlug !== undefined && typeof card.categorySlug !== 'string') return false;
  if (card.categoryId !== undefined && typeof card.categoryId !== 'number') return false;
  if (
    card.safetyHazardWarning !== undefined &&
    card.safetyHazardWarning !== null &&
    typeof card.safetyHazardWarning !== 'string'
  ) {
    return false;
  }
  if (
    card.estimatedLaborCostRange !== undefined &&
    typeof card.estimatedLaborCostRange !== 'string'
  ) {
    return false;
  }
  return true;
}

/** S9f/F19 — Gabung daftar string secara defensif: non-array dinormalisasi ke string, bukan throw. */
export function joinStringList(value: unknown, separator = '; '): string {
  if (Array.isArray(value)) {
    return value.filter((v) => typeof v === 'string').join(separator);
  }
  if (typeof value === 'string') return value;
  return '';
}

/**
 * Intelligent Appliance Expert System untuk analisis diagnosis kerusakan
 */
export function getExpertSystemDiagnosis(
  message: string,
  categorySlug?: string,
  userContext?: ChatUserContext
): {
  reply: string;
  card?: DiagnosisCard;
  quickSuggestions: QuickSuggestion[];
  detectedCategoryId?: number;
} {
  const norm = message.toLowerCase();

  // 1. Pendingin Ruangan (AC)
  if (categorySlug === 'ac-pendingin-ruangan' || /ac|pendingin|freon|outdoor|indoor/i.test(norm)) {
    const isLeaking = /bocor|menetes|air\s+keluar|rembes/i.test(norm);
    if (isLeaking) {
      const card: DiagnosisCard = {
        deviceCategory: 'Pendingin Ruangan (AC)',
        categoryId: 1,
        categorySlug: 'ac-pendingin-ruangan',
        symptomsSummary: 'Air menetes atau bocor dari unit indoor AC ke dalam ruangan.',
        confidenceLevel: 'Sangat Mungkin',
        possibleCauses: [
          'Saluran pembuangan (drain pipe) tersumbat lendir atau lumut',
          'Kemiringan instalasi unit indoor kurang tepat',
          'Bak penampung air indoor kotor atau retak halus',
        ],
        safeCheckSteps: [
          'Matikan AC sementara dan letakkan wadah penampung di bawah tetesan',
          'Periksa apakah ujung selang pembuangan di luar rumah tertutup kotoran',
          'Hindari menusuk lubang drainase dengan kawat tajam',
        ],
        safetyHazardWarning: 'Jangan biarkan tetesan air mengenai stopkontak listrik atau kabel di dinding!',
        recommendedAction: 'Lakukan cuci servis AC dan flushing pipa drainase oleh teknisi resmi BANTUIN.',
        estimatedLaborCostRange: 'Rp 65.000 - Rp 100.000 (perkiraan kasar, bukan tarif resmi)',
      };
      return {
        reply: `Halo! Tetesan air dari unit indoor AC umumnya disebabkan oleh **saluran pembuangan (drainase) yang tersumbat** kotoran atau lumut, sehingga air kondensasi meluap.

Berikut beberapa langkah aman awal yang dapat Anda lakukan:
1. Matikan unit AC terlebih dahulu untuk menghentikan akumulasi air kondensasi.
2. Pastikan tetesan air tidak mengenai stopkontak atau instalasi listrik di dinding.
3. Periksa ujung pipa pembuangan di bagian luar rumah apakah tersumbat atau terjepit.

Untuk mengatasi sumbatan saluran secara tuntas, teknisi BANTUIN dapat melakukan flushing saluran dan cuci unit dengan garansi 30 hari.`,
        card,
        detectedCategoryId: 1,
        quickSuggestions: [
          { label: 'Pesan Servis Cuci AC', prompt: 'Saya ingin pesan servis cuci AC sekarang' },
          { label: 'Berapa tarif servis AC?', prompt: 'Berapa tarif dan biaya servis AC di BANTUIN?' },
          { label: 'Apakah ada garansi?', prompt: 'Bagaimana ketentuan garansi servis BANTUIN?' },
        ],
      };
    }

    // Default: AC Kurang Dingin / Tidak Dingin
    const card: DiagnosisCard = {
      deviceCategory: 'Pendingin Ruangan (AC)',
      categoryId: 1,
      categorySlug: 'ac-pendingin-ruangan',
      symptomsSummary: 'AC menyala namun hembusan udara tidak dingin atau hanya seperti kipas angin biasa.',
      confidenceLevel: 'Kemungkinan Besar',
      possibleCauses: [
        'Filter saringan udara indoor tertutup debu tebal',
        'Tekanan gas pendingin (freon) berkurang akibat kebocoran mikro',
        'Kondensor unit outdoor kotor atau kapasitor kipas outdoor melemah',
      ],
      safeCheckSteps: [
        'Buka penutup depan indoor dan periksa filter saringan, cuci dengan air bersih jika berdebu',
        'Pastikan remote berada pada mode "COOL" (bukan FAN atau DRY) dengan target suhu 20-24°C',
        'Cek apakah unit outdoor menyala dan kipasnya berputar',
      ],
      safetyHazardWarning: null,
      recommendedAction: 'Jadwalkan inspeksi teknisi BANTUIN untuk pengecekan ampere kompresor dan tekanan freon.',
      estimatedLaborCostRange: 'Rp 75.000 - Rp 150.000 (perkiraan kasar, bukan tarif resmi)',
    };
    return {
      reply: `Halo! Keluhan AC tidak dingin atau hanya mengeluarkan angin adalah kasus yang sangat umum pada pendingin ruangan.

**Kemungkinan penyebab utama:**
- Filter saringan udara indoor tertutup debu tebal sehingga sirkulasi hembusan udara terhambat.
- Unit outdoor kotor atau tekanan gas refrigeran (freon) berada di bawah standar operasional.
- Pengaturan remote belum berada pada mode pendingin aktif.

**Langkah pemeriksaan aman awal untuk Anda:**
1. Pastikan mode pada remote AC adalah **COOL** (simbol keping salju/snowflake) dengan target suhu 22°C - 24°C.
2. Buka tutup depan indoor dan cuci saringan kasa filternya bila berdebu tebal.
3. Cek apakah kipas pada unit outdoor berputar saat AC dihidupkan.

Jika setelah membersihkan filter udara tetap tidak dingin, kemungkinan besar freon perlu ditambah atau ada komponen kapasitor outdoor yang melemah. Teknisi resmi BANTUIN siap membantu memeriksa dengan perlindungan garansi 30 hari.`,
      card,
      detectedCategoryId: 1,
      quickSuggestions: [
        { label: 'Pesan Servis AC', prompt: 'Saya mau pesan perbaikan AC' },
        { label: 'Cek Tarif Servis AC', prompt: 'Berapa tarif dasar servis AC di BANTUIN?' },
        { label: 'Info Garansi Servis', prompt: 'Apakah ada garansi perbaikan di BANTUIN?' },
      ],
    };
  }

  // 2. Lemari Es & Freezer
  if (categorySlug === 'kulkas-freezer' || /kulkas|freezer|lemari\s+es|chiller/i.test(norm)) {
    const card: DiagnosisCard = {
      deviceCategory: 'Lemari Es & Freezer',
      categoryId: 2,
      categorySlug: 'kulkas-freezer',
      symptomsSummary: 'Kulkas tidak dingin merata atau bagian freezer membeku berlebihan.',
      confidenceLevel: 'Kemungkinan Besar',
      possibleCauses: [
        'Karet pintu kulkas (gasket) kotor, getas, atau longgar',
        'Kipas sirkulasi evaporator indoor mati atau terhalang bunga es',
        'Thermostat atau defrost timer mengalami kegagalan fungsi',
        'Kompresor overload atau freon berkurang akibat kebocoran',
      ],
      safeCheckSteps: [
        'Periksa kerapatan karet pintu menggunakan selembar kertas',
        'Beri jarak minimal 10 cm antara bagian belakang kulkas dengan dinding',
        'Lakukan defrost manual jika bunga es membeku tebal',
      ],
      safetyHazardWarning: 'Jangan mencongkel bunga es pada evaporator menggunakan pisau atau benda tajam!',
      recommendedAction: 'Jadwalkan pemeriksaan sistem defrost atau kelistrikan kulkas oleh mitra teknisi BANTUIN.',
      estimatedLaborCostRange: 'Rp 80.000 - Rp 180.000 (perkiraan kasar, bukan tarif resmi)',
    };
    return {
      reply: `Halo! Masalah kulkas tidak dingin atau penumpukan bunga es yang tidak merata biasanya berkaitan dengan sistem sirkulasi udara atau komponen pengatur suhu (defrost system).

**Langkah pemeriksaan aman awal:**
1. Pastikan pintu kulkas menutup rapat sempurna. Anda bisa mengetesnya dengan menjepit kertas di pintu; jika mudah ditarik, karet pintu mungkin perlu dibersihkan atau diganti.
2. Pastikan ventilasi di bagian belakang kulkas tidak menempel dinding agar panas kondensor terbuang baik.
3. Hindari menusuk atau mencongkel bunga es dengan benda tajam karena dapat melubangi pipa evaporator.

Teknisi BANTUIN dapat melakukan pengecekan relay kompresor, sensor defrost, dan sirkulasi freon secara presisi.`,
      card,
      detectedCategoryId: 2,
      quickSuggestions: [
        { label: 'Pesan Teknisi Kulkas', prompt: 'Saya mau pesan servis kulkas' },
        { label: 'Cek Tarif Servis Kulkas', prompt: 'Berapa tarif servis kulkas di BANTUIN?' },
      ],
    };
  }

  // 3. Mesin Cuci
  if (categorySlug === 'mesin-cuci-pengering' || /mesin\s+cuci|pengering|dryer|spin/i.test(norm)) {
    const card: DiagnosisCard = {
      deviceCategory: 'Mesin Cuci & Pengering',
      categoryId: 3,
      categorySlug: 'mesin-cuci-pengering',
      symptomsSummary: 'Mesin cuci bermasalah pada putaran, saluran pembuangan air, atau getaran keras.',
      confidenceLevel: 'Kemungkinan Besar',
      possibleCauses: [
        'Saringan filter pembuangan (drain filter) tersumbat koin atau serat pakaian',
        'Tali kipas (fan belt) dinamo aus atau kendor',
        'Kapasitor motor penggerak melemah atau modul PCB error',
      ],
      safeCheckSteps: [
        'Periksa dan bersihkan saringan filter pembuangan di bagian bawah depan mesin cuci',
        'Pastikan posisi kaki mesin cuci rata pada permukaan lantai',
        'Jangan mengisi pakaian melebihi kapasitas beban maksimal mesin',
      ],
      safetyHazardWarning: 'Cabut steker dari stopkontak sebelum memeriksa saluran air atau bagian belakang unit!',
      recommendedAction: 'Gunakan layanan perbaikan mesin cuci resmi BANTUIN untuk pengecekan mekanikal dan modul.',
      estimatedLaborCostRange: 'Rp 85.000 - Rp 200.000 (perkiraan kasar, bukan tarif resmi)',
    };
    return {
      reply: `Halo! Gangguan pada mesin cuci umumnya terjadi pada saluran pembuangan yang tersumbat atau komponen mekanikal motor penggerak.

**Langkah pemeriksaan awal yang aman:**
1. Periksa bagian filter pembuangan (biasanya ada di bagian depan bawah mesin cuci bukaan depan/top loading) dari sumbatan kotoran atau koin.
2. Pastikan selang pembuangan tidak terlipat atau terjepit.
3. Pastikan mesin cuci diletakkan pada permukaan lantai yang rata kokoh untuk menghindari getaran berlebih saat proses memeras (spin).

Jika mesin tetap tidak berputar atau mengeluarkan kode error, mitra teknisi BANTUIN dapat mengecek fan belt, kapasitor, atau modul PCB elektronik dengan aman.`,
      card,
      detectedCategoryId: 3,
      quickSuggestions: [
        { label: 'Pesan Servis Mesin Cuci', prompt: 'Saya mau pesan servis mesin cuci' },
        { label: 'Cek Tarif Mesin Cuci', prompt: 'Berapa biaya perbaikan mesin cuci di BANTUIN?' },
      ],
    };
  }

  // General Response
  return {
    reply: `Halo! Saya **BANTUIN Database Assistant**. BANTUIN melayani perbaikan dan perawatan 6 kategori peralatan elektronik rumah tangga resmi: Pendingin Ruangan (AC), Lemari Es & Freezer, Mesin Cuci & Pengering, Pompa Air & Water Heater, Televisi & Audio, serta Peralatan Dapur Elektronik.

Silakan ceritakan kendala yang dialami perangkat Anda, atau tanyakan informasi seputar pesanan, teknisi, dan layanan resmi BANTUIN.`,
    quickSuggestions: getRoleBasedSuggestedPrompts(userContext?.role || 'guest'),
  };
}

/**
 * PIPELINE UTAMA PEMROSESAN PESAN CHATBOT+
 */
/**
 * F18 — Pembungkus processChatMessage dengan try/catch luar. Sebelumnya
 * exception di luar blok AI (muat riwayat, kueri deterministik, eksekusi
 * aksi teknisi) merambat ke route sebagai 500 dan pesan pengguna hilang,
 * karena pesan baru disimpan setelah pipeline selesai. Sekarang: error apa
 * pun ditangkap, pesan pengguna dipastikan tersimpan (bila belum), balasan
 * error yang ramah disimpan sebagai pesan asisten, dan respons sukses
 * dikembalikan agar pengguna mendapat penjelasan, bukan 500 kosong.
 * Kegagalan panggilan AI sendiri TIDAK sampai ke sini — sudah ditangani di
 * dalam dengan fallback expert system berlabel "Mode offline".
 */
export async function processChatMessage(params: {
  userMessage: string;
  session: ConsultationSession;
  userContext: ChatUserContext;
}): Promise<ChatbotReply> {
  // S9e/F16 — proses pesan dalam satu sesi secara BERURUTAN (pesan kedua
  // menunggu pesan pertama selesai, termasuk penangan error F18 di bawah,
  // agar urutan riwayat dan konteks selalu konsisten).
  return runSerializedPerSession(params.session.id, () =>
    processChatMessageWithRecovery(params)
  );
}

async function processChatMessageWithRecovery(params: {
  userMessage: string;
  session: ConsultationSession;
  userContext: ChatUserContext;
}): Promise<ChatbotReply> {
  const startTime = Date.now();
  try {
    return await processChatMessageInternal(params);
  } catch (err: any) {
    console.error('[Chatbot Engine] processChatMessage gagal (ditangkap F18):', err);
    const { userMessage, session, userContext } = params;
    const errorReply = 'Maaf, terjadi kesalahan sistem saat memproses pesan Anda. Pesan Anda sudah tersimpan — silakan coba kirim ulang sesaat lagi, atau hubungi dukungan BANTUIN bila masalah berlanjut.';
    const metadata: ChatMessageMetadata = {
      model: 'bantuin-error-handler-v1',
      responseTimeMs: Date.now() - startTime,
      quickSuggestions: getRoleBasedSuggestedPrompts(userContext.role, userContext.pageContext?.pathname || '/'),
    };
    // F6: bila penyimpanan gagal total (persistErr di bawah), storedIn tetap
    // 'memory' — ketahanan di DB tidak terkonfirmasi. Bila pesan pengguna
    // sudah tersimpan oleh percobaan sebelumnya (alreadySaved), hanya
    // penyimpanan balasan yang dilacak (lokasi pesan lama tidak diketahui
    // wrapper ini).
    let storedIn: MessageStoreLocation = 'memory';
    // Best-effort: pastikan pesan pengguna + balasan error tersimpan agar
    // percakapan tidak berlubang. Cek duplikasi dulu: bila pesan pengguna
    // sudah tersimpan (error terjadi setelah penyimpanan), jangan simpan
    // dua kali.
    try {
      // S9a/S9e — cukup 20 pesan terakhir: dengan persist-first (S9e),
      // pesan pengguna adalah pesan TERBARU di sesi ini, jadi dedup tidak
      // perlu memuat seluruh riwayat.
      const recent = await getSessionMessages(session.id, { limit: LLM_HISTORY_LIMIT });
      const alreadySaved = recent.some((m: any) => m.role === 'user' && String(m.message || '').trim() === userMessage.trim());
      const locations: MessageStoreLocation[] = [];
      if (!alreadySaved) {
        locations.push(await saveChatMessageTracked(session.id, 'user', userMessage));
      }
      locations.push(await saveChatMessageTracked(session.id, 'assistant', errorReply, metadata, 0, metadata.responseTimeMs));
      storedIn = combineStoredIn(...locations);
    } catch (persistErr) {
      // Penyimpanan pun gagal (mis. DB down total) — tetap kembalikan
      // balasan ramah; route tidak akan mengembalikan 500.
      console.error('[Chatbot Engine] F18 gagal menyimpan pesan error:', persistErr);
    }
    return { reply: errorReply, metadata, storedIn };
  }
}

async function processChatMessageInternal(params: {
  userMessage: string;
  session: ConsultationSession;
  userContext: ChatUserContext;
}): Promise<ChatbotReply> {
  const { userMessage, session, userContext } = params;
  const startTime = Date.now();
  const currentPath = userContext.pageContext?.pathname || '/';
  const norm = userMessage.toLowerCase().trim();

  // 1. FILTER TOPIK & KEAMANAN (Safety & Prompt Injection Guard)
  // Berikan konteks peran agar pengguna terotentikasi tidak salah ditolak
  const validation = validateTopicAndSafety(userMessage, userContext.role);

  if (!validation.isAllowed) {
    const refusalReply = getStandardRefusalMessage(validation.reason);
    const metadata: ChatMessageMetadata = {
      topicRefused: true,
      responseTimeMs: Date.now() - startTime,
      quickSuggestions: getRoleBasedSuggestedPrompts(userContext.role, currentPath),
    };

    const refusalUserStored = await saveChatMessageTracked(session.id, 'user', userMessage);
    const replyStored = await saveChatMessageTracked(session.id, 'assistant', refusalReply, metadata, 0, metadata.responseTimeMs);

    return {
      reply: refusalReply,
      metadata,
      storedIn: combineStoredIn(refusalUserStored, replyStored),
    };
  }

  // Jika terdeteksi bahaya keselamatan kerja (listrik/kebakaran/gas), sisipkan peringatan darurat
  let safetyAlertPrefix = '';
  if (validation.isSafetyHazard && validation.safetyAlert) {
    safetyAlertPrefix = `⚠️ **${validation.safetyAlert}**\n\n---\n\n`;
  }

  // 2. KELOLA MEMORI SESI & RESOLUSI ENTITAS PERCAKAPAN
  // S9a/F13 — riwayat dibatasi 20 pesan terakhir (jendela LLM); riwayat
  // dimuat SEBELUM pesan saat ini disimpan (lihat S9e di bawah) agar pesan
  // saat ini tidak ganda di konteks LLM.
  // S29/F7 — userId pemanggil diteruskan agar memori konteks diverifikasi
  // pemiliknya (memori pengguna lain / guest tidak pernah dipakai).
  const rawHistory = await getSessionMessages(session.id, { limit: LLM_HISTORY_LIMIT });
  const contextEntities = resolveConversationContext(
    userMessage,
    rawHistory,
    session.id,
    userContext.userId ?? null
  );

  // S9e/F16 — SIMPAN PESAN PENGGUNA DULU, sebelum kueri deterministik
  // maupun panggilan AI. Sebelumnya pesan baru disimpan SETELAH seluruh
  // pipeline selesai, sehingga kegagalan di tengah jalan menghilangkan
  // pesan total (lihat F18) dan dua pesan bersamaan saling balap. Semua
  // jalur kembali di bawah memakai `userStored` ini dan HANYA menyimpan
  // balasan asisten — pesan pengguna tidak pernah disimpan dua kali.
  // Komposisi dengan F18: bila error terjadi setelah titik ini, wrapper
  // F18 menemukan pesan ini lewat dedup dan tidak menyimpannya lagi.
  const userStored = await saveChatMessageTracked(session.id, 'user', userMessage);

  // 3. PENGAMBILAN DATA DATABASE AKTUAL SESUAI PERAN & INTENT PENGGUNA
  let dbContextSummary = '';
  let directReply: string | null = null;
  let dynamicSuggestions = getRoleBasedSuggestedPrompts(userContext.role, currentPath, {
    activeOrderCode: contextEntities.activeOrderCode || undefined,
  });

  // ==========================================================================
  // GLOBAL: DETEKSI PERTANYAAN MODEL & PROVIDER AI (SEMUA ROLE & ADMIN)
  // N24: blok peran di bawah (guest/customer/technician/admin) adalah
  // `else if` terhadap cabang ini — jawaban info model tidak boleh ditimpa
  // cabang peran bila pesan juga cocok dengan pola lain (mis. admin bertanya
  // "model apa yang dipakai untuk laporan operasional?" harus dijawab info
  // model, bukan laporan operasional). Peran saling eksklusif sehingga
  // rantai else-if tidak mengubah perilaku pesan non-model-info.
  // ==========================================================================
  if (
    /model\s+(?:apa|ai|llm)|provider\s+(?:apa|ai)|kamu\s+(?:pakai|menggunakan|ditenagai|berbasis)\s+(?:model|ai|gemini|groq|llm|teknologi)|siapa\s+(?:otak|mesin|model)\s+ai|apa\s+model\s+(?:yang\s+)?(?:dipakai|digunakan|aktif)|model\s+yang\s+(?:sedang\s+)?(?:dipakai|digunakan|aktif)|versi\s+ai|provider\s+aktif|ai\s+provider/i.test(norm)
  ) {
    const snapshot = await AIProviderManager.getInstance().getActiveProviderSnapshot();
    const activeConf = snapshot.activeConfig;
    const global = snapshot.globalSettings;
    const statusBadge =
      activeConf.lastConnectionStatus === 'connected'
        ? '🟢 Terhubung & Normal'
        : activeConf.lastConnectionStatus === 'not_configured'
        ? '🟡 Belum Dikonfigurasi'
        : activeConf.lastConnectionStatus === 'connection_error'
        ? '🔴 Gangguan Koneksi'
        : '⚪ Disconnected';

    // S9c — detail konfigurasi provider DIBATASI PER PERAN. Sebelumnya
    // cabang ini menampilkan endpoint, temperature, timeout, dan provider
    // fallback ke SEMUA peran termasuk guest. Sekarang:
    // - guest: HANYA nama model (tanpa provider, endpoint, parameter, fallback).
    // - customer/teknisi: nama model + nama provider + status koneksi.
    // - admin: detail lengkap seperti sebelumnya.
    if (userContext.role === 'guest') {
      directReply = `🤖 Asisten AI BANTUIN saat ini menggunakan model **\`${activeConf.selectedModel}\`**.

Asisten AI BANTUIN siap membantu kebutuhan konsultasi dan operasional servis peralatan rumah tangga Anda.`;
    } else if (userContext.role !== 'admin') {
      directReply = `🤖 **Informasi Model AI Aktif (BANTUIN Assistant):**

Saat ini asisten AI BANTUIN aktif beroperasi menggunakan:
- **Provider AI Aktif:** **${activeConf.name}**
- **Model yang Digunakan:** **\`${activeConf.selectedModel}\`**
- **Status Koneksi:** ${statusBadge}

Asisten AI BANTUIN siap membantu kebutuhan konsultasi dan operasional servis peralatan rumah tangga Anda.`;
    } else {
      directReply = `🤖 **Informasi Model & Provider AI Aktif (BANTUIN Assistant):**

Saat ini asisten AI BANTUIN aktif beroperasi menggunakan:
- **Provider AI Aktif:** **${activeConf.name}** (\`${activeConf.provider}\`)
- **Model yang Digunakan:** **\`${activeConf.selectedModel}\`**
- **Status Koneksi:** ${statusBadge}
- **API Endpoint:** \`${activeConf.apiEndpoint}\`
- **Parameter Inferensi:**
  - Suhu (Temperature): \`${activeConf.temperature}\`
  - Max Output: \`${activeConf.maxOutputTokens} tokens\`
  - Request Timeout: \`${activeConf.requestTimeoutMs} ms\`
- **Fitur Automatic Fallback:** ${global.enableFallback ? `✅ Aktif (Otomatis beralih ke **${global.fallbackProvider.toUpperCase()}** jika provider utama kendala)` : '❌ Nonaktif'}

💡 _Catatan Administrator: Anda dapat mengganti provider aktif, memilih model lain, atau menambah provider kustom kapan saja melalui menu **Pengaturan Sistem → AI Provider Management**._`;
    }
  }

  // ==========================================================================
  // A. KATEGORI KHUSUS GUEST (TAMU PUBLIK)
  // ==========================================================================
  else if (userContext.role === 'guest') {
    if (/apa\s+itu\s+bantuin|tujuan\s+aplikasi|tentang\s+bantuin/i.test(norm)) {
      const guide = DataService.getAppGuide('tentang');
      directReply = `**${guide.title}**\n\n${guide.content}`;
    } else if (/daftar\s+(harga|tarif|layanan)|harga|tarif|biaya/i.test(norm)) {
      // N20: "daftar harga / tarif / layanan" adalah pertanyaan harga —
      // jawab dari katalog layanan (dengan harga dasar), BUKAN panduan
      // pendaftaran. Cabang ini HARUS sebelum cabang pendaftaran dan
      // cabang katalog (pola katalog menangkap kata "katalog", sehingga
      // "katalog harga" pun harus sampai ke sini).
      const catalog = await DataService.getPublicCatalogWithSource();
      const allServices = catalog.items.flatMap((c) => c.services.map((s) => ({ ...s, categoryName: c.categoryName })));
      // A25 — katalog fallback statis (DB offline/kosong) hanya memuat 7
      // layanan dari 15 seed: beri label agar tamu tidak mengira daftarnya
      // lengkap dan harganya terkini.
      const catalogNote = catalog.source === 'fallback-offline'
        ? '\n\n_(data katalog tersimpan — database tidak dapat diakses saat ini)_'
        : catalog.source === 'fallback-empty'
        ? '\n\n_(katalog di database masih kosong — menampilkan data katalog tersimpan)_'
        : '';
      if (allServices.length === 0) {
        directReply = 'Belum ada layanan aktif yang tercatat di katalog BANTUIN.';
      } else {
        const shown = allServices.slice(0, 20);
        directReply = `💰 **Daftar Harga Layanan BANTUIN:**\n\n` +
          shown.map((s, i) => `**${i + 1}. ${s.name}** (${s.categoryName})\n- Harga Dasar: **Rp ${s.basePrice.toLocaleString('id-ID')}**\n- Estimasi Durasi: ${s.estimatedDurationMin} menit`).join('\n') +
          (allServices.length > shown.length ? `\n\n_...dan ${allServices.length - shown.length} layanan lainnya._` : '') +
          `\n\n_Harga di atas adalah tarif dasar. Biaya akhir ditentukan setelah teknisi melakukan diagnosis dan disetujui oleh Anda._` +
          catalogNote;
      }
    } else if (/layanan\s+(tersedia|apa\s+saja)|katalog|kategori\s+alat/i.test(norm)) {
      const categories = await DataService.getPublicApplianceCategoriesWithSource();
      // A25 — label yang sama bila daftar kategori berasal dari fallback.
      const categoriesNote = categories.source === 'fallback-offline'
        ? '\n\n_(data katalog tersimpan — database tidak dapat diakses saat ini)_'
        : categories.source === 'fallback-empty'
        ? '\n\n_(katalog di database masih kosong — menampilkan data katalog tersimpan)_'
        : '';
      directReply = `🏠 **Kategori Peralatan Rumah Tangga yang Dilayani BANTUIN:**\n\n` +
        categories.items.map((c, i) => `**${i + 1}. ${c.name}**\n${c.description ? `   _${c.description}_\n` : ''}`).join('\n') +
        `\nSemua perbaikan ditangani oleh mitra teknisi profesional tersertifikasi dan bergaransi 30 hari.` +
        categoriesNote;
    } else if (/cara\s+(mendaftar|daftar)|mendaftar|daftar\s+akun|pendaftaran|register|apakah.*otp/i.test(norm)) {
      // N20: pola pendaftaran dipersempit — kata bare "daftar" DIHAPUS
      // karena menangkap "daftar harga/tarif/layanan" (ditangani cabang
      // harga di atas). Kata kerja "mendaftar" tetap diterima karena tidak
      // ambigu ("saya mau mendaftar").
      const guide = DataService.getAppGuide('daftar');
      directReply = `**${guide.title}**\n\n${guide.content}`;
    } else if (/login|masuk|cara\s+login/i.test(norm)) {
      const guide = DataService.getAppGuide('login');
      directReply = `**${guide.title}**\n\n${guide.content}`;
    } else if (/cara\s+pesan|proses\s+pemesanan|alur\s+pemesanan/i.test(norm)) {
      const guide = DataService.getAppGuide('alur');
      directReply = `**${guide.title}**\n\n${guide.content}`;
    } else if (/proses\s+perbaikan|alur\s+perbaikan/i.test(norm)) {
      const guide = DataService.getAppGuide('alur');
      directReply = `**${guide.title}**\n\n${guide.content}`;
    } else if (/cara\s+bayar|metode\s+pembayaran|pembayaran/i.test(norm)) {
      const guide = DataService.getAppGuide('bayar');
      directReply = `**${guide.title}**\n\n${guide.content}`;
    } else if (/garansi/i.test(norm)) {
      const guide = DataService.getAppGuide('garansi');
      directReply = `**${guide.title}**\n\n${guide.content}`;
    } else if (/pesanan\s+saya|status\s+perbaikan|tagihan\s+saya|profil\s+saya/i.test(norm)) {
      directReply = `Untuk mengakses data pribadi, melacak status pesanan, atau melihat tagihan perbaikan Anda, silakan **Masuk (Login)** terlebih dahulu ke akun BANTUIN Anda.`;
    } else if (/siapa\s+(?:\w+\s+){0,2}(?:nama\s+)?(?:pengguna|user|customer|pelanggan|teknisi|pemilik|akun)|nama\s+pengguna|pemilik\s+(?:nomor|no|email|akun)/i.test(norm) || contextEntities.activePhoneNumber || contextEntities.activeEmail) {
      directReply = `Untuk mengakses informasi pengguna, melacak pesanan, atau melihat riwayat perbaikan di BANTUIN, silakan **Masuk (Login)** terlebih dahulu menggunakan akun terdaftar Anda.`;
    }
  }

  // ==========================================================================
  // B. KATEGORI KHUSUS CUSTOMER (PELANGGAN)
  // ==========================================================================
  else if (userContext.role === 'customer' && userContext.userId) {
    const custId = userContext.userId;

    // Profil Pelanggan & Pembaruan
    if (/siapa\s+nama\s+saya|email\s+yang\s+terdaftar|kapan\s+saya\s+mendaftar|profil\s+saya|profil.*lengkap|memperbarui\s+profil|data\s+diri/i.test(norm)) {
      const profile = await DataService.getCustomerProfile(custId);
      if (profile) {
        directReply = `👤 **Informasi Data Diri Anda (BANTUIN Customer):**
- **Nama Lengkap:** ${profile.fullName}
- **Email:** ${profile.email}
- **Nomor WhatsApp:** ${profile.phoneNumber} (${profile.isVerified ? '✅ Terverifikasi' : '⚠️ Belum Verifikasi'})
- **Alamat Tersimpan:** ${profile.defaultAddress}
- **Kota / Kode Pos:** ${profile.city} (${profile.postalCode})
- **Status Akun:** ${profile.status.toUpperCase()}
- **Terdaftar Sejak:** ${new Date(profile.registeredAt).toLocaleDateString('id-ID', { dateStyle: 'long' })}
- **Kelengkapan Profil:** ${profile.isProfileComplete ? '✅ Lengkap' : '⚠️ Belum Lengkap'}

💡 **Cara Memperbarui Profil:** Anda dapat memperbarui nama, nomor telepon, dan alamat utama melalui menu **Pengaturan Akun** di dashboard profil BANTUIN.`;
      } else {
        directReply = 'Data profil Anda belum tercatat lengkap di database BANTUIN. Silakan perbarui di menu profil dashboard.';
      }
    }

    // Larangan Mengakses Data Pengguna Lain (RBAC Customer Isolation)
    else if (/siapa\s+(?:nama\s+)?(?:pengguna|user|customer|pelanggan|teknisi|pemilik|akun)|pemilik\s+(?:nomor|no|email|akun)/i.test(norm) && (contextEntities.activePhoneNumber || contextEntities.activeEmail || /\d{8,15}/.test(norm))) {
      const targetPhone = contextEntities.activePhoneNumber || norm.match(/\d{8,15}/)?.[0];
      if (userContext.phoneNumber && targetPhone && (userContext.phoneNumber.includes(targetPhone) || targetPhone.includes(userContext.phoneNumber.replace(/[^0-9]/g, '')))) {
        const profile = await DataService.getCustomerProfile(custId);
        directReply = `👤 Nomor telepon \`${targetPhone}\` adalah nomor WhatsApp terdaftar milik akun Anda sendiri atas nama **${profile?.fullName || userContext.name}** (${profile?.isVerified ? '✅ Terverifikasi' : '⚠️ Belum Verifikasi'}).`;
      } else {
        directReply = `🛡️ **Akses Dibatasi (Keamanan & Privasi Data):**\n\nSesuai prinsip perlindungan privasi dan keamanan data BANTUIN, Anda hanya diizinkan mengakses informasi yang berkaitan dengan akun dan pesanan Anda sendiri. Anda tidak memiliki izin untuk mencari atau melihat data identitas pengguna lain.`;
      }
    }

    // Layanan yang tersedia
    else if (/layanan\s+apa\s+saja|katalog\s+layanan/i.test(norm)) {
      const categories = await DataService.getPublicApplianceCategoriesWithSource();
      // A25 — label yang sama bila daftar kategori berasal dari fallback.
      const categoriesNote = categories.source === 'fallback-offline'
        ? '\n\n_(data katalog tersimpan — database tidak dapat diakses saat ini)_'
        : categories.source === 'fallback-empty'
        ? '\n\n_(katalog di database masih kosong — menampilkan data katalog tersimpan)_'
        : '';
      directReply = `🏠 **Kategori Peralatan yang Dilayani BANTUIN:**\n\n` +
        categories.items.map((c, i) => `**${i + 1}. ${c.name}**\n${c.description ? `   _${c.description}_\n` : ''}`).join('\n') +
        `\nSilakan pilih layanan yang sesuai untuk mengajukan pemesanan teknisi resmi.` +
        categoriesNote;
    }

    // Pembatalan Pesanan
    else if (/cara\s+membatalkan|batalkan\s+pesanan|batal\s+pesanan/i.test(norm)) {
      const guide = DataService.getCustomerCancellationGuide();
      directReply = `📋 **${guide.title}**\n\n${guide.content}`;
    }

    // Keluhan & Komplain
    else if (/menyampaikan\s+keluhan|ajukan\s+komplain|klaim\s+garansi|komplain/i.test(norm)) {
      const guide = DataService.getCustomerComplaintGuide();
      directReply = `🛡️ **${guide.title}**\n\n${guide.content}`;
    }

    // Harga Layanan dari Katalog (N10) — pertanyaan harga umum ("berapa
    // biaya perbaikan AC?") dijawab dari katalog layanan, BUKAN dari daftar
    // invoice milik customer. Cabang ini HARUS sebelum cabang tagihan karena
    // pola tagihan lama menangkap frasa "biaya perbaikan". Dikecualikan bila
    // pertanyaan menyangkut tagihan/pesanan milik sendiri (mengandung
    // "saya"/"tagihan"/"invoice") — itu urusan cabang tagihan/status.
    else if (
      /biaya|harga|tarif/i.test(norm) &&
      !/saya|tagihan|invoice|pesanan\s+saya|order\s+saya/i.test(norm) &&
      /perbaikan|servis|service|layanan|cuci|pasang|instalasi|ac\b|kulkas|freezer|mesin\s+cuci|kipas|televisi|\btv\b|pompa|kompor|dispenser|vacuum/i.test(norm)
    ) {
      const prices = await DataService.getPublicServicePrices();
      if (prices === null) {
        directReply = 'Daftar harga layanan tidak dapat dibaca saat ini (database tidak dapat diakses). Coba lagi nanti.';
      } else if (prices.length === 0) {
        directReply = 'Belum ada layanan aktif yang tercatat di katalog BANTUIN.';
      } else {
        // Cocokkan kata kunci pertanyaan dengan nama layanan/kategori.
        const stopwords = new Set(['berapa', 'biaya', 'harga', 'tarif', 'perbaikan', 'servis', 'service', 'layanan', 'untuk', 'yang', 'dan', 'atau', 'apa', 'saya', 'di', 'ke', 'dari', 'dengan', 'adalah', 'itu', 'ini', 'ya', 'kak', 'min', 'mau', 'tanya', 'dong', 'sih', 'aja', 'saja', 'kisaran', 'sekitar', 'kira', 'ongkos', 'berapa', 'kalo', 'kalau']);
        const keywords = norm.split(/[^a-z0-9]+/i).filter((w) => w.length >= 2 && !stopwords.has(w));
        const matched = prices.filter((p) => {
          const hay = `${p.name} ${p.categoryName} ${p.slug} ${p.categorySlug}`.toLowerCase();
          return keywords.some((k) => hay.includes(k));
        });
        if (matched.length > 0) {
          const list = matched.slice(0, 10);
          directReply = `💰 **Harga Layanan yang Sesuai:**\n\n` +
            list.map((p, i) => `**${i + 1}. ${p.name}** (${p.categoryName})\n- Harga Dasar: **Rp ${p.basePrice.toLocaleString('id-ID')}**\n- Estimasi Durasi: ${p.estimatedDurationMin} menit`).join('\n') +
            (matched.length > 10 ? `\n\n_...dan ${matched.length - 10} layanan lainnya yang cocok._` : '') +
            `\n\n_Harga di atas adalah tarif dasar. Biaya akhir ditentukan setelah teknisi melakukan diagnosis dan disetujui oleh Anda._`;
        } else {
          // Tidak ada layanan yang cocok kata kuncinya — tampilkan kisaran
          // harga per kategori (ringkas) agar pengguna bisa mempersempit.
          const byCat = new Map<string, { min: number; max: number; count: number }>();
          for (const p of prices) {
            const e = byCat.get(p.categoryName) || { min: p.basePrice, max: p.basePrice, count: 0 };
            e.min = Math.min(e.min, p.basePrice);
            e.max = Math.max(e.max, p.basePrice);
            e.count += 1;
            byCat.set(p.categoryName, e);
          }
          directReply = `💰 **Kisaran Harga Layanan BANTUIN:**\n\n` +
            Array.from(byCat.entries()).map(([cat, r]) => `- **${cat}**: Rp ${r.min.toLocaleString('id-ID')} – Rp ${r.max.toLocaleString('id-ID')} (${r.count} layanan)`).join('\n') +
            `\n\nTanyakan perangkat yang spesifik (mis. "berapa biaya perbaikan AC?") untuk melihat harga pastinya.`;
        }
      }
    }

    // Tagihan & Invoice & Pembayaran
    // N10: pola "biaya perbaikan" DIHAPUS dari cabang ini — pertanyaan harga
    // umum ditangani cabang harga di atas; cabang ini hanya untuk tagihan
    // milik customer sendiri.
    else if (/tagihan|invoice|belum\s+dibayar|pembayaran\s+berhasil|riwayat\s+transaksi/i.test(norm)) {
      // A10 — pertanyaan berfilter dijawab dengan daftar BERFILTER:
      // "belum dibayar" -> unpaid saja, "pembayaran berhasil / sudah
      // dibayar" -> paid saja. Tanpa filter, 10 invoice terbaru bisa
      // semuanya paid sehingga customer menyimpulkan tidak ada tunggakan
      // padahal invoice unpaid ke-11 tidak tampil.
      const wantsUnpaid = /belum\s+dibayar/i.test(norm);
      const wantsPaid = /pembayaran\s+berhasil|sudah\s+dibayar/i.test(norm);
      const invoiceStatus = wantsUnpaid ? 'unpaid' as const : wantsPaid ? 'paid' as const : undefined;
      const invoices = await DataService.getCustomerInvoices(custId, invoiceStatus ? { status: invoiceStatus } : {});
      if (invoices === null) {
        directReply = 'Tagihan Anda tidak dapat dibaca saat ini (database tidak dapat diakses). Coba lagi nanti.';
      } else if (invoices.length === 0) {
        directReply = wantsUnpaid
          ? `Tidak ada tagihan yang belum dibayar di akun Anda. Semua tagihan Anda sudah lunas.`
          : wantsPaid
          ? `Belum ada tagihan yang sudah dibayar di akun Anda.`
          : `Saat ini tidak ada tagihan invoice aktif di akun Anda. Tagihan resmi baru akan diterbitkan secara transparan setelah teknisi menyelesaikan inspeksi/perbaikan dan disetujui oleh Anda.`;
      } else {
        directReply = `📋 **Data Tagihan Invoice Anda:**\n\n` +
          invoices.map((inv, i) => `**${i + 1}. Invoice ${inv.invoiceNumber}** (Order #${inv.orderCode})\n- Kategori: ${inv.categoryName}\n- Total Tagihan: **Rp ${inv.totalAmount.toLocaleString('id-ID')}**\n- Status Pembayaran: **${inv.status.toUpperCase()}**\n- Metode Pembayaran: ${inv.paymentMethod}\n- Jatuh Tempo: ${new Date(inv.dueDate).toLocaleDateString('id-ID')}\n`).join('\n') +
          // A24 — daftar dibatasi 10 TERBARU (bukan seluruh tagihan).
          (invoices.length === 10 ? `\n_(menampilkan 10 tagihan terbaru)_` : '') +
          `\nPembayaran dapat dilakukan aman menggunakan QRIS otomatis atau Transfer Virtual Account melalui aplikasi.`;
      }
    }

    // Komunikasi & Pesan dari Teknisi
    else if (/pesan\s+terbaru\s+dari\s+teknisi|catatan\s+terbaru|pesan\s+teknisi|hubungi\s+teknisi/i.test(norm)) {
      // N11: jangan hardcode order id 1 bila tidak ada konteks order — pakai
      // pesanan terbaru customer; bila belum ada pesanan, katakan terus
      // terang (bukan menampilkan pesan order yang salah).
      let orderRef: string | null = contextEntities.activeOrderCode || null;
      if (!orderRef) {
        const latest = await DataService.getCustomerRepairs(custId, { limit: 1 });
        if (latest === null) {
          directReply = 'Pesan teknisi tidak dapat dibaca saat ini (database tidak dapat diakses). Coba lagi nanti.';
        } else if (latest.length === 0) {
          directReply = 'Anda belum memiliki pesanan perbaikan, jadi belum ada pesan dari teknisi. Silakan ajukan pesanan terlebih dahulu.';
        } else {
          orderRef = latest[0].orderCode;
        }
      }
      if (orderRef) {
        const messages = await DataService.getCustomerMessages(custId, orderRef);
        if (messages === null) {
          directReply = 'Pesan teknisi tidak dapat dibaca saat ini (database tidak dapat diakses). Coba lagi nanti.';
        } else if (messages.length === 0) {
          directReply = `Belum ada pesan chat terbaru dari teknisi untuk pesanan #${orderRef}. Anda dapat mengirim pesan langsung melalui fitur **Chat Pesanan** di aplikasi BANTUIN.`;
        } else {
          directReply = `💬 **Pesan Koordinasi Teknisi Terbaru (Pesanan #${orderRef}):**\n\n` +
            messages.map((m, i) => `**${i + 1}. ${m.senderName}:**\n"${m.content}"\n_Waktu: ${new Date(m.createdAt).toLocaleString('id-ID')}_\n`).join('\n') +
            `\nAnda dapat membalas chat langsung melalui panel chat pesanan di aplikasi.`;
        }
      }
    }

    // Teknisi Penangan
    else if (/siapa\s+teknisi|teknisi\s+yang\s+menangani|kontak\s+teknisi/i.test(norm)) {
      const repairs = await DataService.getCustomerRepairs(custId, { limit: 1 });
      if (repairs === null) {
        directReply = 'Pesanan Anda tidak dapat dibaca saat ini (database tidak dapat diakses). Coba lagi nanti.';
      } else if (repairs.length === 0) {
        directReply = `Anda belum memiliki pesanan perbaikan aktif di sistem BANTUIN. Silakan ajukan pesanan teknisi terlebih dahulu.`;
      } else {
        const r = repairs[0];
        if (r.technician) {
          directReply = `👨‍🔧 **Mitra Teknisi untuk Pesanan #${r.orderCode}:**
- **Nama Teknisi:** ${r.technician.name}
- **Rating Kepuasan:** ${r.technician.ratingCount > 0 ? `⭐ ${r.technician.rating.toFixed(1)} / 5.0 (${r.technician.ratingCount} ulasan)` : 'belum ada ulasan'}
- **Status Pesanan:** ${r.status.toUpperCase()}
${r.technician.phone ? `- **Nomor Telepon Koordinasi:** ${r.technician.phone}` : ''}

Anda dapat berkomunikasi secara langsung dengan teknisi melalui fitur **Chat Pesanan** di aplikasi BANTUIN.`;
        } else {
          directReply = `Pesanan Anda #${r.orderCode} saat ini masih berstatus **${r.status.toUpperCase()}** dan sedang dalam proses pencocokan mitra teknisi terdekat. Kami akan segera memberi notifikasi ketika teknisi telah ditugaskan.`;
        }
      }
    }

    // Status Pesanan & Perkembangan Perbaikan
    else if (/status\s+pesanan|perkembangan\s+perbaikan|pesanan\s+saya|pesanan\s+terbaru|belum\s+diproses|sudah\s+selesai|diagnosis\s+kerusakan|tindakan\s+perbaikan|estimasi\s+perbaikan/i.test(norm) || contextEntities.activeOrderCode) {
      const specificOrderCode = contextEntities.activeOrderCode;
      let orderDetail = null;

      if (specificOrderCode) {
        orderDetail = await DataService.getCustomerRepairDetail(custId, specificOrderCode);
      }

      if (!orderDetail) {
        // A11 — "sudah selesai" -> completed saja; "belum diproses" ->
        // submitted saja. Tanpa filter, 3 pesanan terbaru bisa tidak
        // mengandung satu pun pesanan yang ditanyakan.
        // (Filter hanya dipakai bila tidak ada kode spesifik: bila kode
        // disebut, kueri ini hanya menjadi probe keterbacaan DB untuk A12.)
        const wantsCompleted = !specificOrderCode && /sudah\s+selesai/i.test(norm);
        const wantsSubmitted = !specificOrderCode && /belum\s+diproses/i.test(norm);
        const repairs = await DataService.getCustomerRepairs(custId, {
          limit: 3,
          ...(wantsCompleted ? { status: 'completed' } : wantsSubmitted ? { status: 'submitted' } : {}),
        });
        if (repairs === null) {
          directReply = 'Pesanan Anda tidak dapat dibaca saat ini (database tidak dapat diakses). Coba lagi nanti.';
        } else if (specificOrderCode) {
          // A12 — DB terbukti bisa dibaca (repairs bukan null), jadi kode
          // ini memang tidak ada di akun customer (salah ketik / milik
          // orang lain): katakan terus terang, jangan diam-diam
          // menampilkan pesanan lain seolah-olah itu yang ditanyakan.
          directReply = `Pesanan dengan kode \`${specificOrderCode}\` tidak ditemukan di akun Anda. Pastikan kode pesanan sudah benar (format: BAN-YYYYMMDD-XXXXX), atau tanyakan "pesanan saya" untuk melihat daftar pesanan Anda.`;
        } else if (repairs.length === 0) {
          directReply = wantsCompleted
            ? `Anda belum memiliki pesanan perbaikan yang sudah selesai.`
            : wantsSubmitted
            ? `Saat ini tidak ada pesanan Anda yang belum diproses.`
            : `Saat ini Anda belum memiliki pesanan perbaikan aktif di database BANTUIN. Jika membutuhkan perbaikan AC, Kulkas, atau peralatan rumah tangga lainnya, silakan klik tombol **Pesan Layanan** di aplikasi.`;
        } else {
          // A24 — daftar ini dibatasi 3 TERBARU (bukan seluruh pesanan).
          const listTitle = wantsCompleted
            ? '📋 **Pesanan Anda yang Sudah Selesai (3 terbaru):**'
            : wantsSubmitted
            ? '📋 **Pesanan Anda yang Belum Diproses (3 terbaru):**'
            : '📋 **Daftar Pesanan Perbaikan Terbaru Anda (3 terbaru):**';
          directReply = `${listTitle}\n\n` +
            repairs.map((r, i) => `**${i + 1}. Pesanan #${r.orderCode}** (${r.categoryName})\n- Perangkat: ${r.device}\n- Status: **${r.status.toUpperCase()}**\n- Keluhan: ${r.problem}\n- Teknisi: ${r.technician?.name || 'Menunggu Penugasan'}\n- Estimasi/Biaya: ${r.diagnosis?.estimate ? `Rp ${r.diagnosis.estimate.toLocaleString('id-ID')}` : 'Menunggu Inspeksi'}\n`).join('\n') +
            `\nUntuk melihat linimasa lengkap atau live chat teknisi, silakan buka menu **Pesanan Saya**.`;
        }
      } else {
        directReply = `📋 **Rincian Status Pesanan #${orderDetail.orderCode}:**
- **Kategori:** ${orderDetail.categoryName} (${orderDetail.device})
- **Status Saat Ini:** **${orderDetail.status.toUpperCase()}**
- **Keluhan:** ${orderDetail.problem}
- **Teknisi Bertugas:** ${orderDetail.technician?.name || 'Menunggu Penugasan'}
${orderDetail.schedule ? `- **Jadwal Kunjungan:** ${orderDetail.schedule.date} (${orderDetail.schedule.timeSlot})` : ''}
${orderDetail.diagnosis ? `- **Hasil Diagnosis:** ${orderDetail.diagnosis.damageDetails}\n- **Estimasi Biaya:** Rp ${orderDetail.diagnosis.totalEstimate.toLocaleString('id-ID')} (Persetujuan: ${orderDetail.diagnosis.approvalStatus.toUpperCase()})` : ''}
${orderDetail.invoice ? `- **Status Tagihan:** Rp ${orderDetail.invoice.totalAmount.toLocaleString('id-ID')} (${orderDetail.invoice.status.toUpperCase()})` : ''}
- **Waktu Pengajuan:** ${new Date(orderDetail.createdAt).toLocaleString('id-ID')}`;
      }
    }
  }

  // ==========================================================================
  // C. KATEGORI KHUSUS TECHNICIAN (TEKNISI)
  // ==========================================================================
  else if (userContext.role === 'technician' && userContext.userId) {
    const techId = userContext.userId;

    // F10 — Jawaban atas aksi tertunda (langkah ke-2 two-step verification).
    // Cabang ini HARUS berada di awal rantai teknisi agar jawaban "ya" /
    // "tidak" tidak jatuh ke cabang lain atau ke AI. Pesan menanggapi aksi
    // tertunda hanya bila (a) ada aksi tertunda dari teknisi yang sama di
    // sesi ini, dan (b) pesan TIDAK memerintahkan aksi/kode yang berbeda
    // (perintah baru ditangani cabang aksi di bawah dan menggantikan aksi
    // tertunda lama).
    const pendingAction = getPendingTechnicianAction(session.id);
    const messageActionType = detectTechnicianActionType(norm);
    const messageOrderCode = contextEntities.orderCodeFromCurrentMessage === true
      ? contextEntities.activeOrderCode
      : null;
    const messageTargetsPending = Boolean(
      pendingAction &&
      pendingAction.userId === userContext.userId &&
      (!messageActionType || messageActionType === pendingAction.action) &&
      (!messageOrderCode || messageOrderCode === pendingAction.orderCode)
    );

    // S9g — konfirmasi harus KETAT (lihat isTechnicianConfirmationReply):
    // "ya" yang diikuti isi lain ("ya, saya mau tanya soal garansi") BUKAN
    // konfirmasi aksi — pesan itu jatuh ke cabang biasa, dan aksi tertunda
    // tetap menunggu jawaban "ya" yang sesungguhnya.
    if (pendingAction && messageTargetsPending && isTechnicianConfirmationReply(norm, pendingAction)) {
      // Konfirmasi afirmatif: eksekusi aksi tertunda dengan confirmed: true.
      // State machine di action-service memvalidasi ulang status saat ini,
      // jadi konfirmasi yang sudah basi secara status ditolak dengan aman.
      const confirmedResult = await ActionService.executeTechnicianTaskStatusUpdate(userContext, {
        orderCodeOrId: pendingAction.orderCode,
        newStatus: pendingAction.action,
        notes: userMessage,
        confirmed: true,
      });
      if (confirmedResult.requiresConfirmation && confirmedResult.confirmationPrompt) {
        // Tidak seharusnya terjadi (confirmed: true), tetapi bila terjadi,
        // simpan lagi aksinya dan tampilkan prompt baru.
        setPendingTechnicianAction(session.id, { ...pendingAction, createdAt: Date.now() });
        directReply = confirmedResult.confirmationPrompt;
      } else {
        clearPendingTechnicianAction(session.id);
        directReply = confirmedResult.success
          ? `✅ **Berhasil:** ${confirmedResult.message}`
          : `⚠️ **Gagal:** ${confirmedResult.message}`;
      }
    } else if (pendingAction && messageTargetsPending && TECHNICIAN_CONFIRM_NO_PATTERN.test(norm)) {
      const actionLabel = ActionService.TECHNICIAN_TASK_TRANSITIONS?.[pendingAction.action]?.label || pendingAction.action;
      clearPendingTechnicianAction(session.id);
      directReply = `Baik, aksi ${actionLabel} untuk pesanan #${pendingAction.orderCode} dibatalkan. Tidak ada perubahan yang disimpan.`;
    }

    // Profil & Riwayat Kinerja Teknisi
    else if (/siapa\s+nama\s+saya|profil\s+saya/i.test(norm)) {
      const [profile, metrics] = await Promise.all([
        DataService.getTechnicianProfile(techId),
        DataService.getTechnicianPerformanceMetrics(techId),
      ]);

      if (metrics === null) {
        directReply = 'Data kinerja Anda tidak dapat dibaca saat ini (database tidak dapat diakses). Coba lagi nanti.';
      } else {
        directReply = `👨‍🔧 **Ringkasan Profil & Aktivitas Kinerja Rekan Teknisi:**
- **Nama Lengkap:** ${profile?.fullName || userContext.name}
- **Email:** ${profile?.email}
- **Nomor WhatsApp:** ${profile?.phoneNumber}
- **Rating Rata-Rata:** ⭐ ${profile?.ratingAvg.toFixed(2)} (${profile?.ratingCount} ulasan)
- **Pengalaman:** ${profile?.experienceYears} Tahun
- **Keahlian:** ${profile?.specializations.join(', ') || 'Elektronik Rumah Tangga'}
- **Total Pekerjaan Selesai:** **${metrics.stats.completed} pesanan**
- **Tugas Aktif Saat Ini:** **${metrics.pendingTasksCount} tugas**
- **Rata-rata Waktu Penyelesaian:** ${metrics.averageCompletionHours}`;
      }
    }

    // Statistik & Laporan Pekerjaan Selesai / Waktu Penyelesaian
    else if (/jumlah\s+tugas|pekerjaan\s+yang\s+sudah\s+saya\s+selesai|pekerjaan\s+yang\s+sudah\s+selesai|tugas\s+yang\s+belum\s+selesai|rata-rata\s+waktu|pekerjaan\s+masih\s+tertunda|penyebab\s+pekerjaan\s+tertunda|ringkasan\s+aktivitas|ringkasan\s+pekerjaan|performa/i.test(norm)) {
      const metrics = await DataService.getTechnicianPerformanceMetrics(techId);
      if (metrics === null) {
        directReply = 'Data kinerja Anda tidak dapat dibaca saat ini (database tidak dapat diakses). Coba lagi nanti.';
      } else {
        directReply = `📊 **Laporan Kinerja & Aktivitas Pekerjaan Anda:**
- **Pekerjaan Selesai Tuntas:** **${metrics.stats.completed} pesanan**
- **Tugas Sedang Diterima / Berjalan:** **${metrics.stats.accepted} tugas**
- **Tawaran Tugas Baru (Offered):** **${metrics.stats.offered} tugas**
- **Tugas Belum Selesai (Pending):** **${metrics.pendingTasksCount} tugas**
- **Rata-rata Waktu Penyelesaian:** **${metrics.averageCompletionHours}**
- **Tugas Ditolak:** ${metrics.stats.rejected} tugas

💡 **Catatan Kinerja:** Pekerjaan tertunda umumnya disebabkan oleh waktu tunggu kedatangan suku cadang pengganti atau penyesuaian jadwal kunjungan ulang oleh pelanggan.`;
      }
    }

    // Manajemen Tugas & Tugas Hari Ini
    else if (/tugas\s+hari\s+ini|apa\s+saja\s+tugas|tugas\s+mana\s+yang\s+paling\s+mendesak|paling\s+mendesak|deadline|pekerjaan\s+terlambat|detail\s+perangkat|siapa\s+customer/i.test(norm)) {
      // A14 — "tugas hari ini" -> hanya yang terjadwal hari ini;
      // "paling mendesak" -> hanya yang terjadwal dalam 24 jam ke depan,
      // diurutkan jadwal terdekat. Tanpa filter, jawaban mencampur tugas
      // minggu depan dan tugas tanpa jadwal — dan tugas offered minggu
      // depan tampil sebelum tugas accepted hari ini pukul 09:00.
      const wantsToday = /tugas\s+hari\s+ini/i.test(norm);
      const wantsUrgent = !wantsToday && /paling\s+mendesak|deadline|pekerjaan\s+terlambat/i.test(norm);
      const tasks = await DataService.getTechnicianAssignedTasks(techId, {
        limit: 5,
        ...(wantsToday ? { todayOnly: true } : wantsUrgent ? { urgentOnly: true } : {}),
      });
      if (tasks === null) {
        directReply = 'Daftar tugas Anda tidak dapat dibaca saat ini (database tidak dapat diakses). Coba lagi nanti.';
      } else if (tasks.length === 0) {
        directReply = wantsToday
          ? `Halo Rekan Teknisi! Tidak ada tugas yang terjadwal hari ini.`
          : wantsUrgent
          ? `Halo Rekan Teknisi! Tidak ada tugas mendesak (terjadwal dalam 24 jam ke depan) saat ini.`
          : `Halo Rekan Teknisi! Saat ini tidak ada tugas perbaikan aktif yang ditugaskan kepada Anda. Tetap pantau dashboard teknisi Anda.`;
      } else {
        const listTitle = wantsToday
          ? '🛠️ **Daftar Tugas Hari Ini:**'
          : wantsUrgent
          ? '🛠️ **Tugas Paling Mendesak (terjadwal 24 jam ke depan):**'
          : '🛠️ **Daftar Tugas Perbaikan Anda:**';
        directReply = `${listTitle}\n\n` +
          tasks.map((t, i) => `**${i + 1}. Order #${t.orderCode}** (${t.categoryName} - ${t.device})\n- Status Tugas: **${t.assignmentStatus.toUpperCase()}** (Order: ${t.orderStatus})\n- Pelanggan: **${t.customerName}** (${t.customerPhone})\n- Alamat: ${t.address}\n- Keluhan: ${t.problem}\n- Jadwal: **${t.schedule}**\n- Urgensi: ${t.assignmentStatus === 'offered' ? '🔴 Butuh Konfirmasi Cepat' : '🟡 Dalam Jadwal'}\n`).join('\n') +
          `\nAnda dapat memperbarui status kunjungan langsung melalui asisten ini atau dashboard teknisi.`;
      }
    }

    // Diagnosis & Pemeriksaan Awal
    else if (/keluhan\s+customer|riwayat\s+kerusakan|penyebab\s+kerusakan|pemeriksaan\s+awal|rekomendasi\s+tindakan|catatan\s+diagnosis/i.test(norm)) {
      // A15 — bila kode pesanan disebut (konteks sesi), jawab tentang
      // TUGAS ITU — bukan tugas pertama dalam antrean (yang bisa pesanan
      // yang sama sekali berbeda).
      const orderCode = contextEntities.activeOrderCode;
      const tasks = await DataService.getTechnicianAssignedTasks(techId, orderCode ? { orderCode, limit: 1 } : { limit: 1 });
      if (tasks === null) {
        directReply = 'Data tugas Anda tidak dapat dibaca saat ini (database tidak dapat diakses). Coba lagi nanti.';
      } else if (tasks.length === 0) {
        directReply = orderCode
          ? `Tugas dengan kode pesanan #${orderCode} tidak ditemukan di antara tugas aktif Anda. Pastikan kode pesanan sudah benar.`
          : `Belum ada tugas aktif untuk menampilkan data diagnosis.`;
      } else {
        const t = tasks[0];
        directReply = `🔍 **Data Diagnosis & Keluhan Tugas #${t.orderCode}:**
- **Perangkat:** ${t.device} (${t.categoryName})
- **Keluhan Pelanggan:** "${t.problem}"
- **Langkah Pemeriksaan Awal:** Periksa ampere beban, cek tegangan stopkontak, dan lakukan visual inspection pada komponen utama.
${t.diagnosis ? `- **Catatan Diagnosis:** ${t.diagnosis.damageDetails}\n- **Estimasi Biaya:** Rp ${t.diagnosis.estimate.toLocaleString('id-ID')} (Approval: ${t.diagnosis.approvalStatus})` : '- **Catatan Diagnosis:** Belum dilakukan pengisian form diagnosis di aplikasi.'}`;
      }
    }

    // Komunikasi dengan Customer
    else if (/customer\s+yang\s+harus\s+dihubungi|pesan\s+terbaru\s+dari\s+customer|informasi\s+yang\s+perlu\s+disampaikan/i.test(norm)) {
      // A15 — sama seperti cabang diagnosis: hormati kode pesanan dari konteks.
      const orderCode = contextEntities.activeOrderCode;
      const tasks = await DataService.getTechnicianAssignedTasks(techId, orderCode ? { orderCode, limit: 1 } : { limit: 1 });
      if (tasks === null) {
        directReply = 'Data tugas Anda tidak dapat dibaca saat ini (database tidak dapat diakses). Coba lagi nanti.';
      } else if (tasks.length === 0) {
        directReply = orderCode
          ? `Tugas dengan kode pesanan #${orderCode} tidak ditemukan di antara tugas aktif Anda. Pastikan kode pesanan sudah benar.`
          : `Saat ini tidak ada customer dari tugas aktif yang perlu Anda hubungi.`;
      } else {
        const t = tasks[0];
        directReply = `📞 **Customer Tugas Aktif Anda (#${t.orderCode}):**
- **Nama Pelanggan:** ${t.customerName}
- **Nomor Kontak:** ${t.customerPhone}
- **Alamat Kunjungan:** ${t.address}
- **Informasi yang Perlu Disampaikan:** Konfirmasikan estimasi jam kedatangan, sampaikan SOP pemeriksaan awal, dan minta izin sebelum membongkar penutup unit.`;
      }
    }

    // SOP & Prosedur Operasional Teknisi
    else if (/sop\s+penerimaan|prosedur\s+pemeriksaan|prosedur\s+penggantian|tidak\s+dapat\s+diperbaiki|sop/i.test(norm)) {
      const sop = DataService.getTechnicianSOP(norm);
      directReply = `📘 **${sop.title}:**\n\n` + sop.steps.join('\n');
    }

    // Tindakan Aksi Teknisi: Perbarui Status
    // N4: kode order WAJIB disebut eksplisit di pesan yang sama
    // (orderCodeFromCurrentMessage === true). Jangan pernah mengeksekusi aksi
    // pada kode order yang diingat dari pesan lama (entitas sesi bisa
    // kedaluwarsa dan aksi akan mengubah pesanan yang salah).
    else if (/terima\s+tugas|menuju\s+lokasi|mulai\s+diagnosa|mulai\s+perbaikan/i.test(norm)) {
      const explicitOrderCode = contextEntities.orderCodeFromCurrentMessage === true
        ? contextEntities.activeOrderCode
        : null;
      if (!explicitOrderCode) {
        // N18: intent aksi tanpa kode order (dan tanpa kode yang disebut
        // eksplisit di pesan ini) — jawab deterministik; jangan diam lalu
        // melempar ke AI yang tidak punya tool aksi.
        directReply = 'Tugas yang mana? Sebutkan kode pesanannya (mis. BAN-…)';
      } else {
        const actionType = detectTechnicianActionType(norm) || 'on_the_way';

        // F10 — Panggilan pertama tanpa confirmed: action-service
        // mengembalikan requiresConfirmation + prompt TANPA memutasi.
        // Simpan aksi sebagai tertunda dan tampilkan prompt ke teknisi;
        // eksekusi terjadi saat teknisi membalas "ya" (cabang konfirmasi
        // di awal rantai teknisi). Pesan satu langkah ("ya, terima tugas
        // BAN-...") yang cocok dengan aksi tertunda sudah ditangani cabang
        // konfirmasi di atas, sehingga ke sini selalu tanpa confirmed.
        const actionResult = await ActionService.executeTechnicianTaskStatusUpdate(userContext, {
          orderCodeOrId: explicitOrderCode,
          newStatus: actionType,
          notes: userMessage,
        });

        if (actionResult.requiresConfirmation && actionResult.confirmationPrompt) {
          setPendingTechnicianAction(session.id, {
            orderCode: explicitOrderCode,
            action: actionType,
            userId: userContext.userId,
            createdAt: Date.now(),
          });
          directReply = actionResult.confirmationPrompt;
        } else {
          // Aksi dieksekusi atau ditolak definitif (mis. state machine):
          // aksi tertunda yang sama (bila ada) sudah tidak berlaku.
          if (pendingAction && pendingAction.orderCode === explicitOrderCode && pendingAction.action === actionType) {
            clearPendingTechnicianAction(session.id);
          }
          directReply = actionResult.success
            ? `✅ **Berhasil:** ${actionResult.message}`
            : `⚠️ **Gagal:** ${actionResult.message}`;
        }
      }
    }
  }

  // ==========================================================================
  // D. KATEGORI KHUSUS ADMINISTRATOR (ADMIN)
  // ==========================================================================
  else if (userContext.role === 'admin') {
    // 0. Metrik tunggal yang lugas (jawab hanya angka yang ditanya)
    const singleMetric = norm.replace(/[?!.]+$/g, '').trim();
    if (/^(berapa\s+)?total\s+pendapatan$/.test(singleMetric) || singleMetric === 'pendapatan') {
      const finance = await DataService.getAdminFinancialAnalytics();
      directReply = finance === null ? 'Data tidak dapat dibaca saat ini (database tidak dapat diakses). Coba lagi nanti.' : `Total Pendapatan Terkonfirmasi: Rp ${finance.totalRevenuePaid.toLocaleString('id-ID')}`;
    } else if (/^(berapa\s+)?total\s+pengguna$/.test(singleMetric) || /^(berapa\s+)?jumlah\s+pengguna$/.test(singleMetric)) {
      const stats = await DataService.getAdminUserStats();
      directReply = stats === null ? 'Data tidak dapat dibaca saat ini (database tidak dapat diakses). Coba lagi nanti.' : `Total Pengguna Terdaftar: ${stats.totalUsers}`;
    } else if (/^(berapa\s+)?total\s+pesanan$/.test(singleMetric) || /^(berapa\s+)?jumlah\s+pesanan$/.test(singleMetric)) {
      const overview = await DataService.getAdminOperationalOverview();
      directReply = overview === null ? 'Data tidak dapat dibaca saat ini (database tidak dapat diakses). Coba lagi nanti.' : `Total Seluruh Pesanan: ${overview.orders.total} pesanan`;
    } else if (/^(berapa\s+)?total\s+(customer|pelanggan)$/.test(singleMetric) || /^(berapa\s+)?jumlah\s+(customer|pelanggan)$/.test(singleMetric)) {
      const custData = await DataService.getAdminCustomerAnalytics();
      directReply = custData === null ? 'Data tidak dapat dibaca saat ini (database tidak dapat diakses). Coba lagi nanti.' : `Total Pelanggan Terdaftar: ${custData.totalCustomers} akun`;
    } else if (/^(berapa\s+)?total\s+teknisi$/.test(singleMetric) || /^(berapa\s+)?jumlah\s+teknisi$/.test(singleMetric)) {
      const stats = await DataService.getAdminUserStats();
      directReply = stats === null ? 'Data tidak dapat dibaca saat ini (database tidak dapat diakses). Coba lagi nanti.' : `Total Mitra Teknisi: ${stats.technicians.total}`;
    } else if (/^(berapa\s+)?(total\s+|jumlah\s+)?pengguna\s+aktif$/.test(singleMetric)) {
      const stats = await DataService.getAdminUserStats();
      directReply = stats === null ? 'Data tidak dapat dibaca saat ini (database tidak dapat diakses). Coba lagi nanti.' : `Total Pengguna Aktif: ${stats.customers.active + stats.technicians.active + stats.admins.active}`;
    } else if (/^(berapa\s+)?(total\s+|jumlah\s+)?(customer|pelanggan)\s+aktif$/.test(singleMetric)) {
      const stats = await DataService.getAdminUserStats();
      directReply = stats === null ? 'Data tidak dapat dibaca saat ini (database tidak dapat diakses). Coba lagi nanti.' : `Total Pelanggan Aktif: ${stats.customers.active}`;
    } else if (/^(berapa\s+)?(total\s+|jumlah\s+)?teknisi\s+aktif$/.test(singleMetric)) {
      const stats = await DataService.getAdminUserStats();
      directReply = stats === null ? 'Data tidak dapat dibaca saat ini (database tidak dapat diakses). Coba lagi nanti.' : `Total Teknisi Aktif: ${stats.technicians.active}`;
    }

    // 0a. Daftar nama pengguna (mode list lugas: "siapa saja nama customer" -> list nama saja)
    // N21: pola memakai (?:nama(?:-nama)?\s+)? agar reduplikasi "nama-nama"
    // ("siapa aja nama-nama customer") ikut cocok — tanda hubung mematahkan
    // filler \w+ sehingga frasa itu dulu lolos dari 0a maupun D#12.
    else if (
      /siapa\s+(?:\w+\s+){0,2}(?:nama(?:-nama)?\s+)?(pengguna|user|customer|pelanggan|teknisi|pemilik|akun)|daftar\s+(?:nama(?:-nama)?\s+)?(pengguna|user|customer|pelanggan|teknisi|pemilik|akun)|list\s+(?:nama(?:-nama)?\s+)?(pengguna|user|customer|pelanggan|teknisi|pemilik|akun)/i.test(norm) &&
      !contextEntities.activePhoneNumber && !contextEntities.activeEmail && !contextEntities.activeUserUuid && !/\d{8,15}/.test(norm)
    ) {
      const listRoleMatch = norm.match(/(?:siapa\s+(?:\w+\s+){0,2}(?:nama(?:-nama)?\s+)?|daftar\s+(?:nama(?:-nama)?\s+)?|list\s+(?:nama(?:-nama)?\s+)?)(pengguna|user|customer|pelanggan|teknisi|pemilik|akun)/i);
      const roleWord = (listRoleMatch?.[1] || '').toLowerCase();
      const listRole = roleWord === 'customer' || roleWord === 'pelanggan' ? 'customer' : roleWord === 'teknisi' ? 'technician' : null;
      const roleLabel = listRole === 'customer' ? 'customer' : listRole === 'technician' ? 'teknisi' : 'pengguna';
      const wantsActiveOnly = /\baktif\b/i.test(norm) && !/tidak\s+aktif|nonaktif/i.test(norm);
      // A23 — "tidak aktif"/"nonaktif" memfilter status 'inactive'
      // (sebelumnya tidak ada jalurnya sehingga semua customer tampil
      // tanpa penanda status).
      const wantsInactiveOnly = /tidak\s+aktif|nonaktif/i.test(norm);
      const listStatus = wantsActiveOnly ? 'active' as const : wantsInactiveOnly ? 'inactive' as const : undefined;
      // N22: pakai getUserNameListWithTotal agar pemotongan di 50 nama
      // terlihat ("menampilkan 50 terbaru dari N total") — jangan biarkan
      // admin mengira 50 nama itu seluruh pengguna.
      const nameList = await DataService.getUserNameListWithTotal(listRole, 50, listStatus);
      if (nameList === null) {
        directReply = 'Tidak dapat membaca daftar nama saat ini (database tidak dapat diakses). Coba lagi nanti.';
      } else if (nameList.names.length === 0) {
        directReply = wantsActiveOnly ? `Belum ada ${roleLabel} aktif terdaftar.` : wantsInactiveOnly ? `Belum ada ${roleLabel} tidak aktif terdaftar.` : `Belum ada ${roleLabel} terdaftar.`;
      } else {
        directReply = nameList.names.map((n, i) => `${i + 1}. ${n}`).join('\n');
        if (nameList.total > nameList.names.length) {
          directReply += `\n\n_(menampilkan ${nameList.names.length} terbaru dari ${nameList.total} total)_`;
        }
      }
    }

    // 1. Dashboard, Total Pesanan & Status Perbaikan
    else if (/total\s+pesanan|pesanan\s+bulan\s+ini|pesanan\s+hari\s+ini|pesanan\s+yang\s+dibatalkan|pesanan\s+dibatalkan|perbaikan\s+berdasarkan\s+status|ringkasan\s+operasional|dashboard|operasional\s+hari\s+ini/i.test(norm)) {
      const overview = await DataService.getAdminOperationalOverview();
      if (overview === null) {
        directReply = 'Ringkasan operasional tidak dapat dibaca saat ini (database tidak dapat diakses). Coba lagi nanti.';
      } else if (/pesanan\s+hari\s+ini/i.test(norm)) {
        // N6: jawab dengan hitungan berfilter tanggal — bukan total all-time.
        directReply = `Pesanan Hari Ini: ${overview.orders.today} pesanan`;
      } else if (/pesanan\s+bulan\s+ini/i.test(norm)) {
        // N6: jawab dengan hitungan bulan kalender berjalan.
        directReply = `Pesanan Bulan Ini: ${overview.orders.thisMonth} pesanan`;
      } else {
        directReply = `📊 **Ringkasan Operasional & Total Pesanan BANTUIN (Admin Dashboard):**
- **Total Seluruh Pesanan:** **${overview.orders.total} pesanan**
- **Pesanan Hari Ini:** **${overview.orders.today} pesanan**
- **Pesanan Bulan Ini:** **${overview.orders.thisMonth} pesanan**
- **Draf (Draft):** **${overview.orders.draft}**
- **Menunggu Penugasan (Submitted):** **${overview.orders.submitted}**
- **Penugasan Diterima (Assigned):** **${overview.orders.assigned}**
- **Terjadwal Kunjungan (Scheduled):** **${overview.orders.scheduled}**
- **Sedang Diagnosa (In Diagnosis):** **${overview.orders.inDiagnosis}**
- **Estimasi Diterbitkan — Menunggu Persetujuan Pelanggan (Estimated):** **${overview.orders.estimated}**
- **Disetujui Pelanggan / Menunggu Pengerjaan Dimulai (Customer Approved):** **${overview.orders.customerApproved}**
- **Dalam Pengerjaan (In Repair):** **${overview.orders.inRepair}**
- **Selesai Tuntas (Completed):** **${overview.orders.completed}**
- **Pesanan Dibatalkan (Cancelled):** **${overview.orders.cancelled}**
- **Dikomplain (Complained):** **${overview.orders.complained}**
- **Mitra Teknisi Aktif:** **${overview.technicians.active} teknisi**
- **Pelanggan Aktif Terdaftar:** **${overview.customers.active} akun**
- **Pengaduan Terbuka (Open Complaints):** **${overview.complaints.active} kasus**`;
      }
    }

    // 2. Analitik Customer / Pelanggan
    // N25: pesan berawalan "cari" adalah intent pencarian eksplisit — jangan
    // biarkan D#2 (blok analitik) membayanginya; biarkan jatuh ke D#12.
    // (D#12 tidak dipindah ke depan D#2 karena "data customer terbaru"
    // lebih tepat dijawab blok analitik daripada pencarian.)
    else if (!/^\s*cari\b/i.test(norm) && /customer|pelanggan/i.test(norm) && /daftar|terbaru|baru|sering|terbanyak|belum\s+selesai|riwayat|total/i.test(norm)) {
      const custData = await DataService.getAdminCustomerAnalytics();
      if (custData === null) {
        directReply = 'Analitik pelanggan tidak dapat dibaca saat ini (database tidak dapat diakses). Coba lagi nanti.';
      } else {
        // A24 — kedua daftar dibatasi 5 TERBARU: beri tahu totalnya agar
        // admin tidak mengira 5 baris itu seluruh data.
        const recentNote = custData.totalCustomers > custData.recentCustomers.length
          ? ` (menampilkan ${custData.recentCustomers.length} terbaru dari ${custData.totalCustomers} total pelanggan)`
          : '';
        const pendingNote = custData.pendingOrdersTotal > custData.pendingOrders.length
          ? ` (menampilkan ${custData.pendingOrders.length} terbaru dari ${custData.pendingOrdersTotal} total pesanan berjalan)`
          : '';
        directReply = `👥 **Analisis Pelanggan BANTUIN (Customer Intelligence):**
- **Total Pelanggan Terdaftar:** **${custData.totalCustomers} akun**
- **Pelanggan Baru Bulan Ini:** **${custData.newCustomersThisMonth} pelanggan**

**Daftar Pelanggan Terbaru${recentNote}:**\n` +
        custData.recentCustomers.map((c, i) => `${i + 1}. **${c.name}** (${c.phone}) - Kota: ${c.city} - _Daftar: ${c.registeredAt}_`).join('\n') +
        `\n\n**Pelanggan dengan Pesanan Sedang Berjalan${pendingNote}:**\n` +
        custData.pendingOrders.map((p, i) => `${i + 1}. **${p.customerName}** (Order #${p.orderCode}) - ${p.category} [${p.status.toUpperCase()}]`).join('\n');
      }
    }

    // 3. Analitik & Beban Kerja Mitra Teknisi
    else if (/teknisi/i.test(norm) && /total|aktif|terbanyak|tertunda|performa|rata-rata|beban\s+kerja|statistik/i.test(norm)) {
      const workload = await DataService.getAdminTechnicianWorkload();
      if (workload === null) {
        directReply = 'Data beban kerja teknisi tidak dapat dibaca saat ini (database tidak dapat diakses). Coba lagi nanti.';
      } else if (workload.length === 0) {
        directReply = 'Belum ada data teknisi yang tercatat di database BANTUIN.';
      } else {
        // B30/A29 — "Tugas Aktif" hanya penugasan yang sudah DITERIMA
        // (accepted); penawaran yang belum dijawab (offered) dilaporkan
        // terpisah sebagai "Penawaran Menunggu". Kolom Status Akun
        // menampilkan status akun + verifikasi dokumen (teknisi suspended
        // / belum terverifikasi tetap tampil — jangan disembunyikan).
        // is_available berarti kesiapan menerima order baru: "Siap terima
        // order" / "Tidak menerima order" — false BUKAN berarti "Sibuk".
        const techStatusLabel = (w: { accountStatus: string; verifiedStatus: string }): string => {
          const account = w.accountStatus === 'active' ? 'Aktif'
            : w.accountStatus === 'suspended' ? 'Ditangguhkan'
            : w.accountStatus === 'inactive' ? 'Tidak Aktif'
            : w.accountStatus === 'pending_verification' ? 'Menunggu Verifikasi Akun'
            : w.accountStatus;
          const verified = w.verifiedStatus === 'verified' ? ''
            : w.verifiedStatus === 'pending' ? ' (verifikasi dokumen pending)'
            : w.verifiedStatus === 'rejected' ? ' (verifikasi dokumen ditolak)'
            : w.verifiedStatus === 'suspended' ? ' (verifikasi ditangguhkan)'
            : '';
          return `${account}${verified}`;
        };
        directReply = `👨‍🔧 **Analitik Kinerja & Beban Kerja Mitra Teknisi:**\n\n| No | Nama Teknisi | Rating | Tugas Aktif | Penawaran Menunggu | Pekerjaan Selesai | Status Akun | Kesiapan |\n| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |\n` +
          workload.map((w, i) => `| ${i + 1} | ${w.name} | ⭐ ${w.ratingAvg.toFixed(1)} (${w.ratingCount}) | **${w.activeTasks}** | ${w.offeredTasks} | ${w.completedTasks} | ${techStatusLabel(w)} | ${w.isAvailable ? 'Siap terima order' : 'Tidak menerima order'} |`).join('\n') +
          // B29/A24 — daftar ini hanya 10 teratas berdasarkan beban kerja.
          (workload.length === 10 ? `\n\n_(menampilkan 10 teknisi teratas berdasarkan beban kerja — daftar lengkap di Admin Console)_` : '') +
          `\n_Catatan: Teknisi dengan beban kerja tertinggi diprioritaskan untuk penyeimbangan kuota order terdekat._`;
      }
    }

    // 4. Perbaikan Tertunda / Keterlambatan / Belum Diproses
    else if (/belum\s+diproses|belum\s+dapat\s+teknisi|belum\s+mendapatkan\s+teknisi|terlambat|keterlambatan|penyebab\s+keterlambatan|perbaikan\s+tertunda/i.test(norm)) {
      const [delayed, delayedTotal] = await Promise.all([
        DataService.getAdminDelayedRepairs(),
        DataService.countAdminDelayedRepairs(),
      ]);
      if (delayed === null) {
        directReply = 'Data perbaikan tertunda tidak dapat dibaca saat ini (database tidak dapat diakses). Coba lagi nanti.';
      } else if (delayed.length === 0) {
        directReply = `✅ **Status Aman:** Saat ini tidak ada pesanan perbaikan yang terdeteksi mengalami keterlambatan atau penundaan kritis di sistem BANTUIN.`;
      } else {
        // B-X3 — judul lama "(Tertunda / Unassigned)" salah: daftar ini
        // mencakup pesanan assigned/scheduled/in_diagnosis/estimated/
        // in_repair yang SUDAH punya teknisi.
        directReply = `⚠️ **Daftar Pesanan Tertunda / Memerlukan Perhatian:**\n\n` +
          delayed.map((d, i) => `**${i + 1}. Order #${d.orderCode}** (${d.categoryName})\n- Status: **${d.status.toUpperCase()}**\n- Durasi Tunggu: **${d.elapsedHours} jam**\n- Teknisi: ${d.technician}\n- Penyebab Keterlambatan: ${d.cause}\n`).join('\n') +
          // B24/A24 — daftar dibatasi 10 terlama: beri tahu totalnya.
          (delayedTotal !== null && delayedTotal > delayed.length ? `\n_(menampilkan ${delayed.length} pesanan tertunda terlama dari ${delayedTotal} total)_` : '');
      }
    }

    // 5. Keuangan & Transaksi Platform
    else if (/total\s+transaksi|pendapatan|omzet|tagihan\s+belum\s+dibayar|pembayaran\s+gagal|transaksi\s+berhasil|keuangan|laba/i.test(norm)) {
      const finance = await DataService.getAdminFinancialAnalytics();
      if (finance === null) {
        directReply = 'Data keuangan tidak dapat dibaca saat ini (database tidak dapat diakses). Coba lagi nanti.';
      } else {
        // A2/B26 — SATUAN DIJELASKAN: "invoice" (tagihan) dan "transaksi
        // pembayaran" (baris payments) adalah benda yang berbeda — satu
        // invoice bisa dibayar lewat beberapa transaksi (cicilan /
        // percobaan ulang), sehingga 11 invoice vs 18 transaksi adalah
        // hasil yang sah, bukan salah hitung. Tampilkan invoice per
        // status, jembatan rekonsiliasi (COUNT DISTINCT invoice yang
        // punya settlement), baris refund bila ada, dan pisah piutang
        // tertunggak (lewat jatuh tempo) vs belum jatuh tempo.
        const settledTxCount = finance.paymentMethodsBreakdown.reduce((sum, p) => sum + p.transactionCount, 0);
        const breakdownVolume = finance.paymentMethodsBreakdown.reduce((sum, p) => sum + p.volume, 0);
        directReply = `💰 **Rekapitulasi Keuangan Platform BANTUIN:**
- **Total Invoice:** ${finance.totalInvoices} invoice — Lunas: ${finance.invoicesByStatus.paid} | Belum Dibayar: ${finance.invoicesByStatus.unpaid} | Dibatalkan: ${finance.invoicesByStatus.cancelled} | Refund: ${finance.invoicesByStatus.refunded}
- **Total Pendapatan Terkonfirmasi (Lunas):** **Rp ${finance.totalRevenuePaid.toLocaleString('id-ID')}** — dari ${settledTxCount} transaksi pembayaran settlement untuk ${finance.settledInvoiceCount} invoice
- **Total Biaya Platform (Platform Fee):** **Rp ${finance.totalPlatformFee.toLocaleString('id-ID')}** _(dari invoice lunas yang sudah ada pembayaran settlement)_
- **Piutang Invoice Belum Dibayar (Unpaid):** **Rp ${finance.totalUnpaidAmount.toLocaleString('id-ID')}** — Tertunggak (lewat jatuh tempo): Rp ${finance.totalUnpaidOverdue.toLocaleString('id-ID')} | Belum Jatuh Tempo: Rp ${finance.totalUnpaidNotYetDue.toLocaleString('id-ID')}**${finance.refundedTotal > 0 ? `\n- **Dikurangi Refund:** **Rp ${finance.refundedTotal.toLocaleString('id-ID')}**` : ''}\n\n**Sebaran Metode Pembayaran Berhasil (transaksi pembayaran settlement):**\n` +
        finance.paymentMethodsBreakdown.map(p => `- ${p.method.toUpperCase()}: ${p.transactionCount} transaksi (Rp ${p.volume.toLocaleString('id-ID')})`).join('\n') +
        `\n\n_Rekonsiliasi: ${settledTxCount} transaksi pembayaran settlement untuk ${finance.settledInvoiceCount} invoice; jumlah sebaran Rp ${breakdownVolume.toLocaleString('id-ID')} dikurangi refund Rp ${finance.refundedTotal.toLocaleString('id-ID')} = pendapatan Rp ${finance.totalRevenuePaid.toLocaleString('id-ID')}. Satu invoice dapat dibayar lewat beberapa transaksi, sehingga jumlah transaksi bisa melebihi jumlah invoice._`;
      }
    }

    // 6. Laporan & Analisis Strategis
    else if (/laporan\s+operasional|bandingkan\s+jumlah\s+pesanan|layanan\s+paling\s+diminati|kendala\s+operasional|tren\s+penyelesaian|rekomendasi\s+peningkatan\s+efisiensi/i.test(norm)) {
      const rep = await DataService.getAdminOperationalReport();
      if (rep === null) {
        directReply = 'Laporan operasional tidak dapat dibaca saat ini (database tidak dapat diakses). Coba lagi nanti.';
      } else {
        directReply = `📈 **Laporan Strategis Operasional Platform:**
- **Pesanan Bulan Ini:** **${rep.monthlyComparison.currentMonthOrders} pesanan** (Bulan Sebelumnya: ${rep.monthlyComparison.previousMonthOrders} | Pertumbuhan: **${rep.monthlyComparison.growthPercent}**)
- **Pendapatan Bulan Ini:** **${rep.monthlyComparison.currentMonthRevenue}** (Pertumbuhan: **${rep.monthlyComparison.revenueGrowthPercent}**)

**Layanan Paling Diminati:**\n` +
        rep.topServices.map((s, i) => `${i + 1}. **${s.name}**: ${s.requests} pesanan (${s.share})`).join('\n') +
        // B-X4 — penyebut share adalah seluruh pesanan bulan ini (termasuk
        // yang service_id-nya NULL), sehingga jumlah share < 100%: beri
        // label penyebutnya.
        `\n_(persentase dihitung dari seluruh pesanan bulan ini)_` +
        `\n\n**Kendala Operasional Sering Terjadi:**\n` +
        rep.frequentIssues.map(f => `- ${f.issue} (Dampak: ${f.impact})`).join('\n') +
        `\n\n**Rekomendasi Peningkatan Efisiensi:**\n` +
        rep.efficiencyRecommendations.map(r => `✅ ${r}`).join('\n') +
        // B-X4 — catatan konsistensi: pendapatan laporan ini memakai
        // definisi yang sama dengan rekap keuangan (settlement − refund).
        `\n\n_Pendapatan dihitung dari pembayaran yang sudah settlement dikurangi refund — definisi yang sama dengan rekap keuangan._`;
      }
    }

    // 7. Notifikasi Gagal
    else if (/notifikasi.*gagal|gagal\s+dikirim/i.test(norm)) {
      const notif = await DataService.getAdminNotificationStatus();
      if (notif === null) {
        directReply = 'Status notifikasi tidak dapat dibaca saat ini (database tidak dapat diakses). Coba lagi nanti.';
      } else {
        // B-X6/B25 — "Total Upaya Pengiriman" = sent + failed (OTP pending
        // belum dikirim, dilaporkan terpisah). 'sent' berarti gateway
        // menerima pesan — BUKAN "diterima" ponsel tujuan (tidak ada
        // status delivered/read di skema).
        directReply = `📱 **Status Pengiriman Notifikasi WhatsApp OTP:**
- **Total Upaya Pengiriman:** **${notif.totalSent}**
- **Terkirim ke Gateway (Sent):** **${notif.delivered}**
- **Gagal Dikirim (Failed):** **${notif.failed}**
- **Menunggu Pengiriman (Pending):** **${notif.pending}**\n\n**Rincian Log Kegagalan:**\n` +
        notif.failedLogs.map((l, i) => `${i + 1}. Tujuan: \`${l.phone}\` - Penyebab: ${l.reason} (${l.createdAt})`).join('\n');
      }
    }

    // 8. Diagnostik Sistem, Database, OTP & AI
    else if (/status\s+database|layanan\s+otp|gemini\s+api|status\s+sistem|kesehatan\s+sistem/i.test(norm)) {
      const health = await DataService.getAdminSystemHealth();
      // B-X7/B16 — provider AI AKTIF dari database (bukan "Model Gemini"
      // dari env var). B31 — latensi "-" bila DB tidak terhubung.
      const aiProviderLine = health.aiProvider.provider
        ? `${health.aiProvider.name || health.aiProvider.provider} — Model: \`${health.aiProvider.model || 'tidak diketahui'}\` (${health.aiProvider.apiKeyConfigured ? '✅ Kunci API Terkonfigurasi' : '⚠️ API Key Belum Disetel'})${health.aiProvider.lastConnectionStatus ? ` — status koneksi terakhir: ${health.aiProvider.lastConnectionStatus}` : ''}`
        : 'tidak diketahui (konfigurasi provider tidak dapat dibaca)';
      directReply = `🖥️ **Laporan Status Kesehatan Sistem BANTUIN:**
- **Basis Data MySQL 8.0:** ${health.database.connected ? '✅ Terhubung Normal' : '❌ Terputus'} (Latensi: ${health.database.latencyMs === null || health.database.latencyMs === undefined ? '-' : `${health.database.latencyMs} ms`})
- **Gateway WhatsApp OTP (Fonnte):** Status Terakhir: **${health.whatsappFonnte.lastStatus.toUpperCase()}**
- **Provider AI Aktif:** ${aiProviderLine}
- **Waktu Server:** ${new Date(health.serverTime).toLocaleString('id-ID')}`;
    }

    // 9. Pengaturan Konfigurasi Sistem
    else if (/konfigurasi|system\s+settings|pengaturan\s+aplikasi|pengaturan\s+sistem/i.test(norm)) {
      const settings = await DataService.getAdminSystemSettings();
      if (settings === null) {
        directReply = 'Pengaturan sistem tidak dapat dibaca saat ini (database tidak dapat diakses). Coba lagi nanti.';
      } else if (settings.length === 0) {
        directReply = 'Belum ada pengaturan sistem yang tercatat di database BANTUIN.';
      } else {
        directReply = `⚙️ **Pengaturan Konfigurasi Sistem BANTUIN (Admin View):**\n\n` +
          settings.map((s, i) => `**${i + 1}. ${s.key}** [${s.group}]\n- Nilai: \`${s.value}\`\n${s.description ? `- Deskripsi: ${s.description}\n` : ''}`).join('\n') +
          // B31 — daftar ini disaring allowlist R3 (8 key): beri tahu admin.
          `\n\n_Menampilkan pengaturan yang diizinkan untuk chatbot; pengaturan lain dikelola lewat Admin Console._`;
      }
    }

    // 10. Log Audit Aktivitas Admin
    else if (/audit\s+log|aktivitas\s+administrasi|jejak\s+audit/i.test(norm)) {
      const logs = await DataService.getAdminRecentAuditLogs(5);
      if (logs === null) {
        directReply = 'Log audit tidak dapat dibaca saat ini (database tidak dapat diakses). Coba lagi nanti.';
      } else if (logs.length === 0) {
        directReply = 'Belum ada aktivitas administrator yang tercatat di database BANTUIN.';
      } else {
        directReply = `📜 **Riwayat Aktivitas Administrator Terbaru (Audit Trail):**\n\n` +
          logs.map((l, i) => `**${i + 1}. Aksi: ${l.action}**\n- Entitas: \`${l.entityName}\` (ID: ${l.entityId})\n- Admin: ${l.adminEmail}\n- Waktu: ${new Date(l.createdAt).toLocaleString('id-ID')}\n`).join('\n');
      }
    }

    // 11. Statistik Pengguna Berdasarkan Role
    else if (/total\s+pengguna|statistik\s+user|jumlah\s+user|pengguna\s+berdasarkan\s+role/i.test(norm)) {
      const stats = await DataService.getAdminUserStats();
      if (stats === null) {
        directReply = 'Statistik pengguna tidak dapat dibaca saat ini (database tidak dapat diakses). Coba lagi nanti.';
      } else {
        // A9/B27 — tampilkan bucket suspended (sebelumnya hilang sehingga
        // rincian < total) dan lengkapi bucket admin. "Menunggu Verifikasi"
        // teknisi adalah verifikasi AKUN (OTP) — bukan verifikasi dokumen
        // teknisi (technician_profiles.verified_status): label diperjelas.
        directReply = `👥 **Statistik Pengguna Sistem BANTUIN:**
- **Total Pengguna Terdaftar:** **${stats.totalUsers}**
- **Pelanggan (Customer):** ${stats.customers.total} (${stats.customers.active} Aktif, ${stats.customers.pending} Menunggu OTP, ${stats.customers.inactive} Tidak Aktif, ${stats.customers.suspended} Ditangguhkan)
- **Mitra Teknisi:** ${stats.technicians.total} (${stats.technicians.active} Aktif, ${stats.technicians.pending} Menunggu Verifikasi Akun (OTP), ${stats.technicians.inactive} Tidak Aktif, ${stats.technicians.suspended} Ditangguhkan)
- **Administrator:** ${stats.admins.total} Akun (${stats.admins.active} Aktif, ${stats.admins.pending} Menunggu OTP, ${stats.admins.inactive} Tidak Aktif, ${stats.admins.suspended} Ditangguhkan)`;
      }
    }

    // 12. Pencarian Pengguna Berdasarkan Nomor Telepon, Email, UUID, atau Nama (Admin User Search)
    // N21: pola memakai (?:nama(?:-nama)?\s+)? seperti 0a — "siapa aja
    // nama-nama customer" harus mencapai D#12 bila guard 0a tidak lolos.
    else if (
      /siapa\s+(?:\w+\s+){0,2}(?:nama(?:-nama)?\s+)?(?:pengguna|user|customer|pelanggan|teknisi|pemilik|akun)|nama\s+pengguna|pemilik\s+(?:nomor|no|email|akun)|cari\s+(?:pengguna|user|customer|pelanggan|teknisi)|data\s+(?:pengguna|user|customer|pelanggan|teknisi)/i.test(norm) ||
      ((norm.includes('telepon') || norm.includes('phone') || norm.includes('no hp') || norm.includes('nomor') || norm.includes('email') || norm.includes('uuid')) &&
        Boolean(contextEntities.activePhoneNumber || contextEntities.activeEmail || contextEntities.activeUserUuid || /\d{8,15}/.test(norm)))
    ) {
      // N9: strip awalan perintah + kata peran + kata pengisi secara seragam
      // sebelum dipakai sebagai searchTerm. Pola lama hanya men-strip "siapa
      // nama pengguna" dan "cari <peran tanpa pelanggan>" — "cari pelanggan
      // Budi" menjadi searchTerm "cari pelanggan Budi" (dicari harfiah,
      // selalu tidak ketemu) dan "data customer Budi" tidak di-strip sama
      // sekali. Satu regex berulang men-strip semua awalan tersebut.
      // N21: "nama-nama" ikut di-strip (nama(?:-nama)?) agar "siapa aja
      // nama-nama customer Budi" menghasilkan searchTerm "Budi".
      const strippedName = userMessage
        .replace(/^\s*(?:siapa\s+(?:saja\s+|aja\s+)?|cari\s+|data\s+|tampilkan\s+|tunjukkan\s+|lihat\s+|nama(?:-nama)?\s+|pengguna\s+|user\s+|customer\s+|pelanggan\s+|teknisi\s+|pemilik\s+|akun\s+|dengan\s+|nomor\s+telepon\s+|email\s+|uuid\s+|yang\s+|bernama\s+)+/i, '')
        .replace(/[?!.]+$/g, '')
        .trim();
      const searchTerm = contextEntities.activePhoneNumber ||
        contextEntities.activeEmail ||
        contextEntities.activeUserUuid ||
        norm.match(/\b\d{8,15}\b/)?.[0] ||
        strippedName;

      // S29/F20 — bila target pencarian berasal dari MEMORI (bukan disebut
      // di pesan ini) dan belum dikonfirmasi, JANGAN mencari dulu: tanyakan
      // klarifikasi dan simpan targetnya sebagai tertunda. Jawaban "ya"
      // pada pesan berikutnya menjalankan pencarian ini (resolve
      // mengembalikan memorySearchConfirmed). Target dari pesan saat ini
      // (termasuk angka yang diketik langsung) tidak perlu konfirmasi.
      const memoryTarget = contextEntities.memorySearchTarget;
      const searchTermFromMemory = Boolean(
        memoryTarget &&
        searchTerm === memoryTarget.value &&
        (memoryTarget.kind === 'phone' || memoryTarget.kind === 'email' || memoryTarget.kind === 'uuid')
      );

      if (searchTermFromMemory && memoryTarget) {
        setPendingMemorySearchConfirmation(session.id, {
          kind: memoryTarget.kind,
          value: memoryTarget.value,
          userId: userContext.userId ?? null,
          createdAt: Date.now(),
        });
        directReply = buildMemorySearchClarification(memoryTarget);
      } else if (!searchTerm) {
        directReply = 'Sebutkan nama, nomor telepon, email, atau UUID pengguna yang ingin dicari (mis. "cari pelanggan Budi").';
      } else {
        // A18 — kualifikasi peran dari pesan ("cari pelanggan Budi")
        // diteruskan sebagai filter role (getter sudah mendukungnya sejak
        // N14; sebelumnya peran dibuang saat strip sehingga 5 teknisi
        // Budi bisa mendesak customer Budi keluar dari LIMIT).
        const roleWord = /\bpelanggan\b|\bcustomer\b/i.test(norm) ? 'customer'
          : /\bteknisi\b/i.test(norm) ? 'technician'
          : /\badmin\b/i.test(norm) ? 'admin'
          : undefined;
        const matchedUsers = await DataService.searchDatabaseUsers(searchTerm, { limit: 5, ...(roleWord ? { role: roleWord } : {}) });
        if (matchedUsers === null) {
          // A16 — null = DB error, BUKAN "tidak ditemukan".
          directReply = 'Pencarian pengguna tidak dapat dilakukan saat ini (database tidak dapat diakses). Coba lagi nanti.';
        } else if (matchedUsers.length === 0) {
          // A22 — jangan klaim memeriksa "arsip": pengguna soft-deleted
          // tidak pernah dicari (query memfilter deleted_at IS NULL).
          directReply = `🔍 **Hasil Pencarian Basis Data Pengguna:**\n\nBerdasarkan pencarian pada sistem BANTUIN, data pengguna dengan kata kunci \`${searchTerm}\` **tidak ditemukan** di antara pengguna terdaftar (belum termasuk akun yang sudah dihapus).\n\nPastikan nomor telepon, alamat email, atau UUID yang dimasukkan sudah benar dan terdaftar di BANTUIN.`;
        } else {
        directReply = `👤 **Hasil Pencarian Basis Data Pengguna (Admin Console):**\n\n` +
          matchedUsers.map((u, i) => {
            const roleBadge = u.role === 'customer' ? 'Pelanggan (Customer)' : u.role === 'technician' ? 'Mitra Teknisi' : 'Administrator';
            return `**${i + 1}. Data Pengguna #${u.id}:**
- **Nama Lengkap:** **${u.fullName}**
- **Peran (Role):** **${roleBadge}**
- **Nomor Telepon / WA:** \`${u.phoneNumber}\` (${u.isVerified ? '✅ Terverifikasi' : '⚠️ Belum Verifikasi'})
- **Alamat Email:** \`${u.email}\`
- **Status Akun:** **${u.status.toUpperCase()}**
${u.city ? `- **Kota Domisili:** ${u.city}` : ''}
${u.address ? `- **Alamat Tersimpan:** ${u.address}` : ''}
${u.technicianDetails ? `- **Rating Teknisi:** ⭐ ${u.technicianDetails.ratingAvg.toFixed(1)} (${u.technicianDetails.ratingCount} ulasan) | Pengalaman: ${u.technicianDetails.yearsOfExperience} Tahun` : ''}
- **UUID Sistem:** \`${u.uuid}\`
- **Terdaftar Pada:** ${new Date(u.registeredAt).toLocaleDateString('id-ID', { dateStyle: 'long' })}`;
          }).join('\n\n') +
          // A24 — daftar dibatasi 5 terbaru.
          (matchedUsers.length === 5 ? `\n\n_(menampilkan 5 hasil terbaru; persempit kata kunci bila pengguna yang dicari belum muncul)_` : '') +
          `\n\n💡 _Catatan Admin: Untuk mengelola status akun, verifikasi, atau riwayat transaksi pengguna ini, silakan buka menu **Manajemen Pengguna** di Admin Console._`;
        }
      }
    }

    // 13. Pencarian & Detail Pesanan Spesifik (Order Lookup)
    else if (contextEntities.activeOrderCode || /detail\s+pesanan|cari\s+pesanan|status\s+order|lacak\s+order/i.test(norm)) {
      const orderSearchTerm = contextEntities.activeOrderCode || norm.match(/\b(?:REP|BAN|ORD)-[A-Za-z0-9-]+\b/i)?.[0] || '';
      // S29/F20 — kode order dari memori (bukan dari pesan ini) wajib
      // dikonfirmasi dulu (lihat D#12). Kode dari pesan saat ini — atau
      // yang sudah dikonfirmasi ("ya" atas klarifikasi) — langsung dicari.
      if (contextEntities.orderCodeFromMemory && !contextEntities.memorySearchConfirmed && orderSearchTerm) {
        setPendingMemorySearchConfirmation(session.id, {
          kind: 'order',
          value: orderSearchTerm,
          userId: userContext.userId ?? null,
          createdAt: Date.now(),
        });
        directReply = buildMemorySearchClarification({ kind: 'order', value: orderSearchTerm });
      } else if (orderSearchTerm) {
        const orders = await DataService.searchDatabaseOrders(orderSearchTerm, { limit: 3 });
        if (orders === null) {
          // A16 — null = DB error, BUKAN "tidak ditemukan".
          directReply = 'Pencarian pesanan tidak dapat dilakukan saat ini (database tidak dapat diakses). Coba lagi nanti.';
        } else if (orders.length > 0) {
          directReply = `📋 **Rincian Pesanan Perbaikan Basis Data (Admin Intelligence):**\n\n` +
            orders.map((o, i) => `**${i + 1}. Pesanan #${o.orderCode}** (${o.category})
- **Perangkat:** ${o.device}
- **Status Operasional:** **${o.status.toUpperCase()}**
- **Keluhan:** "${o.problem}"
- **Pelanggan:** **${o.customerName}** (\`${o.customerPhone}\`)
- **Lokasi Pengerjaan:** ${o.address}
- **Teknisi Bertugas:** **${o.technicianName}** ${o.technicianRating ? `(⭐ ${o.technicianRating.toFixed(1)})` : ''}
- **Tagihan Invoice:** ${o.invoiceNumber ? `\`${o.invoiceNumber}\` - Rp ${o.totalAmount?.toLocaleString('id-ID')} [${o.invoiceStatus.toUpperCase()}]` : 'Belum Diterbitkan'}
- **Waktu Diajukan:** ${new Date(o.createdAt).toLocaleString('id-ID')}`).join('\n\n') +
            // A24 — daftar dibatasi 3 terbaru.
            (orders.length === 3 ? `\n\n_(menampilkan 3 hasil terbaru; persempit kode pesanan bila yang dicari belum muncul)_` : '');
        } else {
          // N13: jawab eksplisit bila tidak ditemukan — jangan diam lalu
          // melempar ke AI yang tidak punya data order tersebut (AI dapat
          // berhalusinasi menjawab seolah order itu ada).
          directReply = `Pesanan dengan kode \`${orderSearchTerm}\` tidak ditemukan di database BANTUIN. Pastikan kode pesanan sudah benar (format: BAN-YYYYMMDD-XXXXX).`;
        }
      } else {
        directReply = 'Sebutkan kode pesanan yang ingin dicari (mis. "detail pesanan BAN-20261113-00001").';
      }
    }

    // 14. Pencarian Tagihan Invoice Spesifik (Invoice Lookup)
    else if (contextEntities.activeInvoiceNumber || /tagihan\s+invoice|cek\s+invoice|nomor\s+invoice/i.test(norm)) {
      const invSearchTerm = contextEntities.activeInvoiceNumber || norm.match(/\bINV-[A-Za-z0-9-]+\b/i)?.[0] || '';
      // S29/F20 — nomor invoice dari memori wajib dikonfirmasi dulu (lihat D#12).
      if (contextEntities.invoiceNumberFromMemory && !contextEntities.memorySearchConfirmed && invSearchTerm) {
        setPendingMemorySearchConfirmation(session.id, {
          kind: 'invoice',
          value: invSearchTerm,
          userId: userContext.userId ?? null,
          createdAt: Date.now(),
        });
        directReply = buildMemorySearchClarification({ kind: 'invoice', value: invSearchTerm });
      } else if (invSearchTerm) {
        const invoices = await DataService.searchDatabaseInvoices(invSearchTerm, { limit: 3 });
        if (invoices === null) {
          // A16 — null = DB error, BUKAN "tidak ditemukan".
          directReply = 'Pencarian invoice tidak dapat dilakukan saat ini (database tidak dapat diakses). Coba lagi nanti.';
        } else if (invoices.length > 0) {
          directReply = `📋 **Data Tagihan Invoice Basis Data (Admin View):**\n\n` +
            invoices.map((inv, i) => `**${i + 1}. Invoice #${inv.invoiceNumber}** (Order #${inv.orderCode})
- **Kategori Layanan:** ${inv.category}
- **Nama Pelanggan:** **${inv.customerName}** (\`${inv.customerPhone}\`)
- **Rincian Biaya:** Jasa Rp ${inv.laborCost.toLocaleString('id-ID')} | Suku Cadang Rp ${inv.partsCost.toLocaleString('id-ID')} | Biaya Layanan Rp ${inv.serviceFee.toLocaleString('id-ID')}
${inv.discountAmount > 0 ? `- **Diskon:** −Rp ${inv.discountAmount.toLocaleString('id-ID')}\n` : ''}- **Total Pembayaran:** **Rp ${inv.totalAmount.toLocaleString('id-ID')}**
- **Status Tagihan:** **${inv.status.toUpperCase()}**
- **Jatuh Tempo:** ${new Date(inv.dueDate).toLocaleDateString('id-ID')}`).join('\n\n') +
            // A24 — daftar dibatasi 3 terbaru.
            (invoices.length === 3 ? `\n\n_(menampilkan 3 hasil terbaru; persempit nomor invoice bila yang dicari belum muncul)_` : '');
        } else {
          // N13: jawab eksplisit bila tidak ditemukan (lihat D#13).
          directReply = `Invoice dengan nomor \`${invSearchTerm}\` tidak ditemukan di database BANTUIN. Pastikan nomor invoice sudah benar (format: INV-YYYYMMDD-XXXXX).`;
        }
      } else {
        directReply = 'Sebutkan nomor invoice yang ingin dicari (mis. "cek invoice INV-20261113-00001").';
      }
    }

    // 15. Skema & Metadata Basis Data (Database Architecture Inspection)
    else if (/struktur\s+database|skema\s+database|metadata\s+tabel|daftar\s+tabel|relasi\s+tabel/i.test(norm)) {
      const schemaSummary = getRoleFilteredSchemaSummary('admin');
      directReply = `🗄️ **Arsitektur & Skema Basis Data BANTUIN (MySQL 8.0):**\n\n${schemaSummary}\n\n💡 Seluruh akses query pada BANTUIN diproteksi oleh Row-Level Security, parameterized queries, dan whitelist column projection untuk menjamin integritas data dan kepatuhan UU PDP.`;
    }
  }

  // S29/F20 — pertanyaan lanjutan admin yang targetnya HANYA ada di memori
  // dan tidak tertangkap cabang deterministik di atas (mis. "siapa namanya?"
  // setelah menyebut nomor telepon) TIDAK BOLEH jatuh ke AI dengan target
  // memori tersuntik diam-diam: tampilkan klarifikasi deterministik.
  // (Cabang customer tidak digerakkan ke sini: target memori customer hanya
  // memilih di antara pesanan MILIKNYA SENDIRI — salah pilih merugikan
  // kenyamanan, bukan membocorkan data orang lain — dan alur follow-up
  // "pesanan tadi" adalah UX yang dimaksudkan. Cabang teknisi memakai
  // tugas milik sendiri, dan aksi status sudah mewajibkan kode eksplisit.)
  if (
    !directReply &&
    userContext.role === 'admin' &&
    contextEntities.hasUnconfirmedMemorySearchTarget &&
    contextEntities.memorySearchTarget &&
    contextEntities.isFollowUpLike
  ) {
    const target = contextEntities.memorySearchTarget;
    setPendingMemorySearchConfirmation(session.id, {
      kind: target.kind,
      value: target.value,
      userId: userContext.userId ?? null,
      createdAt: Date.now(),
    });
    directReply = buildMemorySearchClarification(target);
  }

  // JIKA DATA DAPAT DIJAWAB LANGSUNG SECARA DETERMINISTIK OLEH DATA SERVICE
  if (directReply) {
    const finalReply = `${safetyAlertPrefix}${directReply}`;
    const metadata: ChatMessageMetadata = {
      model: 'bantuin-database-intelligence-v1',
      responseTimeMs: Date.now() - startTime,
      quickSuggestions: dynamicSuggestions,
    };

    // S9e — pesan pengguna sudah tersimpan di awal (userStored); di sini
    // hanya balasan yang disimpan.
    const replyStored = await saveChatMessageTracked(session.id, 'assistant', finalReply, metadata, 0, metadata.responseTimeMs);

    return {
      reply: finalReply,
      metadata,
      storedIn: combineStoredIn(userStored, replyStored),
    };
  }

  // ==========================================================================
  // E. PEMANGGILAN MULTI-PROVIDER AI (GEMINI & GROQ VIA AI PROVIDER MANAGER)
  // ==========================================================================
  // Jika pemanggilan AI gagal, simpan alasannya agar fallback expert system
  // di bawah TIDAK menyamar sebagai jawaban AI (lihat bagian F).
  let aiGatewayError: string | null = null;

  if (process.env.FORCE_OFFLINE_AI !== 'true') {
    try {
      const providerManager = AIProviderManager.getInstance();
      const snapshot = await providerManager.getActiveProviderSnapshot();
      const hasActiveKey = Boolean(snapshot.activeConfig.apiKey && snapshot.activeConfig.apiKey.trim());
      const hasFallbackKey = Boolean(snapshot.fallbackConfig && snapshot.fallbackConfig.apiKey && snapshot.fallbackConfig.apiKey.trim());

      if (hasActiveKey || hasFallbackKey) {
        // Siapkan ringkasan konteks database aktual untuk pengguna ini
        if (userContext.role === 'customer' && userContext.userId) {
          const [profile, repairs, invoices] = await Promise.all([
            DataService.getCustomerProfile(userContext.userId),
            DataService.getCustomerRepairs(userContext.userId, { limit: 3 }),
            DataService.getCustomerInvoices(userContext.userId),
          ]);
          // N1: repairs/invoices null saat DB error (kosong = []).
          const repairsList = repairs || [];
          const invoicesList = invoices || [];
          if (repairs === null || invoices === null) {
            dbContextSummary += 'Data pesanan/tagihan tidak dapat dibaca saat ini (database tidak dapat diakses).\n';
          }
          // S9b — ringkasan konteks LLM TIDAK memuat nomor telepon maupun
          // alamat lengkap pelanggan (keduanya PII yang tidak dibutuhkan
          // untuk sebagian besar jawaban; bila pengguna menanyakan
          // profilnya sendiri, cabang deterministik yang menjawab — bukan
          // jalur AI ini).
          dbContextSummary += `Profil Customer: Nama: ${profile?.fullName || '-'}\n`;
          dbContextSummary += `Pesanan Terkini: ${repairsList.length} pesanan tercatat.\n`;
          repairsList.forEach(r => {
            dbContextSummary += `  - Order #${r.orderCode}: Alat: ${r.device} (${r.categoryName}), Status: ${r.status}, Teknisi: ${r.technician?.name || 'Belum ada'}\n`;
          });
          dbContextSummary += `Tagihan Invoice: ${invoicesList.length} invoice (${invoicesList.filter(i => i.status === 'unpaid').length} belum lunas).\n`;
        } else if (userContext.role === 'technician' && userContext.userId) {
          const tasks = await DataService.getTechnicianAssignedTasks(userContext.userId, { limit: 5 });
          const tasksList = tasks || [];
          if (tasks === null) {
            dbContextSummary += 'Data tugas tidak dapat dibaca saat ini (database tidak dapat diakses).\n';
          }
          dbContextSummary += `Tugas Aktif Teknisi: ${tasksList.length} penugasan.\n`;
          // S9b — alamat lengkap pelanggan TIDAK disuntik ke prompt LLM
          // (nama pelanggan dipertahankan: teknisi perlu membedakan
          // tugas-tugasnya; alamat kunjungan tersedia di dashboard tugas
          // dan cabang deterministik bila ditanyakan).
          tasksList.forEach(t => {
            dbContextSummary += `  - Order #${t.orderCode}: Pelanggan: ${t.customerName}, Status: ${t.assignmentStatus}\n`;
          });
        } else if (userContext.role === 'admin') {
          const [overview, finance, userStats] = await Promise.all([
            DataService.getAdminOperationalOverview(),
            DataService.getAdminFinancialAnalytics(),
            DataService.getAdminUserStats(),
          ]);
          // N1: overview/finance/userStats null saat DB error (kosong = objek 0).
          if (overview === null || finance === null || userStats === null) {
            dbContextSummary += 'Ringkasan admin tidak dapat dibaca saat ini (database tidak dapat diakses).\n';
          } else {
            const totalActiveUsers = userStats.customers.active + userStats.technicians.active + userStats.admins.active;
            // N26: sertakan status pesanan antara (assigned/scheduled/
            // in_diagnosis/estimated/customer_approved) agar AI yang ditanya
            // "berapa pesanan sedang diproses" tidak menjawab inRepair saja
            // dan mengecilkan angka.
            // B21 — "Menunggu Persetujuan" adalah status estimated, BUKAN
            // customer_approved (yang SUDAH disetujui dan menunggu
            // pengerjaan dimulai). A1 — sertakan complained agar rincian
            // yang dibaca AI berjumlah sama dengan total.
            dbContextSummary += `Ringkasan Admin: Total Pesanan: ${overview.orders.total}, Menunggu: ${overview.orders.submitted}, Ditugaskan: ${overview.orders.assigned}, Terjadwal: ${overview.orders.scheduled}, Diagnosis: ${overview.orders.inDiagnosis}, Estimasi (Menunggu Persetujuan): ${overview.orders.estimated}, Disetujui Pelanggan: ${overview.orders.customerApproved}, Dikerjakan: ${overview.orders.inRepair}, Selesai: ${overview.orders.completed}, Dibatalkan: ${overview.orders.cancelled}, Dikomplain: ${overview.orders.complained}, Mitra Teknisi Aktif: ${overview.technicians.active}, Pelanggan Aktif: ${overview.customers.active}, Total Pengguna Aktif: ${totalActiveUsers}, Total Pengguna Terdaftar: ${userStats.totalUsers}\n`;
            dbContextSummary += `Keuangan: Total Pendapatan: Rp ${finance.totalRevenuePaid.toLocaleString('id-ID')}, Piutang Tertunggak: Rp ${finance.totalUnpaidOverdue.toLocaleString('id-ID')} (belum jatuh tempo: Rp ${finance.totalUnpaidNotYetDue.toLocaleString('id-ID')}), Total Invoice: ${finance.totalInvoices}\n`;
            // A7/B29 — jumlah teknisi dari getAdminUserStats (total +
            // aktif yang benar), BUKAN .length daftar workload ber-LIMIT
            // 10 yang mencakup teknisi suspended/inactive.
            dbContextSummary += `Teknisi: ${userStats.technicians.active} mitra teknisi aktif dari ${userStats.technicians.total} terdaftar.\n`;
          }

          // S29/F20 — blok konteks pengguna/pesanan di bawah TIDAK disuntik
          // bila targetnya berasal dari memori dan belum dikonfirmasi
          // (klarifikasi deterministik sudah ditampilkan di atas; AI tidak
          // boleh menjawab dari data target yang belum pasti). Target dari
          // pesan saat ini — atau yang sudah dikonfirmasi — tetap dipakai.
          const userSearchTerm = contextEntities.activePhoneNumber || contextEntities.activeEmail || contextEntities.activeUserUuid || '';
          const userTermFromMemoryUnconfirmed = Boolean(
            userSearchTerm &&
            !contextEntities.memorySearchConfirmed &&
            ((contextEntities.phoneNumberFromMemory && userSearchTerm === contextEntities.activePhoneNumber) ||
              (contextEntities.emailFromMemory && userSearchTerm === contextEntities.activeEmail) ||
              (contextEntities.userUuidFromMemory && userSearchTerm === contextEntities.activeUserUuid))
          );
          if (
            !userTermFromMemoryUnconfirmed &&
            (currentPath.includes('/admin/users') || contextEntities.activePhoneNumber || contextEntities.activeEmail || contextEntities.activeUserUuid)
          ) {
            const userRecords = await DataService.searchDatabaseUsers(userSearchTerm, { limit: 6 });
            // A16 — null = DB error: jangan akses .length pada null.
            if (userRecords !== null && userRecords.length > 0) {
              // S9b — daftar pengguna di prompt HANYA memuat nama/peran/
              // status; email/telepon/UUID/alamat dibuang, KECUALI
              // pertanyaan saat ini secara eksplisit meminta field itu
              // untuk satu orang spesifik (lihat detectExplicitPiiAsks).
              const asks = detectExplicitPiiAsks(norm);
              dbContextSummary += `\nDaftar Pengguna Relevan Basis Data:\n` +
                userRecords.map((u) => {
                  const projected = projectUserRecordForPrompt(u, asks);
                  const extra: string[] = [];
                  if (projected.phoneNumber) extra.push(`Telp: ${projected.phoneNumber}`);
                  if (projected.email) extra.push(`Email: ${projected.email}`);
                  if (projected.address) extra.push(`Alamat: ${projected.address}`);
                  if (projected.uuid) extra.push(`UUID: ${projected.uuid}`);
                  return `  - ${projected.name}: Role: ${projected.role}, Status: ${projected.status}${extra.length > 0 ? `, ${extra.join(', ')}` : ''}`;
                }).join('\n') + '\n';
            }
          }
          const orderTermFromMemoryUnconfirmed = Boolean(
            contextEntities.activeOrderCode &&
            contextEntities.orderCodeFromMemory &&
            !contextEntities.memorySearchConfirmed
          );
          if (
            !orderTermFromMemoryUnconfirmed &&
            (currentPath.includes('/admin/repairs') || contextEntities.activeOrderCode)
          ) {
            const orderRecords = await DataService.searchDatabaseOrders(contextEntities.activeOrderCode || '', { limit: 5 });
            // A16 — null = DB error: jangan akses .length pada null.
            if (orderRecords !== null && orderRecords.length > 0) {
              // S9b — nomor telepon pelanggan dibuang kecuali pertanyaan
              // saat ini secara eksplisit memintanya.
              const asks = detectExplicitPiiAsks(norm);
              dbContextSummary += `\nDaftar Pesanan Relevan Basis Data:\n` +
                orderRecords.map(o => `  - Order #${o.orderCode}: Alat: ${o.device} (${o.category}), Status: ${o.status}, Pelanggan: ${o.customerName}${asks.phone && o.customerPhone ? ` (${o.customerPhone})` : ''}`).join('\n') + '\n';
            }
          }
        }

        const activeSnapshot = await providerManager.getActiveProviderSnapshot();
        const systemPrompt = buildSystemPrompt(userContext, dbContextSummary, {
          activeProvider: activeSnapshot.activeConfig.provider,
          providerName: activeSnapshot.activeConfig.name,
          activeModel: activeSnapshot.activeConfig.selectedModel,
        });

        const universalTools: UniversalToolDeclaration[] = [
          {
            name: 'searchDatabaseUsers',
            description: 'Mencari data pengguna (customer, teknisi, admin) berdasarkan nomor telepon, email, nama lengkap, atau UUID di seluruh basis data BANTUIN.',
            parameters: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'Kata kunci pencarian: nomor telepon (cth 628... / 08...), alamat email, nama lengkap, atau UUID pengguna' },
              },
              required: ['query'],
            },
          },
          {
            name: 'searchDatabaseOrders',
            description: 'Mencari pesanan perbaikan berdasarkan kode pesanan (#BAN-..., #REP-...), nama customer, nama alat, atau status operasional.',
            parameters: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'Kode pesanan (#BAN-...), nama customer, nama alat, atau status' },
              },
              required: ['query'],
            },
          },
          {
            name: 'searchDatabaseInvoices',
            description: 'Mencari data tagihan invoice berdasarkan nomor invoice (#INV-...) atau kode pesanan (#BAN-...).',
            parameters: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'Nomor invoice (#INV-...) atau kode pesanan' },
              },
              required: ['query'],
            },
          },
          {
            name: 'searchDatabaseTechnicians',
            description: 'Mencari data mitra teknisi berdasarkan nama atau keahlian spesialisasi.',
            parameters: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'Nama teknisi atau kata kunci spesialisasi' },
              },
              required: ['query'],
            },
          },
          {
            name: 'queryDatabase',
            description: 'Kueri BACA data dari tabel database BANTUIN mana pun yang diizinkan untuk peran pengguna. Gunakan untuk pertanyaan data apa pun yang tidak terjawab alat pencarian lain: total, jumlah, daftar, rekap, dan perbandingan. Hanya SELECT; server yang membangun SQL-nya dan menegakkan izin peran, kolom sensitif tidak pernah dikembalikan. Satu putaran tool saja: bila perlu beberapa kueri, panggil queryDatabase beberapa kali sekaligus. Agregasi di atas JOIN: count/sum menghitung BARIS HASIL JOIN, bukan baris tabel dasar — gunakan count_distinct pada id tabel dasar untuk menghitung baris unik; sum/avg atas kolom tabel dasar bersama JOIN ditolak. Filter pada kolom tabel JOIN membuat LEFT JOIN berperilaku seperti INNER JOIN (baris tanpa pasangan terbuang) — pisahkan kueri hitungan total dan hitungan berfilter. Status pembayaran yang benar dibaca dari payments.payment_status settlement, bukan dari invoices.status.',
            parameters: {
              type: 'object',
              properties: {
                table: { type: 'string', description: 'Nama tabel (misal: repair_requests, invoices, users, customer_profiles, technician_profiles, payments, services)' },
                columns: { type: 'string', description: 'Kolom yang diambil, dipisah koma (misal: "full_name,email" atau "customer_profiles.full_name"). Kosongkan untuk semua kolom non-sensitif.' },
                joins: { type: 'string', description: 'Tabel yang di-JOIN, dipisah koma (relasi harus ada di skema; misal: "customer_profiles" saat tabel dasar repair_requests). Bila dua tabel punya lebih dari satu relasi, pilih FK-nya dengan sintaks "tabel:foreignKey" (misal: "users:technician_id" saat tabel dasar repair_reviews, agar JOIN memakai teknisi yang diulas, bukan pelanggan pemberi ulasan).' },
                filterColumn: { type: 'string', description: 'Kolom filter pertama (misal: "current_status" atau "invoices.status")' },
                filterOperator: { type: 'string', enum: ['=', '!=', '>', '>=', '<', '<=', 'LIKE', 'IN'], description: 'Operator filter pertama' },
                filterValue: { type: 'string', description: 'Nilai filter pertama. Untuk LIKE: substring yang dicari. Untuk IN: beberapa nilai dipisah koma.' },
                filterColumn2: { type: 'string', description: 'Kolom filter kedua (opsional)' },
                filterOperator2: { type: 'string', enum: ['=', '!=', '>', '>=', '<', '<=', 'LIKE', 'IN'], description: 'Operator filter kedua' },
                filterValue2: { type: 'string', description: 'Nilai filter kedua' },
                filterColumn3: { type: 'string', description: 'Kolom filter ketiga (opsional; misal batas atas rentang tanggal)' },
                filterOperator3: { type: 'string', enum: ['=', '!=', '>', '>=', '<', '<=', 'LIKE', 'IN'], description: 'Operator filter ketiga' },
                filterValue3: { type: 'string', description: 'Nilai filter ketiga' },
                filterColumn4: { type: 'string', description: 'Kolom filter keempat (opsional)' },
                filterOperator4: { type: 'string', enum: ['=', '!=', '>', '>=', '<', '<=', 'LIKE', 'IN'], description: 'Operator filter keempat' },
                filterValue4: { type: 'string', description: 'Nilai filter keempat' },
                filterColumn5: { type: 'string', description: 'Kolom filter kelima (opsional)' },
                filterOperator5: { type: 'string', enum: ['=', '!=', '>', '>=', '<', '<=', 'LIKE', 'IN'], description: 'Operator filter kelima' },
                filterValue5: { type: 'string', description: 'Nilai filter kelima' },
                aggregateFunction: { type: 'string', enum: ['count', 'count_distinct', 'sum', 'avg', 'min', 'max'], description: 'Fungsi agregasi (misal: "sum" untuk total, "count" untuk jumlah, "count_distinct" untuk jumlah baris unik tabel dasar di atas JOIN)' },
                aggregateColumn: { type: 'string', description: 'Kolom yang diagregasi (misal: "total_amount"; kosongkan untuk count semua baris)' },
                groupBy: { type: 'string', description: 'Kolom GROUP BY (misal: "current_status" untuk rekap per status)' },
                orderByColumn: { type: 'string', description: 'Kolom pengurutan' },
                orderByDirection: { type: 'string', enum: ['ASC', 'DESC'], description: 'Arah pengurutan' },
                limit: { type: 'number', description: 'Maksimal baris (default 20, maks 100)' },
              },
              required: ['table'],
            },
          },
        ];

        // Susun histori chat untuk Universal Messages
        const universalMessages: UniversalChatMessage[] = [
          { role: 'system', content: systemPrompt },
        ];

        for (const h of rawHistory) {
          if (!h.message || !h.message.trim()) continue;
          const role = h.role === 'assistant' ? 'assistant' : 'user';
          if (universalMessages.length > 1 && universalMessages[universalMessages.length - 1].role === role) {
            universalMessages[universalMessages.length - 1].content += `\n${h.message}`;
          } else {
            universalMessages.push({ role, content: h.message });
          }
        }

        while (universalMessages.length > 1 && universalMessages[1].role !== 'user') {
          universalMessages.splice(1, 1);
        }

        if (universalMessages.length > 1 && universalMessages[universalMessages.length - 1].role === 'user') {
          universalMessages[universalMessages.length - 1].content += `\n${userMessage}`;
        } else {
          universalMessages.push({ role: 'user', content: userMessage });
        }

        // Panggil provider AI aktif melalui AIProviderManager
        let aiResponse = await providerManager.generateChatCompletion({
          messages: universalMessages,
          tools: universalTools,
          sessionId: session.id,
          userRole: userContext.role,
        });

        // Tangani pemanggilan function calling (Tool Execution) secara multi-turn
        if (aiResponse.toolCalls && aiResponse.toolCalls.length > 0) {
          const assistantTurn: UniversalChatMessage = {
            role: 'assistant',
            content: aiResponse.content || '',
            toolCalls: aiResponse.toolCalls,
          };
          universalMessages.push(assistantTurn);

          for (const tc of aiResponse.toolCalls) {
            // S9g — session.id diteruskan agar tool aksi teknisi dapat
            // menyimpan aksi tertundanya untuk alur konfirmasi dua langkah.
            const toolResult = await executeRoleBasedTool(tc.name, tc.arguments, userContext, session.id);
            // S9d — hasil tool DIPROYEKSI dulu (hanya kolom yang dibutuhkan
            // jawaban; PII dibuang kecuali diminta eksplisit) — jangan
            // pernah JSON-stringify utuh ke prompt.
            const projectedResult = projectToolResultForPrompt(tc.name, toolResult, norm);
            universalMessages.push({
              role: 'tool',
              toolCallId: tc.id,
              name: tc.name,
              content: typeof projectedResult === 'string' ? projectedResult : JSON.stringify(projectedResult),
            });
          }

          // Request follow-up completion setelah tool dijalankan
          aiResponse = await providerManager.generateChatCompletion({
            messages: universalMessages,
            sessionId: session.id,
            userRole: userContext.role,
          });
        }

        let fullText = aiResponse.content || '';

        // Ekstrak diagnosisCard jika ada
        let extractedCard: DiagnosisCard | null = null;
        let cleanedText = fullText;

        const jsonMatch = fullText.match(/```json\s*(\{[\s\S]*?\})\s*```/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[1]);
            if (parsed.diagnosisCard) {
              // S9f/F19 — validasi bentuk kartu SEGERA setelah parse.
              // Kartu tidak valid ditolak (bukan dipakai lalu throw di
              // `.join`); balasan AI tetap dipakai — kartu hanyalah pelengkap.
              // Blok JSON selalu dihapus dari teks jawaban (data mesin,
              // bukan prosa untuk pengguna), valid atau tidak.
              if (isValidDiagnosisCard(parsed.diagnosisCard)) {
                extractedCard = parsed.diagnosisCard;
              } else {
                console.warn('[Chatbot Engine] diagnosisCard AI ditolak: bentuk tidak valid.');
              }
              cleanedText = fullText.replace(jsonMatch[0], '').trim();
            }
          } catch {
            // ignore parsing error
          }
        }

        // N29: respons AI kosong (konten terpotong/difilter tanpa error) —
        // anggap GAGAL dan jatuh ke fallback expert system berlabel offline
        // di bawah (aiGatewayError terisi -> offlineNotice muncul); jangan
        // pernah mengembalikan balasan kosong ke pengguna.
        if (!cleanedText.trim()) {
          aiGatewayError = 'Respons AI kosong';
          console.warn('[Chatbot Engine] Respons AI kosong — memakai fallback expert system.');
        } else {
          const finalReply = `${safetyAlertPrefix}${cleanedText}`;
          const metadata: ChatMessageMetadata = {
            model: `${aiResponse.provider}:${aiResponse.model}${aiResponse.isFallback ? ' (fallback)' : ''}`,
            responseTimeMs: aiResponse.latencyMs,
            diagnosisCard: extractedCard,
            quickSuggestions: dynamicSuggestions,
          };

          // S9e — pesan pengguna sudah tersimpan di awal (userStored); di sini
          // hanya balasan yang disimpan.
          const replyStored = await saveChatMessageTracked(session.id, 'assistant', finalReply, metadata, 0, metadata.responseTimeMs);

          if (extractedCard) {
            // S9f/F19 — persistensi diagnosis NON-FATAL: kegagalan apa pun
            // di sini (termasuk kueri kategori yang bisa throw saat DB
            // down) tidak boleh membuang balasan AI yang sudah valid dan
            // tidak boleh memicu jalur fallback (yang dulu menyimpan ulang
            // pesan). `.join` defensif meski kartu sudah divalidasi.
            try {
              let catId = session.categoryId;
              if (!catId && extractedCard.categorySlug) {
                const catRows = await query<any[]>(
                  `SELECT id FROM appliance_categories WHERE slug = ? LIMIT 1`,
                  [extractedCard.categorySlug]
                );
                if (catRows.length > 0) catId = Number(catRows[0].id);
              }

              await updateSessionDiagnosis(session.id, {
                categoryId: catId,
                initialSymptoms: extractedCard.symptomsSummary,
                preliminaryDiagnosis: joinStringList(extractedCard.possibleCauses),
                recommendedAction: extractedCard.recommendedAction,
              });
            } catch (diagErr) {
              console.error('[Chatbot Engine] Gagal menyimpan diagnosis sesi (non-fatal):', diagErr);
            }
          }

          return {
            reply: finalReply,
            metadata,
            diagnosisCard: extractedCard,
            storedIn: combineStoredIn(userStored, replyStored),
          };
        }
      } else {
        // N7 — Tidak ada API key sama sekali: blok AI dilewati tanpa
        // exception, jadi tanpa baris ini aiGatewayError tetap null dan
        // jawaban expert system disajikan TANPA label "Mode offline"
        // (fallback diam-diam yang sama seperti yang diperbaiki PR #2
        // untuk jalur exception).
        aiGatewayError = 'Tidak ada API key provider AI yang terkonfigurasi';
      }
    } catch (err: any) {
      aiGatewayError = err?.message || String(err);
      console.warn('[AI Provider Gateway] Menggunakan fallback BANTUIN Database Expert System:', aiGatewayError);
    }
  } else {
    // N7 — Mode offline dipaksa via env: beri label pada jawaban expert
    // system di bawah, seperti jalur gagalnya AI.
    aiGatewayError = 'Mode offline dipaksa via FORCE_OFFLINE_AI';
  }

  // ==========================================================================
  // F. FALLBACK INTELLIGENT EXPERT SYSTEM (DIAGNOSIS & APP GUIDANCE)
  // ==========================================================================
  const fallback = getExpertSystemDiagnosis(
    userMessage,
    session.categorySlug || validation.detectedCategory,
    userContext
  );

  // Jika AI sempat dicoba tetapi gagal, JANGAN menyajikan jawaban expert system
  // seolah-olah berasal dari AI. Beri label yang jelas beserta alasannya, agar
  // admin dan pengguna tahu provider AI sedang tidak terhubung.
  // F23: teks yang ditampilkan ke klien adalah pesan GENERIK — alasan mentah
  // (aiGatewayError) hanya dipakai sebagai penanda bahwa AI gagal dan hanya
  // tercatat di log server (lihat catch di atas); tidak pernah disisipkan
  // ke balasan maupun metadata.
  const offlineNotice = aiGatewayError
    ? `⚠️ *Mode offline:* ${AI_UNAVAILABLE_MESSAGE}. Jawaban berikut berasal dari sistem pakar BANTUIN, bukan dari AI.\n\n`
    : '';
  const finalReply = `${safetyAlertPrefix}${offlineNotice}${fallback.reply}`;
  const metadata: ChatMessageMetadata = {
    model: 'bantuin-expert-system-v1',
    responseTimeMs: Date.now() - startTime,
    diagnosisCard: fallback.card || null,
    quickSuggestions: fallback.quickSuggestions,
    aiError: aiGatewayError ? AI_UNAVAILABLE_MESSAGE : null,
  };

  // S9e — pesan pengguna sudah tersimpan di awal (userStored); di sini
  // hanya balasan yang disimpan.
  const replyStored = await saveChatMessageTracked(session.id, 'assistant', finalReply, metadata, 0, metadata.responseTimeMs);

  if (fallback.card) {
    const targetCatId = session.categoryId || fallback.detectedCategoryId;
    await updateSessionDiagnosis(session.id, {
      categoryId: targetCatId,
      initialSymptoms: fallback.card.symptomsSummary,
      preliminaryDiagnosis: joinStringList(fallback.card.possibleCauses),
      recommendedAction: fallback.card.recommendedAction,
    });
  }

  return {
    reply: finalReply,
    metadata,
    diagnosisCard: fallback.card || null,
    storedIn: combineStoredIn(userStored, replyStored),
  };
}
