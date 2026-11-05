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

export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL('/', request.url), { status: 303 });
  response.cookies.set(USER_COOKIE_NAME, '', clearCookieOptions);
  response.cookies.set(ADMIN_COOKIE_NAME, '', clearCookieOptions);
  return response;
}

export async function POST(request: NextRequest) {
  return GET(request);
}
