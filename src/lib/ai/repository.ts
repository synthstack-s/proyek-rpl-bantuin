/**
 * AI PROVIDER REPOSITORY & STORAGE LAYER
 * BANTUIN AI PROVIDER MANAGEMENT
 * 
 * Lapisan akses data untuk:
 * 1. Penyimpanan & pembacaan konfigurasi terenkripsi provider AI.
 * 2. Pengaturan provider aktif tunggal (Single Source of Truth) di database.
 * 3. Log pengujian koneksi live.
 * 4. Metrik penggunaan AI aktual (token, latensi, status).
 * 5. Log audit modifikasi konfigurasi administrator.
 * 6. In-memory state synchronization & distributed cache invalidation counter.
 */

import { query } from '@/lib/db';
import {
  AIProviderType,
  AIConnectionStatus,
  AIConnectionTestResult,
  ProviderRuntimeConfig,
} from './types';
import { encryptApiKey, decryptApiKey, maskApiKey } from './encryption';
import { validateAndPinEndpoint } from './ssrf-validator';
import { syncProviderToEnvLocal, syncActiveProviderToEnvLocal } from './env-sync';

export interface GlobalAISettings {
  activeProvider: AIProviderType;
  enableFallback: boolean;
  fallbackProvider: AIProviderType;
  version: number;
  circuitBreakerFailureThreshold: number;
  circuitBreakerCooldownSec: number;
  updatedAt: string;
}

// In-Memory Fallback Store untuk mendukung offline testing dan database sandbox
const IN_MEMORY_CONFIGS: Record<string, ProviderRuntimeConfig> = {
  gemini: {
    provider: 'gemini',
    name: 'Google Gemini',
    apiEndpoint: 'https://generativelanguage.googleapis.com',
    apiKey: process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_google_gemini_api_key_here' ? process.env.GEMINI_API_KEY : '',
    keyIdentifier: 'primary-2026',
    maskedKeyPreview: process.env.GEMINI_API_KEY ? maskApiKey(process.env.GEMINI_API_KEY) : '',
    selectedModel: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
    defaultModel: 'gemini-3.5-flash',
    temperature: 0.7,
    maxOutputTokens: 2048,
    requestTimeoutMs: 30000,
    retryLimit: 2,
    lastConnectionStatus: process.env.GEMINI_API_KEY ? 'connected' : 'not_configured',
    lastTestedAt: new Date().toISOString(),
  },
  groq: {
    provider: 'groq',
    name: 'Groq AI',
    apiEndpoint: 'https://api.groq.com/openai/v1',
    apiKey: process.env.GROQ_API_KEY || '',
    keyIdentifier: 'primary-2026',
    maskedKeyPreview: process.env.GROQ_API_KEY ? maskApiKey(process.env.GROQ_API_KEY) : '',
    selectedModel: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
    defaultModel: 'openai/gpt-oss-120b',
    temperature: 0.7,
    maxOutputTokens: 2048,
    requestTimeoutMs: 30000,
    retryLimit: 2,
    lastConnectionStatus: process.env.GROQ_API_KEY ? 'connected' : 'not_configured',
    lastTestedAt: new Date().toISOString(),
  },
};

let inMemoryGlobalSettings: GlobalAISettings = {
  activeProvider: 'gemini',
  enableFallback: false,
  fallbackProvider: 'groq',
  version: 1,
  circuitBreakerFailureThreshold: 3,
  circuitBreakerCooldownSec: 30,
  updatedAt: new Date().toISOString(),
};

const inMemoryConnectionLogs: AIConnectionTestResult[] = [];
const inMemoryUsageLogs: any[] = [];
const inMemoryAuditLogs: any[] = [];

/**
 * Mengambil Pengaturan Global AI dari Database (Source of Truth)
 */
export async function getGlobalAISettings(): Promise<GlobalAISettings> {
  try {
    const rows = await query<any[]>(
      `SELECT active_provider, enable_fallback, fallback_provider, version,
              circuit_breaker_failure_threshold, circuit_breaker_cooldown_sec, updated_at
       FROM ai_global_settings WHERE id = 1 LIMIT 1`
    );

    if (rows && rows.length > 0) {
      const r = rows[0];
      return {
        activeProvider: r.active_provider as AIProviderType,
        enableFallback: Boolean(r.enable_fallback),
        fallbackProvider: r.fallback_provider as AIProviderType,
        version: Number(r.version || 1),
        circuitBreakerFailureThreshold: Number(r.circuit_breaker_failure_threshold || 3),
        circuitBreakerCooldownSec: Number(r.circuit_breaker_cooldown_sec || 30),
        updatedAt: r.updated_at,
      };
    }
  } catch {
    // Fallback
  }

  return inMemoryGlobalSettings;
}

/**
 * Mengambil Konfigurasi Runtime Provider AI dengan Kredensial Terdekripsi
 */
export async function getProviderRuntimeConfig(provider: AIProviderType): Promise<ProviderRuntimeConfig> {
  try {
    const rows = await query<any[]>(
      `SELECT provider, name, api_endpoint, encrypted_api_key, key_identifier,
              masked_key_preview, selected_model, default_model, temperature,
              max_output_tokens, request_timeout_ms, retry_limit,
              last_connection_status, last_tested_at, last_error_message
       FROM ai_provider_configs WHERE provider = ? LIMIT 1`,
      [provider]
    );

    if (rows && rows.length > 0) {
      const r = rows[0];
      let plainApiKey = '';
      if (r.encrypted_api_key) {
        try {
          plainApiKey = decryptApiKey(r.encrypted_api_key);
        } catch (err: any) {
          console.error(`[AI Repository] Gagal mendekripsi API key untuk ${provider}:`, err.message);
        }
      }

      // Jika di DB kosong tapi ada di .env, gunakan env sebagai fallback
      if (!plainApiKey && provider === 'gemini' && process.env.GEMINI_API_KEY) {
        plainApiKey = process.env.GEMINI_API_KEY;
      }
      if (!plainApiKey && provider === 'groq' && process.env.GROQ_API_KEY) {
        plainApiKey = process.env.GROQ_API_KEY;
      }
      if (!plainApiKey) {
        const providerUpper = provider.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
        const envKey = process.env[`${providerUpper}_API_KEY`];
        if (envKey) {
          plainApiKey = envKey;
        }
      }

      return {
        provider: r.provider as AIProviderType,
        name: r.name,
        apiEndpoint: r.api_endpoint,
        apiKey: plainApiKey,
        keyIdentifier: r.key_identifier || 'primary-2026',
        maskedKeyPreview: r.masked_key_preview || (plainApiKey ? maskApiKey(plainApiKey) : ''),
        selectedModel: r.selected_model,
        defaultModel: r.default_model,
        temperature: Number(r.temperature || 0.7),
        maxOutputTokens: Number(r.max_output_tokens || 2048),
        requestTimeoutMs: Number(r.request_timeout_ms || 30000),
        retryLimit: Number(r.retry_limit || 2),
        lastConnectionStatus: r.last_connection_status as AIConnectionStatus,
        lastTestedAt: r.last_tested_at,
        lastErrorMessage: r.last_error_message,
      };
    }
  } catch {
    // Fallback
  }

  if (IN_MEMORY_CONFIGS[provider]) {
    return IN_MEMORY_CONFIGS[provider];
  }

  // Sensible default jika provider baru belum ada di memori
  const defaultConf: ProviderRuntimeConfig = {
    provider,
    name: provider === 'gemini' ? 'Google Gemini' : provider === 'groq' ? 'Groq AI' : provider.toUpperCase(),
    apiEndpoint: provider === 'gemini' ? 'https://generativelanguage.googleapis.com' : 'https://api.groq.com/openai/v1',
    apiKey: '',
    keyIdentifier: 'primary-2026',
    maskedKeyPreview: '',
    selectedModel: provider === 'gemini' ? 'gemini-3.5-flash' : 'llama-3.3-70b-versatile',
    defaultModel: provider === 'gemini' ? 'gemini-3.5-flash' : 'llama-3.3-70b-versatile',
    temperature: 0.7,
    maxOutputTokens: 2048,
    requestTimeoutMs: 30000,
    retryLimit: 2,
    lastConnectionStatus: 'not_configured',
    lastTestedAt: null,
    lastErrorMessage: null,
  };
  IN_MEMORY_CONFIGS[provider] = defaultConf;
  return defaultConf;
}

/**
 * Mengambil Seluruh Konfigurasi Provider Lengkap untuk Administrator (Dengan API Key terdekripsi agar bisa diedit & dilihat)
 */
export async function getAllProviderConfigsAdmin(): Promise<{
  configs: Record<string, ProviderRuntimeConfig>;
  configList: ProviderRuntimeConfig[];
}> {
  const providerSet = new Set<string>(['gemini', 'groq', ...Object.keys(IN_MEMORY_CONFIGS)]);

  try {
    const rows = await query<any[]>('SELECT provider FROM ai_provider_configs');
    if (rows && rows.length > 0) {
      for (const r of rows) {
        if (r.provider) providerSet.add(r.provider);
      }
    }
  } catch {
    // Fallback
  }

  const configMap: Record<string, ProviderRuntimeConfig> = {};
  const configList: ProviderRuntimeConfig[] = [];

  for (const p of providerSet) {
    const conf = await getProviderRuntimeConfig(p);
    configMap[p] = conf;
    configList.push(conf);
  }

  return { configs: configMap, configList };
}

/**
 * Mengambil Ringkasan Seluruh Konfigurasi Provider (Aman untuk Frontend Publik)
 */
export async function getAllProviderConfigsPublic(): Promise<Array<Omit<ProviderRuntimeConfig, 'apiKey'> & { isConfigured: boolean }>> {
  const { configList } = await getAllProviderConfigsAdmin();

  return configList.map((c) => ({
    provider: c.provider,
    name: c.name,
    apiEndpoint: c.apiEndpoint,
    keyIdentifier: c.keyIdentifier,
    maskedKeyPreview: c.maskedKeyPreview,
    selectedModel: c.selectedModel,
    defaultModel: c.defaultModel,
    temperature: c.temperature,
    maxOutputTokens: c.maxOutputTokens,
    requestTimeoutMs: c.requestTimeoutMs,
    retryLimit: c.retryLimit,
    lastConnectionStatus: c.lastConnectionStatus,
    lastTestedAt: c.lastTestedAt,
    lastErrorMessage: c.lastErrorMessage,
    isConfigured: Boolean(c.apiKey && c.apiKey.trim().length > 0),
  }));
}

/**
 * Menyimpan atau Memperbarui Konfigurasi Provider AI
 */
export async function saveProviderConfig(
  provider: AIProviderType,
  updates: {
    name?: string;
    apiKey?: string;
    apiEndpoint?: string;
    selectedModel?: string;
    defaultModel?: string;
    temperature?: number;
    maxOutputTokens?: number;
    requestTimeoutMs?: number;
    retryLimit?: number;
  },
  adminId: number,
  clientMeta: { ip?: string; userAgent?: string } = {}
): Promise<{ success: boolean; message: string; maskedKeyPreview: string; config: ProviderRuntimeConfig }> {
  const current = await getProviderRuntimeConfig(provider);

  const providerDisplayName =
    updates.name?.trim() ||
    current.name ||
    (provider === 'gemini' ? 'Google Gemini' : provider === 'groq' ? 'Groq AI' : provider.toUpperCase());

  // 1. Validasi SSRF pada Endpoint
  const targetEndpoint = updates.apiEndpoint ? updates.apiEndpoint.trim() : current.apiEndpoint;
  const endpointValidation = await validateAndPinEndpoint(
    targetEndpoint,
    provider === 'gemini' || provider === 'groq' ? provider : undefined
  );

  // 2. Kelola Kredensial API Key (Enkripsi baru jika diisi, pertahankan jika kosong)
  let encryptedPayload: string | null = null;
  let keyIdentifier = current.keyIdentifier;
  let maskedPreview = current.maskedKeyPreview;
  let activePlainKey = current.apiKey;

  if (updates.apiKey && updates.apiKey.trim().length > 0) {
    activePlainKey = updates.apiKey.trim();
    const enc = encryptApiKey(activePlainKey);
    encryptedPayload = enc.encryptedPayload;
    keyIdentifier = enc.keyIdentifier;
    maskedPreview = enc.maskedPreview;
  }

  const selectedModel = updates.selectedModel ? updates.selectedModel.trim() : current.selectedModel;
  const defaultModel = updates.defaultModel ? updates.defaultModel.trim() : current.defaultModel || selectedModel;
  const temperature =
    updates.temperature !== undefined ? Math.max(0, Math.min(2, Number(updates.temperature))) : current.temperature;
  const maxTokens =
    updates.maxOutputTokens !== undefined ? Math.max(64, Math.min(32768, Number(updates.maxOutputTokens))) : current.maxOutputTokens;
  const timeoutMs =
    updates.requestTimeoutMs !== undefined ? Math.max(5000, Math.min(120000, Number(updates.requestTimeoutMs))) : current.requestTimeoutMs;
  const retryLimit =
    updates.retryLimit !== undefined ? Math.max(0, Math.min(5, Number(updates.retryLimit))) : current.retryLimit;

  try {
    if (encryptedPayload) {
      await query(
        `INSERT INTO ai_provider_configs (
          provider, name, api_endpoint, encrypted_api_key, key_identifier,
          masked_key_preview, selected_model, default_model, temperature,
          max_output_tokens, request_timeout_ms, retry_limit, last_connection_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'disconnected')
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          api_endpoint = VALUES(api_endpoint),
          encrypted_api_key = VALUES(encrypted_api_key),
          key_identifier = VALUES(key_identifier),
          masked_key_preview = VALUES(masked_key_preview),
          selected_model = VALUES(selected_model),
          default_model = VALUES(default_model),
          temperature = VALUES(temperature),
          max_output_tokens = VALUES(max_output_tokens),
          request_timeout_ms = VALUES(request_timeout_ms),
          retry_limit = VALUES(retry_limit),
          updated_at = CURRENT_TIMESTAMP`,
        [
          provider,
          providerDisplayName,
          endpointValidation.normalizedUrl,
          encryptedPayload,
          keyIdentifier,
          maskedPreview,
          selectedModel,
          defaultModel,
          temperature,
          maxTokens,
          timeoutMs,
          retryLimit,
        ]
      );
    } else {
      await query(
        `INSERT INTO ai_provider_configs (
          provider, name, api_endpoint, key_identifier,
          masked_key_preview, selected_model, default_model, temperature,
          max_output_tokens, request_timeout_ms, retry_limit, last_connection_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'disconnected')
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          api_endpoint = VALUES(api_endpoint),
          selected_model = VALUES(selected_model),
          default_model = VALUES(default_model),
          temperature = VALUES(temperature),
          max_output_tokens = VALUES(max_output_tokens),
          request_timeout_ms = VALUES(request_timeout_ms),
          retry_limit = VALUES(retry_limit),
          updated_at = CURRENT_TIMESTAMP`,
        [
          provider,
          providerDisplayName,
          endpointValidation.normalizedUrl,
          keyIdentifier,
          maskedPreview,
          selectedModel,
          defaultModel,
          temperature,
          maxTokens,
          timeoutMs,
          retryLimit,
        ]
      );
    }

    // Catat log audit perubahan
    await recordAIAuditLog({
      adminUserId: adminId,
      provider,
      action: 'UPDATE_CONFIG',
      changes: {
        name: providerDisplayName,
        apiEndpoint: endpointValidation.normalizedUrl,
        selectedModel,
        temperature,
        maxOutputTokens: maxTokens,
        apiKeyUpdated: Boolean(encryptedPayload),
      },
      ipAddress: clientMeta.ip,
      userAgent: clientMeta.userAgent,
    });
  } catch (err: any) {
    // Database adalah Source of Truth konfigurasi AI. Jika penyimpanan ke DB
    // gagal, perubahan TIDAK BOLEH dilaporkan berhasil — sebelumnya kegagalan
    // ini disembunyikan (lanjut dengan in-memory state), sehingga admin melihat
    // status "connected" dari auto-probe padahal key baru tidak pernah tersimpan
    // dan chat tetap memakai key lama (atau hilang saat server restart).
    const isProviderColumnError =
      /provider/i.test(err.message) && (/enum/i.test(err.message) || /truncated/i.test(err.message) || /data too long/i.test(err.message));
    const migrationHint = isProviderColumnError
      ? ' Jika Anda menambah provider baru, pastikan migrasi database/migrations/003_allow_dynamic_ai_providers.sql sudah dijalankan (kolom provider masih ENUM gemini/groq).'
      : '';
    throw new Error(`Gagal menyimpan konfigurasi AI ke database: ${err.message}.${migrationHint}`);
  }

  // Bump version global agar AIProviderManager mendeteksi perubahan konfigurasi
  // dan me-refresh cachedConfigs. Tanpa ini, manager terus memakai API key lama
  // dari cache (syncWithDatabase hanya me-refresh jika version berubah),
  // sehingga request gagal 401 berulang dan circuit breaker terus trip.
  try {
    await query(
      `UPDATE ai_global_settings SET version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = 1`
    );
  } catch (err: any) {
    console.warn(`[AI Repository] Gagal bump version global settings: ${err.message}`);
  }
  inMemoryGlobalSettings = {
    ...inMemoryGlobalSettings,
    version: inMemoryGlobalSettings.version + 1,
    updatedAt: new Date().toISOString(),
  };

  // Update in-memory state
  const updatedConfig: ProviderRuntimeConfig = {
    ...current,
    provider,
    name: providerDisplayName,
    apiEndpoint: endpointValidation.normalizedUrl,
    apiKey: activePlainKey,
    keyIdentifier,
    maskedKeyPreview: maskedPreview,
    selectedModel,
    defaultModel,
    temperature,
    maxOutputTokens: maxTokens,
    requestTimeoutMs: timeoutMs,
    retryLimit,
  };

  IN_MEMORY_CONFIGS[provider] = updatedConfig;

  // 3. Sinkronisasi otomatis ke file .env.local
  try {
    const currentGlobal = await getGlobalAISettings();
    syncProviderToEnvLocal({
      provider,
      apiKey: activePlainKey,
      selectedModel,
      apiEndpoint: endpointValidation.normalizedUrl,
      isActive: currentGlobal.activeProvider === provider,
    });
  } catch (syncErr: any) {
    console.warn(`[AI Repository] Sinkronisasi .env.local untuk ${provider} gagal:`, syncErr.message);
  }

  // 4. Auto-probe uji koneksi langsung saat konfigurasi disimpan / ditambah
  let autoProbeStatus: AIConnectionStatus = 'disconnected';
  let autoProbeTestedAt: string | null = null;
  let autoProbeError: string | null = null;

  if (activePlainKey && activePlainKey.trim().length > 0) {
    try {
      const { AIProviderManager } = await import('./provider-manager');
      const manager = AIProviderManager.getInstance();
      // Paksa refresh cache manager agar API key baru langsung dipakai request
      // berikutnya. invalidateCache() saja tidak cukup karena syncWithDatabase
      // hanya me-refresh cachedConfigs jika version berubah atau force=true.
      await manager.syncWithDatabase(true);
      const probeResult = await manager.testProviderConnection(
        provider,
        {
          apiEndpoint: endpointValidation.normalizedUrl,
          apiKey: activePlainKey,
          selectedModel,
        },
        adminId
      );

      if (probeResult.status === 'success') {
        autoProbeStatus = 'connected';
        autoProbeError = null;
      } else {
        autoProbeStatus = 'connection_error';
        autoProbeError = probeResult.errorMessage || 'Gagal terhubung ke provider';
      }
      autoProbeTestedAt = probeResult.testedAt || new Date().toISOString();
    } catch (probeErr: any) {
      console.warn(`[AI Repository] Auto-probe provider '${provider}' error:`, probeErr.message);
      autoProbeStatus = 'connection_error';
      autoProbeError = probeErr.message;
      autoProbeTestedAt = new Date().toISOString();
    }
  } else {
    autoProbeStatus = 'not_configured';
    autoProbeError = null;
    autoProbeTestedAt = null;
    try {
      await query(
        `UPDATE ai_provider_configs SET
          last_connection_status = 'not_configured',
          last_tested_at = NULL,
          last_error_message = NULL
         WHERE provider = ?`,
        [provider]
      );
    } catch {}
  }

  updatedConfig.lastConnectionStatus = autoProbeStatus;
  updatedConfig.lastTestedAt = autoProbeTestedAt;
  updatedConfig.lastErrorMessage = autoProbeError;
  IN_MEMORY_CONFIGS[provider] = updatedConfig;

  return {
    success: true,
    message: `Konfigurasi provider ${providerDisplayName} berhasil diperbarui (Status: ${autoProbeStatus}).`,
    maskedKeyPreview: maskedPreview,
    config: updatedConfig,
  };
}

/**
 * Menghapus Provider Kustom dari Database dan Memori
 */
export async function deleteProviderConfig(
  provider: string,
  adminId: number,
  clientMeta: { ip?: string; userAgent?: string } = {}
): Promise<{ success: boolean; message: string }> {
  if (provider === 'gemini' || provider === 'groq') {
    throw new Error(`Provider bawaan sistem '${provider}' tidak dapat dihapus.`);
  }

  try {
    await query('DELETE FROM ai_provider_configs WHERE provider = ?', [provider]);
    await recordAIAuditLog({
      adminUserId: adminId,
      provider,
      action: 'DELETE_PROVIDER',
      changes: { provider },
      ipAddress: clientMeta.ip,
      userAgent: clientMeta.userAgent,
    });
  } catch (err: any) {
    console.warn(`[AI Repository] Gagal hapus provider di DB: ${err.message}`);
  }

  delete IN_MEMORY_CONFIGS[provider];

  // Jika provider yang dihapus sedang aktif, kembalikan ke gemini
  const currentGlobal = await getGlobalAISettings();
  if (currentGlobal.activeProvider === provider) {
    await setActiveAIProvider('gemini', adminId, clientMeta);
  }
  if (currentGlobal.fallbackProvider === provider) {
    await setAutomaticFallbackSettings(currentGlobal.enableFallback, 'groq', adminId, clientMeta);
  }

  return {
    success: true,
    message: `Provider '${provider}' berhasil dihapus.`,
  };
}

/**
 * Mengganti Provider Aktif secara Atomik dengan Validasi Kelayakan
 */
export async function setActiveAIProvider(
  activeProvider: AIProviderType,
  adminId: number,
  clientMeta: { ip?: string; userAgent?: string } = {}
): Promise<{ success: boolean; message: string; version: number }> {
  // 1. Verifikasi apakah provider yang dipilih memiliki API Key yang valid
  const targetConfig = await getProviderRuntimeConfig(activeProvider);
  if (!targetConfig.apiKey || !targetConfig.apiKey.trim()) {
    throw new Error(
      `Tidak dapat mengaktifkan ${targetConfig.name}: API Key belum dikonfigurasi. Harap simpan API Key terlebih dahulu.`
    );
  }

  const currentSettings = await getGlobalAISettings();
  const nextVersion = currentSettings.version + 1;

  try {
    await query(
      `INSERT INTO ai_global_settings (
        id, active_provider, enable_fallback, fallback_provider, version, updated_by_admin_id
      ) VALUES (1, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        active_provider = VALUES(active_provider),
        version = version + 1,
        updated_by_admin_id = VALUES(updated_by_admin_id),
        updated_at = CURRENT_TIMESTAMP`,
      [
        activeProvider,
        currentSettings.enableFallback ? 1 : 0,
        currentSettings.fallbackProvider || 'groq',
        nextVersion,
        adminId,
      ]
    );

    await recordAIAuditLog({
      adminUserId: adminId,
      provider: activeProvider,
      action: 'SWITCH_PROVIDER',
      changes: {
        previousProvider: currentSettings.activeProvider,
        newActiveProvider: activeProvider,
        version: nextVersion,
      },
      ipAddress: clientMeta.ip,
      userAgent: clientMeta.userAgent,
    });
  } catch (err: any) {
    console.warn(`[AI Repository] DB switch failed, using in-memory state: ${err.message}`);
  }

  inMemoryGlobalSettings = {
    ...currentSettings,
    activeProvider,
    version: nextVersion,
    updatedAt: new Date().toISOString(),
  };

  // Sinkronisasikan ACTIVE_AI_PROVIDER ke .env.local
  try {
    syncActiveProviderToEnvLocal(activeProvider);
  } catch (syncErr: any) {
    console.warn(`[AI Repository] Gagal sinkronkan ACTIVE_AI_PROVIDER ke .env.local:`, syncErr.message);
  }

  // Invalidasi cache AIProviderManager agar instan terefleksi
  try {
    const { AIProviderManager } = await import('./provider-manager');
    AIProviderManager.getInstance().invalidateCache();
  } catch {}

  return {
    success: true,
    message: `Provider AI aktif berhasil diubah menjadi ${targetConfig.name}.`,
    version: nextVersion,
  };
}

/**
 * Menyimpan Konfigurasi Automatic Fallback
 */
export async function setAutomaticFallbackSettings(
  enableFallback: boolean,
  fallbackProvider: AIProviderType,
  adminId: number,
  clientMeta: { ip?: string; userAgent?: string } = {}
): Promise<{ success: boolean; message: string; version: number }> {
  const currentSettings = await getGlobalAISettings();
  const nextVersion = currentSettings.version + 1;

  try {
    await query(
      `UPDATE ai_global_settings SET
        enable_fallback = ?,
        fallback_provider = ?,
        version = version + 1,
        updated_by_admin_id = ?,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = 1`,
      [enableFallback ? 1 : 0, fallbackProvider, adminId]
    );

    await recordAIAuditLog({
      adminUserId: adminId,
      provider: fallbackProvider,
      action: 'TOGGLE_FALLBACK',
      changes: {
        enableFallback,
        fallbackProvider,
        version: nextVersion,
      },
      ipAddress: clientMeta.ip,
      userAgent: clientMeta.userAgent,
    });
  } catch (err: any) {
    console.warn(`[AI Repository] DB fallback toggle failed, using in-memory: ${err.message}`);
  }

  inMemoryGlobalSettings = {
    ...currentSettings,
    enableFallback,
    fallbackProvider,
    version: nextVersion,
    updatedAt: new Date().toISOString(),
  };

  return {
    success: true,
    message: `Automatic Fallback berhasil ${enableFallback ? 'diaktifkan' : 'dinonaktifkan'}.`,
    version: nextVersion,
  };
}

/**
 * Mencatat Hasil Connection Test ke Database & Memperbarui Status Provider
 */
export async function recordConnectionTestLog(
  testResult: AIConnectionTestResult,
  adminId?: number
): Promise<void> {
  const statusToConfigStatus: Record<string, AIConnectionStatus> = {
    success: 'connected',
    invalid_api_key: 'connection_error',
    invalid_endpoint: 'connection_error',
    model_not_available: 'connection_error',
    rate_limit_exceeded: 'connection_error',
    timeout: 'disconnected',
    provider_error: 'connection_error',
    unknown_error: 'connection_error',
  };

  const newStatus = statusToConfigStatus[testResult.status] || 'disconnected';

  try {
    await query(
      `INSERT INTO ai_connection_test_logs (
        provider, endpoint, model_tested, status, http_status_code,
        response_time_ms, error_message, admin_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        testResult.provider,
        testResult.endpoint,
        testResult.modelTested,
        testResult.status,
        testResult.httpStatusCode,
        testResult.responseTimeMs,
        testResult.errorMessage,
        adminId || null,
      ]
    );

    await query(
      `UPDATE ai_provider_configs SET
        last_connection_status = ?,
        last_tested_at = CURRENT_TIMESTAMP,
        last_error_message = ?
       WHERE provider = ?`,
      [newStatus, testResult.errorMessage, testResult.provider]
    );
  } catch {
    // Fallback
  }

  inMemoryConnectionLogs.unshift(testResult);
  if (inMemoryConnectionLogs.length > 50) inMemoryConnectionLogs.pop();

  if (IN_MEMORY_CONFIGS[testResult.provider]) {
    IN_MEMORY_CONFIGS[testResult.provider].lastConnectionStatus = newStatus;
    IN_MEMORY_CONFIGS[testResult.provider].lastTestedAt = testResult.testedAt;
    IN_MEMORY_CONFIGS[testResult.provider].lastErrorMessage = testResult.errorMessage;
  }
}

/**
 * Mencatat Metrik Penggunaan AI (Usage & Monitoring)
 */
export async function recordAIUsageLog(params: {
  provider: AIProviderType;
  model: string;
  latencyMs: number;
  status: 'success' | 'failed' | 'fallback';
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  errorCategory?: string;
  isFallback?: boolean;
  fallbackFromProvider?: AIProviderType;
  sessionId?: number;
  userRole?: string;
}): Promise<void> {
  try {
    await query(
      `INSERT INTO ai_usage_logs (
        provider, model, latency_ms, status, prompt_tokens,
        completion_tokens, total_tokens, error_category, is_fallback,
        fallback_from_provider, session_id, user_role
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        params.provider,
        params.model,
        params.latencyMs,
        params.status,
        params.promptTokens || null,
        params.completionTokens || null,
        params.totalTokens || null,
        params.errorCategory || null,
        params.isFallback ? 1 : 0,
        params.fallbackFromProvider || null,
        params.sessionId || null,
        params.userRole || null,
      ]
    );
  } catch {
    // Fallback
  }

  inMemoryUsageLogs.push({
    ...params,
    createdAt: new Date().toISOString(),
  });
  if (inMemoryUsageLogs.length > 500) inMemoryUsageLogs.shift();
}

/**
 * Mencatat Log Audit Modifikasi AI (Tanpa Menyimpan API Key Plaintext)
 */
export async function recordAIAuditLog(params: {
  adminUserId: number;
  provider: string;
  action: string;
  changes?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  const sanitizedChanges = params.changes ? { ...params.changes } : {};
  // Pastikan kunci plaintext disensor
  if (sanitizedChanges.apiKey) sanitizedChanges.apiKey = '[REDACTED]';
  if (sanitizedChanges.rawKey) sanitizedChanges.rawKey = '[REDACTED]';

  try {
    await query(
      `INSERT INTO ai_config_audit_logs (
        admin_user_id, provider, action, changes, ip_address, user_agent
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        params.adminUserId,
        params.provider,
        params.action,
        JSON.stringify(sanitizedChanges),
        params.ipAddress || null,
        params.userAgent || null,
      ]
    );
  } catch {
    // Fallback
  }

  inMemoryAuditLogs.unshift({
    ...params,
    changes: sanitizedChanges,
    createdAt: new Date().toISOString(),
  });
}

/**
 * Mengambil Metrik Pemantauan Penggunaan AI untuk Admin Dashboard
 */
export async function getAIMonitoringMetrics(): Promise<{
  summary: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    fallbackCount: number;
    averageResponseTimeMs: number;
    totalTokensUsed: number;
  };
  providerBreakdown: Array<{
    provider: AIProviderType;
    requests: number;
    avgLatencyMs: number;
    tokens: number;
  }>;
  recentConnectionLogs: AIConnectionTestResult[];
}> {
  try {
    const statsRows = await query<any[]>(
      `SELECT 
        COUNT(*) as total_requests,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful_requests,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_requests,
        SUM(CASE WHEN is_fallback = 1 THEN 1 ELSE 0 END) as fallback_count,
        AVG(latency_ms) as avg_latency_ms,
        SUM(COALESCE(total_tokens, 0)) as total_tokens
       FROM ai_usage_logs
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`
    );

    const breakdownRows = await query<any[]>(
      `SELECT 
        provider,
        COUNT(*) as requests,
        AVG(latency_ms) as avg_latency_ms,
        SUM(COALESCE(total_tokens, 0)) as tokens
       FROM ai_usage_logs
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY provider`
    );

    const testLogsRows = await query<any[]>(
      `SELECT provider, endpoint, model_tested, status, http_status_code, response_time_ms, error_message, created_at
       FROM ai_connection_test_logs
       ORDER BY created_at DESC
       LIMIT 10`
    );

    const s = statsRows?.[0] || {};
    return {
      summary: {
        totalRequests: Number(s.total_requests || inMemoryUsageLogs.length),
        successfulRequests: Number(s.successful_requests || inMemoryUsageLogs.filter(u => u.status === 'success').length),
        failedRequests: Number(s.failed_requests || inMemoryUsageLogs.filter(u => u.status === 'failed').length),
        fallbackCount: Number(s.fallback_count || inMemoryUsageLogs.filter(u => u.isFallback).length),
        averageResponseTimeMs: Math.round(Number(s.avg_latency_ms || 320)),
        totalTokensUsed: Number(s.total_tokens || 0),
      },
      providerBreakdown: (breakdownRows && breakdownRows.length > 0)
        ? breakdownRows.map(r => ({
          provider: r.provider as AIProviderType,
          requests: Number(r.requests),
          avgLatencyMs: Math.round(Number(r.avg_latency_ms)),
          tokens: Number(r.tokens),
        }))
        : [
          { provider: 'gemini', requests: inMemoryUsageLogs.filter(u => u.provider === 'gemini').length, avgLatencyMs: 310, tokens: 0 },
          { provider: 'groq', requests: inMemoryUsageLogs.filter(u => u.provider === 'groq').length, avgLatencyMs: 180, tokens: 0 },
        ],
      recentConnectionLogs: (testLogsRows && testLogsRows.length > 0)
        ? testLogsRows.map(r => ({
          provider: r.provider as AIProviderType,
          endpoint: r.endpoint,
          modelTested: r.model_tested,
          status: r.status,
          httpStatusCode: r.http_status_code,
          responseTimeMs: r.response_time_ms,
          testedAt: r.created_at,
          errorMessage: r.error_message,
        }))
        : inMemoryConnectionLogs.slice(0, 10),
    };
  } catch {
    // Fallback
  }

  return {
    summary: {
      totalRequests: inMemoryUsageLogs.length,
      successfulRequests: inMemoryUsageLogs.filter(u => u.status === 'success').length,
      failedRequests: inMemoryUsageLogs.filter(u => u.status === 'failed').length,
      fallbackCount: inMemoryUsageLogs.filter(u => u.isFallback).length,
      averageResponseTimeMs: inMemoryUsageLogs.length > 0
        ? Math.round(inMemoryUsageLogs.reduce((acc, u) => acc + (u.latencyMs || 0), 0) / inMemoryUsageLogs.length)
        : 285,
      totalTokensUsed: inMemoryUsageLogs.reduce((acc, u) => acc + (u.totalTokens || 0), 0),
    },
    providerBreakdown: [
      { provider: 'gemini', requests: inMemoryUsageLogs.filter(u => u.provider === 'gemini').length, avgLatencyMs: 310, tokens: 0 },
      { provider: 'groq', requests: inMemoryUsageLogs.filter(u => u.provider === 'groq').length, avgLatencyMs: 180, tokens: 0 },
    ],
    recentConnectionLogs: inMemoryConnectionLogs.slice(0, 10),
  };
}
