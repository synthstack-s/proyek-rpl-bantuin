import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { otpVerifySchema } from '@/lib/validations/auth';
import { verifyOtpCode } from '@/lib/otp';
import { createUserToken, getUserCookieOptions } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { success: false, message: 'Format payload tidak valid' },
        { status: 400 }
      );
    }

    const validation = otpVerifySchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          message: validation.error.issues[0]?.message || 'Data verifikasi OTP tidak valid',
        },
        { status: 422 }
      );
    }

    const { user_id, phone_number, otp_code, purpose } = validation.data;

    if (!user_id && !phone_number) {
      return NextResponse.json(
        { success: false, message: 'ID pengguna atau nomor WhatsApp wajib disertakan' },
        { status: 400 }
      );
    }

    // 1. Eksekusi verifikasi OTP secara atomik
    const verifyResult = await verifyOtpCode({
      userId: user_id,
      targetPhone: phone_number,
      otpCode: otp_code,
      purpose,
    });

    if (!verifyResult.success) {
      return NextResponse.json(
        {
          success: false,
          message: verifyResult.error || 'Verifikasi kode OTP gagal',
          remainingAttempts: verifyResult.remainingAttempts,
        },
        { status: 400 }
      );
    }

    const verifiedUserId = verifyResult.userId;

    // 2. Ambil data pengguna dan profil lengkap pasca verifikasi
    const users = await query<any[]>(
      `SELECT u.id, u.uuid, u.email, u.phone_number, u.role, u.status, u.is_verified,
              cp.full_name AS customer_name,
              tp.full_name AS technician_name,
              tp.verified_status AS technician_verified_status
       FROM users u
       LEFT JOIN customer_profiles cp ON u.id = cp.user_id
       LEFT JOIN technician_profiles tp ON u.id = tp.user_id
       WHERE u.id = ? LIMIT 1`,
      [verifiedUserId]
    );

    if (!users || users.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Data pengguna tidak ditemukan' },
        { status: 404 }
      );
    }

    const user = users[0];
    const fullName = user.customer_name || user.technician_name || 'Pengguna BANTUIN';

    // 3. Terbitkan token sesi JWT pengguna (Customer atau Teknisi)
    const token = await createUserToken(
      {
        userId: user.id,
        uuid: user.uuid,
        email: user.email,
        phoneNumber: user.phone_number,
        role: user.role,
        status: user.status,
        isVerified: true,
        name: fullName,
      },
      false
    );

    // 4. Tentukan URL pengalihan berdasarkan peran
    let redirectUrl = '/customer/dashboard';
    if (user.role === 'technician') {
      redirectUrl = '/technician/dashboard';
    } else if (user.role === 'admin') {
      redirectUrl = '/admin';
    }

    const response = NextResponse.json({
      success: true,
      message: 'Nomor WhatsApp berhasil diverifikasi! Sesi Anda telah aktif.',
      data: {
        user: {
          id: user.id,
          uuid: user.uuid,
          email: user.email,
          phone: user.phone_number,
          role: user.role,
          name: fullName,
          isVerified: true,
          status: user.status,
          technicianVerifiedStatus: user.technician_verified_status || null,
        },
        redirectUrl,
      },
    });

    // 5. Tanamkan HttpOnly cookie sesi yang aman
    const cookieOpts = getUserCookieOptions(false);
    response.cookies.set(cookieOpts.name, token, cookieOpts);

    return response;
  } catch (error: any) {
    console.error('[OTP Verify Error]:', error);
    return NextResponse.json(
      { success: false, message: 'Terjadi kesalahan sistem saat memvalidasi OTP' },
      { status: 500 }
    );
  }
}

