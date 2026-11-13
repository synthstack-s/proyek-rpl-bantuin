/**
 * CONTEXT MANAGER - BANTUIN AI DATABASE ASSISTANT
 * 
 * Mengelola memori sesi percakapan dan resolusi entitas referensial:
 * - Menyimpan entitas aktif (misal: activeOrderCode, activeRepairId, activeTechnicianId) dalam memori sesi.
 * - Membantu resolusi pertanyaan lanjutan (misal: "Siapa teknisinya?", "Berapa estimasi biayanya?", "Pesanan tadi").
 * - Memisahkan konteks antarpengguna secara mutlak untuk mencegah kebocoran data silang sesi.
 */

import { StoredChatMessage } from './types';

export interface ResolvedConversationEntities {
  activeOrderCode?: string | null;
  activeRepairId?: number | null;
  activeDeviceCategory?: string | null;
  activeTechnicianName?: string | null;
  activeInvoiceNumber?: string | null;
  activePhoneNumber?: string | null;
  activeEmail?: string | null;
  activeUserUuid?: string | null;
  isFollowUpQuestion: boolean;
  resolvedUserIntent?: string;
  /**
   * N4 — `true` bila `activeOrderCode` berasal dari kode order yang disebut
   * eksplisit di pesan saat ini (bukan dari memori sesi / riwayat asisten).
   * Dipakai engine untuk mewajibkan penyebutan eksplisit pada aksi teknisi.
   */
  orderCodeFromCurrentMessage?: boolean;
  /**
   * S29/F20 — Asal tiap entitas pencarian: `true` bila entitas itu berasal
   * dari memori sesi (bukan disebut di pesan saat ini). Engine WAJIB meminta
   * konfirmasi pengguna sebelum memakai entitas bertanda ini sebagai target
   * pencarian (lihat `memorySearchTarget` / `hasUnconfirmedMemorySearchTarget`).
   * Kode order dari riwayat asisten (3 pesan terakhir) TIDAK ditandai — itu
   * konteks percakapan yang masih segar, bukan memori basi.
   */
  phoneNumberFromMemory?: boolean;
  emailFromMemory?: boolean;
  userUuidFromMemory?: boolean;
  orderCodeFromMemory?: boolean;
  invoiceNumberFromMemory?: boolean;
  /**
   * S29/F20 — Target pencarian dari memori yang BELUM dikonfirmasi pengguna
   * (null bila tidak ada / sudah dikonfirmasi / berasal dari pesan saat ini).
   * Engine memakai ini untuk membangun pertanyaan klarifikasi, mis.
   * "Maksud Bos nomor 0812… yang tadi?".
   */
  memorySearchTarget?: {
    kind: 'phone' | 'email' | 'uuid' | 'order' | 'invoice';
    value: string;
  } | null;
  /** S29/F20 — `true` bila `memorySearchTarget` terisi (ada target memori yang belum dikonfirmasi). */
  hasUnconfirmedMemorySearchTarget?: boolean;
  /**
   * S29/F20 — `true` bila pesan ini menjawab "ya" atas klarifikasi target
   * pencarian dari memori (lihat `setPendingMemorySearchConfirmation`).
   * Engine boleh memakai entitas memori sebagai target pencarian pada pesan ini.
   */
  memorySearchConfirmed?: boolean;
  /**
   * S29/F20 — `true` bila pesan ini tampak seperti pertanyaan lanjutan:
   * ada indikator follow-up ("tadi", "itu", "berapa biaya", dsb) ATAU
   * pertanyaan pendek yang berbentuk pertanyaan (diakhiri "?" atau diawali
   * kata tanya). Pernyataan pendek ("jelaskan tentang BANTUIN") BUKAN
   * follow-up — klarifikasi target memori tidak boleh muncul untuknya.
   * Dipakai engine untuk memutuskan kapan klarifikasi target memori layak
   * ditampilkan pada jalur yang jatuh ke AI (cabang deterministik sudah
   * menangani polanya sendiri).
   */
  isFollowUpLike?: boolean;
}

// In-Memory Sessional Cache untuk entitas aktif percakapan
interface SessionMemoryEntry {
  sessionId: number;
  userId?: number | null;
  activeOrderCode?: string | null;
  activeRepairId?: number | null;
  activeDeviceCategory?: string | null;
  activeTechnicianName?: string | null;
  activeInvoiceNumber?: string | null;
  activePhoneNumber?: string | null;
  activeEmail?: string | null;
  activeUserUuid?: string | null;
  lastInteractionTime: number;
}

const sessionMemoryCache = new Map<number, SessionMemoryEntry>();

/**
 * S29/F20 — TTL entitas yang terekstrak (nomor telepon, email, UUID, kode
 * order/invoice): 30 menit, bukan 6 jam. Entitas yang lebih tua dari ini
 * dianggap basi — tidak dipakai sebagai konteks maupun target pencarian,
 * dan entrinya dihapus saat resolusi berikutnya. 30 menit masih mencakup
 * alur follow-up normal ("pesanan tadi", "siapa namanya?"); percakapan
 * yang jedanya lebih lama dari itu harus menyebut ulang targetnya.
 * (TTL 6 jam lama membuat satu nomor telepon menempel setengah hari dan
 * membajak pencarian berikutnya — lihat N4/F20.)
 */
export const SESSION_ENTITY_TTL_MS = 30 * 60 * 1000;

// ============================================================================
// F10 — Aksi teknisi tertunda (pending action) untuk two-step verification.
// Disimpan terpisah dari entitas sesi: satu sesi hanya punya satu aksi
// tertunda (aksi terbaru menimpa yang lama), terikat ke userId teknisi yang
// memintanya, dan kedaluwarsa setelah TTL agar konfirmasi basi tidak bisa
// mengeksekusi aksi berjam-jam kemudian. State machine di action-service
// tetap memvalidasi ulang status saat eksekusi, sehingga konfirmasi yang
// kedaluwarsa secara status pun ditolak dengan aman.
// Union aksi ini menyalin TechnicianTaskAction di action-service.ts
// (sumber kebenaran matriks transisi) agar modul ini tidak bergantung
// pada action-service.
// ============================================================================
export interface PendingTechnicianAction {
  orderCode: string;
  action: 'accept' | 'on_the_way' | 'start_diagnosis' | 'start_repair';
  userId: number;
  createdAt: number;
}

export const PENDING_TECHNICIAN_ACTION_TTL_MS = 10 * 60 * 1000;

const pendingTechnicianActions = new Map<number, PendingTechnicianAction>();

export function setPendingTechnicianAction(sessionId: number, action: PendingTechnicianAction): void {
  pendingTechnicianActions.set(sessionId, action);
}

export function getPendingTechnicianAction(sessionId: number): PendingTechnicianAction | undefined {
  const pending = pendingTechnicianActions.get(sessionId);
  if (!pending) return undefined;
  if (Date.now() - pending.createdAt > PENDING_TECHNICIAN_ACTION_TTL_MS) {
    pendingTechnicianActions.delete(sessionId);
    return undefined;
  }
  return pending;
}

export function clearPendingTechnicianAction(sessionId: number): void {
  pendingTechnicianActions.delete(sessionId);
}

// ============================================================================
// S29/F20 — Konfirmasi target pencarian dari memori.
//
// Saat engine hendak memakai entitas dari memori (bukan dari pesan saat ini)
// sebagai target pencarian, ia menampilkan klarifikasi ("Maksud Bos nomor
// 0812… yang tadi?") dan menyimpan targetnya di sini. Pesan berikutnya yang
// menjawab "ya" (lihat `isMemorySearchAffirmative`) mengonfirmasi pemakaian
// target itu SATU KALI; jawaban "tidak"/"bukan" membatalkan klarifikasi dan
// menghapus entitas memori yang ternyata salah. Terikat ke userId peminta
// (S29/F7) dan kedaluwarsa setelah TTL agar konfirmasi basi tidak bisa
// memakai target berjam-jam kemudian. Satu sesi hanya punya satu klarifikasi
// tertunda (klarifikasi terbaru menimpa yang lama).
// ============================================================================
export interface PendingMemorySearchConfirmation {
  kind: 'phone' | 'email' | 'uuid' | 'order' | 'invoice';
  value: string;
  userId: number | null;
  createdAt: number;
}

export const PENDING_MEMORY_SEARCH_TTL_MS = 10 * 60 * 1000;

const pendingMemorySearchConfirmations = new Map<number, PendingMemorySearchConfirmation>();

export function setPendingMemorySearchConfirmation(
  sessionId: number,
  pending: PendingMemorySearchConfirmation
): void {
  pendingMemorySearchConfirmations.set(sessionId, pending);
}

export function getPendingMemorySearchConfirmation(
  sessionId: number
): PendingMemorySearchConfirmation | undefined {
  const pending = pendingMemorySearchConfirmations.get(sessionId);
  if (!pending) return undefined;
  if (Date.now() - pending.createdAt > PENDING_MEMORY_SEARCH_TTL_MS) {
    pendingMemorySearchConfirmations.delete(sessionId);
    return undefined;
  }
  return pending;
}

export function clearPendingMemorySearchConfirmation(sessionId: number): void {
  pendingMemorySearchConfirmations.delete(sessionId);
}

// Jawaban atas klarifikasi target memori harus HANYA berupa penegasan /
// penolakan (dengan variasi kata yang wajar) — bukan pertanyaan atau pesan
// lain yang diawali "ya"/"tidak" ("ya, saya mau tanya soal garansi" bukan
// konfirmasi). Pesan yang menyebut ulang targetnya secara eksplisit
// ("ya, 081234567890") tidak perlu lewat jalur ini: entitasnya terdeteksi
// dari pesan saat ini dan bukan lagi "dari memori".
function normalizeConfirmationReply(text: string): string {
  return text.toLowerCase().replace(/[.,!?]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const MEMORY_SEARCH_CONFIRM_YES = new Set([
  'ya', 'iya', 'yup', 'betul', 'benar', 'yakin', 'oke', 'ok',
  'ya betul', 'iya betul', 'betul itu', 'ya itu', 'iya itu',
  'itu', 'itu dia', 'yang itu', 'nomor itu', 'pesanan itu',
  'invoice itu', 'email itu', 'nomor yang itu', 'pesanan yang itu',
]);

const MEMORY_SEARCH_CONFIRM_NO = new Set([
  'tidak', 'nggak', 'gak', 'ga', 'bukan', 'salah', 'jangan',
  'bukan itu', 'bukan nomor itu', 'bukan pesanan itu', 'bukan invoice itu',
  'bukan email itu', 'lain', 'yang lain', 'nomor lain', 'pesanan lain',
]);

function isMemorySearchAffirmative(norm: string): boolean {
  return MEMORY_SEARCH_CONFIRM_YES.has(normalizeConfirmationReply(norm));
}

function isMemorySearchNegative(norm: string): boolean {
  return MEMORY_SEARCH_CONFIRM_NO.has(normalizeConfirmationReply(norm));
}

// Bersihkan entri sesi yang kedaluwarsa (S29/F20: TTL entitas 30 menit).
// Interval tetap 30 menit; pemeriksaan kebasian yang TEPAT dilakukan di
// resolveConversationContext sendiri (entri basi diabaikan + dihapus saat
// resolusi), sehingga interval ini hanya pembersih latar.
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, entry] of sessionMemoryCache.entries()) {
    if (now - entry.lastInteractionTime > SESSION_ENTITY_TTL_MS) {
      sessionMemoryCache.delete(sessionId);
    }
  }
  // F10: bersihkan juga aksi tertunda yang kedaluwarsa.
  for (const [sessionId, pending] of pendingTechnicianActions.entries()) {
    if (now - pending.createdAt > PENDING_TECHNICIAN_ACTION_TTL_MS) {
      pendingTechnicianActions.delete(sessionId);
    }
  }
  // S29/F20: bersihkan klarifikasi target memori yang kedaluwarsa.
  for (const [sessionId, pending] of pendingMemorySearchConfirmations.entries()) {
    if (now - pending.createdAt > PENDING_MEMORY_SEARCH_TTL_MS) {
      pendingMemorySearchConfirmations.delete(sessionId);
    }
  }
}, 30 * 60 * 1000);

/**
 * S29/F7 — Bila pemanggil menyebut `userId`, entri milik pengguna lain
 * TIDAK dikembalikan (pemisahan antarpengguna). Tanpa `userId`, perilaku
 * lama dipertahankan (dipakai pemanggil internal yang sudah memverifikasi).
 */
export function getSessionMemory(
  sessionId: number,
  userId?: number | null
): SessionMemoryEntry | undefined {
  const entry = sessionMemoryCache.get(sessionId);
  if (!entry) return undefined;
  if (userId !== undefined && (entry.userId ?? null) !== (userId ?? null)) {
    return undefined;
  }
  return entry;
}

/**
 * N4 — Menghapus seluruh entitas yang tersimpan untuk satu sesi (dipanggil saat
 * topik berganti atau pengguna meminta "lupakan"). Entri memori dibuat ulang
 * saat entitas baru terdeteksi di pesan berikutnya. Klarifikasi target memori
 * yang tertunda ikut dihapus — topik baru membuat target lama tidak relevan.
 * (TTL entitas kini 30 menit, lihat SESSION_ENTITY_TTL_MS — perbaikan F20.)
 */
export function clearSessionMemoryEntities(sessionId: number): void {
  sessionMemoryCache.delete(sessionId);
  pendingMemorySearchConfirmations.delete(sessionId);
}

// N4 — Pola sinyal topik baru / permintaan melupakan entitas yang menempel.
// Pertanyaan daftar ("siapa saja nama customer", "daftar teknisi") adalah topik
// baru: entitas lama (mis. nomor telepon pencarian sebelumnya) TIDAK BOLEH
// dipakai, agar guard mode list 0a di engine bisa lolos.
const LIST_QUESTION_PATTERN =
  /\b(siapa|daftar|list|tampilkan|lihat)\b.{0,50}\b(nama|pengguna|customer|pelanggan|teknisi|user|akun)\b/;
const GREETING_PATTERN =
  /^(halo|hai|hi|hello|selamat (pagi|siang|sore|malam)|assalamualaikum)\b/;
const NEW_TOPIC_PHRASE_PATTERN =
  /\b(topik baru|ganti topik|ngomong-ngomong|bicara hal lain)\b/;
const FORGET_PATTERNS = [
  /lupakan\b.{0,30}\b(pesanan|order|telepon|nomor|invoice|semua|itu|dia|tadi)\b/,
  /\b(topik baru|ganti topik)\b/,
];

export function updateSessionMemory(
  sessionId: number,
  userId: number | null | undefined,
  updates: Partial<Omit<SessionMemoryEntry, 'sessionId' | 'userId' | 'lastInteractionTime'>>
) {
  const callerUserId = userId ?? null;
  const existing = sessionMemoryCache.get(sessionId);
  // S29/F7 — jangan pernah MENGGABUNGKAN entitas milik pengguna lain ke
  // entri pemanggil: bila entri yang ada milik pengguna berbeda, mulai
  // entri baru untuk pemanggil ini (entri lama dibuang). `userId` entri
  // selalu disetel ke pemanggil saat ini — bukan dipertahankan dari entri
  // lama, dan bukan `null` (bug lama: satu-satunya pemanggil selalu
  // mengoper `userId: null`, sehingga pemisahan pengguna tidak pernah
  // ditegakkan).
  const base =
    existing && (existing.userId ?? null) === callerUserId
      ? existing
      : { sessionId, userId: callerUserId, lastInteractionTime: Date.now() };

  const updated: SessionMemoryEntry = {
    ...base,
    ...updates,
    userId: callerUserId,
    lastInteractionTime: Date.now(),
  };

  sessionMemoryCache.set(sessionId, updated);
  return updated;
}

/**
 * Menganalisis pesan pengguna terkini berdasarkan riwayat pesan sebelumnya
 * untuk mengekstrak entitas referensial ("tadi", "pesanan itu", "teknisinya", dll)
 *
 * S29/F7 — `userId` adalah parameter WAJIB (null = guest). Entri memori
 * hanya dipakai bila `userId`-nya cocok dengan pemanggil: memori milik
 * pengguna A tidak pernah dipakai untuk pengguna B, memori guest tidak
 * pernah dipakai untuk pengguna login, dan sebaliknya.
 */
export function resolveConversationContext(
  currentMessage: string,
  sessionMessages: StoredChatMessage[],
  sessionId: number,
  userId: number | null
): ResolvedConversationEntities {
  const norm = currentMessage.toLowerCase();
  const callerUserId = userId ?? null;

  // S29/F7 — verifikasi pemilik memori SEBELUM memakainya. Entri milik
  // pengguna lain diabaikan sepenuhnya (diperlakukan seolah tidak ada).
  let memory = sessionMemoryCache.get(sessionId);
  if (memory && (memory.userId ?? null) !== callerUserId) {
    memory = undefined;
  }
  // S29/F20 — entitas basi (> 30 menit sejak terakhir diperbarui) diabaikan
  // dan entrinya dihapus, agar tidak menempel dan membajak pencarian.
  if (memory && Date.now() - memory.lastInteractionTime > SESSION_ENTITY_TTL_MS) {
    sessionMemoryCache.delete(sessionId);
    memory = undefined;
  }

  // S29/F20 — jawaban atas klarifikasi target pencarian dari memori
  // ("Maksud Bos nomor 0812… yang tadi?"). Afirmatif: target memori boleh
  // dipakai SATU KALI pada pesan ini. Negatif: klarifikasi dibatalkan DAN
  // entitas memori dihapus (target yang diingat ternyata salah — jangan
  // ditanyakan lagi). Klarifikasi milik pengguna lain diabaikan (F7).
  let memorySearchConfirmed = false;
  const pendingSearch = getPendingMemorySearchConfirmation(sessionId);
  if (pendingSearch && pendingSearch.userId === callerUserId) {
    if (isMemorySearchAffirmative(norm)) {
      memorySearchConfirmed = true;
      clearPendingMemorySearchConfirmation(sessionId);
    } else if (isMemorySearchNegative(norm)) {
      clearPendingMemorySearchConfirmation(sessionId);
      clearSessionMemoryEntities(sessionId);
      memory = undefined;
    }
  }

  // 1. Cek apakah ada kode pesanan, invoice, telepon, email, atau UUID spesifik
  const orderMatch = currentMessage.match(/\b(?:REP|BAN|ORD)-[A-Za-z0-9-]+\b|#\d+/i);
  let detectedOrderCode: string | null = orderMatch ? orderMatch[0].replace('#', '') : null;

  const invMatch = currentMessage.match(/\bINV-[A-Za-z0-9-]+\b/i);
  let detectedInvoiceNumber: string | null = invMatch ? invMatch[0] : null;

  // F22 — Hanya pola nomor HP Indonesia yang valid (08… / +62 8… /
  // 62 8…). Alternatif lama `\b\d{10,15}\b` DIHAPUS: ia menangkap angka
  // apa pun sepanjang 10–15 digit (jumlah rupiah, nomor invoice,
  // tanggal-waktu) lalu menyimpannya sebagai nomor telepon aktif dan
  // memakainya sebagai target pencarian pengguna.
  const phoneMatch = currentMessage.match(/(?:\+?62|0)8[0-9]{8,12}\b/);
  let detectedPhoneNumber: string | null = phoneMatch ? phoneMatch[0] : null;

  const emailMatch = currentMessage.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  let detectedEmail: string | null = emailMatch ? emailMatch[0] : null;

  const uuidMatch = currentMessage.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i);
  let detectedUserUuid: string | null = uuidMatch ? uuidMatch[0] : null;

  // 2. Cek apakah pengguna menggunakan kata ganti penunjuk atau pertanyaan lanjutan bertingkat
  // F22 — 'dia' dan 'nya' DIHAPUS sebagai pemicu mandiri: keduanya terlalu
  // umum ('nya' bahkan muncul sebagai substring di 'punya', 'tanya',
  // 'lainnya', dsb) dan memicu resolusi follow-up terhadap entitas usang.
  // Bentuk posesif spesifik ('alamatnya', 'diagnosisnya', 'kerusakannya')
  // tetap dipertahankan karena sungguh-sungguh anaforis.
  const followUpIndicators = [
    'tadi', 'itu', 'tersebut', 'siapa teknisi', 'berapa biaya',
    'kapan selesai', 'kapan jadwal', 'alamatnya', 'diagnosisnya', 'kerusakannya'
  ];

  const hasFollowUpIndicator = followUpIndicators.some(w => norm.includes(w));
  const isShortQuestion = norm.length < 35 && !orderMatch;

  // N4 — Sinyal "lupakan" / topik baru: entitas yang menempel dihapus dari
  // memori sesi dan TIDAK dipakai untuk pesan ini. Perhatian: pertanyaan
  // daftar seperti "siapa saja nama customer" adalah pertanyaan pendek
  // (< 35 karakter) sehingga lolos `isShortQuestion` — tanpa pemeriksaan
  // topik baru ini, entitas lama tetap menempel dan guard mode list 0a
  // di engine tidak pernah lolos.
  const isForgetRequest = FORGET_PATTERNS.some(p => p.test(norm));
  const isNewTopic =
    isForgetRequest ||
    LIST_QUESTION_PATTERN.test(norm) ||
    GREETING_PATTERN.test(norm) ||
    NEW_TOPIC_PHRASE_PATTERN.test(norm);

  // N4 — Entitas dari memori HANYA dipakai bila pesan saat ini adalah
  // pertanyaan lanjutan (ada indikator follow-up / pertanyaan pendek) DAN
  // bukan sinyal topik baru. Entitas yang terdeteksi di pesan saat ini
  // selalu dipakai, apa pun topiknya.
  const applyMemoryEntities =
    (hasFollowUpIndicator || isShortQuestion) && !isNewTopic;

  if (isNewTopic) {
    clearSessionMemoryEntities(sessionId);
    memory = undefined;
  }

  let activeOrderCode = detectedOrderCode || (applyMemoryEntities ? memory?.activeOrderCode || null : null);
  let activeRepairId = applyMemoryEntities ? memory?.activeRepairId || null : null;
  let activeTechnicianName = applyMemoryEntities ? memory?.activeTechnicianName || null : null;
  let activeInvoiceNumber = detectedInvoiceNumber || (applyMemoryEntities ? memory?.activeInvoiceNumber || null : null);
  let activePhoneNumber = detectedPhoneNumber || (applyMemoryEntities ? memory?.activePhoneNumber || null : null);
  let activeEmail = detectedEmail || (applyMemoryEntities ? memory?.activeEmail || null : null);
  let activeUserUuid = detectedUserUuid || (applyMemoryEntities ? memory?.activeUserUuid || null : null);
  let activeDeviceCategory = applyMemoryEntities ? memory?.activeDeviceCategory || null : null;

  // S29/F20 — lacak asal tiap entitas pencarian: `true` bila berasal dari
  // memori sesi (bukan disebut di pesan saat ini). Engine wajib meminta
  // konfirmasi sebelum memakai entitas bertanda ini sebagai target pencarian.
  const phoneNumberFromMemory = !detectedPhoneNumber && applyMemoryEntities && Boolean(memory?.activePhoneNumber);
  const emailFromMemory = !detectedEmail && applyMemoryEntities && Boolean(memory?.activeEmail);
  const userUuidFromMemory = !detectedUserUuid && applyMemoryEntities && Boolean(memory?.activeUserUuid);
  const orderCodeFromMemory = !detectedOrderCode && applyMemoryEntities && Boolean(memory?.activeOrderCode);
  const invoiceNumberFromMemory = !detectedInvoiceNumber && applyMemoryEntities && Boolean(memory?.activeInvoiceNumber);

  // 3. Jika belum ada kode order langsung, cari di 3 pesan asisten terakhir
  // (hanya untuk pertanyaan lanjutan — bukan topik baru).
  if (!activeOrderCode && applyMemoryEntities) {
    for (let i = sessionMessages.length - 1; i >= Math.max(0, sessionMessages.length - 4); i--) {
      const msg = sessionMessages[i];
      if (msg.role === 'assistant') {
        const found = msg.message.match(/#?(REP-[A-Za-z0-9-]+|BAN-\d{8}-[A-Za-z0-9]+|BAN-[A-Za-z0-9-]+|ORD-[A-Za-z0-9-]+)/i);
        if (found) {
          activeOrderCode = found[1];
          break;
        }
      }
    }
  }

  // 4. Update memory cache jika ditemukan entitas aktif. Permintaan "lupakan"
  // tidak menyimpan apa pun dari pesan ini — entitas yang disebut di pesan
  // "lupakan nomor 0812..." tidak boleh langsung tersimpan kembali.
  // S29/F7 — isi `userId` dengan userId pemanggil yang sebenarnya (bukan
  // `null` seperti dulu), agar pemisahan antarpengguna benar-benar ditegakkan.
  if (!isForgetRequest && (activeOrderCode || activeInvoiceNumber || activePhoneNumber || activeEmail || activeUserUuid)) {
    updateSessionMemory(sessionId, callerUserId, {
      ...(activeOrderCode ? { activeOrderCode } : {}),
      ...(activeInvoiceNumber ? { activeInvoiceNumber } : {}),
      ...(activePhoneNumber ? { activePhoneNumber } : {}),
      ...(activeEmail ? { activeEmail } : {}),
      ...(activeUserUuid ? { activeUserUuid } : {}),
    });
  }

  // S29/F20 — target pencarian dari memori yang belum dikonfirmasi (prioritas
  // sama dengan urutan pemilihan searchTerm di engine: telepon, email, UUID,
  // kode order, nomor invoice). Bila pengguna baru saja mengonfirmasi
  // (`memorySearchConfirmed`), tidak ada lagi target yang tertunda.
  let memorySearchTarget: ResolvedConversationEntities['memorySearchTarget'] = null;
  if (!memorySearchConfirmed) {
    if (phoneNumberFromMemory && activePhoneNumber) {
      memorySearchTarget = { kind: 'phone', value: activePhoneNumber };
    } else if (emailFromMemory && activeEmail) {
      memorySearchTarget = { kind: 'email', value: activeEmail };
    } else if (userUuidFromMemory && activeUserUuid) {
      memorySearchTarget = { kind: 'uuid', value: activeUserUuid };
    } else if (orderCodeFromMemory && activeOrderCode) {
      memorySearchTarget = { kind: 'order', value: activeOrderCode };
    } else if (invoiceNumberFromMemory && activeInvoiceNumber) {
      memorySearchTarget = { kind: 'invoice', value: activeInvoiceNumber };
    }
  }

  return {
    activeOrderCode,
    activeRepairId,
    activeDeviceCategory,
    activeTechnicianName,
    activeInvoiceNumber,
    activePhoneNumber,
    activeEmail,
    activeUserUuid,
    isFollowUpQuestion: Boolean(activeOrderCode && (hasFollowUpIndicator || isShortQuestion)),
    // N4 — `true` hanya bila kode order disebut eksplisit di pesan saat ini
    // (bukan dari memori / riwayat asisten). Engine memakainya untuk
    // mewajibkan penyebutan eksplisit pada aksi teknisi.
    orderCodeFromCurrentMessage: Boolean(detectedOrderCode),
    phoneNumberFromMemory,
    emailFromMemory,
    userUuidFromMemory,
    orderCodeFromMemory,
    invoiceNumberFromMemory,
    memorySearchTarget,
    hasUnconfirmedMemorySearchTarget: memorySearchTarget !== null,
    memorySearchConfirmed,
    // S29/F20 — pertanyaan pendek hanya dihitung follow-up bila berbentuk
    // pertanyaan (tanda "?" / kata tanya); pernyataan pendek bukan follow-up.
    isFollowUpLike:
      hasFollowUpIndicator ||
      (isShortQuestion &&
        (/\?\s*$/.test(norm) ||
          /^(apa|siapa|berapa|kapan|di\s*mana|bagaimana|kenapa|mengapa|gimana)\b/i.test(norm))),
  };
}

