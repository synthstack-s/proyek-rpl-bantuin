/**
 * GOOGLE GEMINI PROVIDER ADAPTER
 * BANTUIN AI PROVIDER MANAGEMENT
 *
 * Mengimplementasikan AIProviderAdapter untuk Google Gemini:
 * - Format resmi Google Generative AI API (REST v1beta)
 * - Normalisasi Function Calling / Tool Calling
 * - Normalisasi Token Usage & Latensi
 * - Uji koneksi terisolasi dengan payload minimal
 * - Penanganan error spesifik Google tanpa kebocoran API Key
 *
 * S7: adapter ini memakai REST langsung (fetch), BUKAN Google SDK
 * (@google/generative-ai) — SDK itu tidak mendukung base URL kustom
 * sehingga `config.apiEndpoint` selalu diabaikan dan request selalu ke
 * endpoint resmi Google. Dengan REST, endpoint terkonfigurasi (termasuk
 * proxy/region kustom) BENAR-BENAR dipakai: setiap metode memvalidasi
 * endpoint lewat `validateAndPinEndpoint` dan memakai `normalizedUrl`
 * hasil validasi untuk membangun URL request. Timeout memakai
 * `AbortSignal.timeout` sehingga request yang kehabisan waktu BENAR-BENAR
 * dibatalkan (bukan Promise.race yang membiarkan request liar berjalan).
 * API key selalu dikirim lewat header `x-goog-api-key` (T2), tidak pernah
 * di query string.
 */

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

/** Versi REST API Gemini yang dipakai seluruh metode adapter ini. */
const GEMINI_REST_API_VERSION = 'v1beta';

/**
 * S7: bangun URL REST Gemini dari base URL TERNORMALISASI hasil validasi
 * SSRF — jangan pernah memakai URL hardcoded atau base mentah dari config.
 */
function buildGeminiRestUrl(normalizedBaseUrl: string, model: string, action: 'generateContent'): string {
  return `${normalizedBaseUrl}/${GEMINI_REST_API_VERSION}/models/${encodeURIComponent(model)}:${action}`;
}

/**
 * S7: satu titik pemanggilan REST Gemini untuk seluruh metode adapter.
 * - Key lewat header `x-goog-api-key` (T2 — tidak pernah di query string).
 * - Timeout memakai `AbortSignal.timeout` sehingga fetch yang kehabisan
 *   waktu benar-benar dibatalkan; error abort diubah menjadi Error timeout
 *   yang jelas agar `normalizeError` mengklasifikasikannya sebagai
 *   `timeout` (bukan `unknown_error`).
 * - Respons non-2xx dilempar sebagai Error dengan properti numerik
 *   `.status` + pesan dari body error Google, agar `normalizeError`
 *   (cabang status numerik Batch 2/H3) mengklasifikasikannya dengan benar.
 * - `JSON.parse` body respons berpenjaga (pola S8e).
 */
async function callGeminiRest(
  url: string,
  apiKey: string,
  body: Record<string, any>,
  timeoutMs: number
): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey.trim(),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err: any) {
    // AbortSignal.timeout membatalkan fetch dengan TimeoutError/AbortError —
    // ubah menjadi pesan timeout yang dikenali normalizeError.
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      throw new Error(`Request timeout (${timeoutMs}ms) — request ke Gemini dibatalkan.`);
    }
    throw err;
  }

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    throw new Error(
      `Respons Gemini bukan JSON yang valid (HTTP ${res.status}) — tidak dapat membaca body respons.`
    );
  }

  if (!res.ok) {
    const apiError: any = new Error(
      data?.error?.message || `Gemini mengembalikan HTTP ${res.status}.`
    );
    // Status numerik agar normalizeError memakai cabang H3 (bukan substring).
    apiError.status = res.status;
    apiError.statusCode = res.status;
    if (typeof data?.error?.status === 'string') apiError.code = data.error.status;
    throw apiError;
  }

  return data;
}

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
      // 1. Validasi SSRF & DNS Pinning pada Endpoint. S7: hasil validasi
      // DIPAKAI — `normalizedUrl`-nya menjadi base URL request REST di
      // bawah (sebelumnya hasil dibuang dan SDK selalu memanggil endpoint
      // resmi Google apa pun endpoint terkonfigurasi).
      const endpointValidation = await validateAndPinEndpoint(endpointToTest, 'gemini');

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

      // L7: timeout probe memakai requestTimeoutMs dari konfigurasi (form) —
      // sebelumnya hardcoded 15 detik, sehingga pengaturan timeout admin
      // diabaikan saat tes koneksi. Dijepit 5s–120s; default 15s bila
      // konfigurasi tidak membawa nilai yang valid.
      const probeTimeoutMs = Number.isFinite(Number(config.requestTimeoutMs))
        ? Math.max(5000, Math.min(120000, Number(config.requestTimeoutMs)))
        : 15000;

      // 2. Kirim probe request berbobot minimal (1 token) lewat REST
      // langsung ke endpoint terkonfigurasi (S7). Timeout benar-benar
      // membatalkan fetch (AbortSignal di callGeminiRest).
      const probeUrl = buildGeminiRestUrl(endpointValidation.normalizedUrl, modelToTest, 'generateContent');
      await callGeminiRest(
        probeUrl,
        config.apiKey,
        {
          contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
          generationConfig: { maxOutputTokens: 1, temperature: 0 },
        },
        probeTimeoutMs
      );

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
      // S7: validasi endpoint di generateChatCompletion JUGA (sebelumnya
      // hanya testConnection yang memvalidasi — dan membuang hasilnya).
      // `normalizedUrl` hasil validasi menjadi base URL request REST di
      // bawah, sehingga endpoint kustom (proxy/region) benar-benar dipakai.
      const endpointUrl = config.apiEndpoint || 'https://generativelanguage.googleapis.com';
      const endpointValidation = await validateAndPinEndpoint(endpointUrl, 'gemini');

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

      // S7: body REST generateContent — bentuk yang sama seperti yang dulu
      // dibangun SDK (systemInstruction/tools/generationConfig), hanya
      // sekarang dikirim langsung lewat fetch ke endpoint terkonfigurasi.
      const modelToUse = config.selectedModel || config.defaultModel || 'gemini-3.5-flash';
      const requestBody: Record<string, any> = {
        systemInstruction: systemMessage ? { parts: [{ text: systemMessage }] } : undefined,
        tools: genAITools,
        generationConfig: {
          temperature: request.temperature ?? config.temperature ?? 0.7,
          maxOutputTokens: request.maxTokens ?? config.maxOutputTokens ?? 2048,
        },
      };
      if (!systemMessage) delete requestBody.systemInstruction;
      if (!genAITools) delete requestBody.tools;

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
      requestBody.contents = contents;

      // S7: panggil REST langsung ke endpoint terkonfigurasi. Timeout
      // memakai AbortSignal sehingga request yang kehabisan waktu
      // benar-benar dibatalkan (bukan Promise.race yang membiarkan
      // request liar berjalan dan memakai token).
      const chatUrl = buildGeminiRestUrl(endpointValidation.normalizedUrl, modelToUse, 'generateContent');
      const data = await callGeminiRest(chatUrl, config.apiKey, requestBody, timeoutMs);

      const latencyMs = Date.now() - startTime;
      const candidates = data?.candidates;
      const candidate = candidates?.[0];

      // Prompt diblokir safety filter / tidak ada kandidat: laporkan dengan
      // jelas (bukan balasan kosong yang tampak seperti sukses).
      if (!candidate) {
        const blockReason =
          data?.promptFeedback?.blockReason ||
          data?.promptFeedback?.blockReasonMessage ||
          'tidak diketahui';
        throw new Error(
          `Gemini tidak mengembalikan kandidat respons (prompt kemungkinan diblokir safety filter; blockReason: ${blockReason}).`
        );
      }

      const parts: any[] = candidate?.content?.parts || [];

      // Gabungkan seluruh part teks (setara response.text() pada SDK).
      const replyText = parts
        .filter((p: any) => typeof p.text === 'string')
        .map((p: any) => p.text)
        .join('');

      // Ekstrak function calling jika dipicu oleh model (part functionCall
      // pada respons REST — bentuk yang sama seperti yang dibaca SDK).
      const functionCallParts = parts.filter((p: any) => p.functionCall);
      let normalizedToolCalls: UniversalToolCall[] | undefined = undefined;

      if (functionCallParts.length > 0) {
        normalizedToolCalls = functionCallParts.map((part: any, index: number) => {
          const fc = part.functionCall;
          return {
            id: `gemini_call_${Date.now()}_${index}`,
            name: fc.name,
            arguments: fc.args || {},
            thoughtSignature: part.thoughtSignature,
            rawPart: part,
          };
        });
      }

      // Normalisasi Token Usage dari usageMetadata
      const usageMeta = data?.usageMetadata;
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
      // S7: pakai endpoint TERKONFIGURASI (tervalidasi SSRF) — sebelumnya
      // URL resmi Google di-hardcode di sini sehingga endpoint kustom
      // diabaikan juga saat mengambil daftar model.
      const endpointUrl = config.apiEndpoint || 'https://generativelanguage.googleapis.com';
      const endpointValidation = await validateAndPinEndpoint(endpointUrl, 'gemini');
      const modelsUrl = `${endpointValidation.normalizedUrl}/${GEMINI_REST_API_VERSION}/models`;

      // T2: key lewat header, bukan query string.
      const res = await fetch(modelsUrl, {
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
        case 402:
          // L1: samakan dengan adapter Groq — 402 (saldo habis) selalu
          // 'provider_error' dengan pesan "Saldo Habis", di semua jalur.
          // (testConnection Gemini hanya memakai normalizeError, jadi tidak
          // ada split seperti di Groq — cabang ini memastikan pesan dan
          // statusnya konsisten dengan Groq.)
          status = 'provider_error';
          isRetryable = false;
          isFallbackEligible = false;
          sanitizedMsg = 'Saldo API Habis (Insufficient Balance). Silakan isi ulang kuota/kredit akun penyedia AI Anda.';
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
      } else if (lower.includes('insufficient balance') || lower.includes('insufficient_balance') || lower.includes('payment required')) {
        // L1: saldo habis tanpa status numerik — samakan dengan cabang 402
        // numerik di atas ('provider_error' + pesan "Saldo Habis"). HARUS
        // sebelum cabang kuota/429, karena pesan saldo bisa menyebut 'quota'.
        // 'insufficient_quota' sendiri TIDAK masuk sini: di Gemini itu error
        // kuota 429 (RESOURCE_EXHAUSTED — layak retry/fallback), bukan 402.
        // Substring angka '402' sengaja TIDAK dipakai (lihat H3: nomor proyek
        // Google bisa mengandung substring angka apa pun).
        status = 'provider_error';
        httpStatusCode = 402;
        isRetryable = false;
        isFallbackEligible = false;
        sanitizedMsg = 'Saldo API Habis (Insufficient Balance). Silakan isi ulang kuota/kredit akun penyedia AI Anda.';
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
