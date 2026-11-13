import { NextRequest, NextResponse } from 'next/server';
import { adminLoginSchema } from '@/lib/validations/auth';
import { query } from '@/lib/db';
import {
  comparePassword,
  createAdminToken,
  ADMIN_COOKIE_NAME,
  getAdminCookieOptions,
  DEFAULT_COOKIE_MAX_AGE,
  REMEMBER_ME_COOKIE_MAX_AGE,
  DEFAULT_TOKEN_EXPIRY,
  REMEMBER_ME_TOKEN_EXPIRY,
} from '@/lib/auth';
import { getUserTokenVersion } from '@/lib/token-revocation';
import {
  checkLoginRateLimit,
  recordFailedLoginAttempt,
  clearLoginRateLimit,
} from '@/lib/rate-limiter';
import { recordAdminAudit } from '@/lib/audit';

interface UserRow {
  id: number;
  uuid: string;
  email: string;
  password_hash: string;
  role: 'admin' | 'customer' | 'technician';
  status: 'active' | 'inactive' | 'suspended' | 'pending_verification';
}

export async function POST(request: NextRequest) {
  try {
    // 1. Ekstraksi IP & Identitas Klien untuk Rate Limiting
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      '127.0.0.1';

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, message: 'Format data JSON tidak valid' },
        { status: 400 }
      );
    }

    // 2. Validasi Skema Input menggunakan Zod
    const validation = adminLoginSchema.safeParse(body);
    if (!validation.success) {
      const firstError = validation.error.issues[0]?.message || 'Input tidak valid';
      return NextResponse.json(
        { success: false, message: firstError },
        { status: 400 }
      );
    }

    const { email, password, rememberMe } = validation.data;
    const normalizedEmail = email.toLowerCase().trim();
    const rateLimitKey = `${ip}:${normalizedEmail}`;

    // 3. Periksa Rate Limit Percobaan Login
    const rateCheck = checkLoginRateLimit(rateLimitKey);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          message: `Terlalu banyak percobaan masuk yang gagal. Silakan coba kembali dalam ${rateCheck.retryAfterSeconds} detik demi keamanan akun.`,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateCheck.retryAfterSeconds || 60),
          },
        }
      );
    }

    // 4. Query Akun Pengguna dari Database MySQL
    // Role diverifikasi di server; input role dari browser TIDAK pernah diterima sebagai otorisasi.
    const users = await query<UserRow[]>(
      `SELECT id, uuid, email, password_hash, role, status 
       FROM users 
       WHERE email = ? AND deleted_at IS NULL 
       LIMIT 1`,
      [normalizedEmail]
    );

    const user = users && users.length > 0 ? users[0] : null;

    // 5. Cegah Enumerasi Akun: Jika akun tidak ada ATAU bukan role admin, berikan respons generik
    if (!user || user.role !== 'admin') {
      const failInfo = recordFailedLoginAttempt(rateLimitKey);
      return NextResponse.json(
        {
          success: false,
          message: 'Email atau kata sandi tidak valid',
          remainingAttempts: failInfo.remainingAttempts,
        },
        { status: 401 }
      );
    }

    // 6. Periksa Status Akun
    if (user.status !== 'active') {
      return NextResponse.json(
        {
          success: false,
          message: 'Akun administrator Anda sedang non-aktif atau ditangguhkan. Hubungi tim teknis.',
        },
        { status: 403 }
      );
    }

    // 7. Verifikasi Hash Kata Sandi menggunakan bcrypt
    const isPasswordValid = await comparePassword(password, user.password_hash);
    if (!isPasswordValid) {
      const failInfo = recordFailedLoginAttempt(rateLimitKey);
      return NextResponse.json(
        {
          success: false,
          message: 'Email atau kata sandi tidak valid',
          remainingAttempts: failInfo.remainingAttempts,
        },
        { status: 401 }
      );
    }

    // 8. Bersihkan Counter Percobaan Login setelah Berhasil & Catat Audit Log
    clearLoginRateLimit(rateLimitKey);

    await recordAdminAudit({
      adminUserId: user.id,
      action: 'ADMIN_LOGIN',
      entityName: 'users',
      entityId: user.id,
      ipAddress: ip,
      userAgent: request.headers.get('user-agent'),
      newValues: { login_time: new Date().toISOString(), status: 'success' },
    });

    // 9. Tentukan Masa Berlaku Sesi & Buat Signed JWT
    const tokenExpiry = rememberMe ? REMEMBER_ME_TOKEN_EXPIRY : DEFAULT_TOKEN_EXPIRY;
    const cookieMaxAge = rememberMe ? REMEMBER_ME_COOKIE_MAX_AGE : DEFAULT_COOKIE_MAX_AGE;

    // T5: sematkan tokenVersion terkini agar token yang diterbitkan sesudah
    // reset password tidak langsung ditolak oleh pemeriksaan pencabutan.
    const tokenVersion = await getUserTokenVersion(user.id);
    const token = await createAdminToken(
      {
        userId: user.id,
        uuid: user.uuid,
        email: user.email,
        role: 'admin',
        tokenVersion,
      },
      tokenExpiry
    );

    // 10. Siapkan Respons & Set HttpOnly, Secure, SameSite Cookie
    // JANGAN PERNAH mengirimkan password_hash atau token rahasia ke body JSON
    const response = NextResponse.json(
      {
        success: true,
        message: 'Login administrator berhasil',
        user: {
          uuid: user.uuid,
          email: user.email,
          role: user.role,
        },
      },
      { status: 200 }
    );

    const cookieOpts = getAdminCookieOptions(cookieMaxAge);
    response.cookies.set(ADMIN_COOKIE_NAME, token, cookieOpts);

    return response;
  } catch (error: any) {
    // Log internal error tanpa membocorkan kredensial atau stack trace ke klien
    console.error('[Admin Auth Login Error]:', error.message || error);
    return NextResponse.json(
      { success: false, message: 'Terjadi kesalahan sistem saat memproses autentikasi' },
      { status: 500 }
    );
  }
}
