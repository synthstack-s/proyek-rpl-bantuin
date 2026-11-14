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
  AIModelListResult,
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
  // M9: apakah kegagalan terakhir yang DIHITUNG menuju breaker layak fallback
  // (dari NormalizedAIError.isFallbackEligible). Cabang OPEN memakai ini agar
  // konsisten dengan jalur normal — error yang tidak layak fallback tidak
  // memicu fallback lewat jalur OPEN. Default true (belum ada kegagalan).
  lastFailureFallbackEligible: boolean;
}

/**
 * M9: status error NON-TRANSIEN — tidak akan sembuh dengan menunggu, jadi
 * TIDAK BOLEH dihitung menuju pembukaan circuit breaker. Sebelumnya 3x chat
 * gagal karena key salah membuat breaker OPEN dan request berikutnya
 * menampilkan pesan "cooldown" alih-alih "API key salah", menutupi akar
 * masalah. Kegagalan ini tetap dicatat di log/metrik (recordAIUsageLog),
 * hanya tidak dihitung menuju threshold breaker.
 */
const NON_TRANSIENT_BREAKER_STATUSES: ReadonlySet<string> = new Set([
  'invalid_api_key',
  'model_not_available',
  'invalid_endpoint',
]);

function isNonTransientBreakerStatus(status: string | undefined | null): boolean {
  return !!status && NON_TRANSIENT_BREAKER_STATUSES.has(status);
}

function createCircuitBreakerTracker(): CircuitBreakerTracker {
  return {
    state: 'CLOSED',
    consecutiveFailures: 0,
    lastFailureTime: 0,
    nextAllowedProbeTime: 0,
    lastFailureFallbackEligible: true,
  };
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

  // L11: promise sinkronisasi yang sedang berjalan (bila ada). Pemanggil
  // konkuren berbagi satu sync yang sama alih-alih masing-masing membaca DB
  // dan saling menimpa cache — dibersihkan saat settle (sukses/gagal).
  private syncPromise: Promise<void> | null = null;

  private constructor() {
    this.adapters.set('gemini', new GeminiProviderAdapter());
    this.adapters.set('groq', new GroqProviderAdapter());

    this.circuitBreakers.set('gemini', createCircuitBreakerTracker());

    this.circuitBreakers.set('groq', createCircuitBreakerTracker());
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
      this.circuitBreakers.set(provider, createCircuitBreakerTracker());
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
   *
   * L11: panggilan konkuren berbagi SATU sinkronisasi lewat `syncPromise` —
   * sebelumnya dua panggilan bisa sama-sama lolos cek TTL, membaca version,
   * lalu saling menimpa cache (panggilan yang membaca version lama bisa
   * menimpa cache yang baru saja diperbarui panggilan lain dengan version
   * lebih baru). Promise dibersihkan saat settle agar sync berikutnya tetap
   * bisa berjalan. Catatan: pemanggil `force` yang bergabung dengan sync
   * non-force yang sedang berjalan tetap mendapat cache segar — sync itu
   * membaca version terkini dari DB dan me-refresh bila version berubah
   * (satu-satunya yang dilewatkan adalah pembacaan ulang saat version SAMA,
   * yang datanya identik).
   */
  public async syncWithDatabase(force = false): Promise<void> {
    const now = Date.now();
    if (!force && now - this.lastCacheCheckTime < this.CACHE_TTL_MS && this.cachedGlobalSettings) {
      return;
    }

    // Ada sync yang sedang berjalan — bergabung, jangan mulai yang baru.
    if (this.syncPromise) {
      return this.syncPromise;
    }

    const pending = this.doSyncWithDatabase(force);
    this.syncPromise = pending;
    try {
      await pending;
    } finally {
      // Bersihkan hanya bila masih promise yang sama (bukan sync baru yang
      // dimulai setelah promise ini settle).
      if (this.syncPromise === pending) {
        this.syncPromise = null;
      }
    }
  }

  /**
   * Pekerja sinkronisasi sebenarnya — hanya dipanggil lewat syncWithDatabase.
   */
  private async doSyncWithDatabase(force: boolean): Promise<void> {
    const now = Date.now();
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
   * M14 — Retry untuk error transient (menghormati `retryLimit` per provider).
   *
   * Sebelum perbaikan ini `retryLimit` adalah config mati: tersimpan di DB
   * dan bisa diubah lewat slider "Retries" di UI, tetapi tidak pernah dibaca
   * logika apa pun — setiap chat hanya mencoba sekali. Sekarang:
   * - Hanya error dengan `isRetryable = true` yang di-retry (429, 5xx,
   *   timeout, network error per M5). Error non-retryable (401/402/403/404,
   *   invalid_endpoint) langsung dilempar tanpa retry.
   * - `retryLimit` = JUMLAH MAKSIMUM PERCOBAAN total (1 = tanpa retry),
   *   dijepit 1..6, default 3 bila tidak diset/tidak valid.
   * - Backoff eksponensial antar percobaan: 500ms -> 1s -> 2s, dibatasi 4s.
   * - Setiap percobaan yang gagal dicatat ke log (provider, percobaan
   *   ke-N, status error, jeda berikutnya).
   * - Setelah retry habis, error terakhir (sudah dinormalisasi) dilempar ke
   *   pemanggil — pemanggil lalu menjalankan fallback seperti biasa
   *   (generateChatCompletion) atau melempar error gabungan (executeFallback).
   *
   * Desain: retry diimplementasikan DI MANAGER (bukan di adapter) agar satu
   * implementasi melayani semua provider (Gemini, Groq, kustom) dan agar
   * circuit breaker tetap dicatat SEKALI per request oleh pemanggil — satu
   * request yang me-retry tidak boleh langsung membuka breaker (threshold 3).
   * `testConnection` sengaja TIDAK memakai retry: tes koneksi harus
   * mencerminkan satu probe, bukan ketahanan hasil retry.
   */
  private async callWithRetry(
    adapter: AIProviderAdapter,
    request: AIChatRequest,
    config: ProviderRuntimeConfig
  ): Promise<AIChatResponse> {
    const rawLimit = Number(config.retryLimit);
    const maxAttempts = Number.isFinite(rawLimit)
      ? Math.max(1, Math.min(6, Math.floor(rawLimit)))
      : 3;
    let lastError: NormalizedAIError | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await adapter.generateChatCompletion(request, config);
      } catch (err: any) {
        const normalized: NormalizedAIError = err.sanitizedMessage
          ? err
          : adapter.normalizeError(err, config.apiKey);
        lastError = normalized;

        const canRetry = normalized.isRetryable && attempt < maxAttempts;
        if (!canRetry) {
          // Lempar error yang sudah dinormalisasi agar pemanggil tidak perlu
          // menormalisasi ulang (dan isFallbackEligible tidak hilang).
          throw normalized;
        }

        const delayMs = Math.min(500 * Math.pow(2, attempt - 1), 4000);
        console.warn(
          `[AI Retry] ${config.provider}: percobaan ${attempt}/${maxAttempts} gagal (${normalized.status}: ${normalized.sanitizedMessage}). Retry dalam ${delayMs} ms.`
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    // Tidak dapat dicapai secara normal (loop selalu return/throw), tetapi
    // TypeScript membutuhkan throw eksplisit di sini.
    throw lastError || new Error(`[${config.provider}] Gagal setelah ${maxAttempts} percobaan.`);
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
        return this.executeFallback(request, fallbackConfig, primaryProvider, 'API key provider aktif belum dikonfigurasi', globalSettings);
      }
      throw new Error(
        `API key untuk ${activeConfig.name || primaryProvider} belum dikonfigurasi. Silakan simpan API key di panel Konfigurasi AI.`
      );
    }

    // 2. Periksa status Circuit Breaker untuk provider utama
    const primaryCircuitState = this.checkCircuitState(primaryProvider, globalSettings);

    if (primaryCircuitState === 'OPEN') {
      console.warn(`[Circuit Breaker] Provider ${primaryProvider} sedang OPEN (cooldown aktif).`);
      // M9: cabang OPEN WAJIB menghormati isFallbackEligible seperti jalur
      // normal — kegagalan terakhir yang membuka breaker tercatat di tracker
      // (lihat recordCircuitFailure). Tanpa ini, error yang dinyatakan tidak
      // layak fallback tetap memicu fallback lewat jalur ini. Pemeriksaan key
      // juga memakai .trim() agar konsisten dengan cabang lain (key berisi
      // spasi saja dianggap tidak ada).
      const primaryTracker = this.circuitBreakers.get(primaryProvider);
      const primaryFailureWasFallbackEligible = primaryTracker?.lastFailureFallbackEligible !== false;
      if (
        globalSettings.enableFallback &&
        fallbackConfig &&
        fallbackConfig.apiKey &&
        fallbackConfig.apiKey.trim() &&
        primaryFailureWasFallbackEligible
      ) {
        return this.executeFallback(request, fallbackConfig, primaryProvider, 'Circuit breaker OPEN on primary provider', globalSettings);
      }
      throw new Error(`Layanan ${activeConfig.name} sedang mengalami gangguan berulang dan dalam masa pemulihan (cooldown).`);
    }

    try {
      // 3. Jalankan pemanggilan provider utama (M14: dengan retry transient —
      // lihat callWithRetry; breaker dicatat sekali di catch di bawah).
      const response = await this.callWithRetry(adapter, request, activeConfig);

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

      // M9: recordCircuitFailure mengabaikan error non-transien
      // (invalid_api_key / model_not_available / invalid_endpoint) untuk
      // hitungan threshold — kegagalan tetap dicatat di log/metrik di bawah.
      this.recordCircuitFailure(primaryProvider, globalSettings, normalizedErr);

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
          normalizedErr.sanitizedMessage,
          globalSettings
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
   *
   * M10: fallback TIDAK BOLEH melewati circuit breaker. Sebelum memanggil
   * provider cadangan, periksa breaker-nya (lempar error gabungan bila OPEN);
   * catat sukses fallback via recordCircuitSuccess dan kegagalan via
   * recordCircuitFailure (dengan pengecualian non-transien M9) seperti
   * provider utama. Sebelumnya breaker untuk provider cadangan praktis mati
   * — provider cadangan yang bermasalah terus dihantam tanpa cooldown.
   */
  private async executeFallback(
    request: AIChatRequest,
    fallbackConfig: ProviderRuntimeConfig,
    fallbackFrom: AIProviderType,
    causeReason: string,
    settings: GlobalAISettings
  ): Promise<AIChatResponse> {
    const fallbackProvider = fallbackConfig.provider;
    const fallbackAdapter = this.getAdapter(fallbackProvider);

    // M10: periksa breaker cadangan di awal — jangan menghantam provider
    // cadangan yang sedang dalam masa pemulihan.
    const fallbackCircuitState = this.checkCircuitState(fallbackProvider, settings);
    if (fallbackCircuitState === 'OPEN') {
      throw new Error(
        `Provider utama (${fallbackFrom}) gagal (${causeReason}), dan provider cadangan (${fallbackProvider}) juga tidak dapat dipakai saat ini karena circuit breaker-nya sedang OPEN (dalam masa pemulihan/cooldown setelah kegagalan berulang).`
      );
    }

    console.info(`[AI Fallback Engine] Mengalihkan request ke ${fallbackConfig.name} (Penyebab: ${causeReason})`);

    try {
      // M14: panggilan cadangan juga memakai retry transient (dengan
      // retryLimit milik provider cadangan).
      const response = await this.callWithRetry(fallbackAdapter, request, fallbackConfig);

      // M10: sukses fallback me-reset breaker cadangan.
      this.recordCircuitSuccess(fallbackProvider);

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

      // M10: kegagalan fallback dicatat ke breaker cadangan (dengan
      // pengecualian non-transien M9 — key cadangan yang salah tidak boleh
      // membuka breaker dan menutupi pesan error aslinya).
      this.recordCircuitFailure(fallbackProvider, settings, normFallbackErr);

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
   *
   * H1: `opts.usesStoredCredentials` (default true) menandakan apakah tes
   * memakai kredensial tersimpan. Tes override dari form (key belum disimpan)
   * tetap dicatat ke ai_connection_test_logs tetapi TIDAK boleh menimpa
   * status tersimpan — flag ini diteruskan ke recordConnectionTestLog.
   *
   * L7: `configOverride.requestTimeoutMs` meneruskan timeout dari form ke
   * probe adapter (dijepit 5s–120s) — sebelumnya route mengabaikannya dan
   * adapter memakai timeout hardcoded, sehingga pengaturan timeout admin
   * tidak berlaku untuk tes koneksi.
   */
  public async testProviderConnection(
    provider: AIProviderType,
    configOverride?: {
      apiEndpoint?: string;
      apiKey?: string;
      selectedModel?: string;
      requestTimeoutMs?: number;
    },
    adminId?: number,
    opts?: { usesStoredCredentials?: boolean }
  ): Promise<AIConnectionTestResult> {
    await this.syncWithDatabase();

    const baseConfig = await getProviderRuntimeConfig(provider);
    const overrideTimeout = Number(configOverride?.requestTimeoutMs);
    const testConfig: ProviderRuntimeConfig = {
      ...baseConfig,
      apiEndpoint: configOverride?.apiEndpoint || baseConfig.apiEndpoint,
      apiKey: configOverride?.apiKey && configOverride.apiKey.trim().length > 0 ? configOverride.apiKey.trim() : baseConfig.apiKey,
      selectedModel: configOverride?.selectedModel || baseConfig.selectedModel,
      // L7: override timeout dari form (dijepit 5s–120s); bila tidak ada /
      // tidak valid, pakai timeout tersimpan dari konfigurasi.
      requestTimeoutMs: Number.isFinite(overrideTimeout)
        ? Math.max(5000, Math.min(120000, Math.floor(overrideTimeout)))
        : baseConfig.requestTimeoutMs,
    };

    const adapter = this.getAdapter(provider);
    const result = await adapter.testConnection(testConfig);

    // Catat log hasil pengujian ke database (status tersimpan hanya diperbarui
    // bila tes memakai kredensial tersimpan — lihat recordConnectionTestLog).
    await recordConnectionTestLog(result, adminId, opts);

    // Jika tes berhasil, reset circuit breaker untuk provider tersebut
    if (result.status === 'success') {
      this.recordCircuitSuccess(provider);
    }

    return result;
  }

  /**
   * Mengambil Model yang Tersedia untuk Provider (Mendukung override kredensial dari form)
   *
   * M4: mengembalikan AIModelListResult — `isLive: false` berarti daftar
   * adalah cadangan hardcoded karena pengambilan live gagal (lihat adapter).
   */
  public async getAvailableModels(
    provider: AIProviderType,
    configOverride?: Partial<ProviderRuntimeConfig>
  ): Promise<AIModelListResult> {
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
      // H1: auto-probe tanpa override menguji kredensial tersimpan, jadi
      // hasilnya boleh memperbarui status tersimpan.
      const probeResult = await this.testProviderConnection(newProvider, undefined, adminId, { usesStoredCredentials: true });
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
      tracker.lastFailureFallbackEligible = true;
    }
  }

  /**
   * M9: error non-transien (invalid_api_key, model_not_available,
   * invalid_endpoint) TIDAK dihitung menuju pembukaan breaker — menunggu
   * cooldown tidak akan memperbaiki key yang salah atau model yang tidak
   * ada. Kegagalan tetap dicatat di log/metrik oleh pemanggil
   * (recordAIUsageLog); fungsi ini hanya menentukan hitungan breaker.
   * Bila `normalizedErr` diberikan, kelayakan fallback-nya dicatat di
   * tracker agar cabang OPEN dapat menghormati isFallbackEligible seperti
   * jalur normal.
   */
  private recordCircuitFailure(
    provider: AIProviderType,
    settings: GlobalAISettings,
    normalizedErr?: NormalizedAIError
  ): void {
    const tracker = this.circuitBreakers.get(provider);
    if (!tracker) return;

    if (normalizedErr && isNonTransientBreakerStatus(normalizedErr.status)) {
      console.warn(
        `[Circuit Breaker] Kegagalan non-transien (${normalizedErr.status}) pada provider ${provider} TIDAK dihitung menuju pembukaan breaker — pesan error asli tetap ditampilkan.`
      );
      return;
    }

    if (normalizedErr) {
      tracker.lastFailureFallbackEligible = normalizedErr.isFallbackEligible;
    }

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
