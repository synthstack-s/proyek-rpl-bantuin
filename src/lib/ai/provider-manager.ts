/**
 * AI PROVIDER MANAGER (ORCHESTRATOR)
 * BANTUIN AI PROVIDER MANAGEMENT
 * 
 * Bertanggung jawab atas:
 * 1. Penyediaan single gateway bagi Chatbot+ untuk berinteraksi dengan AI.
 * 2. Manajemen siklus hidup provider aktif berbasis Database (Source of Truth).
 * 3. In-flight Request Snapshot Isolation (pergantian provider tidak mengganggu request yang sedang berjalan).
 * 4. Multi-Instance Cache Invalidation berbasis version counter.
 * 5. Automatic Fallback dengan Circuit Breaker cerdas (Closed, Open, Half-Open).
 * 6. Pencatatan metrik penggunaan dan konsumsi token secara otomatis.
 */

import {
  AIProviderAdapter,
  AIProviderType,
  AIChatRequest,
  AIChatResponse,
  AIConnectionTestResult,
  AIModelInfo,
  ProviderRuntimeConfig,
  NormalizedAIError,
} from './types';
import { GeminiProviderAdapter } from './adapters/gemini-adapter';
import { GroqProviderAdapter } from './adapters/groq-adapter';
import {
  getGlobalAISettings,
  getProviderRuntimeConfig,
  setActiveAIProvider,
  setAutomaticFallbackSettings,
  recordConnectionTestLog,
  recordAIUsageLog,
  GlobalAISettings,
} from './repository';

type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerTracker {
  state: CircuitBreakerState;
  consecutiveFailures: number;
  lastFailureTime: number;
  nextAllowedProbeTime: number;
}

export class AIProviderManager {
  private static instance: AIProviderManager | null = null;

  private adapters: Map<AIProviderType, AIProviderAdapter> = new Map();
  private circuitBreakers: Map<AIProviderType, CircuitBreakerTracker> = new Map();

  // Local cache untuk performa tinggi dengan invalidasi berbasis version
  private cachedVersion: number = 0;
  private cachedGlobalSettings: GlobalAISettings | null = null;
  private cachedConfigs: Map<AIProviderType, ProviderRuntimeConfig> = new Map();
  private lastCacheCheckTime: number = 0;
  private readonly CACHE_TTL_MS = 5000; // 5 detik TTL untuk pengecekan version ke DB

  private constructor() {
    this.adapters.set('gemini', new GeminiProviderAdapter());
    this.adapters.set('groq', new GroqProviderAdapter());

    this.circuitBreakers.set('gemini', {
      state: 'CLOSED',
      consecutiveFailures: 0,
      lastFailureTime: 0,
      nextAllowedProbeTime: 0,
    });

    this.circuitBreakers.set('groq', {
      state: 'CLOSED',
      consecutiveFailures: 0,
      lastFailureTime: 0,
      nextAllowedProbeTime: 0,
    });
  }

  public static getInstance(): AIProviderManager {
    if (!AIProviderManager.instance) {
      AIProviderManager.instance = new AIProviderManager();
    }
    return AIProviderManager.instance;
  }

  /**
   * Mengambil adapter berdasarkan nama provider
   */
  public getAdapter(provider: AIProviderType): AIProviderAdapter {
    let adapter = this.adapters.get(provider);
    if (!adapter) {
      if (provider === 'gemini') {
        adapter = new GeminiProviderAdapter();
      } else {
        // Provider kustom (OpenAI-Compatible) otomatis dilayani oleh GroqProviderAdapter
        adapter = new GroqProviderAdapter(provider);
      }
      this.adapters.set(provider, adapter);
    }

    if (!this.circuitBreakers.has(provider)) {
      this.circuitBreakers.set(provider, {
        state: 'CLOSED',
        consecutiveFailures: 0,
        lastFailureTime: 0,
        nextAllowedProbeTime: 0,
      });
    }

    return adapter;
  }

  /**
   * Mengosongkan cache internal untuk memicu sinkronisasi ulang seketika
   */
  public invalidateCache(): void {
    this.lastCacheCheckTime = 0;
  }

  /**
   * Memastikan cache terverifikasi sinkron dengan database (Multi-Instance Cache Invalidation)
   */
  public async syncWithDatabase(force = false): Promise<void> {
    const now = Date.now();
    if (!force && now - this.lastCacheCheckTime < this.CACHE_TTL_MS && this.cachedGlobalSettings) {
      return;
    }

    const currentGlobal = await getGlobalAISettings();
    // Jika version di DB lebih tinggi atau force reload, segarkan cache
    if (force || currentGlobal.version !== this.cachedVersion || !this.cachedGlobalSettings) {
      this.cachedGlobalSettings = currentGlobal;
      this.cachedVersion = currentGlobal.version;

      const neededProviders = new Set<string>([
        'gemini',
        'groq',
        currentGlobal.activeProvider,
        currentGlobal.fallbackProvider,
      ]);

      for (const p of neededProviders) {
        if (!p) continue;
        const cfg = await getProviderRuntimeConfig(p);
        this.cachedConfigs.set(p, cfg);
      }
    }

    this.lastCacheCheckTime = now;
  }

  /**
   * Mengambil Snapshot Konfigurasi Provider Aktif untuk Request yang Masuk
   * (Menjamin in-flight request tidak terganggu jika provider berganti di tengah jalan)
   */
  public async getActiveProviderSnapshot(force = false): Promise<{
    globalSettings: GlobalAISettings;
    activeConfig: ProviderRuntimeConfig;
    fallbackConfig: ProviderRuntimeConfig | null;
  }> {
    await this.syncWithDatabase(force);

    const globalSettings = { ...this.cachedGlobalSettings! };
    const activeConfig = { ...this.cachedConfigs.get(globalSettings.activeProvider)! };

    let fallbackConfig: ProviderRuntimeConfig | null = null;
    if (globalSettings.enableFallback && globalSettings.fallbackProvider !== globalSettings.activeProvider) {
      fallbackConfig = { ...this.cachedConfigs.get(globalSettings.fallbackProvider)! };
    }

    return {
      globalSettings,
      activeConfig,
      fallbackConfig,
    };
  }

  /**
   * GATEWAY UTAMA CHATBOT: Menghasilkan Chat Completion dengan Automatic Fallback & Circuit Breaker
   */
  public async generateChatCompletion(request: AIChatRequest): Promise<AIChatResponse> {
    // 1. Kunci snapshot konfigurasi untuk request saat ini (In-Flight Request Snapshot Isolation)
    const { globalSettings, activeConfig, fallbackConfig } = await this.getActiveProviderSnapshot();

    const primaryProvider = activeConfig.provider;
    const adapter = this.getAdapter(primaryProvider);

    // Fail-fast: jangan kirim request dengan API key kosong. Tanpa penjaga ini,
    // adapter mengirim "Bearer " kosong → 401 → circuit breaker trip, padahal
    // masalah sebenarnya hanya key yang belum dikonfigurasi.
    if (!activeConfig.apiKey || !activeConfig.apiKey.trim()) {
      if (globalSettings.enableFallback && fallbackConfig && fallbackConfig.apiKey && fallbackConfig.apiKey.trim()) {
        return this.executeFallback(request, fallbackConfig, primaryProvider, 'API key provider aktif belum dikonfigurasi');
      }
      throw new Error(
        `API key untuk ${activeConfig.name || primaryProvider} belum dikonfigurasi. Silakan simpan API key di panel Konfigurasi AI.`
      );
    }

    // 2. Periksa status Circuit Breaker untuk provider utama
    const primaryCircuitState = this.checkCircuitState(primaryProvider, globalSettings);

    if (primaryCircuitState === 'OPEN') {
      console.warn(`[Circuit Breaker] Provider ${primaryProvider} sedang OPEN (cooldown aktif).`);
      if (globalSettings.enableFallback && fallbackConfig && fallbackConfig.apiKey) {
        return this.executeFallback(request, fallbackConfig, primaryProvider, 'Circuit breaker OPEN on primary provider');
      }
      throw new Error(`Layanan ${activeConfig.name} sedang mengalami gangguan berulang dan dalam masa pemulihan (cooldown).`);
    }

    try {
      // 3. Jalankan pemanggilan provider utama
      const response = await adapter.generateChatCompletion(request, activeConfig);

      // Reset circuit breaker jika berhasil
      this.recordCircuitSuccess(primaryProvider);

      // Catat log metrik penggunaan sukses
      await recordAIUsageLog({
        provider: primaryProvider,
        model: response.model,
        latencyMs: response.latencyMs,
        status: 'success',
        promptTokens: response.usage.promptTokens,
        completionTokens: response.usage.completionTokens,
        totalTokens: response.usage.totalTokens,
        isFallback: false,
        sessionId: request.sessionId,
        userRole: request.userRole,
      });

      return response;
    } catch (err: any) {
      const normalizedErr: NormalizedAIError = err.sanitizedMessage
        ? err
        : adapter.normalizeError(err, activeConfig.apiKey);

      this.recordCircuitFailure(primaryProvider, globalSettings);

      console.warn(`[AI Provider Manager] Gagal pada provider utama (${primaryProvider}): ${normalizedErr.sanitizedMessage}`);

      // 4. Evaluasi apakah memenuhi syarat Automatic Fallback
      const canFallback =
        globalSettings.enableFallback &&
        fallbackConfig &&
        Boolean(fallbackConfig.apiKey && fallbackConfig.apiKey.trim()) &&
        normalizedErr.isFallbackEligible;

      if (canFallback) {
        return this.executeFallback(
          request,
          fallbackConfig,
          primaryProvider,
          normalizedErr.sanitizedMessage
        );
      }

      // Catat log metrik penggunaan gagal
      await recordAIUsageLog({
        provider: primaryProvider,
        model: activeConfig.selectedModel,
        latencyMs: 0,
        status: 'failed',
        errorCategory: normalizedErr.status,
        isFallback: false,
        sessionId: request.sessionId,
        userRole: request.userRole,
      });

      throw new Error(`[${activeConfig.name} Error] ${normalizedErr.sanitizedMessage}`);
    }
  }

  /**
   * Menjalankan Eksekusi Provider Cadangan (Fallback)
   */
  private async executeFallback(
    request: AIChatRequest,
    fallbackConfig: ProviderRuntimeConfig,
    fallbackFrom: AIProviderType,
    causeReason: string
  ): Promise<AIChatResponse> {
    const fallbackProvider = fallbackConfig.provider;
    const fallbackAdapter = this.getAdapter(fallbackProvider);

    console.info(`[AI Fallback Engine] Mengalihkan request ke ${fallbackConfig.name} (Penyebab: ${causeReason})`);

    try {
      const response = await fallbackAdapter.generateChatCompletion(request, fallbackConfig);

      response.isFallback = true;
      response.fallbackFrom = fallbackFrom;

      await recordAIUsageLog({
        provider: fallbackProvider,
        model: response.model,
        latencyMs: response.latencyMs,
        status: 'fallback',
        promptTokens: response.usage.promptTokens,
        completionTokens: response.usage.completionTokens,
        totalTokens: response.usage.totalTokens,
        isFallback: true,
        fallbackFromProvider: fallbackFrom,
        sessionId: request.sessionId,
        userRole: request.userRole,
      });

      return response;
    } catch (fallbackErr: any) {
      const normFallbackErr: NormalizedAIError = fallbackErr.sanitizedMessage
        ? fallbackErr
        : fallbackAdapter.normalizeError(fallbackErr, fallbackConfig.apiKey);

      await recordAIUsageLog({
        provider: fallbackProvider,
        model: fallbackConfig.selectedModel,
        latencyMs: 0,
        status: 'failed',
        errorCategory: normFallbackErr.status,
        isFallback: true,
        fallbackFromProvider: fallbackFrom,
        sessionId: request.sessionId,
        userRole: request.userRole,
      });

      throw new Error(
        `Provider utama (${fallbackFrom}) gagal, dan provider cadangan (${fallbackProvider}) juga gagal: ${normFallbackErr.sanitizedMessage}`
      );
    }
  }

  /**
   * Pengujian Koneksi Terisolasi (Menguji Provider Tertentu Tanpa Mengubah Konfigurasi Aktif)
   */
  public async testProviderConnection(
    provider: AIProviderType,
    configOverride?: {
      apiEndpoint?: string;
      apiKey?: string;
      selectedModel?: string;
    },
    adminId?: number
  ): Promise<AIConnectionTestResult> {
    await this.syncWithDatabase();

    const baseConfig = await getProviderRuntimeConfig(provider);
    const testConfig: ProviderRuntimeConfig = {
      ...baseConfig,
      apiEndpoint: configOverride?.apiEndpoint || baseConfig.apiEndpoint,
      apiKey: configOverride?.apiKey && configOverride.apiKey.trim().length > 0 ? configOverride.apiKey.trim() : baseConfig.apiKey,
      selectedModel: configOverride?.selectedModel || baseConfig.selectedModel,
    };

    const adapter = this.getAdapter(provider);
    const result = await adapter.testConnection(testConfig);

    // Catat log hasil pengujian ke database
    await recordConnectionTestLog(result, adminId);

    // Jika tes berhasil, reset circuit breaker untuk provider tersebut
    if (result.status === 'success') {
      this.recordCircuitSuccess(provider);
    }

    return result;
  }

  /**
   * Mengambil Model yang Tersedia untuk Provider (Mendukung override kredensial dari form)
   */
  public async getAvailableModels(
    provider: AIProviderType,
    configOverride?: Partial<ProviderRuntimeConfig>
  ): Promise<AIModelInfo[]> {
    await this.syncWithDatabase();
    const config = await getProviderRuntimeConfig(provider);
    const effectiveConfig: ProviderRuntimeConfig = {
      ...config,
      ...(configOverride || {}),
    };
    const adapter = this.getAdapter(provider);
    return await adapter.fetchAvailableModels(effectiveConfig);
  }

  /**
   * Pergantian Provider Aktif secara Atomik dengan Auto-Probe & Reset Circuit Breaker
   */
  public async switchActiveProvider(
    newProvider: AIProviderType,
    adminId: number,
    meta?: { ip?: string; userAgent?: string }
  ): Promise<{ success: boolean; message: string; version: number }> {
    // 1. Reset status circuit breaker untuk provider baru
    this.recordCircuitSuccess(newProvider);

    // 2. Simpan status provider aktif (Single Source of Truth)
    const result = await setActiveAIProvider(newProvider, adminId, meta);

    // 3. Segarkan cache lokal segera
    await this.syncWithDatabase(true);

    // 4. Jalankan auto-probe koneksi live agar status provider langsung tersinkronisasi menjadi 'connected'
    try {
      const probeResult = await this.testProviderConnection(newProvider, undefined, adminId);
      if (probeResult.status === 'success') {
        this.recordCircuitSuccess(newProvider);
      }
    } catch (probeErr: any) {
      console.warn(`[AI Provider Manager] Auto-probe setelah switch provider: ${probeErr.message}`);
    }

    return result;
  }

  /**
   * Mengubah Pengaturan Fallback
   */
  public async updateFallbackSettings(
    enable: boolean,
    fallbackProvider: AIProviderType,
    adminId: number,
    meta?: { ip?: string; userAgent?: string }
  ): Promise<{ success: boolean; message: string; version: number }> {
    const result = await setAutomaticFallbackSettings(enable, fallbackProvider, adminId, meta);
    await this.syncWithDatabase(true);
    return result;
  }

  // ==========================================================================
  // CIRCUIT BREAKER LOGIC
  // ==========================================================================

  private checkCircuitState(provider: AIProviderType, settings: GlobalAISettings): CircuitBreakerState {
    const tracker = this.circuitBreakers.get(provider);
    if (!tracker) return 'CLOSED';

    const now = Date.now();
    if (tracker.state === 'OPEN') {
      if (now >= tracker.nextAllowedProbeTime) {
        tracker.state = 'HALF_OPEN';
        return 'HALF_OPEN';
      }
      return 'OPEN';
    }

    return tracker.state;
  }

  private recordCircuitSuccess(provider: AIProviderType): void {
    const tracker = this.circuitBreakers.get(provider);
    if (tracker) {
      tracker.state = 'CLOSED';
      tracker.consecutiveFailures = 0;
      tracker.lastFailureTime = 0;
      tracker.nextAllowedProbeTime = 0;
    }
  }

  private recordCircuitFailure(provider: AIProviderType, settings: GlobalAISettings): void {
    const tracker = this.circuitBreakers.get(provider);
    if (!tracker) return;

    tracker.consecutiveFailures++;
    tracker.lastFailureTime = Date.now();

    const threshold = settings.circuitBreakerFailureThreshold || 3;
    const cooldownMs = (settings.circuitBreakerCooldownSec || 30) * 1000;

    if (tracker.consecutiveFailures >= threshold) {
      tracker.state = 'OPEN';
      tracker.nextAllowedProbeTime = Date.now() + cooldownMs;
      console.warn(`[Circuit Breaker] Provider ${provider} mencapai threshold kegagalan (${tracker.consecutiveFailures}x). State berubah menjadi OPEN selama ${cooldownMs / 1000}s.`);
    }
  }
}
