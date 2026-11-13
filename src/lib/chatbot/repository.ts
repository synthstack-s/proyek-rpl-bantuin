import crypto from 'crypto';
import { query } from '@/lib/db';
import { ConsultationSession, StoredChatMessage, ChatMessageMetadata } from './types';

// ============================================================================
// Fallback in-memory saat database MySQL offline (F6/F14/F15).
//
// - F15: ID fallback memakai bilangan NEGATIF (counter mulai -1, menurun).
//   ID auto-increment MySQL selalu positif (BIGINT UNSIGNED), sehingga ID
//   fallback TIDAK PERNAH bertabrakan dengan ID DB — dan lookup/update
//   fallback tidak pernah menyasar baris DB yang salah.
// - F14: pesan fallback TIDAK PERNAH hilang diam-diam setelah DB pulih:
//   (a) getSessionMessages selalu MENGGABUNGKAN sisi DB + memori (dedup
//   berdasarkan ID), dan (b) drainMemoryFallbackToDatabase() menulis ulang
//   pesan fallback milik sesi DB ke MySQL saat koneksi pulih (outbox).
// - F6: setiap kegagalan DB dicatat (console.error + konteks), cache
//   fallback dibatasi TTL + ukuran (evict oldest-first), dan jalur simpan
//   mengembalikan hasil yang membedakan 'database' vs 'memory'
//   (saveChatMessageDetailed + field storedIn).
// - Sesi fallback disimpan HANYA di bawah kunci UUID (satu kunci per sesi),
//   dengan indeks sekunder id -> UUID untuk lookup berdasarkan ID numerik.
//   Ini sekaligus memperbaiki F12 (sesi fallback tidak lagi terhitung ganda
//   saat iterasi values()).
// ============================================================================

let fallbackMessageIdCounter = -1;
let fallbackSessionIdCounter = -1;

/** F15 — `true` bila ID berasal dari namespace fallback (negatif). */
export function isFallbackId(id: number): boolean {
  return Number(id) < 0;
}

// F6 — Batas cache fallback.
export const MEMORY_FALLBACK_TTL_MS = 6 * 60 * 60 * 1000; // 6 jam, selaras TTL memori konteks
export const MAX_FALLBACK_SESSIONS = 200;
export const MAX_FALLBACK_MESSAGES_PER_SESSION = 200;
export const MAX_FALLBACK_MESSAGES_TOTAL = 5000;

const memorySessions = new Map<string, ConsultationSession>();
const memorySessionIdIndex = new Map<number, string>();
const memoryMessages = new Map<number, StoredChatMessage[]>();

/** F6 — Catat setiap kegagalan DB yang memicu fallback (dulu: catch kosong). */
function logDbFailure(where: string, context: Record<string, unknown>, err: unknown): void {
  console.error(
    `[chatbot-repository] ${where} — DB gagal, memakai fallback in-memory:`,
    JSON.stringify(context),
    err
  );
}

/**
 * F14 — Normalisasi waktu simpan ke epoch ms untuk pengurutan gabungan:
 * createdAt DB berbentuk DATETIME MySQL ('YYYY-MM-DD HH:mm:ss', zona +07:00
 * sesuai konfigurasi pool) sedangkan memori memakai ISO UTC.
 */
function parseStoredTime(value: unknown): number {
  if (typeof value !== 'string') return 0;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(value)) {
    const ms = Date.parse(value.replace(' ', 'T') + '+07:00');
    return Number.isNaN(ms) ? 0 : ms;
  }
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * F14 — Urutan gabungan diurutkan HANYA berdasarkan waktu (stable sort).
 * Sengaja TANPA tiebreak ID: ID DB positif mengurut searah waktu (makin
 * besar = makin baru), sedangkan ID fallback negatif mengurut BERLAWANAN
 * (makin kecil/negatif = makin baru, karena counter menurun dari -1) —
 * satu tiebreak ID tidak bisa benar untuk keduanya. Stable sort
 * mempertahankan urutan sisip di dalam tiap kelompok waktu yang sama:
 * daftar memori sudah terurut sisip, baris DB sudah terurut id ASC dari
 * SQL — keduanya sama dengan urutan kronologis.
 */
function sortMessagesByTime(list: StoredChatMessage[]): StoredChatMessage[] {
  return list.sort((a, b) => parseStoredTime(a.createdAt) - parseStoredTime(b.createdAt));
}

/**
 * F6 — Pangkas cache fallback: hapus sesi/pesan kedaluwarsa (TTL), lalu
 * tertibkan batas ukuran (evict oldest-first; Map menjaga urutan sisip).
 * Dipanggil setiap kali ada penulisan fallback dan secara oportunistik
 * saat baca. Diekspor agar dapat dipanggil manual / diuji.
 */
export function pruneMemoryFallback(now: number = Date.now()): void {
  // 1. TTL sesi (memakai createdAt ISO sesi fallback).
  for (const [uuid, s] of memorySessions.entries()) {
    if (now - parseStoredTime(s.createdAt) > MEMORY_FALLBACK_TTL_MS) {
      memorySessions.delete(uuid);
      memorySessionIdIndex.delete(s.id);
      memoryMessages.delete(s.id);
    }
  }
  // 2. TTL pesan (per pesan, memakai createdAt masing-masing).
  for (const [sessionId, list] of memoryMessages.entries()) {
    const kept = list.filter((m) => now - parseStoredTime(m.createdAt) <= MEMORY_FALLBACK_TTL_MS);
    if (kept.length === 0) memoryMessages.delete(sessionId);
    else if (kept.length !== list.length) memoryMessages.set(sessionId, kept);
  }
  // 3. Batas jumlah sesi (evict oldest-first).
  while (memorySessions.size > MAX_FALLBACK_SESSIONS) {
    const oldestUuid = memorySessions.keys().next().value as string;
    const oldest = memorySessions.get(oldestUuid);
    memorySessions.delete(oldestUuid);
    if (oldest) {
      memorySessionIdIndex.delete(oldest.id);
      memoryMessages.delete(oldest.id);
    }
  }
  // 4. Batas pesan per sesi (buang yang terlama).
  for (const [sessionId, list] of memoryMessages.entries()) {
    if (list.length > MAX_FALLBACK_MESSAGES_PER_SESSION) {
      memoryMessages.set(sessionId, list.slice(list.length - MAX_FALLBACK_MESSAGES_PER_SESSION));
    }
  }
  // 5. Batas total pesan (buang dari sesi tertua dulu).
  let total = 0;
  for (const list of memoryMessages.values()) total += list.length;
  if (total > MAX_FALLBACK_MESSAGES_TOTAL) {
    for (const [sessionId, list] of memoryMessages.entries()) {
      if (total <= MAX_FALLBACK_MESSAGES_TOTAL) break;
      const drop = Math.min(total - MAX_FALLBACK_MESSAGES_TOTAL, list.length);
      const kept = list.slice(drop);
      total -= drop;
      if (kept.length === 0) memoryMessages.delete(sessionId);
      else memoryMessages.set(sessionId, kept);
    }
  }
}

/** Statistik cache fallback (untuk pemantauan / health check / tes). */
export function getMemoryFallbackStats(): {
  sessions: number;
  messages: number;
  pendingDrainMessages: number;
} {
  let messages = 0;
  let pendingDrainMessages = 0;
  for (const [sessionId, list] of memoryMessages.entries()) {
    messages += list.length;
    if (sessionId > 0) {
      pendingDrainMessages += list.filter((m) => isFallbackId(m.id)).length;
    }
  }
  return { sessions: memorySessions.size, messages, pendingDrainMessages };
}

function storeFallbackSession(sessionObj: ConsultationSession): void {
  memorySessions.set(sessionObj.sessionUuid, sessionObj);
  memorySessionIdIndex.set(sessionObj.id, sessionObj.sessionUuid);
  pruneMemoryFallback();
}

/**
 * F15 — Lookup sesi fallback berdasarkan ID numerik lewat indeks id -> UUID.
 * Indeks hanya berisi ID negatif, sehingga ID DB positif tidak pernah
 * menemukan entri memori yang salah.
 */
function getFallbackSessionById(sessionId: number): ConsultationSession | undefined {
  const uuid = memorySessionIdIndex.get(sessionId);
  return uuid ? memorySessions.get(uuid) : undefined;
}

function storeFallbackMessage(stored: StoredChatMessage): void {
  const list = memoryMessages.get(stored.sessionId) || [];
  list.push(stored);
  memoryMessages.set(stored.sessionId, list);
  pruneMemoryFallback();
}

// ============================================================================
// F14 — Outbox drain: tulis pesan fallback milik sesi DB ke MySQL saat
// koneksi pulih. Pesan yang berhasil ditulis mengadopsi ID DB-nya (insertId)
// sehingga merge saat baca mendedup berdasarkan ID secara eksak. Pesan
// milik sesi fallback (sessionId negatif) TIDAK bisa di-drain — tidak ada
// baris sesi DB yang bisa menjadi induk FK-nya — dan tetap terlihat lewat
// merge sampai TTL. Drain tidak pernah melempar: kegagalan per pesan dicatat
// dan dicoba lagi pada drain berikutnya.
// ============================================================================
export interface DrainResult {
  drainedMessages: number;
  failedMessages: number;
  skippedMessages: number;
}

let drainInProgress = false;

function hasPendingDrainMessages(): boolean {
  for (const [sessionId, list] of memoryMessages.entries()) {
    if (sessionId <= 0) continue;
    if (list.some((m) => isFallbackId(m.id))) return true;
  }
  return false;
}

export async function drainMemoryFallbackToDatabase(): Promise<DrainResult> {
  if (drainInProgress) {
    return { drainedMessages: 0, failedMessages: 0, skippedMessages: 0 };
  }
  drainInProgress = true;
  const result: DrainResult = { drainedMessages: 0, failedMessages: 0, skippedMessages: 0 };
  try {
    for (const [sessionId, list] of Array.from(memoryMessages.entries())) {
      if (sessionId <= 0) {
        result.skippedMessages += list.filter((m) => isFallbackId(m.id)).length;
        continue;
      }
      for (const msg of list) {
        if (!isFallbackId(msg.id)) continue; // sudah ter-drain (mengadopsi ID DB)
        try {
          // Pertahankan created_at asli (epoch detik -> FROM_UNIXTIME agar
          // konversi zona waktu ditangani sesi MySQL +07:00) sehingga
          // urutan linimasa percakapan tetap benar setelah drain.
          const createdAtSec = Math.floor(parseStoredTime(msg.createdAt) / 1000);
          const insertResult: any = await query(
            `INSERT INTO ai_chat_messages (
              session_id, role, message, tokens_used, response_time_ms, raw_metadata, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, FROM_UNIXTIME(?))`,
            [
              sessionId,
              msg.role,
              msg.message,
              msg.tokensUsed ?? null,
              msg.responseTimeMs ?? null,
              msg.rawMetadata ? JSON.stringify(msg.rawMetadata) : null,
              createdAtSec > 0 ? createdAtSec : Math.floor(Date.now() / 1000),
            ]
          );
          msg.id = Number(insertResult.insertId);
          msg.storedIn = 'database';
          result.drainedMessages++;
        } catch (err) {
          result.failedMessages++;
          console.error(
            '[chatbot-repository] drainMemoryFallbackToDatabase — gagal menulis pesan fallback:',
            JSON.stringify({ sessionId, messageId: msg.id }),
            err
          );
          // Pesan yang gagal tetap di memori dan dicoba lagi pada drain
          // berikutnya; lanjut ke pesan lain.
        }
      }
    }
  } finally {
    drainInProgress = false;
  }
  return result;
}

/** Picu drain secara fire-and-forget saat DB terbukti dapat dijangkau. */
function triggerDrainIfPending(): void {
  if (drainInProgress || !hasPendingDrainMessages()) return;
  drainMemoryFallbackToDatabase().catch((err) => {
    console.error('[chatbot-repository] drainMemoryFallbackToDatabase — gagal tak terduga:', err);
  });
}

/**
 * Error kepemilikan sesi (temuan F1): dilempar `getOrCreateSession` bila sesi yang
 * ditemukan dimiliki pengguna lain. Route memetakannya ke HTTP 403.
 */
export class SessionForbiddenError extends Error {
  code = 'SESSION_FORBIDDEN';

  constructor(message = 'Sesi chat ini milik pengguna lain.') {
    super(message);
    this.name = 'SESSION_FORBIDDEN';
  }
}

export function isSessionForbiddenError(error: unknown): error is SessionForbiddenError {
  return (
    error instanceof SessionForbiddenError ||
    (typeof error === 'object' &&
      error !== null &&
      (error as { code?: unknown }).code === 'SESSION_FORBIDDEN')
  );
}

/**
 * F1 — Aturan kepemilikan sesi: bila sesi sudah terikat ke seorang pengguna
 * (`sessionUserId` terisi) dan pemanggil bukan pemiliknya (termasuk pemanggil guest
 * dengan `callerUserId` null), akses ditolak. Sesi guest (`user_id` NULL) boleh
 * dipakai siapa pun yang memegang UUID-nya (lihat catatan risiko residual di
 * `history/route.ts`).
 */
function assertSessionOwnership(
  sessionUserId: number | null | undefined,
  callerUserId?: number | null
): void {
  const ownerId = sessionUserId == null ? null : Number(sessionUserId);
  if (ownerId !== null && ownerId !== callerUserId) {
    throw new SessionForbiddenError();
  }
}

function mapSessionRow(row: any): ConsultationSession {
  return {
    id: Number(row.id),
    sessionUuid: row.session_uuid,
    userId: row.user_id ? Number(row.user_id) : null,
    categoryId: row.category_id ? Number(row.category_id) : null,
    categoryName: row.category_name,
    categorySlug: row.category_slug,
    initialSymptoms: row.initial_symptoms,
    preliminaryDiagnosis: row.preliminary_diagnosis,
    recommendedAction: row.recommended_action,
    isConvertedToOrder: Boolean(row.is_converted_to_order),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    storedIn: 'database',
  };
}

function mapMessageRow(r: any): StoredChatMessage {
  let parsedMeta = null;
  if (r.raw_metadata) {
    try {
      parsedMeta = typeof r.raw_metadata === 'string' ? JSON.parse(r.raw_metadata) : r.raw_metadata;
    } catch {
      parsedMeta = null;
    }
  }

  return {
    id: Number(r.id),
    sessionId: Number(r.session_id),
    role: r.role,
    message: r.message,
    tokensUsed: r.tokens_used,
    responseTimeMs: r.response_time_ms,
    rawMetadata: parsedMeta,
    createdAt: r.created_at,
    storedIn: 'database',
  };
}

const SESSION_SELECT_COLUMNS = `
  s.id,
  s.session_uuid,
  s.user_id,
  s.category_id,
  c.name AS category_name,
  c.slug AS category_slug,
  s.initial_symptoms,
  s.preliminary_diagnosis,
  s.recommended_action,
  s.is_converted_to_order,
  s.created_at,
  s.updated_at
`;

async function findSessionRowByUuid(sessionUuid: string): Promise<any | null> {
  const existing = await query<any[]>(
    `SELECT ${SESSION_SELECT_COLUMNS}
     FROM ai_consultation_sessions s
     LEFT JOIN appliance_categories c ON s.category_id = c.id
     WHERE s.session_uuid = ?
     LIMIT 1`,
    [sessionUuid]
  );
  return existing && existing.length > 0 ? existing[0] : null;
}

/**
 * Lookup sesi read-only berdasarkan UUID — TIDAK PERNAH membuat sesi baru.
 * Dipakai `GET /api/chat/history` (temuan F17: GET tidak boleh menulis).
 * Mengembalikan `null` bila UUID tidak dikenal (DB maupun fallback in-memory).
 * Fungsi ini TIDAK memeriksa kepemilikan — pemanggil wajib menegakkannya
 * (lihat `history/route.ts`) sebelum mengembalikan data sesi.
 */
export async function getSessionByUuid(
  sessionUuid: string
): Promise<ConsultationSession | null> {
  try {
    const row = await findSessionRowByUuid(sessionUuid);
    if (row) return mapSessionRow(row);
  } catch (err) {
    // F6: DB tidak dapat dijangkau — catat, lalu lanjut ke fallback in-memory.
    logDbFailure('getSessionByUuid', { sessionUuid }, err);
  }
  pruneMemoryFallback();
  return memorySessions.get(sessionUuid) || null;
}

async function findSessionRowById(sessionId: number): Promise<any | null> {
  const existing = await query<any[]>(
    `SELECT ${SESSION_SELECT_COLUMNS}
     FROM ai_consultation_sessions s
     LEFT JOIN appliance_categories c ON s.category_id = c.id
     WHERE s.id = ?
     LIMIT 1`,
    [sessionId]
  );
  return existing && existing.length > 0 ? existing[0] : null;
}

/**
 * Lookup sesi read-only berdasarkan ID numerik — TIDAK PERNAH membuat sesi baru.
 * Dipakai `GET /api/chat/session?id=...` (temuan F24: halaman booking memuat
 * gejala awal lewat referensi server-side, bukan query string).
 * Mengembalikan `null` bila ID tidak dikenal atau DB tidak dapat dijangkau.
 * Fungsi ini TIDAK memeriksa kepemilikan — pemanggil wajib menegakkannya
 * sebelum mengembalikan data sesi.
 */
export async function getSessionById(
  sessionId: number
): Promise<ConsultationSession | null> {
  if (!Number.isInteger(sessionId) || sessionId <= 0) return null;
  try {
    const row = await findSessionRowById(sessionId);
    if (row) return mapSessionRow(row);
  } catch (err) {
    // F6: DB tidak dapat dijangkau — catat dan kembalikan null.
    // (Fallback in-memory memakai ID negatif, jadi tidak pernah cocok
    // dengan ID numerik positif dari DB.)
    logDbFailure('getSessionById', { sessionId }, err);
  }
  return null;
}

/**
 * Membuat atau mengambil sesi konsultasi AI berdasarkan UUID.
 *
 * Kontrak kepemilikan (temuan F1/F2):
 * - Bila sesi ditemukan dan `user_id`-nya terisi, pemanggil HARUS pemiliknya —
 *   bila tidak (termasuk pemanggil guest), fungsi melempar `SessionForbiddenError`
 *   (route memetakan ke 403) dan TIDAK PERNAH mengembalikan sesi orang lain.
 * - Sesi guest (`user_id` NULL) dikembalikan apa adanya kepada pemanggil yang
 *   memegang UUID-nya; TIDAK ADA lagi klaim otomatis (F2): pemanggil yang login
 *   TIDAK menjadi pemilik sesi guest, baik di jalur DB maupun fallback in-memory.
 *   Sesi guest tidak pernah muncul di riwayat konsultasi pengguna login.
 * - Bila UUID tidak dikenal, sesi BARU dibuat dengan UUID acak (UUID yang
 *   diminta tidak dipakai ulang) — perilaku lama dipertahankan untuk jalur
 *   `message`/`session`/`convert-to-order`.
 */
export async function getOrCreateSession(
  sessionUuid?: string,
  userId?: number | null,
  categoryId?: number | null
): Promise<ConsultationSession> {
  if (sessionUuid) {
    try {
      const row = await findSessionRowByUuid(sessionUuid);

      if (row) {
        // F1: cek kepemilikan SEBELUM mutasi apa pun pada sesi ini.
        assertSessionOwnership(row.user_id, userId);

        // F2 (dihapus): sesi guest TIDAK LAGI diklaim otomatis oleh pemanggil
        // yang login. Sesi guest tetap guest — `user_id` tidak pernah diisi
        // berdasarkan UUID saja.

        // Jika ada kategori baru yang terdeteksi dan belum diset
        if (categoryId && !row.category_id) {
          await query(
            `UPDATE ai_consultation_sessions SET category_id = ?, updated_at = NOW() WHERE id = ?`,
            [categoryId, row.id]
          );
          row.category_id = categoryId;
        }

        return mapSessionRow(row);
      }
    } catch (err) {
      // F1: penolakan kepemilikan harus merambat ke pemanggil — jangan pernah
      // jatuh ke pembuatan sesi baru yang menyamarkan 403 menjadi sukses.
      if (isSessionForbiddenError(err)) throw err;
      // F6: kegagalan DB dicatat, lalu lanjut ke fallback in-memory.
      logDbFailure('getOrCreateSession:lookup', { sessionUuid }, err);
      // In-memory fallback check
      const mem = memorySessions.get(sessionUuid);
      if (mem) {
        // F1 berlaku juga di jalur fallback in-memory.
        assertSessionOwnership(mem.userId, userId);
        // F2 (dihapus): tidak ada klaim otomatis di jalur fallback.
        if (categoryId && !mem.categoryId) mem.categoryId = categoryId;
        return mem;
      }
    }
  }

  // Buat sesi baru
  const newUuid = crypto.randomUUID();
  try {
    const insertResult: any = await query(
      `INSERT INTO ai_consultation_sessions (
        session_uuid, user_id, category_id, is_converted_to_order, created_at, updated_at
      ) VALUES (?, ?, ?, FALSE, NOW(), NOW())`,
      [newUuid, userId || null, categoryId || null]
    );

    return {
      id: Number(insertResult.insertId),
      sessionUuid: newUuid,
      userId: userId || null,
      categoryId: categoryId || null,
      isConvertedToOrder: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      storedIn: 'database',
    };
  } catch (err) {
    // F6: kegagalan DB dicatat (dulu: catch kosong tanpa jejak).
    logDbFailure('getOrCreateSession:create', { userId: userId || null }, err);
    // F15: ID fallback negatif — tidak pernah bertabrakan dengan ID DB.
    const id = fallbackSessionIdCounter--;
    const sessionObj: ConsultationSession = {
      id,
      sessionUuid: newUuid,
      userId: userId || null,
      categoryId: categoryId || null,
      isConvertedToOrder: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      storedIn: 'memory',
    };
    storeFallbackSession(sessionObj);
    return sessionObj;
  }
}

/** F6 — Hasil simpan pesan yang membedakan penyimpanan DB vs memori. */
export interface ChatMessageSaveResult {
  id: number;
  storedIn: 'database' | 'memory';
}

function storeFallbackMessageNow(
  sessionId: number,
  role: 'user' | 'assistant' | 'system',
  message: string,
  metadata?: ChatMessageMetadata | null,
  tokensUsed?: number,
  responseTimeMs?: number
): number {
  // F15: ID fallback negatif — tidak pernah bertabrakan dengan ID DB.
  const id = fallbackMessageIdCounter--;
  const stored: StoredChatMessage = {
    id,
    sessionId,
    role,
    message,
    tokensUsed: tokensUsed || 0,
    responseTimeMs: responseTimeMs || 0,
    rawMetadata: metadata || null,
    createdAt: new Date().toISOString(),
    storedIn: 'memory',
  };
  storeFallbackMessage(stored);
  return id;
}

/**
 * Menyimpan pesan chat ke tabel ai_chat_messages, dengan hasil yang
 * membedakan penyimpanan tahan lama (database) dari fallback sementara
 * (memory — hilang saat restart). Pemanggil yang menganggap simpan sebagai
 * operasi tahan lama WAJIB memakai fungsi ini (atau memeriksa `storedIn`),
 * bukan `saveChatMessage` yang hanya mengembalikan ID.
 */
export async function saveChatMessageDetailed(
  sessionId: number,
  role: 'user' | 'assistant' | 'system',
  message: string,
  metadata?: ChatMessageMetadata | null,
  tokensUsed?: number,
  responseTimeMs?: number
): Promise<ChatMessageSaveResult> {
  const metaJson = metadata ? JSON.stringify(metadata) : null;

  // F15 — Sesi fallback (ID negatif) tidak punya baris di DB (session_id
  // adalah BIGINT UNSIGNED + FK): langsung simpan di memori tanpa mencoba
  // INSERT yang pasti gagal.
  if (isFallbackId(sessionId)) {
    return {
      id: storeFallbackMessageNow(sessionId, role, message, metadata, tokensUsed, responseTimeMs),
      storedIn: 'memory',
    };
  }

  try {
    const result: any = await query(
      `INSERT INTO ai_chat_messages (
        session_id, role, message, tokens_used, response_time_ms, raw_metadata, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [sessionId, role, message, tokensUsed || null, responseTimeMs || null, metaJson]
    );

    // DB terbukti dapat dijangkau — coba drain pesan fallback yang tertunda.
    triggerDrainIfPending();
    return { id: Number(result.insertId), storedIn: 'database' };
  } catch (err) {
    // F6: kegagalan DB dicatat + hasil membedakan 'memory' (dulu: ID palsu
    // dikembalikan seolah-olah penyimpanan berhasil).
    logDbFailure('saveChatMessage', { sessionId, role }, err);
    return {
      id: storeFallbackMessageNow(sessionId, role, message, metadata, tokensUsed, responseTimeMs),
      storedIn: 'memory',
    };
  }
}

/**
 * Menyimpan pesan chat ke tabel ai_chat_messages (kompatibilitas: hanya
 * mengembalikan ID). Untuk membedakan tulisan DB vs memori, pakai
 * `saveChatMessageDetailed`.
 */
export async function saveChatMessage(
  sessionId: number,
  role: 'user' | 'assistant' | 'system',
  message: string,
  metadata?: ChatMessageMetadata | null,
  tokensUsed?: number,
  responseTimeMs?: number
): Promise<number> {
  const result = await saveChatMessageDetailed(
    sessionId,
    role,
    message,
    metadata,
    tokensUsed,
    responseTimeMs
  );
  return result.id;
}

/** Menerapkan pembaruan diagnosis ke salinan sesi fallback di memori. */
function applyDiagnosisToMemory(
  sessionId: number,
  data: {
    categoryId?: number | null;
    initialSymptoms?: string | null;
    preliminaryDiagnosis?: string | null;
    recommendedAction?: string | null;
  }
): void {
  // F15: lookup lewat indeks id -> UUID — hanya sesi fallback (ID negatif)
  // yang bisa ditemukan; ID DB tidak pernah menyasar entri memori.
  const mem = getFallbackSessionById(sessionId);
  if (mem) {
    if (data.categoryId !== undefined) mem.categoryId = data.categoryId;
    if (data.initialSymptoms !== undefined) mem.initialSymptoms = data.initialSymptoms;
    if (data.preliminaryDiagnosis !== undefined) mem.preliminaryDiagnosis = data.preliminaryDiagnosis;
    if (data.recommendedAction !== undefined) mem.recommendedAction = data.recommendedAction;
    mem.updatedAt = new Date().toISOString();
  }
}

/**
 * Memperbarui data diagnosis pada ai_consultation_sessions
 */
export async function updateSessionDiagnosis(
  sessionId: number,
  data: {
    categoryId?: number | null;
    initialSymptoms?: string | null;
    preliminaryDiagnosis?: string | null;
    recommendedAction?: string | null;
  }
): Promise<void> {
  const fields: string[] = [];
  const params: any[] = [];

  if (data.categoryId !== undefined) {
    fields.push('category_id = ?');
    params.push(data.categoryId);
  }
  if (data.initialSymptoms !== undefined) {
    fields.push('initial_symptoms = ?');
    params.push(data.initialSymptoms);
  }
  if (data.preliminaryDiagnosis !== undefined) {
    fields.push('preliminary_diagnosis = ?');
    params.push(data.preliminaryDiagnosis);
  }
  if (data.recommendedAction !== undefined) {
    fields.push('recommended_action = ?');
    params.push(data.recommendedAction);
  }

  if (fields.length === 0) return;

  // F15 — Sesi fallback: langsung ke memori (tanpa UPDATE DB yang pasti gagal).
  if (isFallbackId(sessionId)) {
    applyDiagnosisToMemory(sessionId, data);
    return;
  }

  fields.push('updated_at = NOW()');
  params.push(sessionId);

  try {
    await query(
      `UPDATE ai_consultation_sessions SET ${fields.join(', ')} WHERE id = ?`,
      params
    );
  } catch (err) {
    // F6: kegagalan DB dicatat, lalu fallback ke memori bila ada salinannya.
    logDbFailure('updateSessionDiagnosis', { sessionId }, err);
    applyDiagnosisToMemory(sessionId, data);
  }
}

/**
 * Mengambil riwayat pesan obrolan untuk sesi tertentu.
 *
 * F14 — Selalu MENGGABUNGKAN sisi DB + memori (bukan salah satu): pesan
 * yang tersimpan in-memory selama outage tetap terlihat setelah DB pulih,
 * dan percakapan tidak pernah tampak berlubang. Dedup berdasarkan ID
 * (namespace terpisah: DB positif, fallback negatif; salinan yang sudah
 * ter-drain mengadopsi ID DB-nya). Memori dibaca DULU lalu DB, sehingga
 * drain yang menyisip di antara kedua baca tidak bisa menggandakan maupun
 * menghilangkan pesan dari satu hasil baca.
 */
export async function getSessionMessages(sessionId: number): Promise<StoredChatMessage[]> {
  pruneMemoryFallback();
  const memoryCopy = (memoryMessages.get(sessionId) || []).slice();

  // F15 — Sesi fallback tidak punya baris di DB: memori saja.
  if (isFallbackId(sessionId)) {
    return sortMessagesByTime(memoryCopy);
  }

  let dbRows: StoredChatMessage[] = [];
  try {
    const rows = await query<any[]>(
      `SELECT id, session_id, role, message, tokens_used, response_time_ms, raw_metadata, created_at
       FROM ai_chat_messages
       WHERE session_id = ?
       ORDER BY id ASC`,
      [sessionId]
    );

    dbRows = (rows || []).map(mapMessageRow);
    // DB terbukti dapat dijangkau — coba drain pesan fallback yang tertunda.
    triggerDrainIfPending();
  } catch (err) {
    // F6: kegagalan DB dicatat; kembalikan sisi memori saja.
    logDbFailure('getSessionMessages', { sessionId }, err);
  }

  // Bila ID sama (salinan ter-drain), salinan DB lebih diutamakan.
  const byId = new Map<number, StoredChatMessage>();
  for (const m of memoryCopy) byId.set(m.id, m);
  for (const m of dbRows) byId.set(m.id, m);
  return sortMessagesByTime(Array.from(byId.values()));
}

/**
 * Mengambil daftar sesi konsultasi milik seorang customer.
 *
 * F14/F12 — Menggabungkan sisi DB + memori (dedup berdasarkan UUID) dan
 * membatasi 20 terbaru. Sesi fallback disimpan satu kunci per UUID sehingga
 * tidak lagi terhitung ganda.
 */
export async function getUserConsultationSessions(userId: number): Promise<ConsultationSession[]> {
  pruneMemoryFallback();
  const memoryCopy = Array.from(memorySessions.values()).filter((s) => s.userId === userId);

  let dbRows: ConsultationSession[] = [];
  try {
    const rows = await query<any[]>(
      `SELECT
        s.id,
        s.session_uuid,
        s.user_id,
        s.category_id,
        c.name AS category_name,
        c.slug AS category_slug,
        s.initial_symptoms,
        s.preliminary_diagnosis,
        s.recommended_action,
        s.is_converted_to_order,
        s.created_at,
        s.updated_at
       FROM ai_consultation_sessions s
       LEFT JOIN appliance_categories c ON s.category_id = c.id
       WHERE s.user_id = ?
       ORDER BY s.updated_at DESC
       LIMIT 20`,
      [userId]
    );

    dbRows = (rows || []).map(mapSessionRow);
    triggerDrainIfPending();
  } catch (err) {
    // F6: kegagalan DB dicatat; kembalikan sisi memori saja.
    logDbFailure('getUserConsultationSessions', { userId }, err);
  }

  const byUuid = new Map<string, ConsultationSession>();
  for (const s of memoryCopy) byUuid.set(s.sessionUuid, s);
  for (const s of dbRows) byUuid.set(s.sessionUuid, s);
  return Array.from(byUuid.values())
    .sort((a, b) => parseStoredTime(b.updatedAt) - parseStoredTime(a.updatedAt))
    .slice(0, 20);
}

/**
 * Menandai sesi telah dikonversi menjadi pesanan perbaikan
 */
export async function markSessionConverted(sessionId: number): Promise<void> {
  // F15 — Sesi fallback: langsung ke memori (tanpa UPDATE DB yang pasti gagal).
  if (isFallbackId(sessionId)) {
    const mem = getFallbackSessionById(sessionId);
    if (mem) {
      mem.isConvertedToOrder = true;
      mem.updatedAt = new Date().toISOString();
    }
    return;
  }

  try {
    await query(
      `UPDATE ai_consultation_sessions
       SET is_converted_to_order = TRUE, updated_at = NOW()
       WHERE id = ?`,
      [sessionId]
    );
  } catch (err) {
    // F6: kegagalan DB dicatat, lalu fallback ke memori bila ada salinannya.
    logDbFailure('markSessionConverted', { sessionId }, err);
    const mem = getFallbackSessionById(sessionId);
    if (mem) {
      mem.isConvertedToOrder = true;
      mem.updatedAt = new Date().toISOString();
    }
  }
}
