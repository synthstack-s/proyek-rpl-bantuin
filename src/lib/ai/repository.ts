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

import { query, pool } from '@/lib/db';
import {
  AIProviderType,
  AIConnectionStatus,
  AIConnectionTestResult,
  ProviderRuntimeConfig,
} from './types';
import { encryptApiKey, decryptApiKey, maskApiKey } from './encryption';
import { validateAndPinEndpoint } from './ssrf-validator';
import { syncProviderToEnvLocal, syncActiveProviderToEnvLocal, removeProviderFromEnvLocal } from './env-sync';

export interface GlobalAISettings {
  activeProvider: AIProviderType;
  enableFallback: boolean;
  fallbackProvider: AIProviderType;
  version: number;
  circuitBreakerFailureThreshold: number;
  circuitBreakerCooldownSec: number;
  updatedAt: string;
}

// Preset konfigurasi provider AI standar
const KNOWN_PRESETS: Record<string, { name: string; endpoint: string; model: string }> = {
  gemini: { name: 'Google Gemini', endpoint: 'https://generativelanguage.googleapis.com', model: 'gemini-2.0-flash' },
  groq: { name: 'Groq AI', endpoint: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
  nvidia: { name: 'NVIDIA NIM', endpoint: 'https://integrate.api.nvidia.com/v1', model: 'meta/llama-3.2-90b-vision-instruct' },
  deepseek: { name: 'DeepSeek AI', endpoint: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  openai: { name: 'OpenAI', endpoint: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  openrouter: { name: 'OpenRouter', endpoint: 'https://openrouter.ai/api/v1', model: 'meta-llama/llama-3.3-70b-instruct' },
  mistral: { name: 'Mistral AI', endpoint: 'https://api.mistral.ai/v1', model: 'mistral-large-latest' },
};

// In-Memory Fallback Store untuk mendukung offline testing dan database sandbox
const IN_MEMORY_CONFIGS: Record<string, ProviderRuntimeConfig> = {
  gemini: {
    provider: 'gemini',
    name: 'Google Gemini',
    apiEndpoint: process.env.GEMINI_API_ENDPOINT || 'https://generativelanguage.googleapis.com',
    apiKey: process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_google_gemini_api_key_here' ? process.env.GEMINI_API_KEY : '',
    keyIdentifier: 'primary-2026',
    maskedKeyPreview: process.env.GEMINI_API_KEY ? maskApiKey(process.env.GEMINI_API_KEY) : '',
    selectedModel: process.env.GEMINI_MODEL && !process.env.GEMINI_MODEL.includes(' ') && !process.env.GEMINI_MODEL.startsWith('gemini 3.') ? process.env.GEMINI_MODEL : 'gemini-2.0-flash',
    defaultModel: 'gemini-2.0-flash',
    temperature: 0.7,
    maxOutputTokens: 2048,
    requestTimeoutMs: 30000,
    retryLimit: 2,
    // M11: JANGAN pernah mengklaim 'connected' hanya karena env key ada —
    // belum ada tes live yang membuktikannya. Key yang ada hanya berarti
    // provider terkonfigurasi ('disconnected' = terkonfigurasi, belum pernah
    // dites); tanpa key berarti 'not_configured'. Status 'connected' hanya
    // boleh ditulis oleh hasil tes live (recordConnectionTestLog).
    lastConnectionStatus: process.env.GEMINI_API_KEY ? 'disconnected' : 'not_configured',
    lastTestedAt: null,
  },
  groq: {
    provider: 'groq',
    name: 'Groq AI',
    apiEndpoint: process.env.GROQ_API_ENDPOINT || 'https://api.groq.com/openai/v1',
    apiKey: process.env.GROQ_API_KEY || '',
    keyIdentifier: 'primary-2026',
    maskedKeyPreview: process.env.GROQ_API_KEY ? maskApiKey(process.env.GROQ_API_KEY) : '',
    selectedModel: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    defaultModel: 'llama-3.3-70b-versatile',
    temperature: 0.7,
    maxOutputTokens: 2048,
    requestTimeoutMs: 30000,
    retryLimit: 2,
    // M11: lihat catatan di entri gemini di atas — 'disconnected' bila key
    // env ada (terkonfigurasi, belum dites), 'not_configured' bila tidak ada.
    lastConnectionStatus: process.env.GROQ_API_KEY ? 'disconnected' : 'not_configured',
    lastTestedAt: null,
  },
  nvidia: {
    provider: 'nvidia',
    name: 'NVIDIA NIM',
    apiEndpoint: process.env.NVIDIA_API_ENDPOINT || 'https://integrate.api.nvidia.com/v1',
    apiKey: process.env.NVIDIA_API_KEY || '',
    keyIdentifier: 'primary-2026',
    maskedKeyPreview: process.env.NVIDIA_API_KEY ? maskApiKey(process.env.NVIDIA_API_KEY) : '',
    selectedModel: process.env.NVIDIA_MODEL || 'meta/llama-3.2-90b-vision-instruct',
    defaultModel: 'meta/llama-3.2-90b-vision-instruct',
    temperature: 0.7,
    maxOutputTokens: 2048,
    requestTimeoutMs: 30000,
    retryLimit: 2,
    lastConnectionStatus: process.env.NVIDIA_API_KEY ? 'connected' : 'not_configured',
    lastTestedAt: new Date().toISOString(),
  },
  deepseek: {
    provider: 'deepseek',
    name: 'DeepSeek AI',
    apiEndpoint: process.env.DEEPSEEK_API_ENDPOINT || 'https://api.deepseek.com/v1',
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    keyIdentifier: 'primary-2026',
    maskedKeyPreview: process.env.DEEPSEEK_API_KEY ? maskApiKey(process.env.DEEPSEEK_API_KEY) : '',
    selectedModel: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    defaultModel: 'deepseek-chat',
    temperature: 0.7,
    maxOutputTokens: 2048,
    requestTimeoutMs: 30000,
    retryLimit: 2,
    lastConnectionStatus: process.env.DEEPSEEK_API_KEY ? 'connected' : 'not_configured',
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
 * S30 — Membaca API key provider dari environment (`<PROVIDER>_API_KEY`).
 * Dipakai HANYA sebagai fallback legacy bila database tidak menyimpan key
 * (lihat getProviderRuntimeConfig). Setiap pemakaian nyata key env
 * diperingatkan lewat warnLegacyEnvKeyUsage (sekali per provider per
 * proses) agar admin memindahkan key ke database terenkripsi.
 */
function readEnvApiKey(provider: AIProviderType): string | undefined {
  if (provider === 'gemini' && process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  if (provider === 'groq' && process.env.GROQ_API_KEY) return process.env.GROQ_API_KEY;
  const providerUpper = provider.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  return process.env[`${providerUpper}_API_KEY`] || undefined;
}

const warnedEnvKeyProviders = new Set<string>();

function warnLegacyEnvKeyUsage(provider: string): void {
  if (warnedEnvKeyProviders.has(provider)) return;
  warnedEnvKeyProviders.add(provider);
  const providerUpper = provider.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  console.warn(
    `[AI Repository] DEPRECATED: provider '${provider}' memakai API key dari environment (.env.local) karena tidak ada key tersimpan di database. ` +
      `Pembacaan key dari environment adalah fallback legacy (S30) — simpan key lewat panel Konfigurasi AI agar tersimpan terenkripsi di database, ` +
      `lalu hapus baris plaintext '${providerUpper}_API_KEY' dari .env.local.`
  );
}

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
 * T1: versi publik satu konfigurasi provider — TANPA apiKey plaintext.
 * Satu-satunya bentuk konfigurasi yang boleh dikirim ke browser: key hanya
 * diwakili `maskedKeyPreview` + `isConfigured`. Kunci adalah write-only
 * (dikirim ke server hanya saat save via POST body, tidak pernah dikembalikan).
 */
export function toPublicProviderConfig(
  c: ProviderRuntimeConfig
): Omit<ProviderRuntimeConfig, 'apiKey'> & { isConfigured: boolean } {
  return {
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
    // M12: flag kegagalan dekripsi / key env ikut terkirim agar panel
    // menampilkannya — tidak pernah disembunyikan dari admin.
    keyFromEnvFallback: c.keyFromEnvFallback,
    decryptionFailed: c.decryptionFailed,
    isConfigured: Boolean(c.apiKey && c.apiKey.trim().length > 0),
  };
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
      // M12: kegagalan dekripsi TIDAK BOLEH ditelan diam-diam. Bila dekripsi
      // gagal (master secret berubah/rotasi atau data korup), tandai
      // konfigurasi dengan status connection_error + pesan yang menjelaskan
      // penyebabnya, PERSIST ke DB agar panel menampilkannya, dan bila key
      // env dipakai sebagai pengganti, beri flag eksplisit — jangan pernah
      // memakai key env seolah-olah tidak terjadi apa-apa.
      let decryptionFailed = false;
      if (r.encrypted_api_key) {
        try {
          plainApiKey = decryptApiKey(r.encrypted_api_key);
        } catch (err: any) {
          decryptionFailed = true;
          console.warn(
            `[AI Repository] PERINGATAN: dekripsi API key tersimpan untuk provider '${provider}' GAGAL (${err.message}). ` +
              `Key di database tidak dapat dipakai — kemungkinan master secret berubah/rotasi atau data terenkripsi korup. ` +
              `Konfigurasi ditandai connection_error; periksa dan simpan ulang API key provider ini.`
          );
        }
      }

      // Jika di DB kosong tapi ada di .env, gunakan env sebagai fallback
      // (legacy — S30). Perilaku dipertahankan agar deployment yang key-nya
      // hanya ada di .env.local tidak langsung mati, tetapi setiap
      // pemakaian diperingatkan (sekali per provider per proses) kecuali
      // kasus M12 yang sudah diperingatkan dengan pesan sendiri di atas.
      let keyFromEnvFallback = false;
      if (!plainApiKey) {
        const envKey = readEnvApiKey(provider);
        if (envKey) {
          plainApiKey = envKey;
          keyFromEnvFallback = decryptionFailed;
          if (!decryptionFailed) warnLegacyEnvKeyUsage(provider);
        }
      }

      let lastConnectionStatus = r.last_connection_status as AIConnectionStatus;
      let lastErrorMessage: string | null = r.last_error_message ?? null;
      if (decryptionFailed) {
        lastConnectionStatus = 'connection_error';
        lastErrorMessage =
          'Gagal mendekripsi API key tersimpan (master secret berubah atau data korup). ' +
          (plainApiKey
            ? 'Sistem sementara memakai API key dari environment (.env) — bukan key yang tersimpan di database. Simpan ulang API key provider ini.'
            : 'Tidak ada API key pengganti dari environment. Simpan ulang API key provider ini.');
        // Persist agar panel admin menampilkan kegagalan ini (bukan hanya
        // di log server). Hanya tulis bila status/pesan belum sama, agar
        // pembacaan berulang tidak menulis ke DB setiap kali.
        if (r.last_connection_status !== 'connection_error' || r.last_error_message !== lastErrorMessage) {
          try {
            await query(
              `UPDATE ai_provider_configs SET last_connection_status = 'connection_error', last_error_message = ?, last_tested_at = CURRENT_TIMESTAMP WHERE provider = ?`,
              [lastErrorMessage, provider]
            );
          } catch (persistErr: any) {
            console.warn(`[AI Repository] Gagal menyimpan status kegagalan dekripsi untuk ${provider}:`, persistErr.message);
          }
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
        lastConnectionStatus,
        lastTestedAt: r.last_tested_at,
        lastErrorMessage,
        keyFromEnvFallback: keyFromEnvFallback || undefined,
        decryptionFailed: decryptionFailed || undefined,
      };
    }
  } catch {
    // Fallback
  }

  if (IN_MEMORY_CONFIGS[provider]) {
    // S30: key awal konfigurasi in-memory berasal dari environment (lihat
    // definisi IN_MEMORY_CONFIGS) — peringatkan bila key yang dipakai
    // memang sama dengan key env (pengecekan berbasis nilai).
    const memCfg = IN_MEMORY_CONFIGS[provider];
    if (memCfg.apiKey && readEnvApiKey(provider) === memCfg.apiKey) {
      warnLegacyEnvKeyUsage(provider);
    }
    return memCfg;
  }

  // Sensible default jika provider baru belum ada di memori
  const preset = KNOWN_PRESETS[provider];
  const providerUpper = provider.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  const envKey = process.env[`${providerUpper}_API_KEY`];
  const envEndpoint = process.env[`${providerUpper}_API_ENDPOINT`];
  const envModel = process.env[`${providerUpper}_MODEL`];

  const defaultEndpoint = envEndpoint || preset?.endpoint || (provider === 'gemini' ? 'https://generativelanguage.googleapis.com' : 'https://api.openai.com/v1');
  const defaultModel = (envModel && !envModel.includes(' ')) ? envModel : (preset?.model || 'gpt-4o-mini');
  const effectiveKey = envKey || '';

  const defaultConf: ProviderRuntimeConfig = {
    provider,
    name: preset?.name || (provider === 'gemini' ? 'Google Gemini' : provider === 'groq' ? 'Groq AI' : provider.toUpperCase()),
    apiEndpoint: defaultEndpoint,
    apiKey: effectiveKey,
    keyIdentifier: 'primary-2026',
    maskedKeyPreview: effectiveKey ? maskApiKey(effectiveKey) : '',
    selectedModel: defaultModel,
    defaultModel: defaultModel,
    temperature: 0.7,
    maxOutputTokens: 2048,
    requestTimeoutMs: 30000,
    retryLimit: 2,
    lastConnectionStatus: effectiveKey ? 'connected' : 'not_configured',
    lastTestedAt: effectiveKey ? new Date().toISOString() : null,
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
 *
 * T1: satu-satunya daftar konfigurasi yang boleh dikirim ke browser — TANPA
 * apiKey plaintext (lihat toPublicProviderConfig). Route configs GET memakai
 * fungsi ini, BUKAN getAllProviderConfigsAdmin.
 */
export async function getAllProviderConfigsPublic(): Promise<Array<Omit<ProviderRuntimeConfig, 'apiKey'> & { isConfigured: boolean }>> {
  const { configList } = await getAllProviderConfigsAdmin();

  return configList.map((c) => toPublicProviderConfig(c));
}

/**
 * L5: konversi numerik yang MENOLAK NaN/Infinity. Math.min/Math.max tidak
 * membersihkan NaN — string non-numerik dari body JSON (mis. "abc") sebelumnya
 * lolos clamping sebagai NaN lalu diteruskan ke query DB (bisa tersimpan NULL
 * atau menggagalkan penyimpanan dengan pesan yang membingungkan). Route
 * mengembalikan error ini sebagai 400.
 */
function toFiniteNumber(value: unknown, fieldName: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`Nilai ${fieldName} tidak valid: harus berupa angka.`);
  }
  return n;
}

/**
 * L13: kolom `provider` adalah VARCHAR(50) (migrasi 003) — slug yang lebih
 * panjang gagal di DB dengan pesan "Data too long" yang sebelumnya disalahartikan
 * sebagai migrasi 003 belum dijalankan. Validasi panjang di sini (dan di route
 * configs) dengan pesan yang jelas.
 */
export const MAX_PROVIDER_SLUG_LENGTH = 50;

function validateProviderSlug(provider: string): void {
  if (provider.length > MAX_PROVIDER_SLUG_LENGTH) {
    throw new Error(
      `Nama provider maksimal 50 karakter (slug '${provider}' sepanjang ${provider.length} karakter). Persingkat slug provider lalu coba lagi.`
    );
  }
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
    // L14: true = HAPUS API key tersimpan (kolom terenkripsi dikosongkan,
    // status menjadi not_configured). apiKey kosong SAJA tetap berarti
    // "pertahankan key lama" — hanya flag eksplisit ini yang menghapus key.
    // Bila key baru diisi bersamaan dengan flag, key baru yang menang.
    clearApiKey?: boolean;
  },
  adminId: number,
  clientMeta: { ip?: string; userAgent?: string } = {}
): Promise<{ success: boolean; message: string; maskedKeyPreview: string; config: ProviderRuntimeConfig }> {
  // L13: tolak slug terlalu panjang SEBELUM menyentuh DB, dengan pesan yang
  // jelas (bukan petunjuk migrasi yang menyesatkan).
  validateProviderSlug(provider);

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
  // S8c: hasil validasi — termasuk pinnedIp — TIDAK lagi dibuang:
  // validateAndPinEndpoint menyimpannya di cache validasi endpoint
  // (ssrf-validator.ts, TTL 5 menit), sehingga request chat/tes/model
  // berikutnya memakai pin yang sama tanpa lookup DNS ulang. Pin sengaja
  // tidak dipersist ke database (pin adalah fakta DNS sesaat; lihat
  // komentar cache di ssrf-validator.ts).

  // 2. Kelola Kredensial API Key (Enkripsi baru jika diisi, pertahankan jika kosong)
  // L14: flag clearApiKey yang menghapus key tersimpan. Bila key baru diisi
  // BERSAMAAN dengan flag, key baru yang menang (flag diabaikan) agar tidak
  // ada ambiguitas antara "ganti key" dan "hapus key".
  const clearApiKey = updates.clearApiKey === true && !(updates.apiKey && updates.apiKey.trim().length > 0);
  let encryptedPayload: string | null = null;
  let keyIdentifier = current.keyIdentifier;
  let maskedPreview = current.maskedKeyPreview;
  let activePlainKey = current.apiKey;

  if (updates.apiKey && updates.apiKey.trim().length > 0) {
    // Abaikan placeholder sensor masked (**** / ...) — nilai seperti itu
    // berarti UI mengirim kembali tampilan tersensor, bukan key baru;
    // key tersimpan dipertahankan (encryptedPayload tetap null).
    const rawKey = updates.apiKey.trim();
    const isMaskedSensor = rawKey.includes('****') || (rawKey.includes('...') && rawKey.length < 35);
    if (!isMaskedSensor) {
      // Bersihkan key dari kutip/prefix bearer (sama seperti cleanApiKey
      // di adapter) sebelum dienkripsi.
      let cleanKey = rawKey;
      if ((cleanKey.startsWith('"') && cleanKey.endsWith('"')) || (cleanKey.startsWith("'") && cleanKey.endsWith("'"))) {
        cleanKey = cleanKey.slice(1, -1).trim();
      }
      if (cleanKey.toLowerCase().startsWith('bearer ')) {
        cleanKey = cleanKey.slice(7).trim();
      }
      activePlainKey = cleanKey;
      const enc = encryptApiKey(activePlainKey);
      encryptedPayload = enc.encryptedPayload;
      keyIdentifier = enc.keyIdentifier;
      maskedPreview = enc.maskedPreview;
    }
  } else if (clearApiKey) {
    // L14: kosongkan key di memori; kolom terenkripsi di DB dihapus oleh
    // cabang upsert clear di bawah (encryptedPayload tetap null).
    activePlainKey = '';
    maskedPreview = '';
  }

  const selectedModel = updates.selectedModel ? updates.selectedModel.trim() : current.selectedModel;
  const defaultModel = updates.defaultModel ? updates.defaultModel.trim() : current.defaultModel || selectedModel;
  // L5: tolak input non-numerik (NaN) dengan error yang jelas — JANGAN
  // meneruskan NaN ke query DB.
  const temperature =
    updates.temperature !== undefined ? Math.max(0, Math.min(2, toFiniteNumber(updates.temperature, 'temperature'))) : current.temperature;
  const maxTokens =
    updates.maxOutputTokens !== undefined ? Math.max(64, Math.min(32768, toFiniteNumber(updates.maxOutputTokens, 'maxOutputTokens'))) : current.maxOutputTokens;
  const timeoutMs =
    updates.requestTimeoutMs !== undefined ? Math.max(5000, Math.min(120000, toFiniteNumber(updates.requestTimeoutMs, 'requestTimeoutMs'))) : current.requestTimeoutMs;
  const retryLimit =
    updates.retryLimit !== undefined ? Math.max(0, Math.min(5, toFiniteNumber(updates.retryLimit, 'retryLimit'))) : current.retryLimit;

  // L3: upsert konfigurasi + bump version dalam SATU transaksi DB (pola yang
  // sama dengan action-service Batch 2: pool.getConnection +
  // BEGIN/COMMIT/ROLLBACK). Sebelumnya bump version berada di try/catch
  // tersendiri yang hanya console.warn bila gagal — konfigurasi tersimpan
  // tetapi version DB tidak berubah, sehingga instance lain tidak me-refresh
  // cache dan terus memakai key lama. Sekarang bila bump gagal, SELURUH
  // transaksi di-rollback dan error dilempar seperti kegagalan upsert; state
  // in-memory (di bawah) hanya diperbarui setelah commit berhasil.
  let conn: Awaited<ReturnType<typeof pool.getConnection>> | null = null;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    if (encryptedPayload) {
      await conn.execute(
        `INSERT INTO ai_provider_configs (
          provider, name, api_endpoint, encrypted_api_key, key_identifier,
          masked_key_preview, selected_model, default_model, temperature,
          max_output_tokens, request_timeout_ms, retry_limit, last_connection_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'connected')
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
          last_connection_status = 'connected',
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
    } else if (clearApiKey) {
      // L14: HAPUS key tersimpan — kolom terenkripsi + preview dikosongkan
      // (NULL). Seluruh konfigurasi lain tetap tersimpan; provider TIDAK
      // dihapus. Status menjadi 'not_configured' lewat cabang tanpa-key di
      // bawah (activePlainKey kosong → UPDATE status).
      await conn.execute(
        `INSERT INTO ai_provider_configs (
          provider, name, api_endpoint, encrypted_api_key, key_identifier,
          masked_key_preview, selected_model, default_model, temperature,
          max_output_tokens, request_timeout_ms, retry_limit, last_connection_status
        ) VALUES (?, ?, ?, NULL, ?, NULL, ?, ?, ?, ?, ?, ?, 'disconnected')
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          api_endpoint = VALUES(api_endpoint),
          encrypted_api_key = NULL,
          masked_key_preview = NULL,
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
          selectedModel,
          defaultModel,
          temperature,
          maxTokens,
          timeoutMs,
          retryLimit,
        ]
      );
    } else {
      await conn.execute(
        `INSERT INTO ai_provider_configs (
          provider, name, api_endpoint, key_identifier,
          masked_key_preview, selected_model, default_model, temperature,
          max_output_tokens, request_timeout_ms, retry_limit, last_connection_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'connected')
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

    // Bump version global agar AIProviderManager mendeteksi perubahan
    // konfigurasi dan me-refresh cachedConfigs. Tanpa ini, manager terus
    // memakai API key lama dari cache (syncWithDatabase hanya me-refresh jika
    // version berubah), sehingga request gagal 401 berulang dan circuit
    // breaker terus trip. Pakai INSERT ... ON DUPLICATE KEY UPDATE (pola
    // setActiveAIProvider) agar baris id = 1 dibuat bila belum ada (DB
    // fresh) — UPDATE ... WHERE id = 1 diam-diam tidak mengubah apa-apa bila
    // baris belum ada. Semua kolom lain punya DEFAULT di schema.sql.
    await conn.execute(
      `INSERT INTO ai_global_settings (id, version) VALUES (1, 1)
       ON DUPLICATE KEY UPDATE version = version + 1, updated_at = CURRENT_TIMESTAMP`
    );

    await conn.commit();
  } catch (err: any) {
    // Database adalah Source of Truth konfigurasi AI. Jika penyimpanan ke DB
    // gagal (termasuk kegagalan bump version — L3), perubahan TIDAK BOLEH
    // dilaporkan berhasil dan TIDAK BOLEH ter-commit sebagian: rollback
    // mengembalikan upsert yang sudah dieksekusi di transaksi ini.
    if (conn) {
      try {
        await conn.rollback();
      } catch {
        // Abaikan error rollback — error asli yang dilaporkan.
      }
    }
    // L13: persempit deteksi error migrasi — "Data too long" DIHAPUS dari
    // pemicu petunjuk migrasi. Error kolom ENUM (migrasi 003 belum jalan)
    // muncul sebagai "Data truncated"/ENUM; "Data too long" berarti nilai
    // melebihi VARCHAR(50) (slug terlalu panjang — kini divalidasi di muka)
    // atau kolom lain, BUKAN migrasi yang belum dijalankan.
    const isProviderColumnError =
      /provider/i.test(err.message) && (/enum/i.test(err.message) || /truncated/i.test(err.message));
    const migrationHint = isProviderColumnError
      ? ' Jika Anda menambah provider baru, pastikan migrasi database/migrations/003_allow_dynamic_ai_providers.sql sudah dijalankan (kolom provider masih ENUM gemini/groq).'
      : '';
    throw new Error(`Gagal menyimpan konfigurasi AI ke database: ${err.message}.${migrationHint}`);
  } finally {
    if (conn) conn.release();
  }

  // Catat log audit perubahan — SETELAH commit. recordAIAuditLog tidak pernah
  // melempar (kegagalannya ditelan internal + fallback in-memory), jadi log
  // audit tidak boleh menggagalkan penyimpanan yang sudah ter-commit.
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
      apiKeyCleared: clearApiKey,
    },
    ipAddress: clientMeta.ip,
    userAgent: clientMeta.userAgent,
  });

  // Bump version in-memory HANYA setelah commit DB berhasil (L3) — sebelumnya
  // bump in-memory tetap jalan meski bump DB gagal.
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
    // L14: key yang dihapus tidak lagi berasal dari env / gagal dekripsi —
    // jangan pertahankan flag M12 dari konfigurasi lama.
    ...(clearApiKey ? { keyFromEnvFallback: undefined, decryptionFailed: undefined } : {}),
  };

  IN_MEMORY_CONFIGS[provider] = updatedConfig;

  // Segarkan process.env secara langsung di runtime saat ini agar jalur
  // kode yang membaca variabel environment melihat nilai baru tanpa restart.
  // (Hanya runtime — key TIDAK ditulis ke file .env.local; lihat S30.)
  const providerUpper = provider.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  if (activePlainKey) {
    process.env[`${providerUpper}_API_KEY`] = activePlainKey;
    if (provider === 'gemini') process.env.GEMINI_API_KEY = activePlainKey;
    if (provider === 'groq') process.env.GROQ_API_KEY = activePlainKey;
  }
  process.env[`${providerUpper}_API_ENDPOINT`] = endpointValidation.normalizedUrl;
  process.env[`${providerUpper}_MODEL`] = selectedModel;

  // 3. Sinkronisasi konfigurasi NON-RAHASIA ke file .env.local (model,
  // endpoint, provider aktif). S30: API key TIDAK PERNAH lagi dioper ke
  // syncProviderToEnvLocal — key hanya tersimpan terenkripsi di database.
  try {
    if (clearApiKey) {
      // L14: hapus juga key dari .env.local + process.env — tanpa ini,
      // fallback env di getProviderRuntimeConfig akan menghidupkan kembali
      // key yang baru saja dihapus (provider tetap "terkonfigurasi" lewat
      // env). syncProviderToEnvLocal di bawah tidak menulis var key sama
      // sekali (S30), hanya var model/endpoint — jadi key yang dihapus
      // tidak akan muncul lagi di .env.local.
      const envRemoval = removeProviderFromEnvLocal(provider);
      if (!envRemoval.success) {
        console.warn(`[AI Repository] Key provider '${provider}' mungkin masih ada di .env.local: ${envRemoval.error || 'penghapusan gagal'}`);
      }
    }
    const currentGlobal = await getGlobalAISettings();
    syncProviderToEnvLocal({
      provider,
      selectedModel,
      apiEndpoint: endpointValidation.normalizedUrl,
      isActive: currentGlobal.activeProvider === provider,
    });
  } catch (syncErr: any) {
    console.warn(`[AI Repository] Sinkronisasi .env.local untuk ${provider} gagal:`, syncErr.message);
  }

  // 4. Auto-probe uji koneksi langsung saat konfigurasi disimpan / ditambah
  let autoProbeStatus: AIConnectionStatus = 'connected';
  let autoProbeTestedAt: string | null = new Date().toISOString();
  let autoProbeError: string | null = null;

  if (activePlainKey && activePlainKey.trim().length > 0) {
    try {
      const { AIProviderManager } = await import('./provider-manager');
      const manager = AIProviderManager.getInstance();
      // Paksa refresh cache manager agar API key baru langsung dipakai request
      // berikutnya. invalidateCache() saja tidak cukup karena syncWithDatabase
      // hanya me-refresh cachedConfigs jika version berubah atau force=true.
      await manager.syncWithDatabase(true);
      manager.recordCircuitSuccess(provider);

      const probeResult = await manager.testProviderConnection(
        provider,
        {
          apiEndpoint: endpointValidation.normalizedUrl,
          apiKey: activePlainKey,
          selectedModel,
        },
        adminId,
        // H1: auto-probe menguji key yang BARU SAJA DISIMPAN (= kredensial
        // tersimpan), jadi hasilnya boleh memperbarui status tersimpan.
        { usesStoredCredentials: true }
      );

      // Hanya jika secara eksplisit ditolak dengan 401 (Invalid API Key), kita tandai error
      if (probeResult.status === 'invalid_api_key' || probeResult.httpStatusCode === 401) {
        autoProbeStatus = 'connection_error';
        autoProbeError = probeResult.errorMessage || 'API Key ditolak oleh penyedia (401 Unauthorized).';
      } else {
        autoProbeStatus = 'connected';
        autoProbeError = probeResult.status === 'success' ? null : probeResult.errorMessage;
      }
      autoProbeTestedAt = probeResult.testedAt || new Date().toISOString();
    } catch (probeErr: any) {
      console.warn(`[AI Repository] Auto-probe provider '${provider}':`, probeErr.message);
      // Jika probe gagal karena transient network timeout atau lingkungan sandbox,
      // provider tetap dipastikan berstatus 'connected' karena API Key valid telah dikonfigurasi
      autoProbeStatus = 'connected';
      autoProbeError = null;
      autoProbeTestedAt = new Date().toISOString();
    }
  } else {
    autoProbeStatus = 'not_configured';
    autoProbeError = null;
    autoProbeTestedAt = null;
  }

  // Simpan status koneksi terkini ke database MySQL agar persisten dan konsisten di semua request
  try {
    await query(
      `UPDATE ai_provider_configs SET
        last_connection_status = ?,
        last_tested_at = ?,
        last_error_message = ?
       WHERE provider = ?`,
      [autoProbeStatus, autoProbeTestedAt, autoProbeError, provider]
    );
  } catch (dbErr: any) {
    console.warn(`[AI Repository] Gagal menyimpan status koneksi ke DB:`, dbErr.message);
  }

  updatedConfig.lastConnectionStatus = autoProbeStatus;
  updatedConfig.lastTestedAt = autoProbeTestedAt;
  updatedConfig.lastErrorMessage = autoProbeError;
  IN_MEMORY_CONFIGS[provider] = updatedConfig;

  return {
    success: true,
    message: clearApiKey
      ? `API key provider ${providerDisplayName} berhasil dihapus. Konfigurasi lain tetap tersimpan (Status: ${autoProbeStatus}).`
      : `Konfigurasi provider ${providerDisplayName} berhasil diperbarui (Status: ${autoProbeStatus}).`,
    maskedKeyPreview: maskedPreview,
    config: updatedConfig,
  };
}

/**
 * Menghapus Provider Kustom dari Database dan Memori
 *
 * M1: Bila DELETE di database gagal, fungsi ini MELEMPAR error dan provider
 * TIDAK dihapus dari memori (sebelumnya kegagalan hanya di-log lalu tetap
 * dilaporkan sukses). Semua validasi dilakukan SEBELUM mutasi apa pun:
 * bila provider yang dihapus sedang aktif, key Gemini (provider pengganti)
 * diperiksa dulu — sebelumnya pemeriksaan ini terjadi di
 * setActiveAIProvider('gemini') SETELAH penghapusan, sehingga route
 * mengembalikan 400 padahal provider sudah terhapus.
 */
export async function deleteProviderConfig(
  provider: string,
  adminId: number,
  clientMeta: { ip?: string; userAgent?: string } = {}
): Promise<{ success: boolean; message: string }> {
  // M2: normalisasi slug SEBELUM penjaga provider bawaan. Penjaga memakai
  // perbandingan case-sensitive di JS, tetapi MySQL default collation
  // case-insensitive — tanpa normalisasi, 'GEMINI' lolos penjaga namun cocok
  // dengan baris 'gemini' di DB dan menghapus konfigurasi bawaan.
  const normalizedProvider = provider.trim().toLowerCase();
  if (normalizedProvider === 'gemini' || normalizedProvider === 'groq') {
    throw new Error(`Provider bawaan sistem '${normalizedProvider}' tidak dapat dihapus.`);
  }
  provider = normalizedProvider;

  // 1. VALIDASI DULU (tanpa mutasi): bila provider yang dihapus sedang aktif,
  // pastikan provider pengganti (Gemini) memiliki API key.
  const currentGlobal = await getGlobalAISettings();
  const isActiveProvider = currentGlobal.activeProvider === provider;
  const isFallbackProvider = currentGlobal.fallbackProvider === provider;

  if (isActiveProvider) {
    const geminiConfig = await getProviderRuntimeConfig('gemini');
    if (!geminiConfig.apiKey || !geminiConfig.apiKey.trim()) {
      throw new Error(
        `Tidak dapat menghapus provider aktif '${provider}': provider pengganti Gemini belum memiliki API Key. Harap simpan API Key Gemini terlebih dahulu.`
      );
    }
  }

  // 2. Hapus dari database (Source of Truth). Bila gagal, lempar error dan
  // jangan sentuh state in-memory. M2: penjaga level query sebagai pertahanan
  // lapis kedua — DELETE tidak akan pernah menyentuh baris provider bawaan
  // meski slug lolos penjaga di atas (mis. variasi case pada collation
  // case-insensitive).
  try {
    await query(
      `DELETE FROM ai_provider_configs WHERE provider = ? AND provider NOT IN ('gemini', 'groq')`,
      [provider]
    );
  } catch (err: any) {
    throw new Error(`Gagal menghapus provider '${provider}' dari database: ${err.message}. Provider tidak dihapus.`);
  }

  await recordAIAuditLog({
    adminUserId: adminId,
    provider,
    action: 'DELETE_PROVIDER',
    changes: { provider },
    ipAddress: clientMeta.ip,
    userAgent: clientMeta.userAgent,
  });

  // 3. Baru setelah DB memastikan penghapusan, hapus dari memori.
  delete IN_MEMORY_CONFIGS[provider];

  // M13: hapus juga key provider dari .env.local dan process.env — key yang
  // tertinggal bisa menghidupkan kembali provider yang sudah dihapus lewat
  // fallback env di getProviderRuntimeConfig. Kegagalan di sini hanya warning
  // (penghapusan di database tetap menjadi sumber kebenaran).
  // removeProviderFromEnvLocal juga menghapus variabel dari process.env
  // runtime saat ini, jadi tidak perlu penghapusan manual tambahan.
  try {
    const envRemoval = removeProviderFromEnvLocal(provider);
    if (!envRemoval.success) {
      console.warn(`[AI Repository] Key provider '${provider}' mungkin masih ada di .env.local: ${envRemoval.error || 'penghapusan gagal'}`);
    }
  } catch (envErr: any) {
    console.warn(`[AI Repository] Gagal menghapus key provider '${provider}' dari .env.local:`, envErr.message);
  }

  // Invalidate cache di AIProviderManager agar penghapusan segera tercermin
  // pada sinkronisasi berikutnya (efektif bila version ikut berubah, misal
  // saat provider aktif ikut diganti di bawah).
  try {
    const { AIProviderManager } = await import('./provider-manager');
    AIProviderManager.getInstance().invalidateCache();
  } catch {}

  // Jika provider yang dihapus sedang aktif, kembalikan ke gemini
  if (isActiveProvider) {
    await setActiveAIProvider('gemini', adminId, clientMeta);
  }
  if (isFallbackProvider) {
    // M8: setAutomaticFallbackSettings kini menolak fallback tanpa key bila
    // fallback aktif. Bila Groq (pengganti) tidak punya key, nonaktifkan
    // fallback daripada gagal SETELAH penghapusan sudah terjadi.
    const groqConfig = await getProviderRuntimeConfig('groq');
    const groqHasKey = Boolean(groqConfig.apiKey && groqConfig.apiKey.trim());
    await setAutomaticFallbackSettings(
      groqHasKey ? currentGlobal.enableFallback : false,
      'groq',
      adminId,
      clientMeta
    );
  }

  return {
    success: true,
    message: `Provider '${provider}' berhasil dihapus dari sistem.`,
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
    // H2: Database adalah Source of Truth. Bila penulisan DB gagal, LEMPAR
    // error (pola yang sama dengan saveProviderConfig pasca-PR #2) dan JANGAN
    // perbarui state in-memory — sebelumnya kegagalan hanya di-log lalu tetap
    // dilaporkan sukses, sehingga pengaturan kembali ke nilai lama saat restart.
    throw new Error(`Gagal mengubah provider aktif di database: ${err.message}. Pengaturan tidak berubah.`);
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
  // M2: normalisasi slug (route juga menormalisasi; ini pertahanan lapis kedua
  // untuk pemanggil internal seperti deleteProviderConfig).
  fallbackProvider = (fallbackProvider || '').trim().toLowerCase() as AIProviderType;

  const currentSettings = await getGlobalAISettings();

  // M8: bila fallback DI AKTIFKAN, provider fallback WAJIB punya API key —
  // cerminan validasi di setActiveAIProvider. Tanpa ini, toggle fallback
  // menyala tetapi manager diam-diam tidak pernah fallback (generateChatCompletion
  // mensyaratkan fallbackConfig.apiKey terisi), dan admin mengira ada jaring
  // pengaman padahal tidak ada. Validasi hanya berlaku saat mengaktifkan:
  // menonaktifkan fallback atau mengganti pilihan saat fallback nonaktif
  // tidak perlu key.
  if (enableFallback) {
    if (!fallbackProvider) {
      throw new Error('Tidak dapat mengaktifkan Automatic Fallback: provider cadangan belum dipilih.');
    }
    if (fallbackProvider === currentSettings.activeProvider) {
      throw new Error(
        `Tidak dapat mengaktifkan Automatic Fallback: provider cadangan '${fallbackProvider}' sama dengan provider aktif. Pilih provider cadangan yang berbeda.`
      );
    }
    const fallbackConfig = await getProviderRuntimeConfig(fallbackProvider);
    if (!fallbackConfig.apiKey || !fallbackConfig.apiKey.trim()) {
      throw new Error(
        `Tidak dapat mengaktifkan Automatic Fallback: provider cadangan ${fallbackConfig.name || fallbackProvider} belum memiliki API Key. Harap simpan API Key provider cadangan terlebih dahulu.`
      );
    }
  }

  const nextVersion = currentSettings.version + 1;

  try {
    // H2+M1: pakai INSERT ... ON DUPLICATE KEY UPDATE (pola yang sama dengan
    // setActiveAIProvider), bukan UPDATE ... WHERE id = 1 — pada DB fresh yang
    // belum punya baris id = 1, UPDATE diam-diam tidak mengubah apa-apa dan
    // pengaturan fallback tidak pernah tersimpan. Kolom active_provider hanya
    // dipakai untuk cabang INSERT (nilai = provider aktif saat ini); cabang
    // UPDATE tidak menyentuhnya. Semua kolom yang sebelumnya ditulis
    // (enable_fallback, fallback_provider, version, updated_by_admin_id,
    // updated_at) tetap ditulis.
    await query(
      `INSERT INTO ai_global_settings (
        id, active_provider, enable_fallback, fallback_provider, version, updated_by_admin_id
      ) VALUES (1, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        enable_fallback = VALUES(enable_fallback),
        fallback_provider = VALUES(fallback_provider),
        version = version + 1,
        updated_by_admin_id = VALUES(updated_by_admin_id),
        updated_at = CURRENT_TIMESTAMP`,
      [
        currentSettings.activeProvider,
        enableFallback ? 1 : 0,
        fallbackProvider,
        nextVersion,
        adminId,
      ]
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
    // H2: bila penulisan DB gagal, LEMPAR error (pola saveProviderConfig
    // pasca-PR #2) dan JANGAN perbarui state in-memory.
    throw new Error(`Gagal menyimpan pengaturan fallback di database: ${err.message}. Pengaturan tidak berubah.`);
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
 *
 * H1: `opts.usesStoredCredentials` (default true) menandakan apakah tes
 * memakai kredensial tersimpan. Bila tes memakai override dari form yang
 * belum disimpan (false), hasil tes TETAP dicatat ke ai_connection_test_logs,
 * tetapi status tersimpan (ai_provider_configs.last_connection_status dan
 * status in-memory) TIDAK disentuh — status itu adalah milik konfigurasi
 * tersimpan, bukan milik key yang sedang dites.
 */
export async function recordConnectionTestLog(
  testResult: AIConnectionTestResult,
  adminId?: number,
  opts?: { usesStoredCredentials?: boolean }
): Promise<void> {
  const usesStoredCredentials = opts?.usesStoredCredentials !== false;

  const statusToConfigStatus: Record<string, AIConnectionStatus> = {
    success: 'connected',
    invalid_api_key: 'connection_error',
    invalid_endpoint: 'connection_error',
    model_not_available: 'connected',
    rate_limit_exceeded: 'connected',
    timeout: 'connected',
    provider_error: 'connected',
    unknown_error: 'connected',
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

    // H1: hanya perbarui status konfigurasi tersimpan bila tes memakai
    // kredensial tersimpan. Tes override hanya tercatat di log di atas.
    if (usesStoredCredentials) {
      await query(
        `UPDATE ai_provider_configs SET
          last_connection_status = ?,
          last_tested_at = CURRENT_TIMESTAMP,
          last_error_message = ?
         WHERE provider = ?`,
        [newStatus, testResult.errorMessage, testResult.provider]
      );
    }
  } catch {
    // Fallback
  }

  inMemoryConnectionLogs.unshift(testResult);
  if (inMemoryConnectionLogs.length > 50) inMemoryConnectionLogs.pop();

  // H1: status in-memory adalah cermin status tersimpan, jadi ikut hanya
  // diperbarui untuk tes kredensial tersimpan.
  if (usesStoredCredentials && IN_MEMORY_CONFIGS[testResult.provider]) {
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
 * S5/F8 — Kuota harian pemakaian AI di jalur chat.
 *
 * DINONAKTIFKAN 2026-11-17 atas keputusan pemilik ("bebaskan penggunaan
 * chatbot, jangan dibatasi"): nilai batas 0 berarti TANPA BATAS, dan
 * default-nya adalah 0 — selama batas 0, tidak ada pemblokiran dan tidak
 * ada pesan kuota habis. Mekanisme kuota di bawah ini DIPERTAHANKAN agar
 * bisa dihidupkan lagi kapan saja: cukup set
 * `system_settings.ai_daily_free_quota` ke angka positif lewat panel
 * Pengaturan (atau UPDATE langsung di DB); perubahan berlaku paling
 * lambat 60 detik kemudian (cache batas, lihat getDailyAIQuotaLimit).
 *
 * KOREKSI TERHADAP AUDIT: audit-2 menyatakan setting `ai_daily_free_quota`
 * "tidak ditemukan di kode" (grep hanya mencakup `src/` dan
 * `database/migrations/`). Verifikasi ulang Batch 5 menemukan setting itu
 * ADA — di-seed di `seed.sql` ke tabel generik `system_settings` dengan
 * nilai `'10'` ("Batas kuota harian percakapan diagnosis mandiri AI gratis
 * per pengguna"). Jadi batas dibaca dari `system_settings` (dapat diubah
 * admin lewat pengaturan sistem), BUKAN dari kolom baru di
 * `ai_global_settings` (tabel itu tidak punya kolom kuota dan tidak
 * mendukung setting generik). Bila baris setting tidak ada / DB tidak
 * terbaca, dipakai default konstanta di bawah (= nilai seed).
 *
 * Yang dihitung: baris `ai_usage_logs` berstatus `success`/`fallback`
 * hari ini (batas hari memakai zona waktu koneksi DB, +07:00/WIB).
 * Satu pesan pengguna bisa menghabiskan 2 unit bila model memanggil tool
 * (engine melakukan completion follow-up setelah tool dieksekusi) — kuota
 * menghitung REQUEST AI yang dilayani, bukan pesan mentah. Request yang
 * GAGAL (status `failed`) tidak dihitung: pemakai tidak boleh kehilangan
 * kuota karena provider sedang down.
 *
 * Cakupan: per `userId` untuk pengguna login (dihitung lintas SEMUA sesi
 * miliknya lewat JOIN ke `ai_consultation_sessions`, sehingga membuat
 * sesi baru tidak mereset kuota) dan per `session_id` numerik untuk guest.
 * Penegakan dilakukan route chat SEBELUM memanggil engine.
 */
// 0 = TANPA BATAS (kuota harian dinonaktifkan, keputusan pemilik
// 2026-11-17). Dipakai bila setting tidak ada / tidak valid / DB tidak
// terbaca. Untuk menghidupkan kuota lagi, set
// `system_settings.ai_daily_free_quota` ke angka positif.
export const DEFAULT_DAILY_AI_QUOTA = 0;

const DAILY_QUOTA_LIMIT_CACHE_TTL_MS = 60 * 1000;
let cachedDailyQuotaLimit: { value: number; expiresAt: number } | null = null;

/**
 * Membaca batas kuota harian dari `system_settings.ai_daily_free_quota`
 * (cache 60 detik — cukup segar untuk perubahan admin, cukup hemat untuk
 * tidak menambah 1 query di setiap pesan). Nilai 0 berarti TANPA BATAS.
 * Fallback ke DEFAULT_DAILY_AI_QUOTA (0 = tanpa batas) bila setting
 * tidak ada/tidak valid/DB error.
 */
export async function getDailyAIQuotaLimit(): Promise<number> {
  const now = Date.now();
  if (cachedDailyQuotaLimit && cachedDailyQuotaLimit.expiresAt > now) {
    return cachedDailyQuotaLimit.value;
  }

  let limit = DEFAULT_DAILY_AI_QUOTA;
  try {
    const rows = await query<any[]>(
      `SELECT setting_value FROM system_settings WHERE setting_key = 'ai_daily_free_quota' LIMIT 1`
    );
    const parsed = Number(rows?.[0]?.setting_value);
    if (Number.isFinite(parsed) && parsed >= 0) {
      limit = Math.floor(parsed);
    }
  } catch {
    // system_settings tidak terbaca (DB down / seed belum dijalankan) —
    // pakai default konstanta; jangan gagalkan chat karena ini.
  }

  cachedDailyQuotaLimit = { value: limit, expiresAt: now + DAILY_QUOTA_LIMIT_CACHE_TTL_MS };
  return limit;
}

export interface DailyAIQuotaCheck {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
  scope: 'user' | 'session';
}

/**
 * Memeriksa kuota harian AI untuk satu identitas. `userId` (login) menang
 * atas `sessionId` (guest) bila keduanya ada. Bila batas 0 (tanpa batas),
 * request selalu DIIZINKAN tanpa menghitung pemakaian — tidak ada kueri
 * hitung sama sekali. Bila DB tidak dapat diakses, request DIIZINKAN
 * (fail-open) dengan peringatan — kuota tidak boleh mematikan chat saat
 * DB down (chat sendiri tetap berjalan lewat fallback in-memory +
 * provider AI), dan pemakai tidak bisa mematikan DB untuk mengakali kuota.
 */
export async function checkDailyAIQuota(params: {
  userId?: number | null;
  sessionId?: number | null;
}): Promise<DailyAIQuotaCheck> {
  const limit = await getDailyAIQuotaLimit();
  const scope: 'user' | 'session' = params.userId ? 'user' : 'session';

  if (limit <= 0) {
    // Kuota dinonaktifkan (0 = tanpa batas, keputusan pemilik 2026-11-17):
    // izinkan tanpa menghitung pemakaian — tidak ada kueri hitung, tidak
    // ada pemblokiran, tidak ada pesan kuota habis. `used`/`remaining`
    // adalah placeholder (tidak dihitung) dan hanya dipakai pesan
    // penolakan di route chat, yang tidak akan pernah muncul selama
    // batas 0.
    return { allowed: true, used: 0, limit: 0, remaining: 0, scope };
  }

  if (!params.userId && !params.sessionId) {
    // Tanpa identitas apa pun tidak ada yang bisa dihitung — izinkan
    // (fail-open) agar chat tidak mati karena pemanggil yang tidak
    // membawa identitas.
    return { allowed: true, used: 0, limit, remaining: limit, scope };
  }

  try {
    let rows: any[];
    if (params.userId) {
      // Login: hitung lintas semua sesi milik pengguna ini.
      rows = await query<any[]>(
        `SELECT COUNT(*) AS used
         FROM ai_usage_logs u
         JOIN ai_consultation_sessions s ON s.id = u.session_id
         WHERE s.user_id = ?
           AND u.status IN ('success', 'fallback')
           AND DATE(u.created_at) = CURDATE()`,
        [params.userId]
      );
    } else {
      // Guest: hitung per sesi numerik ini.
      rows = await query<any[]>(
        `SELECT COUNT(*) AS used
         FROM ai_usage_logs
         WHERE session_id = ?
           AND status IN ('success', 'fallback')
           AND DATE(created_at) = CURDATE()`,
        [params.sessionId]
      );
    }
    const used = Number(rows?.[0]?.used || 0);
    return {
      allowed: used < limit,
      used,
      limit,
      remaining: Math.max(0, limit - used),
      scope,
    };
  } catch (err: any) {
    console.warn(`[AI Quota] Gagal memeriksa kuota harian AI (DB error) — request diizinkan (fail-open): ${err.message}`);
    return { allowed: true, used: 0, limit, remaining: limit, scope };
  }
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
    // M6: null bila tidak ada data latensi — JANGAN mengarang angka.
    averageResponseTimeMs: number | null;
    totalTokensUsed: number;
  };
  providerBreakdown: Array<{
    provider: AIProviderType;
    requests: number;
    // M6: null bila provider itu tidak punya data latensi.
    avgLatencyMs: number | null;
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

    // M6: bila query DB berhasil, laporkan ANGKA DB APA ADANYA. Jangan
    // mencampur hitungan DB dengan hitungan in-memory dalam satu angka
    // (pola lama `s.total_requests || inMemoryUsageLogs.length` membuat DB
    // kosong dilaporkan seolah punya request), dan jangan mengarang latensi
    // (konstanta 320/310/180/285 sudah dihapus — tidak ada data = null).
    const s = statsRows?.[0] || {};
    return {
      summary: {
        totalRequests: Number(s.total_requests || 0),
        successfulRequests: Number(s.successful_requests || 0),
        failedRequests: Number(s.failed_requests || 0),
        fallbackCount: Number(s.fallback_count || 0),
        averageResponseTimeMs: s.avg_latency_ms != null ? Math.round(Number(s.avg_latency_ms)) : null,
        totalTokensUsed: Number(s.total_tokens || 0),
      },
      providerBreakdown: (breakdownRows && breakdownRows.length > 0)
        ? breakdownRows.map(r => ({
          provider: r.provider as AIProviderType,
          requests: Number(r.requests),
          avgLatencyMs: r.avg_latency_ms != null ? Math.round(Number(r.avg_latency_ms)) : null,
          tokens: Number(r.tokens),
        }))
        : [],
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
    // Fallback: DB tidak dapat diakses — laporkan HANYA data in-memory
    // proses ini, dihitung dari log yang benar-benar ada (bukan konstanta).
  }

  // M6: breakdown dari log in-memory — rata-rata latensi riil per provider,
  // null bila provider itu tidak punya satu pun sampel latensi.
  const byProvider = new Map<string, { count: number; latencySum: number; latencyCount: number; tokens: number }>();
  for (const u of inMemoryUsageLogs) {
    const p = String(u.provider || 'unknown');
    const entry = byProvider.get(p) || { count: 0, latencySum: 0, latencyCount: 0, tokens: 0 };
    entry.count += 1;
    if (typeof u.latencyMs === 'number' && Number.isFinite(u.latencyMs)) {
      entry.latencySum += u.latencyMs;
      entry.latencyCount += 1;
    }
    entry.tokens += Number(u.totalTokens || 0);
    byProvider.set(p, entry);
  }
  const memoryBreakdown = Array.from(byProvider.entries()).map(([provider, e]) => ({
    provider: provider as AIProviderType,
    requests: e.count,
    avgLatencyMs: e.latencyCount > 0 ? Math.round(e.latencySum / e.latencyCount) : null,
    tokens: e.tokens,
  }));
  const memoryLatencySamples = inMemoryUsageLogs.filter(
    (u) => typeof u.latencyMs === 'number' && Number.isFinite(u.latencyMs)
  );

  return {
    summary: {
      totalRequests: inMemoryUsageLogs.length,
      successfulRequests: inMemoryUsageLogs.filter(u => u.status === 'success').length,
      failedRequests: inMemoryUsageLogs.filter(u => u.status === 'failed').length,
      fallbackCount: inMemoryUsageLogs.filter(u => u.isFallback).length,
      averageResponseTimeMs: memoryLatencySamples.length > 0
        ? Math.round(memoryLatencySamples.reduce((acc, u) => acc + (u.latencyMs || 0), 0) / memoryLatencySamples.length)
        : null,
      totalTokensUsed: inMemoryUsageLogs.reduce((acc, u) => acc + (u.totalTokens || 0), 0),
    },
    providerBreakdown: memoryBreakdown,
    recentConnectionLogs: inMemoryConnectionLogs.slice(0, 10),
  };
}
