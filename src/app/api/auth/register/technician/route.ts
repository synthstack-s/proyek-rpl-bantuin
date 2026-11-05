import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { pool, query } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { technicianRegisterSchema } from '@/lib/validations/auth';
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

    // 1. Validasi input teknisi dengan Zod
    const validation = technicianRegisterSchema.safeParse(body);
    if (!validation.success) {
      const firstIssue = validation.error.issues[0];
      return NextResponse.json(
        {
          success: false,
          message: firstIssue?.message || 'Data registrasi teknisi tidak valid',
          errors: validation.error.format(),
        },
        { status: 422 }
      );
    }

    const { full_name, phone_number, email, password, years_of_experience, bio } = validation.data;

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
        const otpResult = await createAndSendOtp({
          userId: existing.id,
          targetPhone: phone_number,
          purpose: 'registration',
        });

        return NextResponse.json({
          success: true,
          message: 'Akun Teknisi Anda telah terdaftar sebelumnya dan menunggu verifikasi. Kode OTP baru telah dikirim ke WhatsApp Anda.',
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

    // 3. Simpan akun teknisi baru dan profil teknisi dalam database transaction
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
        ) VALUES (?, ?, ?, ?, 'technician', 'pending_verification', FALSE, NOW(), NOW())`,
        [userUuid, email, phone_number, passwordHash]
      );

      newUserId = userInsert.insertId;

      await connection.execute(
        `INSERT INTO technician_profiles (
          user_id,
          full_name,
          bio,
          years_of_experience,
          is_available,
          verified_status,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, FALSE, 'pending', NOW(), NOW())`,
        [newUserId, full_name, bio || null, years_of_experience || 0]
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
        message: 'Registrasi teknisi berhasil! Kode OTP verifikasi nomor WhatsApp telah dikirim.',
        data: {
          userId: newUserId,
          phone: maskPhoneNumber(phone_number),
          targetPhone: phone_number,
          role: 'technician',
          status: 'pending_verification',
          technicianVerifiedStatus: 'pending',
          cooldownSeconds: otpResult.cooldownSeconds || 60,
          deliveryWarning: otpResult.deliveryStatus === 'failed' ? otpResult.error : undefined,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('[Register Technician Error]:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Terjadi kegagalan server saat memproses registrasi teknisi.',
      },
      { status: 500 }
    );
  }
}

