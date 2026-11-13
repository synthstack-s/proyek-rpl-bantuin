/**
 * T5 — Pencabutan sesi JWT via token_version.
 *
 * Masalah: JWT BANTUIN bersifat stateless — reset password hanya mencabut
 * baris di `user_refresh_tokens`, tabel yang TIDAK PERNAH ditulis oleh kode
 * mana pun, sehingga pencabutan itu no-op dan token curian tetap valid
 * sampai kedaluwarsa (8 jam / 7 hari dengan remember-me).
 *
 * Mekanisme: setiap JWT kini membawa klaim `tokenVersion`. Kolom
 * `users.token_version` (migrasi 004, default 1) dinaikkan setiap reset
 * password; `checkSessionRevocation` menolak token yang versinya lebih lama
 * dari versi di DB. Pemeriksaan yang sama juga menolak sesi akun yang
 * di-suspend/di-nonaktifkan/dihapus (T4: suspensi langsung mematikan sesi
 * yang sudah berjalan, bukan hanya login baru).
 *
 * Modul ini Node-only (mengimpor @/lib/db → mysql2) dan TIDAK BOLEH
 * diimpor — langsung maupun transitif — oleh kode Edge runtime
 * (middleware). Karena itu auth.ts dipisah: fungsi token yang dipakai
 * middleware tinggal di auth-edge.ts (edge-safe), sementara
 * getUserSession/getAdminSession (yang memakai modul ini) tinggal di
 * auth.ts (Node-only). JANGAN menggabungkannya kembali — build produksi
 * akan gagal (webpack edge tidak bisa mem-bundle mysql2).
 */

import { query } from '@/lib/db';

/**
 * Mengambil token_version pengguna saat ini (untuk disematkan ke JWT baru
 * saat login/OTP). Best-effort: bila kolom belum ada (migrasi 004 belum
 * dijalankan) atau DB error, kembalikan 1 agar login tetap berfungsi —
 * pencabutan baru aktif setelah migrasi dijalankan.
 */
export async function getUserTokenVersion(userId: number): Promise<number> {
  try {
    const rows = await query<any[]>(
      `SELECT token_version FROM users WHERE id = ? LIMIT 1`,
      [userId]
    );
    const v = Number(rows?.[0]?.token_version);
    return Number.isFinite(v) && v >= 1 ? Math.floor(v) : 1;
  } catch (err: any) {
    console.warn('[Token Revocation] getUserTokenVersion gagal (pencabutan belum aktif — jalankan migrasi 004):', err?.message || err);
    return 1;
  }
}

/**
 * Menaikkan token_version pengguna — memicu pencabutan seluruh JWT yang
 * diterbitkan sebelumnya. Dipakai saat reset password. Best-effort: bila
 * gagal (mis. kolom belum ada), kembalikan false dan catat warning —
 * pemanggil TIDAK BOLEH menggagalkan reset password karenanya.
 */
export async function bumpUserTokenVersion(userId: number): Promise<boolean> {
  try {
    await query(
      `UPDATE users SET token_version = token_version + 1, updated_at = NOW() WHERE id = ?`,
      [userId]
    );
    return true;
  } catch (err: any) {
    console.warn('[Token Revocation] bumpUserTokenVersion gagal (sesi lama TIDAK tercabut — jalankan migrasi 004):', err?.message || err);
    return false;
  }
}

/**
 * Memeriksa apakah sesi JWT masih berlaku terhadap keadaan terkini di DB.
 * Menolak bila:
 * - tokenVersion di token berbeda dari token_version di DB (token
 *   diterbitkan sebelum reset password);
 * - status akun 'suspended' atau 'inactive' (sama seperti penolakan di
 *   route login — suspensi/nonaktivasi langsung mematikan sesi berjalan);
 * - akun tidak ditemukan atau sudah soft-deleted.
 *
 * Fail-open bila DB tidak dapat diakses: versi tidak mungkin berubah saat
 * DB tidak terjangkau (perubahan versi butuh tulis DB), dan memblokir semua
 * sesi saat outage akan melumpuhkan aplikasi. Kegagalan dicatat ke log.
 */
export async function checkSessionRevocation(payload: {
  userId: number;
  tokenVersion?: number;
}): Promise<{ valid: boolean; reason?: string }> {
  try {
    const rows = await query<any[]>(
      `SELECT token_version, status, deleted_at FROM users WHERE id = ? LIMIT 1`,
      [payload.userId]
    );
    if (!rows || rows.length === 0) {
      return { valid: false, reason: 'pengguna tidak ditemukan' };
    }
    const user = rows[0];
    if (user.deleted_at) {
      return { valid: false, reason: 'akun sudah dihapus' };
    }
    if (user.status === 'suspended' || user.status === 'inactive') {
      return { valid: false, reason: `akun berstatus ${user.status}` };
    }
    const currentRaw = Number(user.token_version);
    const currentVersion = Number.isFinite(currentRaw) && currentRaw >= 1 ? Math.floor(currentRaw) : 1;
    const tokenRaw = Number(payload.tokenVersion);
    const effectiveTokenVersion = Number.isFinite(tokenRaw) && tokenRaw >= 1 ? Math.floor(tokenRaw) : 1;
    if (currentVersion !== effectiveTokenVersion) {
      return { valid: false, reason: 'sesi dicabut (kata sandi diubah setelah token diterbitkan)' };
    }
    return { valid: true };
  } catch (err: any) {
    console.warn('[Token Revocation] checkSessionRevocation gagal (fail-open, sesi tetap dipercaya):', err?.message || err);
    return { valid: true };
  }
}
