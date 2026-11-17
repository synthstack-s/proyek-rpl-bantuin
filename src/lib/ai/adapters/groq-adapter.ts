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

/**
 * S8g: batas maksimum ukuran body respons provider (10 MB). Tanpa batas,
 * chunk respons diakumulasi tanpa henti sebelum Buffer.concat — satu
 * respons raksasa (atau server jahat) bisa menghabiskan memori proses.
 */
export const MAX_PROVIDER_RESPONSE_BYTES = 10 * 1024 * 1024;

/**
 * S8e: ekstrak tool calls format OpenAI ke bentuk universal. Dipakai
 * BERSAMA oleh jalur normal dan jalur auto-heal — sebelumnya jalur heal
 * mengembalikan `toolCalls: undefined` sehingga tool call yang diminta
 * model hasil heal dibuang diam-diam (model "memanggil tool" tetapi
 * tidak ada yang dieksekusi dan tidak ada error).
 */
function extractOpenAIToolCalls(message: any): UniversalToolCall[] | undefined {
  const rawCalls = message?.tool_calls;
  if (!Array.isArray(rawCalls) || rawCalls.length === 0) return undefined;
  return rawCalls.map((tc: any) => {
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
function makeHttpsRequestPinned(
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
        let totalBytes = 0;
        let aborted = false;
        const failOnce = (err: Error) => {
          if (aborted) return;
          aborted = true;
          reject(err);
        };
        res.on('data', (c: Buffer) => {
          if (aborted) return;
          totalBytes += c.length;
          // S8g: batalkan request begitu akumulasi melewati batas — jangan
          // menunggu seluruh body selesai diunduh.
          if (totalBytes > MAX_PROVIDER_RESPONSE_BYTES) {
            failOnce(
              new Error(
                `Respons provider melebihi batas ukuran maksimum ${MAX_PROVIDER_RESPONSE_BYTES / 1024 / 1024} MB (${totalBytes} byte diterima) — request dibatalkan untuk melindungi memori server.`
              )
            );
            req.destroy();
            return;
          }
          chunks.push(c);
        });
        res.on('end', () => {
          if (aborted) return;
          const bodyText = Buffer.concat(chunks).toString('utf8');
          const status = res.statusCode || 200;
          resolve({
            status,
            ok: status >= 200 && status < 300,
            statusText: res.statusMessage || '',
            text: async () => bodyText,
            // S8e: JSON.parse atas respons provider WAJIB berpenjaga —
            // SyntaxError mentah ("Unexpected token...") tidak menjelaskan
            // apa-apa; lempar pesan yang menyebut provider-nya.
            json: async () => {
              try {
                return JSON.parse(bodyText);
              } catch {
                throw new Error(
                  `Respons provider bukan JSON yang valid (HTTP ${status}) — tidak dapat membaca body respons.`
                );
              }
            },
          });
        });
        res.on('error', (err) => failOnce(err));
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
/**
 * Jalur fallback bila socket lokal menolak koneksi https.request (EACCES —
 * ditemui di environment Windows tertentu). Memakai global fetch dengan
 * AbortController; batas 10 MB (S8g) ditegakkan lewat streaming reader
 * agar body raksasa tetap dibatalkan sebelum memenuhi memori. CATATAN:
 * fetch tidak mendukung agent Node sehingga jalur ini TIDAK memakai IP
 * pinning SSRF — hanya dipakai bila jalur pinning gagal di level socket
 * lokal, bukan untuk error jaringan/DNS/HTTP biasa.
 */
async function makeHttpsRequestFetch(
  urlStr: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
  }
): Promise<PinnedHttpResponse> {
  const timeoutMs = options.timeoutMs || 30000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(urlStr, {
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.body,
      signal: controller.signal,
    });
    // Baca body lewat streaming reader dengan batas byte (S8g).
    const reader = res.body?.getReader();
    let bodyText = '';
    if (reader) {
      const decoder = new TextDecoder();
      let totalBytes = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > MAX_PROVIDER_RESPONSE_BYTES) {
          await reader.cancel();
          throw new Error(
            `Respons provider melebihi batas ukuran maksimum ${MAX_PROVIDER_RESPONSE_BYTES / 1024 / 1024} MB (${totalBytes} byte diterima) — request dibatalkan untuk melindungi memori server.`
          );
        }
        bodyText += decoder.decode(value, { stream: true });
      }
      bodyText += decoder.decode();
    } else {
      bodyText = await res.text();
    }
    return {
      status: res.status,
      ok: res.ok,
      statusText: res.statusText,
      text: async () => bodyText,
      json: async () => {
        try {
          return JSON.parse(bodyText);
        } catch {
          throw new Error(
            `Respons provider bukan JSON yang valid (HTTP ${res.status}) — tidak dapat membaca body respons.`
          );
        }
      },
    };
  } catch (fetchErr: any) {
    if (fetchErr.name === 'AbortError') {
      throw new Error(`Request timeout (${timeoutMs}ms) ke ${urlStr}`);
    }
    throw fetchErr;
  } finally {
    clearTimeout(timer);
  }
}
/**
 * Satu titik request HTTP(S) adapter Groq. Jalur utama memakai
 * https.request dengan pinned agent (DNS pinning SSRF) + batas 10 MB
 * (S8g). Bila socket lokal menolak koneksi (EACCES/EPERM/EADDRNOTAVAIL),
 * coba sekali lewat global fetch (tanpa pinning) agar adapter tetap
 * berfungsi di environment yang memblokir socket https.request.
 */
async function makeHttpsRequest(
  urlStr: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    agent?: https.Agent;
    timeoutMs?: number;
  }
): Promise<PinnedHttpResponse> {
  try {
    return await makeHttpsRequestPinned(urlStr, options);
  } catch (err: any) {
    const code = String(err?.code || '');
    if (code === 'EACCES' || code === 'EPERM' || code === 'EADDRNOTAVAIL') {
      console.warn(`[Groq Adapter] https.request gagal di level socket (${code}); fallback ke global fetch tanpa IP pinning.`);
      return await makeHttpsRequestFetch(urlStr, options);
    }
    throw err;
  }
}

function cleanApiKey(key: string): string {
  if (!key) return '';
  let cleaned = key.trim();
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  if (cleaned.toLowerCase().startsWith('bearer ')) {
    cleaned = cleaned.slice(7).trim();
  }
  return cleaned;
}

const KNOWN_PROVIDER_FALLBACK_MODELS: Record<string, string[]> = {
  groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'openai/gpt-oss-120b'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  nvidia: ['meta/llama-3.1-8b-instruct', 'meta/llama-3.2-90b-vision-instruct', 'meta/llama-3.3-70b-instruct', 'nvidia/llama-3.1-nemotron-70b-instruct'],
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo'],
  openrouter: ['openrouter/auto', 'meta-llama/llama-3.3-70b-instruct'],
  mistral: ['mistral-large-latest', 'mistral-small-latest'],
};

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
    let modelToTest = config.selectedModel || config.defaultModel || (this.providerName === 'groq' ? 'openai/gpt-oss-120b' : 'default-model');

    const cleanedKey = cleanApiKey(config.apiKey);

    // L7: timeout probe memakai requestTimeoutMs dari konfigurasi (form) —
    // sebelumnya hardcoded 10s (/models) dan 15s (chat), sehingga pengaturan
    // timeout admin diabaikan saat tes koneksi. Dijepit 5s–120s; default 15s
    // bila konfigurasi tidak membawa nilai yang valid.
    const probeTimeoutMs = Number.isFinite(Number(config.requestTimeoutMs))
      ? Math.max(5000, Math.min(120000, Number(config.requestTimeoutMs)))
      : 15000;

    // L2: model yang BENAR-BENAR diuji. Bila auto-heal berhasil (model yang
    // diminta tidak tersedia, diganti model default), testedModel berubah ke
    // model pengganti dan healedModel mengisinya agar UI bisa menawarkan
    // untuk menyimpan model pengganti — model tersimpan TIDAK diubah di sini.
    let testedModel = modelToTest;
    let healedModel: string | null = null;

    try {
      // 1. Validasi SSRF & Pin DNS IP
      const endpointValidation = await validateAndPinEndpoint(
        endpointToTest,
        this.providerName === 'groq' ? 'groq' : undefined
      );

      if (!cleanedKey) {
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

      // 3. Normalisasi base URL untuk provider OpenAI-compatible (pastikan /v1 jika belum ada)
      let normalizedBase = endpointValidation.normalizedUrl.replace(/\/+$/, '');
      if (!normalizedBase.endsWith('/v1') && !normalizedBase.includes('/v1/')) {
        normalizedBase = `${normalizedBase}/v1`;
      }

      // Probe Autentikasi Kredensial & Model via GET /models
      let modelsUrl = `${normalizedBase}/models`;
      let modelsRes = await makeHttpsRequest(modelsUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${cleanedKey}`,
        },
        agent,
        timeoutMs: probeTimeoutMs,
      });

      // Auto-heal path: jika 404 dan belum berakhiran /v1, coba /v1/models
      if (modelsRes.status === 404 && !normalizedBase.endsWith('/v1')) {
        const v1Url = `${normalizedBase}/v1/models`;
        const v1Res = await makeHttpsRequest(v1Url, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${cleanedKey}`,
          },
          agent,
          timeoutMs: probeTimeoutMs,
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

      // Jika GET /models berhasil 200, API KEY DAN ENDPOINT 100% VALID & TERKONEKSI!
      let availableModelsFromEndpoint: string[] = [];
      if (modelsRes.ok) {
        try {
          const modelsData = await modelsRes.json();
          if (Array.isArray(modelsData?.data)) {
            availableModelsFromEndpoint = modelsData.data
              .map((m: any) => m?.id)
              .filter((id: any): id is string => typeof id === 'string');
          }
        } catch {}
      }

      // 4. Probe Chat Completion via POST /chat/completions
      const chatUrl = `${normalizedBase}/chat/completions`;
      
      // Jika modelToTest tidak ada di daftar model yang tersedia, pilih model chat pertama yang tersedia
      if (availableModelsFromEndpoint.length > 0 && !availableModelsFromEndpoint.includes(modelToTest)) {
        const candidateChat = availableModelsFromEndpoint.find((id) => 
          !id.includes('embed') && !id.includes('whisper') && !id.includes('tts') && !id.includes('moderation')
        ) || availableModelsFromEndpoint[0];
        if (candidateChat) {
          modelToTest = candidateChat;
          config.selectedModel = candidateChat;
          // L2: laporkan model yang BENAR-BENAR diuji (seperti loop heal
          // 404 di bawah) — sebelumnya testedModel tetap model lama yang
          // tidak ada di daftar, sehingga model salah ketik teruji "sukses".
          testedModel = candidateChat;
          healedModel = candidateChat;
        }
      }

      let chatRes = await makeHttpsRequest(chatUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cleanedKey}`,
        },
        body: JSON.stringify({
          model: modelToTest,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 16,
        }),
        agent,
        timeoutMs: probeTimeoutMs,
      });

      const latencyMs = Date.now() - startTime;
      const resText = await chatRes.text();

      // Auto-heal untuk Groq jika model default tidak tersedia: coba
      // model-model cadangan provider ini satu per satu hingga ada yang
      // merespons OK. Model pengganti dicatat sebagai model yang
      // benar-benar diuji (L2: testedModel + healedModel agar UI bisa
      // menawarkan penyimpanan model pengganti).
      if (chatRes.status === 404) {
        const fallbacks = KNOWN_PROVIDER_FALLBACK_MODELS[this.providerName] || [];
        for (const candidate of fallbacks) {
          if (candidate === modelToTest) continue;
          try {
            const healRes = await makeHttpsRequest(chatUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${cleanedKey}`,
              },
              body: JSON.stringify({
                model: candidate,
                messages: [{ role: 'user', content: 'ping' }],
                max_tokens: 16,
              }),
              agent,
              timeoutMs: probeTimeoutMs,
            });

            if (healRes.ok) {
              modelToTest = candidate;
              config.selectedModel = candidate;
              testedModel = candidate;
              healedModel = candidate;
              chatRes = healRes;
              break;
            }
          } catch {}
        }
      }

      // 1. Jika chat completion sukses 200
      if (chatRes.ok) {
        return {
          provider: this.providerName,
          endpoint: endpointToTest,
          // L2: laporkan model yang BENAR-BENAR diuji (bisa model hasil heal,
          // bukan model asli yang diminta).
          modelTested: testedModel,
          healedModel,
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
      // padahal setiap percakapan gagal. L1: status disamakan dengan
      // normalizeError ('provider_error' + pesan "Saldo Habis") — sebelumnya
      // jalur ini memakai 'rate_limit_exceeded' sementara normalizeError
      // memakai 'provider_error' untuk kondisi 402 yang sama.
      // Cek ini WAJIB di atas blok modelsRes.ok di bawah: GET /models
      // gratis dan mengembalikan 200 walau saldo 0, sehingga akun yang
      // saldonya habis sebelumnya teruji "success" dan setiap chat gagal.
      if (
        chatRes.status === 402 ||
        errorDetail.toLowerCase().includes('insufficient balance') ||
        errorDetail.toLowerCase().includes('insufficient_quota')
      ) {
        return {
          provider: this.providerName,
          endpoint: endpointToTest,
          modelTested: modelToTest,
          status: 'provider_error',
          httpStatusCode: 402,
          responseTimeMs: latencyMs,
          testedAt: new Date().toISOString(),
          errorMessage: 'Saldo akun AI habis (402 Insufficient Balance). API key valid, tetapi provider tidak dapat melayani percakapan sampai saldo diisi ulang di console provider.',
        };
      }

      // 2. Jika GET /models sukses 200 (kredensial terotentikasi penuh)
      if (modelsRes.ok) {
        return {
          provider: this.providerName,
          endpoint: endpointToTest,
          modelTested: modelToTest,
          status: 'success',
          httpStatusCode: 200,
          responseTimeMs: latencyMs,
          testedAt: new Date().toISOString(),
          errorMessage: 'Koneksi terhubung & API Key valid.',
        };
      }

      // L15: bila /models DAN /chat/completions sama-sama 404, masalahnya
      // adalah endpoint (salah total), bukan model — laporkan invalid_endpoint
      // agar admin memeriksa URL endpoint. Sebelumnya kode jatuh ke
      // normalizeError({ status: 404 }) → model_not_available, yang menyuruh
      // admin memeriksa model padahal endpoint-lah yang salah.
      if (chatRes.status === 404 && modelsRes.status === 404) {
        return {
          provider: this.providerName,
          endpoint: endpointToTest,
          modelTested: modelToTest,
          status: 'invalid_endpoint',
          httpStatusCode: 404,
          responseTimeMs: latencyMs,
          testedAt: new Date().toISOString(),
          errorMessage: 'Endpoint tidak ditemukan (404 pada /models dan /chat/completions) — periksa URL endpoint.',
        };
      }

      // 4. Kasus Khusus: Rate Limit (Kredensial valid)
      if (chatRes.status === 429) {
        return {
          provider: this.providerName,
          endpoint: endpointToTest,
          modelTested: modelToTest,
          status: 'success',
          httpStatusCode: 200,
          responseTimeMs: latencyMs,
          testedAt: new Date().toISOString(),
          errorMessage: 'Koneksi & API Key Berhasil Diverifikasi (Catatan: Rate limit frekuensi panggilan sedang aktif).',
        };
      }

      const normalized = this.normalizeError({ message: errorDetail, status: chatRes.status }, cleanedKey);

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
      const normalized = this.normalizeError(err, cleanedKey);
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
      let baseUrl = endpointValidation.normalizedUrl.replace(/\/+$/, '');
      if (!baseUrl.endsWith('/v1') && !baseUrl.includes('/v1/')) {
        baseUrl = `${baseUrl}/v1`;
      }
      const url = `${baseUrl}/chat/completions`;

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
          Authorization: `Bearer ${cleanApiKey(config.apiKey)}`,
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

        // Auto-heal untuk model yang tidak tersedia pada akun (404).
        // Sebelumnya hanya Groq yang di-heal (ke openai/gpt-oss-120b),
        // sehingga model OpenRouter yang salah ketik / berganti nama /
        // dihapus menggagalkan SEMUA pesan tanpa fallback. Sekarang semua
        // provider memakai daftar cadangannya sendiri
        // (KNOWN_PROVIDER_FALLBACK_MODELS); Groq mempertahankan target
        // lamanya agar perilakunya tidak berubah.
        const healModel =
          this.providerName === 'groq'
            ? (payload.model !== 'openai/gpt-oss-120b' ? 'openai/gpt-oss-120b' : undefined)
            : (KNOWN_PROVIDER_FALLBACK_MODELS[this.providerName] || []).find((m) => m !== payload.model);
        if (
          res.status === 404 &&
          healModel
        ) {
          console.info(`[${this.providerName} Auto-Heal] Model ${payload.model} tidak ditemukan, beralih ke ${healModel}`);
          payload.model = healModel;
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
            // S8e: JSON.parse atas respons heal WAJIB berpenjaga — bila
            // provider mengembalikan 200 non-JSON, lempar error yang jelas
            // (bukan SyntaxError mentah yang menjadi unknown_error).
            let healData: any;
            try {
              healData = JSON.parse(healText);
            } catch {
              throw new Error(
                'Respons auto-heal provider bukan JSON yang valid — tidak dapat membaca hasil percobaan model pengganti.'
              );
            }
            const healChoice = healData.choices?.[0];
            const healMsg = healChoice?.message;
            return {
              content: healMsg?.content || '',
              // S8e: JANGAN buang tool calls hasil heal — ekstrak dengan
              // helper yang sama seperti jalur normal, agar tool yang
              // diminta model pengganti tetap dieksekusi.
              toolCalls: extractOpenAIToolCalls(healMsg),
              usage: {
                promptTokens: Number(healData.usage?.prompt_tokens || 0),
                completionTokens: Number(healData.usage?.completion_tokens || 0),
                totalTokens: Number(healData.usage?.total_tokens || 0),
              },
              provider: this.providerName,
              model: healModel,
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

      // S8e: JSON.parse atas respons chat WAJIB berpenjaga — provider yang
      // mengembalikan 200 non-JSON sebelumnya menghasilkan SyntaxError
      // mentah (unknown_error). Lempar pesan yang jelas; catch di bawah
      // menormalkannya.
      let data: any;
      try {
        data = JSON.parse(resText);
      } catch {
        throw new Error(
          'Respons provider bukan JSON yang valid — tidak dapat membaca hasil chat completion.'
        );
      }
      const choice = data.choices?.[0];
      const message = choice?.message;

      // Ekstrak function/tool calling jika ada (helper yang sama dipakai
      // jalur auto-heal — S8e).
      const normalizedToolCalls = extractOpenAIToolCalls(message);

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
      networkSignal.includes('fetch failed') ||
      networkSignal.includes('network') ||
      networkSignal.includes('eacces');

    if (isNetworkError) {
      status = 'provider_error';
      httpStatusCode = null; // tidak ada respons HTTP yang diterima
      sanitizedMsg = `Koneksi jaringan ke penyedia ${this.providerName.toUpperCase()} gagal atau terputus (Periksa sambungan internet Anda).`;
      isRetryable = true;
      isFallbackEligible = true;
    } else if (httpStatusCode === 400) {
      // 400: argumen tidak valid / konteks melebihi batas model / model
      // tidak mendukung tools — sebelumnya jatuh ke unknown_error (tanpa
      // retry, tanpa fallback, DAN ikut menghitung circuit breaker).
      // Disamakan dengan adapter Gemini: provider_error yang layak
      // fallback (provider lain memakai model dan batas berbeda). Pesan
      // provider dipertahankan karena biasanya menyebut penyebabnya
      // (mis. "maximum context length"). Cabang ini sengaja di atas
      // cabang substring (401/404): status numerik lebih dapat dipercaya
      // daripada kata-kata di pesan error.
      status = 'provider_error';
      isRetryable = false;
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
      // Saldo habis LAYAK fallback: provider cadangan yang masih punya
      // kredit bisa menjawab, tidak seperti kunci salah (401) yang harus
      // tampil apa adanya. Bila tidak ada fallback yang sehat, pesan
      // "Saldo Habis" tetap yang sampai ke log (dan mode offline ke user).
      isFallbackEligible = true;
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
