import crypto from 'crypto';
import { query } from '@/lib/db';
import { ConsultationSession, StoredChatMessage, ChatMessageMetadata } from './types';

// In-memory fallback cache saat database MySQL offline atau berada dalam sandbox mode
const memorySessions = new Map<number | string, ConsultationSession>();
const memoryMessages = new Map<number, StoredChatMessage[]>();
let fallbackMessageIdCounter = 1;
let fallbackSessionIdCounter = 1;

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
  } catch {
    // DB tidak dapat dijangkau — lanjut ke fallback in-memory di bawah.
  }
  return memorySessions.get(sessionUuid) || null;
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
    };
  } catch {
    // In-memory fallback
    const id = fallbackSessionIdCounter++;
    const sessionObj: ConsultationSession = {
      id,
      sessionUuid: newUuid,
      userId: userId || null,
      categoryId: categoryId || null,
      isConvertedToOrder: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    memorySessions.set(newUuid, sessionObj);
    memorySessions.set(id, sessionObj);
    return sessionObj;
  }
}

/**
 * Menyimpan pesan chat ke tabel ai_chat_messages
 */
export async function saveChatMessage(
  sessionId: number,
  role: 'user' | 'assistant' | 'system',
  message: string,
  metadata?: ChatMessageMetadata | null,
  tokensUsed?: number,
  responseTimeMs?: number
): Promise<number> {
  const metaJson = metadata ? JSON.stringify(metadata) : null;
  try {
    const result: any = await query(
      `INSERT INTO ai_chat_messages (
        session_id, role, message, tokens_used, response_time_ms, raw_metadata, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [sessionId, role, message, tokensUsed || null, responseTimeMs || null, metaJson]
    );

    return Number(result.insertId);
  } catch {
    // In-memory fallback
    const id = fallbackMessageIdCounter++;
    const stored: StoredChatMessage = {
      id,
      sessionId,
      role,
      message,
      tokensUsed: tokensUsed || 0,
      responseTimeMs: responseTimeMs || 0,
      rawMetadata: metadata || null,
      createdAt: new Date().toISOString(),
    };
    const list = memoryMessages.get(sessionId) || [];
    list.push(stored);
    memoryMessages.set(sessionId, list);
    return id;
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

  fields.push('updated_at = NOW()');
  params.push(sessionId);

  try {
    await query(
      `UPDATE ai_consultation_sessions SET ${fields.join(', ')} WHERE id = ?`,
      params
    );
  } catch {
    // In-memory fallback
    const mem = memorySessions.get(sessionId);
    if (mem) {
      if (data.categoryId !== undefined) mem.categoryId = data.categoryId;
      if (data.initialSymptoms !== undefined) mem.initialSymptoms = data.initialSymptoms;
      if (data.preliminaryDiagnosis !== undefined) mem.preliminaryDiagnosis = data.preliminaryDiagnosis;
      if (data.recommendedAction !== undefined) mem.recommendedAction = data.recommendedAction;
      mem.updatedAt = new Date().toISOString();
    }
  }
}

/**
 * Mengambil riwayat pesan obrolan untuk sesi tertentu
 */
export async function getSessionMessages(sessionId: number): Promise<StoredChatMessage[]> {
  try {
    const rows = await query<any[]>(
      `SELECT id, session_id, role, message, tokens_used, response_time_ms, raw_metadata, created_at 
       FROM ai_chat_messages 
       WHERE session_id = ? 
       ORDER BY id ASC`,
      [sessionId]
    );

    if (rows && rows.length > 0) {
      return rows.map(r => {
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
        };
      });
    }
  } catch {
    // In-memory fallback
  }

  return memoryMessages.get(sessionId) || [];
}

/**
 * Mengambil daftar sesi konsultasi milik seorang customer
 */
export async function getUserConsultationSessions(userId: number): Promise<ConsultationSession[]> {
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

    if (rows && rows.length > 0) {
      return rows.map(r => ({
        id: Number(r.id),
        sessionUuid: r.session_uuid,
        userId: Number(r.user_id),
        categoryId: r.category_id ? Number(r.category_id) : null,
        categoryName: r.category_name,
        categorySlug: r.category_slug,
        initialSymptoms: r.initial_symptoms,
        preliminaryDiagnosis: r.preliminary_diagnosis,
        recommendedAction: r.recommended_action,
        isConvertedToOrder: Boolean(r.is_converted_to_order),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    }
  } catch {
    // In-memory fallback
  }

  const userSessions: ConsultationSession[] = [];
  for (const s of memorySessions.values()) {
    if (s.userId === userId) {
      userSessions.push(s);
    }
  }
  return userSessions;
}

/**
 * Menandai sesi telah dikonversi menjadi pesanan perbaikan
 */
export async function markSessionConverted(sessionId: number): Promise<void> {
  try {
    await query(
      `UPDATE ai_consultation_sessions 
       SET is_converted_to_order = TRUE, updated_at = NOW() 
       WHERE id = ?`,
      [sessionId]
    );
  } catch {
    const mem = memorySessions.get(sessionId);
    if (mem) {
      mem.isConvertedToOrder = true;
      mem.updatedAt = new Date().toISOString();
    }
  }
}
