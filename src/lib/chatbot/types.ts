/**
 * Tipe data dan antarmuka untuk modul Chatbot+ BANTUIN
 */

export type UserRole = 'customer' | 'technician' | 'admin' | 'guest';

export interface ChatUserContext {
  userId?: number;
  uuid?: string;
  role: UserRole;
  name?: string;
  email?: string;
  phoneNumber?: string;
  /**
   * F21 — IP klien asal request, disetel oleh route handler dari header
   * x-forwarded-for (entri pertama, tervalidasi). Hanya untuk log audit;
   * TIDAK PERNAH dibaca dari argumen tool AI (bisa dipalsukan). Null bila
   * tidak ada konteks request (pemanggilan langsung / job latar).
   */
  clientIp?: string | null;
  pageContext?: {
    pathname: string;
    pageTitle?: string;
  };
}

export interface DiagnosisCard {
  deviceCategory: string;
  categoryId?: number;
  categorySlug?: string;
  symptomsSummary: string;
  confidenceLevel: 'Sangat Mungkin' | 'Kemungkinan Besar' | 'Perlu Pemeriksaan Langsung';
  possibleCauses: string[];
  safeCheckSteps: string[];
  safetyHazardWarning?: string | null;
  recommendedAction: string;
  estimatedLaborCostRange?: string;
}

export interface QuickSuggestion {
  label: string;
  prompt: string;
  category?: string;
}

export interface TopicValidationResult {
  isAllowed: boolean;
  reason?: string;
  isSafetyHazard: boolean;
  safetyAlert?: string;
  detectedCategory?: string;
  isBantuinAppQuery?: boolean;
}

export interface ChatMessageMetadata {
  model?: string;
  responseTimeMs?: number;
  tokensUsed?: number;
  diagnosisCard?: DiagnosisCard | null;
  quickSuggestions?: QuickSuggestion[];
  safetyAlert?: string | null;
  topicRefused?: boolean;
  toolCalls?: Array<{ name: string; args: any }>;
  aiError?: string | null;
}

export interface StoredChatMessage {
  id: number;
  sessionId: number;
  role: 'user' | 'assistant' | 'system';
  message: string;
  tokensUsed?: number | null;
  responseTimeMs?: number | null;
  rawMetadata?: ChatMessageMetadata | null;
  createdAt: string;
  /**
   * F6 — Dari mana pesan ini berasal: 'database' (tersimpan di MySQL) atau
   * 'memory' (hanya di fallback in-memory selama DB tidak dapat dijangkau).
   * Dipakai pemanggil untuk membedakan tulisan yang tahan lama dari yang
   * hanya di memori (hilang saat restart).
   */
  storedIn?: 'database' | 'memory';
}

export interface ConsultationSession {
  id: number;
  sessionUuid: string;
  userId?: number | null;
  categoryId?: number | null;
  categoryName?: string | null;
  categorySlug?: string | null;
  initialSymptoms?: string | null;
  preliminaryDiagnosis?: string | null;
  recommendedAction?: string | null;
  isConvertedToOrder: boolean;
  createdAt: string;
  updatedAt: string;
  /**
   * F6 — Dari mana sesi ini berasal: 'database' (baris MySQL) atau 'memory'
   * (sesi fallback in-memory selama DB tidak dapat dijangkau; hilang saat
   * restart). Sesi fallback selalu ber-ID negatif (F15).
   */
  storedIn?: 'database' | 'memory';
}
