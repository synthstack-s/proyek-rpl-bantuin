/**
 * GROQ AI PROVIDER ADAPTER
 * BANTUIN AI PROVIDER MANAGEMENT
 * 
 * Mengimplementasikan AIProviderAdapter untuk Groq AI (OpenAI-Compatible):
 * - Endpoint resmi: https://api.groq.com/openai/v1
 * - DNS Socket Pinning & SSRF validation
 * - Normalisasi Function Calling / Tool Calling (OpenAI format <-> Universal format)
 * - Normalisasi Token Usage (usage.prompt_tokens, completion_tokens, total_tokens)
 * - Uji koneksi terisolasi dengan probe payload minimal
 * - Penanganan error spesifik tanpa membocorkan API Key
 */

import https from 'https';
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
import { validateAndPinEndpoint, createPinnedHttpsAgent } from '../ssrf-validator';

interface PinnedHttpResponse {
  status: number;
  ok: boolean;
  statusText: string;
  text: () => Promise<string>;
  json: () => Promise<any>;
}

function makeHttpsRequest(
  urlStr: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    agent?: https.Agent;
    timeoutMs?: number;
  }
): Promise<PinnedHttpResponse> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(urlStr);
    const req = https.request(
      {
        protocol: parsedUrl.protocol,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 443,
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        method: options.method || 'GET',
        headers: options.headers || {},
        agent: options.agent,
        timeout: options.timeoutMs || 30000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const bodyText = Buffer.concat(chunks).toString('utf8');
          const status = res.statusCode || 200;
          resolve({
            status,
            ok: status >= 200 && status < 300,
            statusText: res.statusMessage || '',
            text: async () => bodyText,
            json: async () => JSON.parse(bodyText),
          });
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error(`Request timeout (${options.timeoutMs || 30000}ms)`));
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

export class GroqProviderAdapter implements AIProviderAdapter {
  readonly providerName: AIProviderType;

  constructor(providerName: AIProviderType = 'groq') {
    this.providerName = providerName;
  }

  /**
   * Menguji koneksi langsung ke Groq AI API atau Provider OpenAI-Compatible dengan socket pinning
   */
  async testConnection(config: ProviderRuntimeConfig): Promise<AIConnectionTestResult> {
    const startTime = Date.now();
    const endpointToTest = config.apiEndpoint || (this.providerName === 'groq' ? 'https://api.groq.com/openai/v1' : 'https://api.openai.com/v1');
    const modelToTest = config.selectedModel || config.defaultModel || (this.providerName === 'groq' ? 'openai/gpt-oss-120b' : 'default-model');

    try {
      // 1. Validasi SSRF & Pin DNS IP
      const endpointValidation = await validateAndPinEndpoint(
        endpointToTest,
        this.providerName === 'groq' ? 'groq' : undefined
      );

      if (!config.apiKey || !config.apiKey.trim()) {
        return {
          provider: this.providerName,
          endpoint: endpointToTest,
          modelTested: modelToTest,
          status: 'invalid_api_key',
          httpStatusCode: 401,
          responseTimeMs: Date.now() - startTime,
          testedAt: new Date().toISOString(),
          errorMessage: `API Key untuk ${config.name || this.providerName} belum dikonfigurasi atau kosong.`,
        };
      }

      // 2. Siapkan Agent dengan DNS Pinning
      const agent = createPinnedHttpsAgent(endpointValidation.hostname, endpointValidation.pinnedIp);

      // 3. Probe Autentikasi Kredensial & Model via GET /models
      let normalizedBase = endpointValidation.normalizedUrl;
      let modelsUrl = `${normalizedBase}/models`;
      let modelsRes = await makeHttpsRequest(modelsUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${config.apiKey.trim()}`,
        },
        agent,
        timeoutMs: 10000,
      });

      // Auto-heal path: jika 404 dan belum berakhiran /v1, coba /v1/models
      if (modelsRes.status === 404 && !normalizedBase.endsWith('/v1')) {
        const v1Url = `${normalizedBase}/v1/models`;
        const v1Res = await makeHttpsRequest(v1Url, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${config.apiKey.trim()}`,
          },
          agent,
          timeoutMs: 10000,
        });
        if (v1Res.ok) {
          normalizedBase = `${normalizedBase}/v1`;
          modelsRes = v1Res;
        }
      }

      // Jika /models mengembalikan 401 Unauthorized, maka API Key pasti salah
      if (modelsRes.status === 401) {
        return {
          provider: this.providerName,
          endpoint: endpointToTest,
          modelTested: modelToTest,
          status: 'invalid_api_key',
          httpStatusCode: 401,
          responseTimeMs: Date.now() - startTime,
          testedAt: new Date().toISOString(),
          errorMessage: 'API Key ditolak oleh penyedia AI (401 Unauthorized). Harap periksa kembali kebenaran API Key Anda.',
        };
      }

      // 4. Probe Chat Completion via POST /chat/completions
      const chatUrl = `${normalizedBase}/chat/completions`;
      let chatRes = await makeHttpsRequest(chatUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: modelToTest,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
        }),
        agent,
        timeoutMs: 15000,
      });

      const latencyMs = Date.now() - startTime;
      const resText = await chatRes.text();

      // Auto-heal untuk Groq jika model default tidak tersedia
      if (
        chatRes.status === 404 &&
        this.providerName === 'groq' &&
        modelToTest !== 'openai/gpt-oss-120b'
      ) {
        try {
          const healRes = await makeHttpsRequest(chatUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${config.apiKey.trim()}`,
            },
            body: JSON.stringify({
              model: 'openai/gpt-oss-120b',
              messages: [{ role: 'user', content: 'ping' }],
              max_tokens: 1,
            }),
            agent,
            timeoutMs: 15000,
          });

          if (healRes.ok) {
            config.selectedModel = 'openai/gpt-oss-120b';
            chatRes = healRes;
          }
        } catch {}
      }

      // Jika chat completion sukses 200
      if (chatRes.ok) {
        return {
          provider: this.providerName,
          endpoint: endpointToTest,
          modelTested: modelToTest,
          status: 'success',
          httpStatusCode: 200,
          responseTimeMs: latencyMs,
          testedAt: new Date().toISOString(),
          errorMessage: null,
        };
      }

      let parsedErr: any = null;
      try {
        parsedErr = JSON.parse(resText);
      } catch {
        parsedErr = { error: { message: resText } };
      }
      const errorDetail = parsedErr?.error?.message || `HTTP ${chatRes.status}: ${chatRes.statusText}`;

      // Saldo/kuota habis (402): API key memang valid, tetapi provider TIDAK BISA
      // melayani chat sama sekali. JANGAN laporkan sebagai 'success' — status
      // 'connected' yang menutupi saldo 0 membuat admin mengira provider sehat
      // padahal setiap percakapan gagal. Laporkan sebagai rate_limit_exceeded
      // agar tersimpan sebagai 'connection_error' dan UI menampilkan badge
      // "Saldo Habis (402)".
      if (
        chatRes.status === 402 ||
        errorDetail.toLowerCase().includes('insufficient balance') ||
        errorDetail.toLowerCase().includes('insufficient_quota')
      ) {
        return {
          provider: this.providerName,
          endpoint: endpointToTest,
          modelTested: modelToTest,
          status: 'rate_limit_exceeded',
          httpStatusCode: 402,
          responseTimeMs: latencyMs,
          testedAt: new Date().toISOString(),
          errorMessage: 'Saldo akun AI habis (402 Insufficient Balance). API key valid, tetapi provider tidak dapat melayani percakapan sampai saldo diisi ulang di console provider.',
        };
      }

      // Kasus jika models berhasil (200) namun model yang diuji 404 (Model tidak ditemukan pada akun)
      if (chatRes.status === 404 && modelsRes.ok) {
        try {
          const modelsJson = await modelsRes.json();
          if (Array.isArray(modelsJson?.data) && modelsJson.data.length > 0) {
            const availableModelId = modelsJson.data[0].id;
            return {
              provider: this.providerName,
              endpoint: endpointToTest,
              modelTested: modelToTest,
              status: 'model_not_available',
              httpStatusCode: 404,
              responseTimeMs: latencyMs,
              testedAt: new Date().toISOString(),
              errorMessage: `Model '${modelToTest}' tidak ditemukan pada akun Anda. Model yang tersedia: ${availableModelId}`,
            };
          }
        } catch {}
      }

      const normalized = this.normalizeError({ message: errorDetail, status: chatRes.status }, config.apiKey);

      return {
        provider: this.providerName,
        endpoint: endpointToTest,
        modelTested: modelToTest,
        status: normalized.status,
        httpStatusCode: chatRes.status,
        responseTimeMs: latencyMs,
        testedAt: new Date().toISOString(),
        errorMessage: normalized.sanitizedMessage,
      };
    } catch (err: any) {
      const normalized = this.normalizeError(err, config.apiKey);
      return {
        provider: this.providerName,
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
   * Menghasilkan Chat Completion menggunakan Groq AI API
   */
  async generateChatCompletion(
    request: AIChatRequest,
    config: ProviderRuntimeConfig
  ): Promise<AIChatResponse> {
    const startTime = Date.now();
    const endpointUrl = config.apiEndpoint || 'https://api.groq.com/openai/v1';

    try {
      const endpointValidation = await validateAndPinEndpoint(
        endpointUrl,
        this.providerName === 'groq' ? 'groq' : undefined
      );
      const agent = createPinnedHttpsAgent(endpointValidation.hostname, endpointValidation.pinnedIp);
      const url = `${endpointValidation.normalizedUrl}/chat/completions`;

      // 1. Konversi Universal Messages ke format OpenAI-Compatible
      const groqMessages: Array<{
        role: string;
        content: string | null;
        name?: string;
        tool_call_id?: string;
        tool_calls?: any[];
      }> = [];

      for (const m of request.messages) {
        if (m.role === 'tool') {
          groqMessages.push({
            role: 'tool',
            tool_call_id: m.toolCallId || 'call_default',
            content: m.content,
          });
        } else if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
          groqMessages.push({
            role: 'assistant',
            content: m.content || null,
            tool_calls: m.toolCalls.map((tc) => ({
              id: tc.id,
              type: 'function',
              function: {
                name: tc.name,
                arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments),
              },
            })),
          });
        } else {
          groqMessages.push({
            role: m.role,
            content: m.content,
          });
        }
      }

      // 2. Konversi Universal Tools ke format OpenAI-Compatible
      let groqTools: any[] | undefined = undefined;
      if (request.tools && request.tools.length > 0) {
        groqTools = request.tools.map((t) => ({
          type: 'function',
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        }));
      }

      const timeoutMs = config.requestTimeoutMs || 30000;
      const payload: Record<string, any> = {
        model: config.selectedModel || config.defaultModel || 'openai/gpt-oss-120b',
        messages: groqMessages,
        temperature: request.temperature ?? config.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? config.maxOutputTokens ?? 2048,
      };

      if (groqTools && groqTools.length > 0) {
        payload.tools = groqTools;
        payload.tool_choice = 'auto';
      }

      let res = await makeHttpsRequest(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey.trim()}`,
        },
        body: JSON.stringify(payload),
        agent,
        timeoutMs,
      });

      let latencyMs = Date.now() - startTime;
      let resText = await res.text();

      // M3 (opsi a): terapkan auto-heal `/v1` yang SAMA dengan testConnection.
      // Sebelumnya tes koneksi diam-diam mencoba `{base}/v1/...` bila `/models`
      // 404, tetapi chat memakai endpoint tersimpan apa adanya — provider yang
      // endpoint-nya disimpan tanpa `/v1` lolos tes tetapi setiap chat gagal
      // 404 selamanya. Bila chat 404 dan base belum berakhiran `/v1`, coba
      // sekali dengan `/v1/chat/completions`. Bila percobaan itu berhasil,
      // pakai responsnya; bila gagal dengan status non-404 (mis. 401 — key
      // salah), pakai respons itu karena lebih informatif; bila tetap 404,
      // laporkan respons aslinya (endpoint tersimpan-lah yang bermasalah).
      // Endpoint tersimpan TIDAK diubah — heal bersifat per-request, sama
      // seperti di testConnection.
      if (res.status === 404 && !endpointValidation.normalizedUrl.endsWith('/v1')) {
        try {
          const v1Url = `${endpointValidation.normalizedUrl}/v1/chat/completions`;
          const v1Res = await makeHttpsRequest(v1Url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${config.apiKey.trim()}`,
            },
            body: JSON.stringify(payload),
            agent,
            timeoutMs,
          });
          if (v1Res.ok || v1Res.status !== 404) {
            res = v1Res;
            resText = await v1Res.text();
            latencyMs = Date.now() - startTime;
          }
        } catch {
          // Gagal menghubungi /v1 — lanjut dengan respons aslinya.
        }
      }

      if (!res.ok) {
        let errJson: any = null;
        try {
          errJson = JSON.parse(resText);
        } catch {
          errJson = { error: { message: resText } };
        }

        // Auto-heal untuk model Groq yang tidak tersedia pada akun (404)
        if (
          res.status === 404 &&
          this.providerName === 'groq' &&
          payload.model !== 'openai/gpt-oss-120b'
        ) {
          console.info(`[Groq Auto-Heal] Model ${payload.model} tidak ditemukan, beralih ke openai/gpt-oss-120b`);
          payload.model = 'openai/gpt-oss-120b';
          const healRes = await makeHttpsRequest(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${config.apiKey.trim()}`,
            },
            body: JSON.stringify(payload),
            agent,
            timeoutMs,
          });

          if (healRes.ok) {
            const healText = await healRes.text();
            const healData = JSON.parse(healText);
            const healChoice = healData.choices?.[0];
            const healMsg = healChoice?.message;
            return {
              content: healMsg?.content || '',
              toolCalls: undefined,
              usage: {
                promptTokens: Number(healData.usage?.prompt_tokens || 0),
                completionTokens: Number(healData.usage?.completion_tokens || 0),
                totalTokens: Number(healData.usage?.total_tokens || 0),
              },
              provider: this.providerName,
              model: 'openai/gpt-oss-120b',
              latencyMs: Date.now() - startTime,
              httpStatusCode: 200,
              isFallback: false,
            };
          }
        }

        throw this.normalizeError({
          message: errJson?.error?.message || `HTTP ${res.status}: ${res.statusText}`,
          status: res.status,
        }, config.apiKey);
      }

      const data = JSON.parse(resText);
      const choice = data.choices?.[0];
      const message = choice?.message;

      // Ekstrak function/tool calling jika ada
      let normalizedToolCalls: UniversalToolCall[] | undefined = undefined;
      if (message?.tool_calls && Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
        normalizedToolCalls = message.tool_calls.map((tc: any) => {
          let args: Record<string, any> = {};
          try {
            args = typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : tc.function.arguments;
          } catch {
            args = {};
          }
          return {
            id: tc.id,
            name: tc.function.name,
            arguments: args,
          };
        });
      }

      // Normalisasi Token Usage
      const promptTokens = Number(data.usage?.prompt_tokens || 0);
      const completionTokens = Number(data.usage?.completion_tokens || 0);
      const totalTokens = Number(data.usage?.total_tokens || promptTokens + completionTokens);

      return {
        content: message?.content || '',
        toolCalls: normalizedToolCalls,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens,
        },
        provider: this.providerName,
        model: data.model || config.selectedModel,
        latencyMs,
        httpStatusCode: 200,
        isFallback: false,
      };
    } catch (err: any) {
      if (err.name === 'NormalizedAIError' || err.status) {
        throw err;
      }
      throw this.normalizeError(err, config.apiKey);
    }
  }

  /**
   * Mengambil daftar model yang tersedia melalui endpoint /models.
   *
   * M4: bila pengambilan live gagal (termasuk 401 — key tidak valid),
   * kembalikan daftar cadangan dengan `isLive: false` + pesan error, BUKAN
   * daftar hardcoded yang tampak seperti data live. UI menampilkan
   * "daftar cadangan — pengambilan live gagal" untuk kasus ini. Untuk
   * provider kustom, daftar cadangan tetap [] (perilaku PR #2).
   *
   * M3: heal `/v1` yang sama seperti testConnection diterapkan di sini —
   * bila `/models` 404 dan base belum berakhiran `/v1`, coba `/v1/models`
   * agar endpoint yang lolos tes tidak dilaporkan gagal mengambil model.
   */
  async fetchAvailableModels(config: ProviderRuntimeConfig): Promise<AIModelListResult> {
    // Daftar model fallback hanya berlaku untuk Groq. Provider kustom TIDAK BOLEH
    // menerima daftar model Groq — model yang salah membuat admin memilih model
    // yang tidak ada di provider tersebut, lalu chat gagal 404 ("tidak terkoneksi").
    const fallbackModels: AIModelInfo[] =
      this.providerName === 'groq'
        ? [
            { id: 'openai/gpt-oss-120b', name: 'OpenAI GPT-OSS 120B', description: 'Model penalaran performa tinggi untuk Chatbot+ BANTUIN', isDefault: true },
            { id: 'openai/gpt-oss-20b', name: 'OpenAI GPT-OSS 20B', description: 'Model inferensi cepat dan responsif' },
            { id: 'qwen/qwen3.8-27b', name: 'Qwen 3.8 27B', description: 'Model multibahasa cerdas dan efisien' },
            { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile', description: 'Model alternatif penalaran' },
          ]
        : [];

    const fallback = (error: string): AIModelListResult => ({
      models: fallbackModels,
      isLive: false,
      error,
    });

    if (!config.apiKey || !config.apiKey.trim()) {
      return fallback(`API key ${this.providerName} belum dikonfigurasi — daftar model tidak dapat diambil dari provider.`);
    }

    try {
      const endpointUrl = config.apiEndpoint || (this.providerName === 'groq' ? 'https://api.groq.com/openai/v1' : '');
      if (!endpointUrl) return fallback('Endpoint provider belum dikonfigurasi.');
      const endpointValidation = await validateAndPinEndpoint(endpointUrl, this.providerName === 'groq' ? 'groq' : undefined);
      const agent = createPinnedHttpsAgent(endpointValidation.hostname, endpointValidation.pinnedIp);
      const normalizedBase = endpointValidation.normalizedUrl;
      const url = `${normalizedBase}/models`;

      let res = await makeHttpsRequest(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${config.apiKey.trim()}`,
        },
        agent,
        timeoutMs: 8000,
      });

      // M3: heal /v1 seperti testConnection.
      if (res.status === 404 && !normalizedBase.endsWith('/v1')) {
        try {
          const v1Res = await makeHttpsRequest(`${normalizedBase}/v1/models`, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${config.apiKey.trim()}`,
            },
            agent,
            timeoutMs: 8000,
          });
          if (v1Res.ok || v1Res.status !== 404) {
            res = v1Res;
          }
        } catch {
          // Gagal menghubungi /v1 — lanjut dengan respons aslinya.
        }
      }

      if (!res.ok) {
        const detail =
          res.status === 401
            ? 'API key ditolak provider (401 Unauthorized) — periksa kembali key yang tersimpan.'
            : `Provider mengembalikan HTTP ${res.status} saat mengambil daftar model.`;
        return fallback(detail);
      }

      const data = await res.json();
      if (Array.isArray(data.data)) {
        const models = data.data
          .filter((m: any) => m.active !== false && !m.id.includes('whisper') && !m.id.includes('guard'))
          .map((m: any) => ({
            id: m.id,
            name: m.id.replace(/-/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
            contextWindow: m.context_window,
            isDefault: m.id === (config.selectedModel || 'llama-3.3-70b-versatile'),
          }));

        if (models.length > 0) {
          return { models, isLive: true, error: null };
        }
        return fallback('Provider tidak mengembalikan model apa pun.');
      }
      return fallback('Respons daftar model provider tidak dikenali.');
    } catch (err: any) {
      return fallback(`Gagal menghubungi provider untuk daftar model: ${err?.message || 'error jaringan'}`);
    }
  }

  /**
   * Menormalkan error vendor Groq AI dan menyensor API key
   */
  normalizeError(error: any, apiKeyToSanitize?: string): NormalizedAIError {
    const rawMsg = String(error?.message || error || 'Unknown Groq error');
    let sanitizedMsg = rawMsg;

    if (apiKeyToSanitize) {
      sanitizedMsg = sanitizedMsg.replace(new RegExp(apiKeyToSanitize.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '[REDACTED_API_KEY]');
    }

    let status: AIConnectionTestResult['status'] = 'unknown_error';
    let httpStatusCode: number | null = error?.status || null;
    let isRetryable = false;
    let isFallbackEligible = false;

    const lower = sanitizedMsg.toLowerCase();

    // M5: error jaringan transient (tanpa respons HTTP sama sekali). Sinyal
    // diambil dari pesan + kode error Node (error.code / cause.code), karena
    // fetch yang gagal DNS/koneksi sering hanya membawa pesan generik
    // "fetch failed" dengan kode di cause. Tanpa cabang ini semua error
    // jaringan jatuh ke unknown_error dan tidak pernah memicu retry/fallback
    // — padahal inilah kasus paling layak untuk keduanya. Cabang ini HARUS
    // pertama: tidak ada respons HTTP berarti tidak ada status 4xx/5xx yang
    // bisa diklaim dari substring pesan.
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
    } else if (lower.includes('invalid api key') || lower.includes('unauthorized') || lower.includes('authentication') || httpStatusCode === 401) {
      status = 'invalid_api_key';
      httpStatusCode = 401;
      isRetryable = false;
      isFallbackEligible = false;
    } else if (lower.includes('insufficient balance') || lower.includes('insufficient_quota') || lower.includes('quota exceeded') || httpStatusCode === 402) {
      status = 'provider_error';
      httpStatusCode = 402;
      isRetryable = false;
      isFallbackEligible = false;
      sanitizedMsg = 'Saldo API Habis (Insufficient Balance). Silakan isi ulang kuota/kredit akun penyedia AI Anda.';
    } else if (lower.includes('permission denied') || httpStatusCode === 403) {
      status = 'provider_error';
      httpStatusCode = 403;
      isRetryable = false;
      isFallbackEligible = false;
    } else if (lower.includes('rate limit') || lower.includes('too many requests') || httpStatusCode === 429) {
      status = 'rate_limit_exceeded';
      httpStatusCode = 429;
      isRetryable = true;
      isFallbackEligible = true;
    } else if (lower.includes('model not found') || lower.includes('does not exist') || httpStatusCode === 404) {
      status = 'model_not_available';
      httpStatusCode = 404;
      isRetryable = false;
      isFallbackEligible = false;
    } else if (lower.includes('timeout') || lower.includes('aborted') || lower.includes('etimedout')) {
      status = 'timeout';
      httpStatusCode = 504;
      isRetryable = true;
      isFallbackEligible = true;
    } else if (httpStatusCode && httpStatusCode >= 500) {
      status = 'provider_error';
      isRetryable = true;
      isFallbackEligible = true;
    } else if (lower.includes('ssrf') || lower.includes('protocol') || lower.includes('private ip')) {
      status = 'invalid_endpoint';
      httpStatusCode = 400;
      isRetryable = false;
      isFallbackEligible = false;
    }

    return {
      provider: this.providerName,
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
