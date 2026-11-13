import { NextRequest, NextResponse } from 'next/server';
import { query, pool } from '@/lib/db';
import { resetPasswordSchema } from '@/lib/validations/auth';
import { verifyOtpCode } from '@/lib/otp';
import { hashPassword } from '@/lib/auth';
import { bumpUserTokenVersion } from '@/lib/token-revocation';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { success: false, message: 'Format data tidak valid' },
        { status: 400 }
      );
    }

    const validation = resetPasswordSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          message: validation.error.issues[0]?.message || 'Input data reset sandi tidak valid',
        },
        { status: 422 }
      );
    }

    const { user_id, phone_number, otp_code, new_password } = validation.data;

    if (!user_id && !phone_number) {
      return NextResponse.json(
        { success: false, message: 'Identitas ID pengguna atau nomor WhatsApp harus disertakan' },
        { status: 400 }
      );
    }

    // 1. Verifikasi kode OTP secara atomik
    const verifyResult = await verifyOtpCode({
      userId: user_id,
      targetPhone: phone_number,
      otpCode: otp_code,
      purpose: 'password_reset',
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

    const targetUserId = verifyResult.userId!;

    // 2. Hash kata sandi baru
    const passwordHash = await hashPassword(new_password);

    // 3. Perbarui kata sandi dan cabut sesi refresh token lama dalam database
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      await connection.execute(
        `UPDATE users
         SET password_hash = ?, updated_at = NOW()
         WHERE id = ?`,
        [passwordHash, targetUserId]
      );

      // Cabut seluruh refresh token aktif untuk keamanan
      await connection.execute(
        `UPDATE user_refresh_tokens
         SET revoked_at = NOW()
         WHERE user_id = ? AND revoked_at IS NULL`,
        [targetUserId]
      );

      await connection.commit();
    } catch (dbErr: any) {
      await connection.rollback();
      throw dbErr;
    } finally {
      connection.release();
    }

    // T5: cabut seluruh JWT yang diterbitkan sebelum reset ini dengan
    // menaikkan users.token_version. Dilakukan TERPISAH SETELAH transaksi
    // commit — best-effort: bila kolom token_version belum ada (migrasi
    // 004 belum dijalankan), bump gagal dengan warning dan reset kata
    // sandi itu sendiri tetap berhasil. Pencabutan refresh token di atas
    // dibiarkan apa adanya: tabel user_refresh_tokens tidak pernah ditulis
    // oleh kode mana pun, jadi pencabutan itu no-op (lihat temuan T5);
    // pencabutan JWT yang nyata adalah bump token_version ini.
    const revoked = await bumpUserTokenVersion(targetUserId);
    if (!revoked) {
      console.warn('[Reset Password] PERINGATAN: token_version tidak naik — sesi lama (JWT) masih berlaku sampai kedaluwarsa. Jalankan migrasi 004.');
    }

    return NextResponse.json({
      success: true,
      message: 'Kata sandi akun Anda berhasil diperbarui! Silakan masuk dengan kata sandi baru Anda.',
    });
  } catch (error: any) {
    console.error('[Reset Password Error]:', error);
    return NextResponse.json(
      { success: false, message: 'Terjadi kesalahan sistem saat memperbarui kata sandi' },
      { status: 500 }
    );
  }
}

