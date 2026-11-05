/**
 * UNIVERSAL AI PROVIDER MANAGEMENT TYPES
 * BANTUIN SaaS PLATFORM
 * 
 * Standarisasi antarmuka vendor-agnostik untuk Google Gemini dan Groq AI:
 * - Runtime configuration
 * - Normalized chat completion request & response
 * - Normalized tool calling (Function Calling)
 * - Normalized error taxonomy
 * - Connection test result & model descriptors
 */

export type AIProviderType = 'gemini' | 'groq' | (string & {});

export type AIConnectionStatus =
  | 'not_configured'
  | 'connected'
  | 'disconnected'
  | 'connection_error'
  | 'disabled';

export type AIConnectionTestStatus =
  | 'success'
  | 'invalid_api_key'
  | 'invalid_endpoint'
  | 'model_not_available'
  | 'rate_limit_exceeded'
  | 'timeout'
  | 'provider_error'
  | 'unknown_error';

export interface ProviderRuntimeConfig {
  provider: AIProviderType;
  name: string;
  apiEndpoint: string;
  apiKey: string; // Plaintext saat runtime (hanya ada di memori internal server)
  keyIdentifier: string;
  maskedKeyPreview: string;
  selectedModel: string;
  defaultModel: string;
  temperature: number;
  maxOutputTokens: number;
  requestTimeoutMs: number;
  retryLimit: number;
  lastConnectionStatus: AIConnectionStatus;
  lastTestedAt?: string | null;
  lastErrorMessage?: string | null;
}

export interface UniversalToolParameterProperty {
  type: string;
  description?: string;
  enum?: string[];
  items?: { type: string };
}

export interface UniversalToolDeclaration {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, UniversalToolParameterProperty>;
    required?: string[];
  };
}

export interface UniversalToolCall {
  id: string; // ID unik pemanggilan tool (cth: call_abc123)
  name: string; // Nama fungsi yang dipanggil
  arguments: Record<string, any>; // Argumen ter-parse
  thoughtSignature?: string; // Tanda tangan thought Gemini jika ada
  rawPart?: any; // Part raw dari model untuk round-trip preservation
}

export interface UniversalToolExecutionResult {
  toolCallId: string;
  toolName: string;
  result: any;
}

export interface UniversalChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string; // Nama fungsi jika role === 'tool'
  toolCallId?: string; // ID korelasi pemanggilan jika role === 'tool'
  toolCalls?: UniversalToolCall[]; // Jika assistant meminta pemanggilan fungsi
}

export interface AIChatRequest {
  messages: UniversalChatMessage[];
  tools?: UniversalToolDeclaration[];
  toolResults?: UniversalToolExecutionResult[];
  temperature?: number;
  maxTokens?: number;
  sessionId?: number;
  userRole?: string;
}

export interface NormalizedTokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface AIChatResponse {
  content: string;
  toolCalls?: UniversalToolCall[];
  usage: NormalizedTokenUsage;
  provider: AIProviderType;
  model: string;
  latencyMs: number;
  httpStatusCode?: number;
  isFallback: boolean;
  fallbackFrom?: AIProviderType;
}

export interface AIConnectionTestResult {
  provider: AIProviderType;
  endpoint: string;
  modelTested: string;
  status: AIConnectionTestStatus;
  httpStatusCode: number | null;
  responseTimeMs: number;
  testedAt: string;
  errorMessage: string | null;
}

export interface AIModelInfo {
  id: string; // Model identifier (cth: "llama-3.3-70b-versatile", "gemini-3.5-flash")
  name: string; // Human-friendly display name
  description?: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  isDefault?: boolean;
}

export interface NormalizedAIError {
  provider: AIProviderType;
  status: AIConnectionTestStatus;
  httpStatusCode: number | null;
  isRetryable: boolean;
  isFallbackEligible: boolean;
  rawMessage: string;
  sanitizedMessage: string;
  timestamp: string;
}

/**
 * Interface Standar Adapter Provider AI
 */
export interface AIProviderAdapter {
  readonly providerName: AIProviderType;

  /**
   * Menguji koneksi aktual ke provider dengan konsumsi token minimal
   */
  testConnection(config: ProviderRuntimeConfig): Promise<AIConnectionTestResult>;

  /**
   * Menghasilkan teks percakapan dan menangani pemanggilan fungsi (Function Calling)
   */
  generateChatCompletion(
    request: AIChatRequest,
    config: ProviderRuntimeConfig
  ): Promise<AIChatResponse>;

  /**
   * Mengambil daftar model yang aktif tersedia dari endpoint API provider
   */
  fetchAvailableModels(config: ProviderRuntimeConfig): Promise<AIModelInfo[]>;

  /**
   * Menormalkan error dari vendor ke format standar BANTUIN
   */
  normalizeError(error: any, apiKeyToSanitize?: string): NormalizedAIError;
}
