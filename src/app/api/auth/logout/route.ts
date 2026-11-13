import { NextRequest, NextResponse } from 'next/server';
import {
  USER_COOKIE_NAME,
  ADMIN_COOKIE_NAME,
  verifyUserToken,
  verifyAdminToken,
} from '@/lib/auth';
import { revokeToken } from '@/lib/token-revocation';

const clearCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 0,
  expires: new Date(0),
};

/**
 * T6 — Mencatat token sesi yang sedang aktif ke blocklist logout
 * (`revoked_tokens`) agar tidak dapat dipakai lagi setelah logout.
 *
 * Best-effort: logout tetap berhasil (cookie dihapus) walau pencabutan
 * gagal — mis. DB down atau migrasi 005 belum dijalankan. Token pra-T6
 * tanpa klaim `jti` tidak dapat dicabut satu per satu (hanya cookie-nya
 * yang dihapus); token semacam itu kedaluwarsa sendiri maksimal 7 hari
 * dan tetap tunduk pada revalidasi role/status + token_version.
 */
async function revokeSessionTokens(request: NextRequest): Promise<void> {
  const candidates: Array<{ token: string | undefined; verify: (t: string) => Promise<{ userId: number; jti?: string; exp?: number } | null> }> = [
    { token: request.cookies.get(USER_COOKIE_NAME)?.value, verify: verifyUserToken },
    { token: request.cookies.get(ADMIN_COOKIE_NAME)?.value, verify: verifyAdminToken },
  ];

  for (const { token, verify } of candidates) {
    if (!token) continue;
    try {
      const session = await verify(token);
      if (!session || !session.jti) continue;
      // Kedaluwarsa entri blocklist = kedaluwarsa token asli; bila klaim
      // exp hilang (tidak seharusnya terjadi — semua token membawa exp),
      // pakai 7 hari dari sekarang (durasi token maksimum) agar entri
      // tetap kedaluwarsa dan ter-prune.
      const expiresAt = new Date((session.exp ?? Date.now() / 1000 + 7 * 24 * 3600) * 1000);
      await revokeToken(session.jti, session.userId, expiresAt);
    } catch {
      // Token tidak valid / verifikasi gagal — tidak ada yang perlu dicabut.
    }
  }
}

export async function POST(request: NextRequest) {
  // T6: cabut token di blocklist dulu, lalu hapus cookie seperti biasa.
  await revokeSessionTokens(request);

  const acceptHeader = request.headers.get('accept') || '';
  const contentType = request.headers.get('content-type') || '';
  const secFetchDest = request.headers.get('sec-fetch-dest') || '';
  const redirectParam = request.nextUrl.searchParams.get('redirect');

  // Deteksi jika panggilan berasal dari navigasi browser / form submission langsung
  const isBrowserFormSubmission =
    acceptHeader.includes('text/html') ||
    contentType.includes('application/x-www-form-urlencoded') ||
    secFetchDest === 'document' ||
    Boolean(redirectParam);

  if (isBrowserFormSubmission) {
    // Alihkan langsung ke menu pengunjung (/)
    const redirectTarget = redirectParam || '/';
    const response = NextResponse.redirect(new URL(redirectTarget, request.url), { status: 303 });
    response.cookies.set(USER_COOKIE_NAME, '', clearCookieOptions);
    response.cookies.set(ADMIN_COOKIE_NAME, '', clearCookieOptions);
    return response;
  }

  // Panggilan API/fetch programmatic (misal dari client-side helper atau unit test)
  const response = NextResponse.json({
    success: true,
    message: 'Anda telah berhasil keluar dari sesi BANTUIN.',
    redirectUrl: '/',
  });

  // Hapus cookie sesi pengguna dan admin
  response.cookies.set(USER_COOKIE_NAME, '', clearCookieOptions);
  response.cookies.set(ADMIN_COOKIE_NAME, '', clearCookieOptions);

  return response;
}

export async function GET(request: NextRequest) {
  // T6: cabut token di blocklist dulu, lalu hapus cookie seperti biasa.
  await revokeSessionTokens(request);

  const redirectTarget = request.nextUrl.searchParams.get('redirect') || '/';
  const response = NextResponse.redirect(new URL(redirectTarget, request.url), { status: 303 });
  response.cookies.set(USER_COOKIE_NAME, '', clearCookieOptions);
  response.cookies.set(ADMIN_COOKIE_NAME, '', clearCookieOptions);
  return response;
}
