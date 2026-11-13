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

// Bersihkan entri sesi yang lebih dari 6 jam tidak aktif
setInterval(() => {
  const now = Date.now();
  const maxAge = 6 * 60 * 60 * 1000;
  for (const [sessionId, entry] of sessionMemoryCache.entries()) {
    if (now - entry.lastInteractionTime > maxAge) {
      sessionMemoryCache.delete(sessionId);
    }
  }
  // F10: bersihkan juga aksi tertunda yang kedaluwarsa.
  for (const [sessionId, pending] of pendingTechnicianActions.entries()) {
    if (now - pending.createdAt > PENDING_TECHNICIAN_ACTION_TTL_MS) {
      pendingTechnicianActions.delete(sessionId);
    }
  }
}, 30 * 60 * 1000);

export function getSessionMemory(sessionId: number): SessionMemoryEntry | undefined {
  return sessionMemoryCache.get(sessionId);
}

/**
 * N4 — Menghapus seluruh entitas yang tersimpan untuk satu sesi (dipanggil saat
 * topik berganti atau pengguna meminta "lupakan"). Entri memori dibuat ulang
 * saat entitas baru terdeteksi di pesan berikutnya. TTL 6 jam TIDAK diubah
 * (temuan F20, di luar cakupan ini).
 */
export function clearSessionMemoryEntities(sessionId: number): void {
  sessionMemoryCache.delete(sessionId);
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
  const existing = sessionMemoryCache.get(sessionId) || {
    sessionId,
    userId: userId || null,
    lastInteractionTime: Date.now(),
  };

  const updated: SessionMemoryEntry = {
    ...existing,
    ...updates,
    lastInteractionTime: Date.now(),
  };

  sessionMemoryCache.set(sessionId, updated);
  return updated;
}

/**
 * Menganalisis pesan pengguna terkini berdasarkan riwayat pesan sebelumnya
 * untuk mengekstrak entitas referensial ("tadi", "pesanan itu", "teknisinya", dll)
 */
export function resolveConversationContext(
  currentMessage: string,
  sessionMessages: StoredChatMessage[],
  sessionId: number
): ResolvedConversationEntities {
  const norm = currentMessage.toLowerCase();
  const memory = sessionMemoryCache.get(sessionId);

  // 1. Cek apakah ada kode pesanan, invoice, telepon, email, atau UUID spesifik
  const orderMatch = currentMessage.match(/\b(?:REP|BAN|ORD)-[A-Za-z0-9-]+\b|#\d+/i);
  let detectedOrderCode: string | null = orderMatch ? orderMatch[0].replace('#', '') : null;

  const invMatch = currentMessage.match(/\bINV-[A-Za-z0-9-]+\b/i);
  let detectedInvoiceNumber: string | null = invMatch ? invMatch[0] : null;

  const phoneMatch = currentMessage.match(/(?:\+?62|0)8[0-9]{8,12}\b|\b\d{10,15}\b/);
  let detectedPhoneNumber: string | null = phoneMatch ? phoneMatch[0] : null;

  const emailMatch = currentMessage.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  let detectedEmail: string | null = emailMatch ? emailMatch[0] : null;

  const uuidMatch = currentMessage.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i);
  let detectedUserUuid: string | null = uuidMatch ? uuidMatch[0] : null;

  // 2. Cek apakah pengguna menggunakan kata ganti penunjuk atau pertanyaan lanjutan bertingkat
  const followUpIndicators = [
    'tadi', 'itu', 'tersebut', 'dia', 'nya', 'siapa teknisi', 'berapa biaya',
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
  }

  let activeOrderCode = detectedOrderCode || (applyMemoryEntities ? memory?.activeOrderCode || null : null);
  let activeRepairId = applyMemoryEntities ? memory?.activeRepairId || null : null;
  let activeTechnicianName = applyMemoryEntities ? memory?.activeTechnicianName || null : null;
  let activeInvoiceNumber = detectedInvoiceNumber || (applyMemoryEntities ? memory?.activeInvoiceNumber || null : null);
  let activePhoneNumber = detectedPhoneNumber || (applyMemoryEntities ? memory?.activePhoneNumber || null : null);
  let activeEmail = detectedEmail || (applyMemoryEntities ? memory?.activeEmail || null : null);
  let activeUserUuid = detectedUserUuid || (applyMemoryEntities ? memory?.activeUserUuid || null : null);
  let activeDeviceCategory = applyMemoryEntities ? memory?.activeDeviceCategory || null : null;

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
  if (!isForgetRequest && (activeOrderCode || activeInvoiceNumber || activePhoneNumber || activeEmail || activeUserUuid)) {
    updateSessionMemory(sessionId, null, {
      ...(activeOrderCode ? { activeOrderCode } : {}),
      ...(activeInvoiceNumber ? { activeInvoiceNumber } : {}),
      ...(activePhoneNumber ? { activePhoneNumber } : {}),
      ...(activeEmail ? { activeEmail } : {}),
      ...(activeUserUuid ? { activeUserUuid } : {}),
    });
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
  };
}

