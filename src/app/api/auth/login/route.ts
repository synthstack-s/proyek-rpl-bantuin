/**
 * POST /api/auth/login — SATU-SATUNYA endpoint login BANTUIN.
 *
 * Satu panel login (/login) dan satu endpoint login untuk SEMUA peran
 * (admin, pelanggan, teknisi). Endpoint login admin terpisah
 * (POST /api/admin/auth/login) dihapus — perilakunya yang benar
 * dilestarikan di sini:
 * - Admin login hanya dengan kata sandi (TANPA gerbang verifikasi OTP);
 *   gerbang OTP (F-05) hanya berlaku untuk pelanggan/teknisi.
 * - Login admin yang berhasil dicatat ke audit log (aksi ADMIN_LOGIN).
 * - Admin mendapat token + cookie admin (bukan token pengguna) dan
 *   redirectUrl '/admin'.
 *
 * Peran SELALU dibaca dari database (users.role) — tidak pernah dari
 * field yang dikirim klien. Urutan pemeriksaan: rate limit -> cari akun
 * -> kata sandi -> status akun -> (non-admin) verifikasi OTP. Status akun
 * baru diungkap sesudah kata sandi benar, agar keberadaan/status akun
 * tidak bocor ke penelepon yang tidak terautentikasi.
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import {
  comparePassword,
  createUserToken,
  getUserCookieOptions,
  createAdminToken,
  getAdminCookieOptions,
  DEFAULT_TOKEN_EXPIRY,
  REMEMBER_ME_TOKEN_EXPIRY,
  DEFAULT_COOKIE_MAX_AGE,
  REMEMBER_ME_COOKIE_MAX_AGE,
} from '@/lib/auth';
import { userLoginSchema } from '@/lib/validations/auth';
import { getUserTokenVersion } from '@/lib/token-revocation';
import { checkLoginRateLimit, recordFailedLoginAttempt, clearLoginRateLimit } from '@/lib/rate-limiter';
import { normalizePhoneNumber, maskPhoneNumber } from '@/lib/fonnte';
import { createAndSendOtp } from '@/lib/otp';
import { recordAdminAudit } from '@/lib/audit';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { success: false, message: 'Format payload tidak valid' },
        { status: 400 }
      );
    }

    // 1. Validasi struktur request
    const validation = userLoginSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          message: validation.error.issues[0]?.message || 'Input kredensial tidak valid',
        },
        { status: 422 }
      );
    }

    const { identifier, password, rememberMe } = validation.data;
    const trimmedId = identifier.trim().toLowerCase();

    // IP klien untuk audit log login admin (informasional).
    const clientIp =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      '127.0.0.1';

    // 2. Cek perlindungan brute-force via sliding-window rate limiter
    const rateCheck = checkLoginRateLimit(trimmedId);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          message: `Terlalu banyak percobaan gagal. Akun diblokir sementara. Silakan coba lagi dalam ${rateCheck.retryAfterSeconds} detik.`,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateCheck.retryAfterSeconds || 60),
          },
        }
      );
    }

    // 3. Normalisasi jika identifier adalah nomor telepon
    const normalizedPhone = normalizePhoneNumber(trimmedId);

    // 4. Cari pengguna berdasarkan email atau nomor telepon.
    // Akun yang dihapus (soft-delete) tidak dapat login.
    const users = await query<any[]>(
      `SELECT u.id, u.uuid, u.email, u.phone_number, u.password_hash, u.role, u.status, u.is_verified,
              cp.full_name AS customer_name,
              tp.full_name AS technician_name,
              tp.verified_status AS technician_verified_status
       FROM users u
       LEFT JOIN customer_profiles cp ON u.id = cp.user_id
       LEFT JOIN technician_profiles tp ON u.id = tp.user_id
       WHERE (u.email = ? OR u.phone_number = ?) AND u.deleted_at IS NULL
       LIMIT 1`,
      [trimmedId, normalizedPhone]
    );

    if (!users || users.length === 0) {
      recordFailedLoginAttempt(trimmedId);
      return NextResponse.json(
        { success: false, message: 'Email/Nomor WhatsApp atau kata sandi tidak valid.' },
        { status: 401 }
      );
    }

    const user = users[0];

    // 5. Verifikasi kata sandi
    const isPasswordValid = await comparePassword(password, user.password_hash);
    if (!isPasswordValid) {
      const failRecord = recordFailedLoginAttempt(trimmedId);
      return NextResponse.json(
        {
          success: false,
          message: failRecord.isBlocked
            ? `Terlalu banyak percobaan gagal. Akun Anda diblokir sementara selama ${failRecord.retryAfterSeconds} detik.`
            : `Email/Nomor WhatsApp atau kata sandi tidak valid. Sisa percobaan: ${failRecord.remainingAttempts} kali.`,
        },
        { status: 401 }
      );
    }

    // 6. Cek status akun
    if (user.status === 'suspended') {
      return NextResponse.json(
        { success: false, message: 'Akun Anda sedang ditangguhkan. Hubungi tim dukungan BANTUIN.' },
        { status: 403 }
      );
    }

    if (user.status === 'inactive') {
      return NextResponse.json(
        { success: false, message: 'Akun Anda saat ini tidak aktif.' },
        { status: 403 }
      );
    }

    // 7. Cek verifikasi kontak WhatsApp — HANYA untuk pelanggan/teknisi.
    // Admin login hanya dengan kata sandi (perilaku endpoint admin lama);
    // akun admin dibuat lewat seed/CLI dan tidak melewati alur OTP.
    if (user.role !== 'admin' && !user.is_verified) {
      // Kirim ulang kode OTP untuk verifikasi sebelum mengizinkan login
      const otpRes = await createAndSendOtp({
        userId: user.id,
        targetPhone: user.phone_number,
        purpose: 'registration',
      });

      return NextResponse.json(
        {
          success: false,
          needsVerification: true,
          message: 'Nomor WhatsApp Anda belum diverifikasi. Kode OTP verifikasi baru telah dikirimkan ke WhatsApp Anda.',
          data: {
            userId: user.id,
            phone: maskPhoneNumber(user.phone_number),
            targetPhone: user.phone_number,
            cooldownSeconds: otpRes.cooldownSeconds || 60,
          },
        },
        { status: 403 }
      );
    }

    // 8. Berhasil login! Reset counter percobaan gagal
    clearLoginRateLimit(trimmedId);

    const fullName = user.customer_name || user.technician_name || (user.role === 'admin' ? 'Administrator' : 'Pengguna BANTUIN');

    // 9. Terbitkan token sesi dan cookie berdasarkan peran
    // T5: sematkan tokenVersion terkini agar token yang diterbitkan sesudah
    // reset password tidak langsung ditolak oleh pemeriksaan pencabutan.
    const tokenVersion = await getUserTokenVersion(user.id);
    let response: NextResponse;
    let redirectUrl = '/customer/dashboard';

    if (user.role === 'admin') {
      redirectUrl = '/admin';

      // Catat login admin ke audit log (aksi ADMIN_LOGIN), seperti yang
      // dilakukan endpoint login admin lama. recordAdminAudit tidak
      // pernah melempar — kegagalan audit tidak membatalkan login.
      await recordAdminAudit({
        adminUserId: user.id,
        action: 'ADMIN_LOGIN',
        entityName: 'users',
        entityId: user.id,
        ipAddress: clientIp,
        userAgent: request.headers.get('user-agent'),
        newValues: { login_time: new Date().toISOString(), status: 'success' },
      });

      const adminToken = await createAdminToken(
        {
          userId: user.id,
          uuid: user.uuid,
          email: user.email,
          role: 'admin',
          name: fullName,
          tokenVersion,
        },
        rememberMe ? REMEMBER_ME_TOKEN_EXPIRY : DEFAULT_TOKEN_EXPIRY
      );

      response = NextResponse.json({
        success: true,
        message: 'Login Administrator berhasil.',
        data: {
          user: {
            id: user.id,
            uuid: user.uuid,
            email: user.email,
            phone: user.phone_number,
            role: user.role,
            name: fullName,
          },
          redirectUrl,
        },
      });

      const adminCookieOpts = getAdminCookieOptions(rememberMe ? REMEMBER_ME_COOKIE_MAX_AGE : DEFAULT_COOKIE_MAX_AGE);
      response.cookies.set(adminCookieOpts.name, adminToken, adminCookieOpts);
    } else {
      if (user.role === 'technician') {
        redirectUrl = '/technician/dashboard';
      }

      const userToken = await createUserToken(
        {
          userId: user.id,
          uuid: user.uuid,
          email: user.email,
          phoneNumber: user.phone_number,
          role: user.role,
          status: user.status,
          isVerified: true,
          name: fullName,
          tokenVersion,
        },
        rememberMe
      );

      response = NextResponse.json({
        success: true,
        message: `Login berhasil! Selamat datang, ${fullName}.`,
        data: {
          user: {
            id: user.id,
            uuid: user.uuid,
            email: user.email,
            phone: user.phone_number,
            role: user.role,
            name: fullName,
            status: user.status,
            technicianVerifiedStatus: user.technician_verified_status || null,
          },
          redirectUrl,
        },
      });

      const userCookieOpts = getUserCookieOptions(rememberMe);
      response.cookies.set(userCookieOpts.name, userToken, userCookieOpts);
    }

    return response;
  } catch (error: any) {
    console.error('[User Login Error]:', error);
    return NextResponse.json(
      { success: false, message: 'Terjadi kegagalan server saat memproses login.' },
      { status: 500 }
    );
  }
}
