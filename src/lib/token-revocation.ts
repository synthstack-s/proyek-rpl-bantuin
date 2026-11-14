/**
 * T5 + T6 — Pencabutan sesi JWT via token_version, revalidasi role dari DB,
 * dan blocklist logout.
 *
 * T5 — Masalah: JWT BANTUIN bersifat stateless — reset password hanya mencabut
 * baris di `user_refresh_tokens`, tabel yang TIDAK PERNAH ditulis oleh kode
 * mana pun, sehingga pencabutan itu no-op dan token curian tetap valid
 * sampai kedaluwarsa (8 jam / 7 hari dengan remember-me).
 *
 * Mekanisme T5: setiap JWT kini membawa klaim `tokenVersion`. Kolom
 * `users.token_version` (migrasi 004, default 1) dinaikkan setiap reset
 * password; `checkSessionRevocation` menolak token yang versinya lebih lama
 * dari versi di DB. Pemeriksaan yang sama juga menolak sesi akun yang
 * di-suspend/di-nonaktifkan/dihapus (T4: suspensi langsung mematikan sesi
 * yang sudah berjalan, bukan hanya login baru).
 *
 * T6 — Dua celah yang tersisa setelah T5, diperbaiki di modul ini:
 *
 * (a) REVALIDASI ROLE: klaim `role` (dan `status`/`isVerified`) di token
 * tidak pernah dicek ulang ke DB, sehingga admin yang dicopot tetap admin
 * sampai tokennya habis (sampai 7 hari dengan remember-me).
 * `checkSessionRevocation` kini membaca `role`, `status`, dan `is_verified`
 * terkini dari DB dan mengembalikannya ke pemanggil; pemanggil (auth.ts)
 * WAJIB memakai nilai DB itu, bukan klaim token. Untuk sesi admin,
 * role DB harus 'admin' — bila tidak, sesi admin ditolak.
 *
 * (b) BLOCKLIST LOGOUT: logout hanya menghapus cookie — token tetap valid
 * sampai kedaluwarsa. Setiap token kini membawa klaim `jti` (dibuat di
 * auth-edge.ts). Route logout memanggil `revokeToken` untuk mencatat jti
 * ke tabel `revoked_tokens` (migrasi 005) beserta kedaluwarsa aslinya;
 * `checkSessionRevocation` menolak token yang jti-nya ada di tabel itu
 * dan belum kedaluwarsa. Token pra-T6 tanpa jti TIDAK dapat dicabut satu
 * per satu lewat logout — batasan ini didokumentasikan (satu-satunya cara
 * mencabutnya adalah reset password / bump token_version), dan token
 * semacam itu tetap tunduk pada revalidasi role/status + token_version.
 *
 * PRUNING: entri blocklist yang kedaluwarsa dihapus secara oportunistik
 * setiap kali `revokeToken` dipanggil (jalur tulis logout), lewat
 * `pruneRevokedTokens`. Jalur baca (checkSessionRevocation) sengaja tetap
 * SELECT murni — entri kedaluwarsa diabaikan lewat `expires_at > NOW()`
 * sehingga pruning yang tertunda tidak pernah membuat token kedaluwarsa
 * ditolak atau token aktif diterima secara salah.
 *
 * KEBIJAKAN DB-DOWN: fail-open, sama seperti T5. Role, logout, dan reset
 * password semuanya butuh tulis DB, sehingga tidak mungkin berubah saat DB
 * tidak terjangkau; memblokir semua sesi saat outage akan melumpuhkan
 * aplikasi. Bila tabel `revoked_tokens` belum ada (migrasi 005 belum
 * dijalankan), pemeriksaan blocklist dilewati dengan warning — revalidasi
 * role/status + token_version tetap berjalan. Kegagalan dicatat ke log.
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
 * Hasil pemeriksaan sesi terhadap DB.
 *
 * Bila `valid` true dan field `db*` terisi, pemanggil WAJIB memakai nilai
 * DB itu untuk role/status/isVerified sesi — klaim token TIDAK BOLEH
 * dipakai lagi (T6: DB menang atas klaim). Field `db*` hanya kosong saat
 * fail-open karena DB tidak dapat diakses; dalam keadaan itu pemanggil
 * memakai klaim token apa adanya (perilaku lama, didokumentasikan).
 */
export interface SessionRevocationCheck {
  valid: boolean;
  reason?: string;
  dbRole?: 'admin' | 'customer' | 'technician';
  dbStatus?: 'active' | 'inactive' | 'suspended' | 'pending_verification';
  dbIsVerified?: boolean;
}

/**
 * Memeriksa apakah token (berdasarkan klaim `jti`-nya) sudah dicabut lewat
 * logout. Entri blocklist yang sudah kedaluwarsa diabaikan — token yang
 * bersangkutan toh sudah tidak berlaku karena `exp`-nya sendiri.
 *
 * Fail-open bila DB tidak dapat diakses atau tabel `revoked_tokens` belum
 * ada (migrasi 005 belum dijalankan): kembalikan false dengan warning.
 */
export async function isTokenRevoked(jti: string): Promise<boolean> {
  if (!jti) return false;
  try {
    const rows = await query<any[]>(
      `SELECT 1 AS revoked FROM revoked_tokens WHERE jti = ? AND expires_at > NOW() LIMIT 1`,
      [jti]
    );
    return Array.isArray(rows) && rows.length > 0;
  } catch (err: any) {
    console.warn('[Token Revocation] isTokenRevoked gagal (fail-open, blocklist dilewati — jalankan migrasi 005 bila tabel belum ada):', err?.message || err);
    return false;
  }
}

/**
 * Mencatat token ke blocklist logout. Dipakai route logout; best-effort —
 * bila gagal (mis. tabel belum ada atau DB down), kembalikan false dan
 * catat warning. Pemanggil TIDAK BOLEH menggagalkan logout karenanya
 * (cookie tetap dihapus; token tanpa jti memang tidak dapat dicabut).
 *
 * Setiap pemanggilan yang berhasil juga memangkas entri blocklist yang
 * sudah kedaluwarsa (pruning oportunistik di jalur tulis — jalur baca
 * tetap SELECT murni).
 */
export async function revokeToken(jti: string, userId: number, expiresAt: Date): Promise<boolean> {
  if (!jti) return false;
  try {
    await query(
      `INSERT IGNORE INTO revoked_tokens (jti, user_id, expires_at) VALUES (?, ?, ?)`,
      [jti, userId, expiresAt]
    );
    // Pruning oportunistik — kegagalannya tidak menggagalkan revoke.
    await pruneRevokedTokens();
    return true;
  } catch (err: any) {
    console.warn('[Token Revocation] revokeToken gagal (token TIDAK masuk blocklist — jalankan migrasi 005 bila tabel belum ada):', err?.message || err);
    return false;
  }
}

/**
 * Menghapus entri blocklist yang sudah kedaluwarsa. Dipanggil oportunistik
 * dari `revokeToken` (setiap logout) dan dapat dipanggil dari job
 * pemeliharaan bila ada. Mengembalikan jumlah baris yang dihapus (0 bila
 * gagal — kegagalan dicatat, bukan dilempar).
 */
export async function pruneRevokedTokens(): Promise<number> {
  try {
    const result = await query<any>(
      `DELETE FROM revoked_tokens WHERE expires_at <= NOW()`,
      []
    );
    const n = Number(result?.affectedRows);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch (err: any) {
    console.warn('[Token Revocation] pruneRevokedTokens gagal:', err?.message || err);
    return 0;
  }
}

/**
 * Memeriksa apakah sesi JWT masih berlaku terhadap keadaan terkini di DB.
 * Menolak bila:
 * - tokenVersion di token berbeda dari token_version di DB (token
 *   diterbitkan sebelum reset password);
 * - status akun 'suspended' atau 'inactive' (sama seperti penolakan di
 *   route login — suspensi/nonaktivasi langsung mematikan sesi berjalan);
 * - akun tidak ditemukan atau sudah soft-deleted;
 * - T6: jti token ada di blocklist logout (`revoked_tokens`) dan belum
 *   kedaluwarsa (token pra-T6 tanpa jti tidak dapat dicek — lihat header
 *   modul).
 *
 * T6: bila valid, kembalikan juga `role`, `status`, dan `is_verified`
 * terkini dari DB. Pemanggil WAJIB memakai nilai-nilai itu — klaim token
 * hanya dipakai sebagai fallback saat fail-open (DB tidak terjangkau).
 *
 * Fail-open bila DB tidak dapat diakses: versi/role/logout tidak mungkin
 * berubah saat DB tidak terjangkau (semuanya butuh tulis DB), dan
 * memblokir semua sesi saat outage akan melumpuhkan aplikasi. Kegagalan
 * dicatat ke log. Pemeriksaan blocklist sendiri juga fail-open (lihat
 * `isTokenRevoked`) sehingga tabel `revoked_tokens` yang belum ada
 * tidak mematahkan revalidasi role/status + token_version.
 */
export async function checkSessionRevocation(payload: {
  userId: number;
  tokenVersion?: number;
  jti?: string;
}): Promise<SessionRevocationCheck> {
  try {
    const rows = await query<any[]>(
      `SELECT token_version, role, status, is_verified, deleted_at FROM users WHERE id = ? LIMIT 1`,
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
    // T6: blocklist logout — pemeriksaannya sendiri fail-open, jadi tabel
    // yang belum ada (migrasi 005 belum dijalankan) tidak mematahkan
    // pemeriksaan di atas.
    if (payload.jti && (await isTokenRevoked(payload.jti))) {
      return { valid: false, reason: 'sesi telah dicabut (pengguna sudah logout)' };
    }
    return {
      valid: true,
      dbRole: user.role as SessionRevocationCheck['dbRole'],
      dbStatus: user.status as SessionRevocationCheck['dbStatus'],
      dbIsVerified: Boolean(user.is_verified),
    };
  } catch (err: any) {
    console.warn('[Token Revocation] checkSessionRevocation gagal (fail-open, sesi tetap dipercaya):', err?.message || err);
    return { valid: true };
  }
}
