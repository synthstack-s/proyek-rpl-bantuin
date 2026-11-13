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
}
