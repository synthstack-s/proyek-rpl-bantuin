import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { otpSendSchema } from '@/lib/validations/auth';
import { createAndSendOtp } from '@/lib/otp';
import { maskPhoneNumber, normalizePhoneNumber } from '@/lib/fonnte';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { success: false, message: 'Format payload tidak valid' },
        { status: 400 }
      );
    }

    const validation = otpSendSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          message: validation.error.issues[0]?.message || 'Data permohonan OTP tidak valid',
        },
        { status: 422 }
      );
    }

    const { user_id, phone_number, purpose } = validation.data;

    if (!user_id && !phone_number) {
      return NextResponse.json(
        { success: false, message: 'ID pengguna atau nomor telepon wajib disertakan' },
        { status: 400 }
      );
    }

    // Cari pengguna di database
    let users: any[];
    if (user_id) {
      users = await query<any[]>(
        `SELECT id, phone_number, status, is_verified, role FROM users WHERE id = ? LIMIT 1`,
        [user_id]
      );
    } else {
      const normalized = normalizePhoneNumber(phone_number!);
      users = await query<any[]>(
        `SELECT id, phone_number, status, is_verified, role FROM users WHERE phone_number = ? LIMIT 1`,
        [normalized]
      );
    }

    if (!users || users.length === 0) {
      // Keamanan: hindari user enumeration pada publik, kembalikan pesan netral
      return NextResponse.json(
        { success: false, message: 'Data pengguna tidak ditemukan dalam sistem.' },
        { status: 404 }
      );
    }

    const user = users[0];

    // Cek apakah akun diblokir/suspended
    if (user.status === 'suspended') {
      return NextResponse.json(
        { success: false, message: 'Akun Anda sedang ditangguhkan. Hubungi tim dukungan BANTUIN.' },
        { status: 403 }
      );
    }

    // Jika purpose adalah registrasi tapi akun sudah terverifikasi
    if (purpose === 'registration' && user.is_verified) {
      return NextResponse.json(
        { success: false, message: 'Nomor WhatsApp akun ini sudah terverifikasi. Silakan langsung masuk.' },
        { status: 400 }
      );
    }

    // Buat dan kirim OTP via Fonnte
    const result = await createAndSendOtp({
      userId: user.id,
      targetPhone: user.phone_number,
      purpose,
    });

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          message: result.error || 'Gagal mengirimkan kode OTP',
          cooldownSeconds: result.cooldownSeconds || 0,
        },
        { status: result.cooldownSeconds ? 429 : 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Kode verifikasi OTP baru berhasil dikirim ke nomor WhatsApp Anda.',
      data: {
        userId: user.id,
        phone: maskPhoneNumber(user.phone_number),
        cooldownSeconds: result.cooldownSeconds || 60,
      },
    });
  } catch (error: any) {
    console.error('[OTP Send Error]:', error);
    return NextResponse.json(
      { success: false, message: 'Terjadi kesalahan sistem saat memproses pengiriman OTP' },
      { status: 500 }
    );
  }
}

