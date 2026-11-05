import { NextRequest, NextResponse } from 'next/server';
import { USER_COOKIE_NAME, ADMIN_COOKIE_NAME } from '@/lib/auth';

const clearCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 0,
  expires: new Date(0),
};

export async function POST(request: NextRequest) {
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
  const redirectTarget = request.nextUrl.searchParams.get('redirect') || '/';
  const response = NextResponse.redirect(new URL(redirectTarget, request.url), { status: 303 });
  response.cookies.set(USER_COOKIE_NAME, '', clearCookieOptions);
  response.cookies.set(ADMIN_COOKIE_NAME, '', clearCookieOptions);
  return response;
}
