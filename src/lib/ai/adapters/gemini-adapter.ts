/**
 * GOOGLE GEMINI PROVIDER ADAPTER
 * BANTUIN AI PROVIDER MANAGEMENT
 * 
 * Mengimplementasikan AIProviderAdapter untuk Google Gemini:
 * - Format resmi Google Generative AI API
 * - Normalisasi Function Calling / Tool Calling
 * - Normalisasi Token Usage & Latensi
 * - Uji koneksi terisolasi dengan payload minimal
 * - Penanganan error spesifik Google tanpa kebocoran API Key
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  AIProviderAdapter,
  AIProviderType,
  ProviderRuntimeConfig,
  AIChatRequest,
  AIChatResponse,
  AIConnectionTestResult,
  AIModelInfo,
  AIModelListResult,
  NormalizedAIError,
  UniversalToolCall,
} from '../types';
import { validateAndPinEndpoint } from '../ssrf-validator';

export class GeminiProviderAdapter implements AIProviderAdapter {
  readonly providerName: AIProviderType = 'gemini';

  /**
   * Menguji koneksi langsung ke Google Gemini API
   */
  async testConnection(config: ProviderRuntimeConfig): Promise<AIConnectionTestResult> {
    const startTime = Date.now();
    const endpointToTest = config.apiEndpoint || 'https://generativelanguage.googleapis.com';
    const modelToTest = config.selectedModel || config.defaultModel || 'gemini-3.5-flash';

    try {
      // 1. Validasi SSRF & DNS Pinning pada Endpoint
      await validateAndPinEndpoint(endpointToTest, 'gemini');

      if (!config.apiKey || !config.apiKey.trim()) {
        return {
          provider: 'gemini',
          endpoint: endpointToTest,
          modelTested: modelToTest,
          status: 'invalid_api_key',
          httpStatusCode: 401,
          responseTimeMs: Date.now() - startTime,
          testedAt: new Date().toISOString(),
          errorMessage: 'API Key Google Gemini belum dikonfigurasi atau kosong.',
        };
      }

      // 2. Kirim probe request berbobot minimal (1 token)
      const genAI = new GoogleGenerativeAI(config.apiKey);
      const model = genAI.getGenerativeModel({
        model: modelToTest,
        generationConfig: {
          maxOutputTokens: 1,
          temperature: 0,
        },
      });

      // Panggil generateContent dengan prompt pendek untuk memverifikasi autentikasi dan model
      const probeResult = await Promise.race([
        model.generateContent('ping'),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Koneksi timeout setelah 15 detik')), 15000)
        ),
      ]);

      const latencyMs = Date.now() - startTime;

      return {
        provider: 'gemini',
        endpoint: endpointToTest,
        modelTested: modelToTest,
        status: 'success',
        httpStatusCode: 200,
        responseTimeMs: latencyMs,
        testedAt: new Date().toISOString(),
        errorMessage: null,
      };
    } catch (err: any) {
      const normalized = this.normalizeError(err, config.apiKey);
      return {
        provider: 'gemini',
        endpoint: endpointToTest,
        modelTested: modelToTest,
        status: normalized.status,
        httpStatusCode: normalized.httpStatusCode,
        responseTimeMs: Date.now() - startTime,
        testedAt: new Date().toISOString(),
        errorMessage: normalized.sanitizedMessage,
      };
    }
  }

  /**
   * Menghasilkan Chat Completion dengan dukungan Tool Calling
   */
  async generateChatCompletion(
    request: AIChatRequest,
    config: ProviderRuntimeConfig
  ): Promise<AIChatResponse> {
    const startTime = Date.now();

    try {
      const genAI = new GoogleGenerativeAI(config.apiKey);

      // Pisahkan system message dari pesan obrolan reguler
      const systemMessage = request.messages.find((m) => m.role === 'system')?.content;

      // Konversi tools universal ke format Google Gemini
      let genAITools: any[] | undefined = undefined;
      if (request.tools && request.tools.length > 0) {
        genAITools = [
          {
            functionDeclarations: request.tools.map((t) => {
              const convertedProperties: Record<string, any> = {};
              if (t.parameters.properties) {
                for (const [key, prop] of Object.entries(t.parameters.properties)) {
                  convertedProperties[key] = {
                    ...prop,
                    type: (prop.type || 'STRING').toUpperCase(),
                  };
                }
              }
              return {
                name: t.name,
                description: t.description,
                parameters: {
                  type: 'OBJECT' as any,
                  properties: convertedProperties,
                  required: t.parameters.required,
                },
              };
            }),
          },
        ];
      }

      const model = genAI.getGenerativeModel({
        model: config.selectedModel || config.defaultModel || 'gemini-3.5-flash',
        systemInstruction: systemMessage,
        tools: genAITools,
        generationConfig: {
          temperature: request.temperature ?? config.temperature ?? 0.7,
          maxOutputTokens: request.maxTokens ?? config.maxOutputTokens ?? 2048,
        },
      });

      // Format riwayat percakapan untuk Gemini
      const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text?: string; functionCall?: any; functionResponse?: any }> }> = [];

      for (const m of request.messages) {
        if (m.role === 'system') continue;

        if (m.role === 'user') {
          contents.push({ role: 'user', parts: [{ text: m.content }] });
        } else if (m.role === 'assistant') {
          if (m.toolCalls && m.toolCalls.length > 0) {
            contents.push({
              role: 'model',
              parts: m.toolCalls.map((tc) => {
                if (tc.rawPart) return tc.rawPart;
                const part: any = {
                  functionCall: {
                    name: tc.name,
                    args: tc.arguments,
                  },
                };
                if (tc.thoughtSignature) {
                  part.thoughtSignature = tc.thoughtSignature;
                }
                return part;
              }),
            });
          } else {
            contents.push({ role: 'model', parts: [{ text: m.content || '' }] });
          }
        } else if (m.role === 'tool') {
          let responsePayload: any;
          try {
            responsePayload = typeof m.content === 'string' ? JSON.parse(m.content) : m.content;
          } catch {
            responsePayload = { result: m.content };
          }
          contents.push({
            role: 'user',
            parts: [
              {
                functionResponse: {
                  name: m.name || 'tool_response',
                  response: responsePayload && typeof responsePayload === 'object' ? responsePayload : { result: responsePayload },
                },
              },
            ],
          });
        }
      }

      // Pastikan ada setidaknya satu pesan user
      if (contents.length === 0) {
        contents.push({ role: 'user', parts: [{ text: 'Halo' }] });
      }

      const timeoutMs = config.requestTimeoutMs || 30000;
      const apiCall = model.generateContent({
        contents: contents as any,
      });

      const response = await Promise.race([
        apiCall,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Request timeout (${timeoutMs}ms)`)), timeoutMs)
        ),
      ]);

      const latencyMs = Date.now() - startTime;
      const candidates = response.response.candidates;
      const candidate = candidates?.[0];

      let replyText = '';
      try {
        replyText = response.response.text();
      } catch {
        replyText = candidate?.content?.parts?.find((p: any) => p.text)?.text || '';
      }

      // Ekstrak function calling jika dipicu oleh model
      const functionCallsRaw = response.response.functionCalls();
      let normalizedToolCalls: UniversalToolCall[] | undefined = undefined;

      if (functionCallsRaw && functionCallsRaw.length > 0) {
        const parts = candidate?.content?.parts || [];
        normalizedToolCalls = functionCallsRaw.map((fc: any, index: number) => {
          const matchingPart = parts.find((p: any) => p.functionCall && p.functionCall.name === fc.name);
          return {
            id: fc.id || `gemini_call_${Date.now()}_${index}`,
            name: fc.name,
            arguments: fc.args || {},
            thoughtSignature: (matchingPart as any)?.thoughtSignature,
            rawPart: matchingPart,
          };
        });
      }

      // Normalisasi Token Usage dari usageMetadata
      const usageMeta = response.response.usageMetadata;
      const promptTokens = Number(usageMeta?.promptTokenCount || 0);
      const completionTokens = Number(usageMeta?.candidatesTokenCount || 0);
      const totalTokens = Number(usageMeta?.totalTokenCount || promptTokens + completionTokens);

      return {
        content: replyText,
        toolCalls: normalizedToolCalls,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens,
        },
        provider: 'gemini',
        model: config.selectedModel || config.defaultModel,
        latencyMs,
        httpStatusCode: 200,
        isFallback: false,
      };
    } catch (err: any) {
      throw this.normalizeError(err, config.apiKey);
    }
  }

  /**
   * Mengambil daftar model Google Gemini yang tersedia.
   *
   * T2: API key TIDAK PERNAH dimasukkan ke query string URL (`?key=...` —
   * key masuk ke log server/proxy dan histori browser). Key dikirim lewat
   * header `x-goog-api-key` yang didukung REST API Google.
   *
   * M4: bila pengambilan live gagal (termasuk 401 — key tidak valid),
   * kembalikan daftar cadangan dengan `isLive: false` + pesan error, BUKAN
   * daftar hardcoded yang tampak seperti data live. UI menampilkan
   * "daftar cadangan — pengambilan live gagal" untuk kasus ini.
   */
  async fetchAvailableModels(config: ProviderRuntimeConfig): Promise<AIModelListResult> {
    const fallbackGeminiModels: AIModelInfo[] = [
      { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash', description: 'Model rekomendasi cepat dan cerdas untuk operasional BANTUIN', isDefault: true },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Model inferensi generasi baru dengan latensi ultra rendah' },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Model penalaran tinggi untuk diagnosis kerusakan kompleks' },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', description: 'Model standar stabil' },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: 'Model kapasitas token besar' },
    ];

    const fallback = (error: string): AIModelListResult => ({
      models: fallbackGeminiModels,
      isLive: false,
      error,
    });

    if (!config.apiKey || !config.apiKey.trim()) {
      return fallback('API key Gemini belum dikonfigurasi — daftar model tidak dapat diambil dari provider.');
    }

    try {
      // T2: key lewat header, bukan query string.
      const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
        headers: { 'x-goog-api-key': config.apiKey.trim() },
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        const detail =
          res.status === 401
            ? 'API key ditolak provider (401 Unauthorized) — periksa kembali key yang tersimpan.'
            : `Provider mengembalikan HTTP ${res.status} saat mengambil daftar model.`;
        return fallback(detail);
      }

      const data = await res.json();
      if (Array.isArray(data.models)) {
        const models = data.models
          .filter((m: any) => m.name && (m.supportedGenerationMethods || []).includes('generateContent'))
          .map((m: any) => {
            const cleanId = m.name.replace(/^models\//, '');
            return {
              id: cleanId,
              name: m.displayName || cleanId,
              description: m.description,
              contextWindow: m.inputTokenLimit,
              maxOutputTokens: m.outputTokenLimit,
              isDefault: cleanId === (config.selectedModel || 'gemini-3.5-flash'),
            };
          });

        if (models.length > 0) {
          return { models, isLive: true, error: null };
        }
        return fallback('Provider tidak mengembalikan model apa pun yang mendukung generateContent.');
      }
      return fallback('Respons daftar model provider tidak dikenali.');
    } catch (err: any) {
      return fallback(`Gagal menghubungi provider untuk daftar model: ${err?.message || 'error jaringan'}`);
    }
  }

  /**
   * Menormalkan error vendor Google Gemini dan menyensor API key.
   *
   * H3: klasifikasikan berdasarkan STATUS HTTP NUMERIK dari SDK terlebih
   * dahulu (seperti adapter Groq) — `GoogleGenerativeAIFetchError` membawa
   * `status`/`statusCode`. Pencocokan substring pesan hanya dipakai sebagai
   * fallback bila tidak ada status numerik. Sebelumnya klasifikasi sepenuhnya
   * substring-matching, sehingga: 500/502 selalu dilaporkan 503; error kuota
   * 429 yang pesan-nya mengandung substring "401" (mis. nomor proyek Google)
   * salah jadi `invalid_api_key` dan mematikan fallback; setiap pesan yang
   * mengandung `models/` diklaim model tidak tersedia; dan error 400 jatuh
   * ke `unknown_error`.
   */
  normalizeError(error: any, apiKeyToSanitize?: string): NormalizedAIError {
    const rawMsg = String(error?.message || error || 'Unknown Gemini error');
    let sanitizedMsg = rawMsg;

    // Bersihkan API key jika tercantum dalam pesan error
    if (apiKeyToSanitize) {
      sanitizedMsg = sanitizedMsg.replace(new RegExp(apiKeyToSanitize.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '[REDACTED_API_KEY]');
    }

    let status: AIConnectionTestResult['status'] = 'unknown_error';
    let httpStatusCode: number | null = null;
    let isRetryable = false;
    let isFallbackEligible = false;

    // 1. Status HTTP numerik dari SDK menang atas segalanya. Terima angka
    // maupun string numerik 3 digit dari properti yang umum dipakai SDK
    // (`status`, `statusCode`, `response.status`, `code` bila numerik).
    const numericStatus = extractNumericHttpStatus(error);

    if (numericStatus !== null) {
      httpStatusCode = numericStatus;
      switch (numericStatus) {
        case 400:
          // Argumen tidak valid / prompt diblokir safety — sebelumnya jatuh
          // ke unknown_error. Fallback ke provider lain masih layak dicoba
          // (provider lain memakai model dan filter berbeda).
          status = 'provider_error';
          isRetryable = false;
          isFallbackEligible = true;
          break;
        case 401:
          status = 'invalid_api_key';
          isRetryable = false;
          isFallbackEligible = false; // TIDAK BOLEH fallback jika API key salah
          break;
        case 403:
          status = 'provider_error';
          isRetryable = false;
          isFallbackEligible = false;
          break;
        case 404:
          status = 'model_not_available';
          isRetryable = false;
          isFallbackEligible = false;
          break;
        case 408:
          status = 'timeout';
          isRetryable = true;
          isFallbackEligible = true;
          break;
        case 429:
          status = 'rate_limit_exceeded';
          isRetryable = true;
          isFallbackEligible = true; // Boleh fallback jika kuota terlampaui
          break;
        default:
          // 500/502/503/504 dan kode lain: LAPORKAN KODE ASLINYA — jangan
          // paksa semua menjadi 503 seperti sebelumnya. Error server (5xx)
          // layak retry + fallback; kode 4xx lain tidak.
          status = 'provider_error';
          isRetryable = numericStatus >= 500;
          isFallbackEligible = numericStatus >= 500;
          break;
      }
    } else {
      // 2. Fallback: tidak ada status numerik — klasifikasikan dari pesan.
      // URUTAN PENTING: kuota/429 HARUS diperiksa SEBELUM 401, karena pesan
      // kuota Google menyertakan nomor proyek konsumen yang bisa mengandung
      // substring "401" (atau "404"/"500") — memeriksa 401 lebih dulu akan
      // salah mengklasifikasi error 429 sebagai invalid_api_key.
      const lower = sanitizedMsg.toLowerCase();

      // M5: error jaringan transient (tanpa respons HTTP sama sekali). Sinyal
      // diambil dari pesan + kode error Node (error.code / cause.code),
      // karena fetch yang gagal DNS/koneksi sering hanya membawa pesan
      // generik "fetch failed" dengan kode di cause. Tanpa cabang ini semua
      // error jaringan jatuh ke unknown_error dan tidak pernah memicu
      // retry/fallback — padahal inilah kasus paling layak untuk keduanya.
      // Cabang ini HARUS pertama: tidak ada respons HTTP berarti tidak ada
      // status 4xx/5xx yang bisa diklaim dari substring pesan.
      const networkSignal = `${lower} ${typeof error?.code === 'string' ? error.code : ''} ${typeof error?.cause?.code === 'string' ? error.cause.code : ''} ${typeof error?.cause?.message === 'string' ? error.cause.message : ''}`.toLowerCase();
      const isNetworkError =
        networkSignal.includes('enotfound') ||
        networkSignal.includes('econnrefused') ||
        networkSignal.includes('econnreset') ||
        networkSignal.includes('eai_again') ||
        networkSignal.includes('socket hang up') ||
        networkSignal.includes('fetch failed');

      if (isNetworkError) {
        status = 'provider_error';
        httpStatusCode = null; // tidak ada respons HTTP yang diterima
        isRetryable = true;
        isFallbackEligible = true;
      } else if (lower.includes('resource_exhausted') || lower.includes('quota') || lower.includes('rate limit') || lower.includes('too many requests') || lower.includes('429')) {
        status = 'rate_limit_exceeded';
        httpStatusCode = 429;
        isRetryable = true;
        isFallbackEligible = true; // Boleh fallback jika kuota terlampaui
      } else if (lower.includes('api_key_invalid') || lower.includes('api key not valid') || lower.includes('invalid api key') || lower.includes('unauthenticated') || lower.includes('401')) {
        status = 'invalid_api_key';
        httpStatusCode = 401;
        isRetryable = false;
        isFallbackEligible = false; // TIDAK BOLEH fallback jika API key salah
      } else if (lower.includes('permission_denied') || lower.includes('permission denied') || lower.includes('403')) {
        status = 'provider_error';
        httpStatusCode = 403;
        isRetryable = false;
        isFallbackEligible = false;
      } else if (
        lower.includes('invalid argument') || lower.includes('invalid_argument') ||
        lower.includes('bad request') || lower.includes('safety') ||
        lower.includes('blocked') || lower.includes('400')
      ) {
        // 400: argumen tidak valid / prompt diblokir safety.
        status = 'provider_error';
        httpStatusCode = 400;
        isRetryable = false;
        isFallbackEligible = true;
      } else if (
        lower.includes('not found') || lower.includes('model not found') ||
        lower.includes('does not exist') || lower.includes('404') ||
        lower.includes('unknown model') ||
        // 'models/' saja TIDAK cukup (H3): hanya hitung bila disertai penanda
        // tidak-tersedia — error 400/403 yang hanya menyebut path model
        // tidak boleh diklaim model_not_available.
        (lower.includes('models/') && lower.includes('not supported'))
      ) {
        status = 'model_not_available';
        httpStatusCode = 404;
        isRetryable = false;
        isFallbackEligible = false;
      } else if (lower.includes('timeout') || lower.includes('aborted') || lower.includes('etimedout')) {
        status = 'timeout';
        httpStatusCode = 504;
        isRetryable = true;
        isFallbackEligible = true; // Boleh fallback jika timeout
      } else if (lower.includes('500') || lower.includes('502') || lower.includes('503') || lower.includes('unavailable') || lower.includes('overloaded')) {
        // Pisahkan kode 5xx apa adanya; 'unavailable'/'overloaded' tanpa kode
        // eksplisit tetap dilaporkan 503 (perilaku lama yang benar untuk kasus ini).
        status = 'provider_error';
        if (lower.includes('500')) httpStatusCode = 500;
        else if (lower.includes('502')) httpStatusCode = 502;
        else httpStatusCode = 503;
        isRetryable = true;
        isFallbackEligible = true; // Boleh fallback jika server Google error
      } else if (lower.includes('ssrf') || lower.includes('protocol') || lower.includes('private ip')) {
        status = 'invalid_endpoint';
        httpStatusCode = 400;
        isRetryable = false;
        isFallbackEligible = false;
      }
    }

    return {
      provider: 'gemini',
      status,
      httpStatusCode,
      isRetryable,
      isFallbackEligible,
      rawMessage: rawMsg,
      sanitizedMessage: sanitizedMsg,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * H3: ambil kode status HTTP numerik dari error SDK bila ada.
 * Menerima angka (mis. 429) atau string numerik 3 digit (mis. '429').
 * Mengembalikan null bila tidak ada status numerik yang valid — pemanggil
 * kemudian memakai pencocokan pesan sebagai fallback.
 */
function extractNumericHttpStatus(error: any): number | null {
  if (!error || typeof error !== 'object') return null;
  const candidates = [error.status, error.statusCode, error.response?.status, error.code];
  for (const c of candidates) {
    if (typeof c === 'number' && Number.isFinite(c) && c >= 100 && c < 600) {
      return Math.trunc(c);
    }
    if (typeof c === 'string' && /^\d{3}$/.test(c.trim())) {
      const n = Number(c.trim());
      if (n >= 100 && n < 600) return n;
    }
  }
  return null;
}
