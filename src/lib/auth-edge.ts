/**
 * auth-edge.ts — Bagian auth yang AMAN UNTUK EDGE RUNTIME.
 *
 * Modul ini diimpor oleh src/middleware.ts (Edge runtime). Aturannya:
 * - TIDAK BOLEH mengimpor modul Node-only (mysql2, @/lib/db,
 *   @/lib/token-revocation, next/headers).
 * - Hanya jose + bcryptjs + konstanta + fungsi token murni.
 *
 * Pemeriksaan sesi berbasis DB (pencabutan token T5, status akun) tinggal
 * di auth.ts (Node-only) — getAdminSession/getUserSession. Middleware hanya
 * memverifikasi tanda tangan JWT; pencabutan ditegakkan di route handler
 * dan server component melalui getAdminSession/getUserSession.
 *
 * JANGAN mengimpor @/lib/auth dari middleware — itu akan menarik mysql2 ke
 * dalam bundle Edge dan MEMATAHKAN build produksi (webpack edge tidak bisa
 * mem-bundle `node:diagnostics_channel` milik mysql2; terbukti di repro
 * Next.js 16.4.6).
 */

import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';

export const ADMIN_COOKIE_NAME = 'bantuin_admin_token';
export const USER_COOKIE_NAME = 'bantuin_user_token';

// Durasi token default: 8 jam (standar jam kerja operasional admin / sesi aktif)
export const DEFAULT_TOKEN_EXPIRY = '8h';
export const DEFAULT_COOKIE_MAX_AGE = 8 * 60 * 60; // 8 jam dalam detik

// Durasi token jika "Ingat perangkat ini" dicentang: 7 hari
export const REMEMBER_ME_TOKEN_EXPIRY = '7d';
export const REMEMBER_ME_COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 hari dalam detik

export interface AdminSessionPayload {
  userId: number;
  uuid: string;
  email: string;
  role: 'admin';
  name?: string;
  /**
   * T5 — Versi token (disamakan dengan users.token_version). Token lama
   * (pra-migrasi 004) tidak membawa klaim ini dan dianggap versi 1.
   */
  tokenVersion?: number;
  [key: string]: any;
}

export interface UserSessionPayload {
  userId: number;
  uuid: string;
  email: string;
  phoneNumber: string;
  role: 'admin' | 'customer' | 'technician';
  status: 'active' | 'inactive' | 'suspended' | 'pending_verification';
  isVerified: boolean;
  name?: string;
  /**
   * T5 — Versi token (disamakan dengan users.token_version). Token lama
   * (pra-migrasi 004) tidak membawa klaim ini dan dianggap versi 1.
   */
  tokenVersion?: number;
  [key: string]: any;
}

/**
 * Mengambil secret key untuk JWT dari environment variable.
 * Menghasilkan Uint8Array yang kompatibel dengan Web Crypto API (jose).
 */
function getJwtSecretKey(): Uint8Array {
  const secret = process.env.JWT_ACCESS_SECRET || process.env.AUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: JWT_ACCESS_SECRET belum dikonfigurasi di environment variables');
    }
    // Fallback khusus development lokal dengan warning keamanan
    return new TextEncoder().encode('bantuin_dev_only_insecure_jwt_secret_key_32chars_min!');
  }
  return new TextEncoder().encode(secret);
}

/**
 * Hash password menggunakan bcrypt dengan salt rounds = 12
 */
export async function hashPassword(plainText: string): Promise<string> {
  const saltRounds = Number(process.env.PASSWORD_SALT_ROUNDS) || 12;
  return bcrypt.hash(plainText, saltRounds);
}

/**
 * Verifikasi kecocokan password polos terhadap bcrypt hash
 */
export async function comparePassword(plainText: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plainText, hash);
}

/**
 * Membuat JWT bertanda tangan aman untuk sesi administrator (pertahankan kompatibilitas)
 */
export async function createAdminToken(
  payload: AdminSessionPayload,
  expiresIn: string = DEFAULT_TOKEN_EXPIRY
): Promise<string> {
  const secretKey = getJwtSecretKey();

  return new SignJWT({
    userId: payload.userId,
    uuid: payload.uuid,
    email: payload.email,
    role: 'admin',
    name: payload.name || 'Administrator',
    tokenVersion: payload.tokenVersion ?? 1,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(payload.uuid)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secretKey);
}

/**
 * Verifikasi integritas tanda tangan dan masa berlaku JWT sesi administrator.
 */
export async function verifyAdminToken(token: string): Promise<AdminSessionPayload | null> {
  try {
    const secretKey = getJwtSecretKey();
    const { payload } = await jwtVerify(token, secretKey, {
      algorithms: ['HS256'],
    });

    if (payload.role !== 'admin') {
      return null;
    }

    return {
      userId: Number(payload.userId),
      uuid: String(payload.uuid || payload.sub),
      email: String(payload.email),
      role: 'admin',
      name: payload.name ? String(payload.name) : undefined,
      tokenVersion: Number(payload.tokenVersion) || 1,
    };
  } catch {
    return null;
  }
}

/**
 * Membuat token JWT umum untuk pengguna (Customer, Teknisi, Admin)
 */
export async function createUserToken(
  payload: UserSessionPayload,
  rememberMe = false
): Promise<string> {
  const secretKey = getJwtSecretKey();
  const expiry = rememberMe ? REMEMBER_ME_TOKEN_EXPIRY : DEFAULT_TOKEN_EXPIRY;

  return new SignJWT({
    userId: payload.userId,
    uuid: payload.uuid,
    email: payload.email,
    phoneNumber: payload.phoneNumber,
    role: payload.role,
    status: payload.status,
    isVerified: payload.isVerified,
    name: payload.name || 'Pengguna',
    tokenVersion: payload.tokenVersion ?? 1,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(payload.uuid)
    .setIssuedAt()
    .setExpirationTime(expiry)
    .sign(secretKey);
}

/**
 * Verifikasi integritas tanda tangan dan masa berlaku JWT sesi pengguna umum.
 */
export async function verifyUserToken(token: string): Promise<UserSessionPayload | null> {
  try {
    const secretKey = getJwtSecretKey();
    const { payload } = await jwtVerify(token, secretKey, {
      algorithms: ['HS256'],
    });

    if (!payload.role || !['admin', 'customer', 'technician'].includes(payload.role as string)) {
      return null;
    }

    return {
      userId: Number(payload.userId),
      uuid: String(payload.uuid || payload.sub),
      email: String(payload.email),
      phoneNumber: String(payload.phoneNumber || ''),
      role: payload.role as 'admin' | 'customer' | 'technician',
      status: (payload.status as any) || 'active',
      isVerified: Boolean(payload.isVerified),
      name: payload.name ? String(payload.name) : undefined,
      tokenVersion: Number(payload.tokenVersion) || 1,
    };
  } catch {
    return null;
  }
}

/**
 * Konfigurasi opsi cookie yang aman untuk Admin (HttpOnly, Secure, SameSite: lax)
 */
export function getAdminCookieOptions(maxAgeSeconds: number = DEFAULT_COOKIE_MAX_AGE) {
  return {
    name: ADMIN_COOKIE_NAME,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

/**
 * Konfigurasi opsi cookie yang aman untuk Customer dan Teknisi (HttpOnly, Secure, SameSite: lax)
 */
export function getUserCookieOptions(rememberMe = false) {
  const maxAge = rememberMe ? REMEMBER_ME_COOKIE_MAX_AGE : DEFAULT_COOKIE_MAX_AGE;
  return {
    name: USER_COOKIE_NAME,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}
