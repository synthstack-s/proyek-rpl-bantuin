import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { pool, query } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { customerRegisterSchema } from '@/lib/validations/auth';
import { createAndSendOtp } from '@/lib/otp';
import { maskPhoneNumber } from '@/lib/fonnte';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { success: false, message: 'Format payload tidak valid' },
        { status: 400 }
      );
    }

    // 1. Validasi input dengan Zod
    const validation = customerRegisterSchema.safeParse(body);
    if (!validation.success) {
      const firstIssue = validation.error.issues[0];
      return NextResponse.json(
        {
          success: false,
          message: firstIssue?.message || 'Data registrasi tidak valid',
          errors: validation.error.format(),
        },
        { status: 422 }
      );
    }

    const { full_name, phone_number, email, password } = validation.data;

    // 2. Cek apakah email atau nomor telepon sudah terdaftar
    const existingUsers = await query<any[]>(
      `SELECT id, email, phone_number, role, status, is_verified
       FROM users
       WHERE email = ? OR phone_number = ?
       LIMIT 1`,
      [email, phone_number]
    );

    if (existingUsers.length > 0) {
      const existing = existingUsers[0];
      if (existing.is_verified) {
        return NextResponse.json(
          {
            success: false,
            message: 'Email atau Nomor WhatsApp sudah terdaftar. Silakan masuk ke akun Anda.',
          },
          { status: 409 }
        );
      } else {
        // Akun sudah ada tapi belum terverifikasi kontak WhatsApp-nya.
        // Kirimkan OTP ulang ke nomor WhatsApp akun tersebut.
        const otpResult = await createAndSendOtp({
          userId: existing.id,
          targetPhone: phone_number,
          purpose: 'registration',
        });

        return NextResponse.json({
          success: true,
          message: 'Akun Anda telah terdaftar sebelumnya dan menunggu verifikasi. Kode OTP baru telah dikirim ke WhatsApp Anda.',
          data: {
            userId: existing.id,
            phone: maskPhoneNumber(phone_number),
            targetPhone: phone_number,
            role: existing.role,
            status: existing.status,
            cooldownSeconds: otpResult.cooldownSeconds || 60,
          },
        });
      }
    }

    // 3. Simpan akun baru dan profil customer dalam database transaction
    const connection = await pool.getConnection();
    let newUserId: number;

    try {
      await connection.beginTransaction();

      const userUuid = crypto.randomUUID();
      const passwordHash = await hashPassword(password);

      const [userInsert]: any = await connection.execute(
        `INSERT INTO users (
          uuid,
          email,
          phone_number,
          password_hash,
          role,
          status,
          is_verified,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, 'customer', 'pending_verification', FALSE, NOW(), NOW())`,
        [userUuid, email, phone_number, passwordHash]
      );

      newUserId = userInsert.insertId;

      await connection.execute(
        `INSERT INTO customer_profiles (
          user_id,
          full_name,
          created_at,
          updated_at
        ) VALUES (?, ?, NOW(), NOW())`,
        [newUserId, full_name]
      );

      await connection.commit();
    } catch (dbErr: any) {
      await connection.rollback();
      if (dbErr.code === 'ER_DUP_ENTRY') {
        return NextResponse.json(
          {
            success: false,
            message: 'Email atau Nomor WhatsApp sudah digunakan oleh pengguna lain.',
          },
          { status: 409 }
        );
      }
      throw dbErr;
    } finally {
      connection.release();
    }

    // 4. Kirim kode OTP WhatsApp perdana melalui Fonnte
    const otpResult = await createAndSendOtp({
      userId: newUserId,
      targetPhone: phone_number,
      purpose: 'registration',
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Registrasi berhasil! Kode OTP verifikasi telah dikirim ke WhatsApp Anda.',
        data: {
          userId: newUserId,
          phone: maskPhoneNumber(phone_number),
          targetPhone: phone_number,
          role: 'customer',
          status: 'pending_verification',
          cooldownSeconds: otpResult.cooldownSeconds || 60,
          deliveryWarning: otpResult.deliveryStatus === 'failed' ? otpResult.error : undefined,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('[Register Customer Error]:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Terjadi kegagalan server saat memproses registrasi. Silakan coba kembali.',
      },
      { status: 500 }
    );
  }
}

