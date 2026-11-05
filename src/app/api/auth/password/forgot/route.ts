import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { forgotPasswordSchema } from '@/lib/validations/auth';
import { normalizePhoneNumber, maskPhoneNumber } from '@/lib/fonnte';
import { createAndSendOtp } from '@/lib/otp';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { success: false, message: 'Format data tidak valid' },
        { status: 400 }
      );
    }

    const validation = forgotPasswordSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          message: validation.error.issues[0]?.message || 'Input tidak valid',
        },
        { status: 422 }
      );
    }

    const { identifier } = validation.data;
    const trimmedId = identifier.trim().toLowerCase();
    const normalizedPhone = normalizePhoneNumber(trimmedId);

    // Cari akun berdasarkan email atau nomor telepon
    const users = await query<any[]>(
      `SELECT id, email, phone_number, role, status
       FROM users
       WHERE (email = ? OR phone_number = ?) AND deleted_at IS NULL
       LIMIT 1`,
      [trimmedId, normalizedPhone]
    );

    if (!users || users.length === 0) {
      // Netral: tidak membocorkan keberadaan akun
      return NextResponse.json(
        {
          success: false,
          message: 'Akun dengan Email atau Nomor WhatsApp tersebut tidak ditemukan dalam sistem BANTUIN.',
        },
        { status: 404 }
      );
    }

    const user = users[0];

    if (user.status === 'suspended') {
      return NextResponse.json(
        {
          success: false,
          message: 'Akun Anda sedang ditangguhkan. Silakan hubungi dukungan administrator.',
        },
        { status: 403 }
      );
    }

    // Kirim kode OTP untuk tujuan reset password
    const otpResult = await createAndSendOtp({
      userId: user.id,
      targetPhone: user.phone_number,
      purpose: 'password_reset',
    });

    if (!otpResult.success) {
      return NextResponse.json(
        {
          success: false,
          message: otpResult.error || 'Gagal mengirimkan kode OTP reset sandi',
          cooldownSeconds: otpResult.cooldownSeconds || 0,
        },
        { status: otpResult.cooldownSeconds ? 429 : 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Kode verifikasi reset kata sandi telah dikirimkan ke WhatsApp Anda.',
      data: {
        userId: user.id,
        phone: maskPhoneNumber(user.phone_number),
        targetPhone: user.phone_number,
        cooldownSeconds: otpResult.cooldownSeconds || 60,
      },
    });
  } catch (error: any) {
    console.error('[Forgot Password Error]:', error);
    return NextResponse.json(
      { success: false, message: 'Terjadi kesalahan sistem saat memproses permohonan reset sandi' },
      { status: 500 }
    );
  }
}

