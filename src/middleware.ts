import { NextRequest, NextResponse } from 'next/server';
// T5: middleware (Edge runtime) WAJIB mengimpor dari auth-edge, BUKAN
// @/lib/auth — auth.ts menarik mysql2 (via token-revocation) dan akan
// mematahkan build produksi. Middleware hanya memverifikasi tanda tangan
// JWT; pencabutan token ditegakkan di route handler/server component
// melalui getAdminSession/getUserSession.
import {
  verifyAdminToken,
  verifyUserToken,
  ADMIN_COOKIE_NAME,
  USER_COOKIE_NAME,
} from '@/lib/auth-edge';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Abaikan file statis, _next, dan favicon
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // 2. Jalur autentikasi admin yang tidak butuh sesi (endpoint logout).
  // Endpoint login admin terpisah (/api/admin/auth/login) DIHAPUS —
  // login semua peran memakai POST /api/auth/login (panel terpadu).
  const isAdminLoginPage = pathname === '/admin/login';
  const isAdminAuthApi = pathname === '/api/admin/auth/logout';

  if (isAdminAuthApi) {
    return NextResponse.next();
  }

  // 3. Ambil Token Sesi Admin dari Cookie HttpOnly
  const adminToken = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  const adminSession = adminToken ? await verifyAdminToken(adminToken) : null;
  const isAdminAuthenticated = adminSession !== null && adminSession.role === 'admin';

  // 4. Rute lama /admin/login: panel login admin terpisah DIHAPUS — satu
  // panel login untuk semua peran ada di /login. Alihkan ke sana agar
  // bookmark/tautan lama tetap berfungsi. callbackUrl diteruskan hanya
  // bila berupa path relatif internal (mencegah open redirect).
  if (isAdminLoginPage) {
    const loginUrl = new URL('/login', request.url);
    const callbackUrl = request.nextUrl.searchParams.get('callbackUrl');
    if (callbackUrl && callbackUrl.startsWith('/') && !callbackUrl.startsWith('//')) {
      loginUrl.searchParams.set('callbackUrl', callbackUrl);
    }
    return NextResponse.redirect(loginUrl);
  }

  // 5. Proteksi Seluruh Halaman Dashboard Admin (/admin/...)
  if (pathname.startsWith('/admin')) {
    if (!isAdminAuthenticated) {
      const loginUrl = new URL('/login', request.url);
      if (pathname !== '/admin') {
        loginUrl.searchParams.set('callbackUrl', pathname);
      }

      const response = NextResponse.redirect(loginUrl);
      if (adminToken) {
        response.cookies.delete(ADMIN_COOKIE_NAME);
      }
      return response;
    }
    return NextResponse.next();
  }

  // 6. Proteksi Seluruh API Admin (/api/admin/...)
  if (pathname.startsWith('/api/admin')) {
    if (!isAdminAuthenticated) {
      return NextResponse.json(
        {
          success: false,
          message: 'Akses ditolak: sesi administrator tidak valid atau telah berakhir',
        },
        { status: 401 }
      );
    }
    return NextResponse.next();
  }

  // ============================================================================
  // BAGIAN 2: AUTENTIKASI PENGGUNA UMUM (CUSTOMER & TEKNISI)
  // ============================================================================

  const userToken = request.cookies.get(USER_COOKIE_NAME)?.value;
  const userSession = userToken ? await verifyUserToken(userToken) : null;
  const isUserAuthenticated = userSession !== null;

  const isPublicAuthPage =
    pathname === '/login' ||
    pathname === '/forgot-password' ||
    pathname.startsWith('/register');

  // Jika pengguna sudah login dan mencoba mengakses /login atau /register
  if (isPublicAuthPage) {
    if (isAdminAuthenticated) {
      return NextResponse.redirect(new URL('/admin', request.url));
    }
    if (isUserAuthenticated && userSession.isVerified && userSession.role !== 'admin') {
      const targetUrl =
        userSession.role === 'technician'
          ? '/technician/dashboard'
          : '/customer/dashboard';
      return NextResponse.redirect(new URL(targetUrl, request.url));
    }
    // Token pengguna ber-role 'admin' (terbitan lama / tidak konsisten)
    // TIDAK diarahkan ke dasbor — pemiliknya harus login ulang dengan
    // kata sandi di panel ini agar memperoleh cookie admin yang sah.
    // Mengarahkannya ke /customer/dashboard akan menjebak admin dalam
    // loop redirect /login <-> /customer/dashboard <-> /admin.
    return NextResponse.next();
  }

  // Proteksi Rute Customer (/customer/...)
  if (pathname.startsWith('/customer')) {
    if (!isUserAuthenticated) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(loginUrl);
    }

    if (userSession.role !== 'customer') {
      const redirectUrl =
        userSession.role === 'technician' ? '/technician/dashboard' : '/admin';
      return NextResponse.redirect(new URL(redirectUrl, request.url));
    }

    if (!userSession.isVerified) {
      return NextResponse.redirect(new URL('/verify-otp', request.url));
    }

    return NextResponse.next();
  }

  // Proteksi Rute Teknisi (/technician/...)
  if (pathname.startsWith('/technician')) {
    if (!isUserAuthenticated) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(loginUrl);
    }

    if (userSession.role !== 'technician') {
      const redirectUrl =
        userSession.role === 'customer' ? '/customer/dashboard' : '/admin';
      return NextResponse.redirect(new URL(redirectUrl, request.url));
    }

    if (!userSession.isVerified) {
      return NextResponse.redirect(new URL('/verify-otp', request.url));
    }

    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/api/admin/:path*',
    '/customer/:path*',
    '/technician/:path*',
    '/login',
    '/forgot-password',
    '/register/:path*',
  ],
};
