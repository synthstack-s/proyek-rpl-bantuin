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

// Bersihkan entri sesi yang lebih dari 6 jam tidak aktif
setInterval(() => {
  const now = Date.now();
  const maxAge = 6 * 60 * 60 * 1000;
  for (const [sessionId, entry] of sessionMemoryCache.entries()) {
    if (now - entry.lastInteractionTime > maxAge) {
      sessionMemoryCache.delete(sessionId);
    }
  }
}, 30 * 60 * 1000);

export function getSessionMemory(sessionId: number): SessionMemoryEntry | undefined {
  return sessionMemoryCache.get(sessionId);
}

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

  let activeOrderCode = detectedOrderCode || memory?.activeOrderCode || null;
  let activeRepairId = memory?.activeRepairId || null;
  let activeTechnicianName = memory?.activeTechnicianName || null;
  let activeInvoiceNumber = detectedInvoiceNumber || memory?.activeInvoiceNumber || null;
  let activePhoneNumber = detectedPhoneNumber || memory?.activePhoneNumber || null;
  let activeEmail = detectedEmail || memory?.activeEmail || null;
  let activeUserUuid = detectedUserUuid || memory?.activeUserUuid || null;

  // 3. Jika belum ada kode order langsung, cari di 3 pesan asisten terakhir
  if (!activeOrderCode && (hasFollowUpIndicator || isShortQuestion)) {
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

  // 4. Update memory cache jika ditemukan entitas aktif
  if (activeOrderCode || activeInvoiceNumber || activePhoneNumber || activeEmail || activeUserUuid) {
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
    activeDeviceCategory: memory?.activeDeviceCategory || null,
    activeTechnicianName,
    activeInvoiceNumber,
    activePhoneNumber,
    activeEmail,
    activeUserUuid,
    isFollowUpQuestion: Boolean(activeOrderCode && (hasFollowUpIndicator || isShortQuestion)),
  };
}

