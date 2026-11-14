/**
 * auth.ts — API auth untuk route handler & server component (NODE RUNTIME).
 *
 * Modul ini mengekspor ulang semua fungsi token dari auth-edge.ts, ditambah
 * getAdminSession/getUserSession yang melakukan pemeriksaan pencabutan
 * berbasis DB (T5). Semua import yang sudah ada dari '@/lib/auth' tetap
 * berfungsi tanpa perubahan.
 *
 * PERINGATAN — modul ini Node-only (mengimpor @/lib/token-revocation →
 * @/lib/db → mysql2). JANGAN mengimpornya dari middleware atau route
 * Edge runtime; middleware harus mengimpor dari '@/lib/auth-edge'.
 * Mengimpor modul ini dari Edge akan mematahkan build produksi.
 */

import { cookies } from 'next/headers';
import { checkSessionRevocation } from '@/lib/token-revocation';

export * from './auth-edge';
import {
  ADMIN_COOKIE_NAME,
  USER_COOKIE_NAME,
  verifyAdminToken,
  verifyUserToken,
} from './auth-edge';
import type { AdminSessionPayload, UserSessionPayload } from './auth-edge';

/**
 * Mengambil dan memvalidasi sesi admin aktif dari HttpOnly cookie di server component / route handler.
 *
 * T5: setelah tanda tangan JWT diverifikasi, sesi juga diperiksa terhadap
 * DB — token yang diterbitkan sebelum reset password (tokenVersion lebih
 * lama dari users.token_version) ditolak, begitu pula akun yang
 * di-suspend/di-nonaktifkan/dihapus.
 *
 * T6: role juga direvalidasi dari DB — sesi admin HANYA sah bila role
 * terkini di DB adalah 'admin'. Admin yang dicopot (role diubah di DB)
 * langsung kehilangan akses admin meskipun tokennya belum kedaluwarsa.
 * Token yang sudah logout (jti di blocklist) juga ditolak. Bila DB tidak
 * dapat diakses, pemeriksaan fail-open seperti T5 (klaim token dipakai
 * apa adanya — lihat token-revocation.ts).
 */
export async function getAdminSession(): Promise<AdminSessionPayload | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
    if (!token) return null;

    const session = await verifyAdminToken(token);
    if (!session) return null;

    const check = await checkSessionRevocation(session);
    if (!check.valid) {
      console.warn('[Auth] Sesi admin ditolak:', check.reason, '(userId', session.userId + ')');
      return null;
    }

    // T6: role DB menang atas klaim token. Sesi admin mensyaratkan role
    // 'admin' di DB — bila admin dicopot, token lamanya tidak lagi memberi
    // akses admin. (dbRole kosong hanya saat fail-open DB-down; saat itu
    // klaim token dipertahankan sesuai kebijakan fail-open T5.)
    if (check.dbRole !== undefined && check.dbRole !== 'admin') {
      console.warn('[Auth] Sesi admin ditolak: role di DB adalah', check.dbRole, 'bukan admin (userId', session.userId + ')');
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

/**
 * Mengambil dan memvalidasi sesi customer/teknisi aktif dari HttpOnly cookie.
 *
 * T5: setelah tanda tangan JWT diverifikasi, sesi juga diperiksa terhadap
 * DB — token yang diterbitkan sebelum reset password (tokenVersion lebih
 * lama dari users.token_version) ditolak, begitu pula akun yang
 * di-suspend/di-nonaktifkan/dihapus.
 *
 * T6: role/status/isVerified yang dikembalikan adalah nilai TERKINI dari
 * DB, bukan klaim token. Perubahan role (promosi/demosi) langsung berlaku
 * pada sesi yang sudah berjalan; token yang sudah logout (jti di
 * blocklist) ditolak. Bila DB tidak dapat diakses, pemeriksaan fail-open
 * seperti T5 (klaim token dipakai apa adanya — lihat
 * token-revocation.ts).
 */
export async function getUserSession(): Promise<UserSessionPayload | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(USER_COOKIE_NAME)?.value;
    if (!token) return null;

    const session = await verifyUserToken(token);
    if (!session) return null;

    const check = await checkSessionRevocation(session);
    if (!check.valid) {
      console.warn('[Auth] Sesi pengguna ditolak:', check.reason, '(userId', session.userId + ')');
      return null;
    }

    // T6: DB menang atas klaim token. Nilai DB dipakai bila tersedia;
    // bila kosong (fail-open DB-down), klaim token dipertahankan.
    if (check.dbRole !== undefined && check.dbRole !== session.role) {
      console.warn('[Auth] Role sesi disesuaikan dari DB:', session.role, '->', check.dbRole, '(userId', session.userId + ')');
    }
    return {
      ...session,
      role: check.dbRole ?? session.role,
      status: check.dbStatus ?? session.status,
      isVerified: check.dbIsVerified ?? session.isVerified,
    };
  } catch {
    return null;
  }
}
