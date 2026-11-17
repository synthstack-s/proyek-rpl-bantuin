/**
 * ENV-SYNC MODULE - BANTUIN AI PROVIDER MANAGEMENT
 *
 * Bertanggung jawab melakukan sinkronisasi otomatis konfigurasi AI Provider
 * NON-RAHASIA (Model, Endpoint, dan Active Provider) ke file `.env.local`
 * secara atomik, aman, dan tanpa merusak variabel lingkungan yang sudah ada.
 *
 * S30: modul ini TIDAK PERNAH LAGI menulis API key ke `.env.local` maupun
 * ke `process.env`. Database terenkripsi adalah satu-satunya sumber
 * kebenaran untuk API key sejak PR #1/#2; menulis key plaintext ke file
 * saat runtime membuat key rawan ter-commit, terbaca proses lain, dan
 * memicu restart pada deployment watch-mode. Key yang sudah telanjur ada
 * di `.env.local` masih DIBACA sebagai fallback legacy (lihat
 * getProviderRuntimeConfig) dengan peringatan deprecation, sampai admin
 * menyimpan ulang key lewat panel dan menghapus baris plaintext-nya —
 * lihat catatan migrasi di REPORT Batch 5.
 */

import fs from 'fs';
import path from 'path';

export interface EnvSyncOptions {
  provider: string;
  /**
   * S30 — DEPRECATED dan DIABAIKAN: API key TIDAK PERNAH ditulis ke
   * `.env.local` lagi. Field dipertahankan agar pemanggil lama tidak
   * patah, tetapi nilai apa pun yang dioper akan diabaikan dengan
   * peringatan. Key hanya tersimpan terenkripsi di database.
   */
  apiKey?: string | null;
  selectedModel?: string | null;
  apiEndpoint?: string | null;
  isActive?: boolean;
}

function formatEnvValue(val: string): string {
  if (val.includes(' ') || val.includes('#') || val.includes('"')) {
    if (!val.startsWith('"')) {
      return `"${val.replace(/"/g, '\\"')}"`;
    }
  }
  return val;
}

/**
 * Nama variabel lingkungan untuk satu provider — dipakai bersama oleh
 * syncProviderToEnvLocal dan removeProviderFromEnvLocal agar penulisan dan
 * penghapusan selalu menyasar variabel yang sama (M13).
 */
function getProviderEnvVarNames(provider: string): { keyVar: string; modelVar: string; endpointVar: string } {
  const providerSlug = provider.trim().toLowerCase();
  const providerUpper = providerSlug.toUpperCase().replace(/[^A-Z0-9_]/g, '_');

  if (providerSlug === 'gemini') {
    return { keyVar: 'GEMINI_API_KEY', modelVar: 'GEMINI_MODEL', endpointVar: 'GEMINI_API_ENDPOINT' };
  }
  if (providerSlug === 'groq') {
    return { keyVar: 'GROQ_API_KEY', modelVar: 'GROQ_MODEL', endpointVar: 'GROQ_API_ENDPOINT' };
  }
  return {
    keyVar: `${providerUpper}_API_KEY`,
    modelVar: `${providerUpper}_MODEL`,
    endpointVar: `${providerUpper}_API_ENDPOINT`,
  };
}

/**
 * Sinkronisasi konfigurasi provider AI NON-RAHASIA ke `.env.local`
 * (model, endpoint, provider aktif). API key TIDAK PERNAH ditulis (S30).
 */
export function syncProviderToEnvLocal(options: EnvSyncOptions): {
  success: boolean;
  updatedKeys: string[];
  error?: string;
} {
  // S30: bila ada pemanggil yang masih mengoper apiKey, ABAIKAN dengan
  // peringatan yang jelas — jangan diam-diam menulisnya ke file.
  if (options.apiKey && options.apiKey.trim().length > 0) {
    console.warn(
      `[EnvSync] DEPRECATED: API key provider '${options.provider}' TIDAK ditulis ke .env.local (S30) — ` +
        `key hanya tersimpan terenkripsi di database. Pemanggil yang mengoper apiKey ke syncProviderToEnvLocal harus diperbarui.`
    );
  }

  try {
    const envPath = path.resolve(process.cwd(), '.env.local');
    let content = '';

    if (fs.existsSync(envPath)) {
      content = fs.readFileSync(envPath, 'utf8');
    }

    const updatedKeys: string[] = [];
    const providerSlug = options.provider.trim().toLowerCase();

    // Tentukan nama variabel lingkungan (penamaan yang sama dipakai
    // removeProviderFromEnvLocal saat provider dihapus — M13).
    // S30: keyVar sengaja TIDAK dipakai untuk menulis — hanya model,
    // endpoint, dan ACTIVE_AI_PROVIDER yang disinkronkan.
    const { modelVar, endpointVar } = getProviderEnvVarNames(providerSlug);

    const updates: Record<string, string> = {};

    if (options.selectedModel && options.selectedModel.trim().length > 0) {
      updates[modelVar] = options.selectedModel.trim();
    }
    if (options.apiEndpoint && options.apiEndpoint.trim().length > 0) {
      updates[endpointVar] = options.apiEndpoint.trim();
    }
    if (options.isActive) {
      updates['ACTIVE_AI_PROVIDER'] = providerSlug;
    }

    if (Object.keys(updates).length === 0) {
      return { success: true, updatedKeys: [] };
    }

    let lines = content.split(/\r?\n/);
    const existingKeysInFile = new Set<string>();

    // Update baris yang sudah ada — hanya bila nilainya benar-benar
    // berubah, agar updatedKeys jujur dan penulisan bisa dilewati bila
    // tidak ada yang berubah (lihat penjaga sebelum writeFileSync).
    lines = lines.map((line) => {
      const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
      if (match) {
        const key = match[1];
        existingKeysInFile.add(key);
        if (updates[key] !== undefined) {
          const newLine = `${key}=${formatEnvValue(updates[key])}`;
          if (line !== newLine) {
            updatedKeys.push(key);
            return newLine;
          }
        }
      }
      return line;
    });

    // Tambahkan baris baru untuk kunci yang belum ada
    const newLinesToAppend: string[] = [];
    let hasHeader = false;

    for (const [key, value] of Object.entries(updates)) {
      if (!existingKeysInFile.has(key)) {
        if (!hasHeader) {
          newLinesToAppend.push(`\n# Integrasi AI Provider (${options.provider})`);
          hasHeader = true;
        }
        newLinesToAppend.push(`${key}=${formatEnvValue(value)}`);
        updatedKeys.push(key);
      }
      // Update memory env
      process.env[key] = value;
    }

    let finalContent = lines.join('\n');
    if (newLinesToAppend.length > 0) {
      if (!finalContent.endsWith('\n') && finalContent.length > 0) {
        finalContent += '\n';
      }
      finalContent += newLinesToAppend.join('\n') + '\n';
    }

    // Tulis ke .env.local — HANYA bila isi berubah. Menulis ulang file
    // yang identik tetap mengubah mtime dan memicu recompile/restart
    // pada dev server (Next memantau .env.local) tanpa manfaat apa pun.
    if (finalContent !== content) {
      fs.writeFileSync(envPath, finalContent, 'utf8');
      console.info(`[EnvSync] Berhasil sinkronisasi provider '${options.provider}' ke .env.local: [${updatedKeys.join(', ')}]`);
    }

    return { success: true, updatedKeys };
  } catch (err: any) {
    console.error('[EnvSync] Gagal menulis ke .env.local:', err);
    return { success: false, updatedKeys: [], error: err.message };
  }
}

/**
 * M13: Menghapus variabel provider AI dari `.env.local` dan `process.env`
 * saat provider dihapus. Tanpa ini, key provider yang sudah "dihapus" tetap
 * tersimpan plaintext di `.env.local` dan tetap hidup di `process.env` —
 * dan karena getProviderRuntimeConfig memakai key env sebagai fallback,
 * provider yang sudah dihapus masih bisa aktif kembali dengan key lamanya.
 *
 * Variabel yang dihapus adalah key + model + endpoint. S30: syncProviderToEnvLocal
 * sudah tidak menulis key lagi, tetapi fungsi ini TETAP menghapus var key —
 * justru untuk membersihkan baris key plaintext LEGACY yang ditulis sebelum
 * perbaikan S30 (dan dipakai saat admin menghapus key / provider).
 * Kegagalan menghapus file TIDAK melempar — pemanggil (deleteProviderConfig)
 * mencatatnya sebagai warning; penghapusan di database tetap menjadi sumber
 * kebenaran.
 */
export function removeProviderFromEnvLocal(provider: string): {
  success: boolean;
  removedKeys: string[];
  error?: string;
} {
  const removedKeys: string[] = [];
  try {
    const providerSlug = provider.trim().toLowerCase();
    const { keyVar, modelVar, endpointVar } = getProviderEnvVarNames(providerSlug);
    const varsToRemove = new Set([keyVar, modelVar, endpointVar]);

    // Hapus dari process.env (runtime saat ini)
    for (const key of varsToRemove) {
      if (process.env[key] !== undefined) {
        delete process.env[key];
        removedKeys.push(key);
      }
    }

    // Hapus baris variabel dari .env.local (bila file ada)
    const envPath = path.resolve(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      const headerPattern = new RegExp(`^#\\s*Integrasi AI Provider \\(${providerSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)\\s*$`, 'i');
      const lines = content.split(/\r?\n/);
      const keptLines: string[] = [];
      let changed = false;
      for (const line of lines) {
        const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
        if (match && varsToRemove.has(match[1])) {
          changed = true;
          if (!removedKeys.includes(match[1])) removedKeys.push(match[1]);
          continue;
        }
        // Hapus juga header komentar yang ditulis syncProviderToEnvLocal
        // untuk provider ini, agar file tidak menyisakan header yatim.
        if (headerPattern.test(line)) {
          changed = true;
          continue;
        }
        keptLines.push(line);
      }
      if (changed) {
        fs.writeFileSync(envPath, keptLines.join('\n'), 'utf8');
      }
    }

    if (removedKeys.length > 0) {
      console.info(`[EnvSync] Variabel provider '${providerSlug}' dihapus dari .env.local/process.env: [${removedKeys.join(', ')}]`);
    }
    return { success: true, removedKeys };
  } catch (err: any) {
    console.warn('[EnvSync] Gagal menghapus variabel provider dari .env.local:', err.message);
    return { success: false, removedKeys, error: err.message };
  }
}

/**
 * Sinkronisasi ACTIVE_AI_PROVIDER ke `.env.local` saat berpindah provider aktif
 */
export function syncActiveProviderToEnvLocal(activeProvider: string): void {
  try {
    const envPath = path.resolve(process.cwd(), '.env.local');
    if (!fs.existsSync(envPath)) return;

    const content = fs.readFileSync(envPath, 'utf8');
    const cleanProvider = activeProvider.trim().toLowerCase();

    const regex = /^ACTIVE_AI_PROVIDER=.*$/m;
    const newContent = regex.test(content)
      ? content.replace(regex, `ACTIVE_AI_PROVIDER=${cleanProvider}`)
      : `${content}\n# Provider AI Aktif Terpilih\nACTIVE_AI_PROVIDER=${cleanProvider}\n`;

    process.env['ACTIVE_AI_PROVIDER'] = cleanProvider;
    // Tulis hanya bila isi berubah — penulisan ulang yang identik tetap
    // mengubah mtime dan memicu recompile pada dev server.
    if (newContent !== content) {
      fs.writeFileSync(envPath, newContent, 'utf8');
      console.info(`[EnvSync] ACTIVE_AI_PROVIDER disinkronkan ke .env.local: '${cleanProvider}'`);
    }
  } catch (err: any) {
    console.warn('[EnvSync] Gagal memperbarui ACTIVE_AI_PROVIDER di .env.local:', err.message);
  }
}
