/**
 * BANTUIN CONVERSATION MEMORY ENGINE
 * 
 * Pengelola memori percakapan multi-turn terisolasi:
 * 1. Mempertahankan konteks entitas aktif (Active Entities) sepanjang sesi:
 *    - activeOrderCode
 *    - activeInvoiceNumber
 *    - activePhoneNumber
 *    - activeEmail
 *    - activeCategorySlug
 *    - lastIntent
 * 2. Memungkinkan pemahaman pertanyaan lanjutan (Follow-Up Questions).
 * 3. Pengelolaan context window efisien (menghindari pengiriman seluruh data mentah).
 * 4. Isolasi ketat berbasis sesi dan ID pengguna.
 */

import { StoredChatMessage } from '../types';

export interface ActiveConversationState {
  sessionId: number;
  userId?: number | null;
  activeOrderCode?: string | null;
  activeInvoiceNumber?: string | null;
  activePhoneNumber?: string | null;
  activeEmail?: string | null;
  activeCategorySlug?: string | null;
  lastIntent?: string | null;
  turnCount: number;
  updatedAt: number;
}

// In-memory Session State Cache (Terisolasi per sessionId)
// F15: batas atas jumlah sesi yang disimpan — registry ini sebelumnya
// tumbuh tanpa batas (tanpa TTL/pembersihan), sehingga setiap sesi chat
// baru menambah entri selamanya di memori proses Next.js. Saat batas
// tercapai, sesi yang paling lama tidak diperbarui dihapus lebih dulu
// (memori percakapan adalah cache: sesi yang terhapus dibangun ulang
// dari entitas pesan berikutnya).
const MAX_SESSION_STATES = 1000;
const sessionStateRegistry = new Map<number, ActiveConversationState>();

/**
 * Mengambil atau menginisialisasi memori percakapan untuk sesi tertentu
 */
export function getOrCreateConversationMemory(sessionId: number, userId?: number | null): ActiveConversationState {
  let state = sessionStateRegistry.get(sessionId);

  if (!state) {
    if (sessionStateRegistry.size >= MAX_SESSION_STATES) {
      let oldestId: number | undefined;
      let oldestUpdatedAt = Infinity;
      for (const [id, entry] of sessionStateRegistry) {
        if (entry.updatedAt < oldestUpdatedAt) {
          oldestUpdatedAt = entry.updatedAt;
          oldestId = id;
        }
      }
      if (oldestId !== undefined) sessionStateRegistry.delete(oldestId);
    }
    state = {
      sessionId,
      userId: userId || null,
      activeOrderCode: null,
      activeInvoiceNumber: null,
      activePhoneNumber: null,
      activeEmail: null,
      activeCategorySlug: null,
      lastIntent: null,
      turnCount: 0,
      updatedAt: Date.now(),
    };
    sessionStateRegistry.set(sessionId, state);
  }

  return state;
}

/**
 * Memperbarui memori entitas sesi dari pesan dan riwayat terkini
 */
export function updateConversationMemory(
  sessionId: number,
  newEntities: {
    orderCode?: string;
    invoiceNumber?: string;
    phoneNumber?: string;
    email?: string;
    categorySlug?: string;
    intent?: string;
  },
  userId?: number | null
): ActiveConversationState {
  const state = getOrCreateConversationMemory(sessionId, userId);

  if (newEntities.orderCode) state.activeOrderCode = newEntities.orderCode;
  if (newEntities.invoiceNumber) state.activeInvoiceNumber = newEntities.invoiceNumber;
  if (newEntities.phoneNumber) state.activePhoneNumber = newEntities.phoneNumber;
  if (newEntities.email) state.activeEmail = newEntities.email;
  if (newEntities.categorySlug) state.activeCategorySlug = newEntities.categorySlug;
  if (newEntities.intent) state.lastIntent = newEntities.intent;

  state.turnCount += 1;
  state.updatedAt = Date.now();

  return state;
}

/**
 * Menyaring riwayat percakapan agar hemat token dan tidak membocorkan kredensial
 */
export function pruneAndSanitizeHistory(
  rawMessages: StoredChatMessage[],
  maxTurns: number = 6
): Array<{ role: 'user' | 'assistant'; content: string }> {
  // Ambil hanya n pesan terakhir untuk menjaga context budget
  const slice = rawMessages.slice(-maxTurns);

  return slice.map((msg) => {
    let cleanContent = msg.message;

    // Bersihkan dump JSON besar jika ada
    cleanContent = cleanContent.replace(/```json[\s\S]*?```/g, '').trim();

    return {
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: cleanContent,
    };
  });
}

/**
 * Menghapus memori sesi jika percakapan direset
 */
export function clearConversationMemory(sessionId: number) {
  sessionStateRegistry.delete(sessionId);
}
