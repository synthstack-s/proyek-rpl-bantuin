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
   * Mengambil daftar model Google Gemini yang tersedia
   */
  async fetchAvailableModels(config: ProviderRuntimeConfig): Promise<AIModelInfo[]> {
    const fallbackGeminiModels: AIModelInfo[] = [
      { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash', description: 'Model rekomendasi cepat dan cerdas untuk operasional BANTUIN', isDefault: true },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Model inferensi generasi baru dengan latensi ultra rendah' },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Model penalaran tinggi untuk diagnosis kerusakan kompleks' },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', description: 'Model standar stabil' },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: 'Model kapasitas token besar' },
    ];

    if (!config.apiKey || !config.apiKey.trim()) {
      return fallbackGeminiModels;
    }

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${config.apiKey}`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        return fallbackGeminiModels;
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

        return models.length > 0 ? models : fallbackGeminiModels;
      }
    } catch {
      // Fallback
    }

    return fallbackGeminiModels;
  }

  /**
   * Menormalkan error vendor Google Gemini dan menyensor API key
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

    const lower = sanitizedMsg.toLowerCase();

    if (lower.includes('api_key_invalid') || lower.includes('api key not valid') || lower.includes('invalid api key') || lower.includes('401')) {
      status = 'invalid_api_key';
      httpStatusCode = 401;
      isRetryable = false;
      isFallbackEligible = false; // TIDAK BOLEH fallback jika API key salah
    } else if (lower.includes('permission_denied') || lower.includes('403')) {
      status = 'provider_error';
      httpStatusCode = 403;
      isRetryable = false;
      isFallbackEligible = false;
    } else if (lower.includes('resource_exhausted') || lower.includes('quota') || lower.includes('rate limit') || lower.includes('429')) {
      status = 'rate_limit_exceeded';
      httpStatusCode = 429;
      isRetryable = true;
      isFallbackEligible = true; // Boleh fallback jika kuota terlampaui
    } else if (lower.includes('not found') || lower.includes('models/') || lower.includes('404')) {
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
      status = 'provider_error';
      httpStatusCode = 503;
      isRetryable = true;
      isFallbackEligible = true; // Boleh fallback jika server Google error
    } else if (lower.includes('ssrf') || lower.includes('protocol') || lower.includes('private ip')) {
      status = 'invalid_endpoint';
      httpStatusCode = 400;
      isRetryable = false;
      isFallbackEligible = false;
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
