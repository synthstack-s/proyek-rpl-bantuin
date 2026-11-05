import crypto from 'crypto';
import { pool, query } from '@/lib/db';
import { sendOtpWhatsApp, normalizePhoneNumber } from '@/lib/fonnte';

export const OTP_EXPIRY_MINUTES = 5;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_COOLDOWN_SECONDS = 60;
export const OTP_MAX_REQUESTS_IN_WINDOW = 5;
export const OTP_WINDOW_MINUTES = 15;

export type OtpPurpose = 'registration' | 'password_reset' | 'login' | 'phone_verification';

export interface CreateOtpParams {
  userId: number;
  targetPhone: string;
  purpose: OtpPurpose;
}

export interface CreateOtpResult {
  success: boolean;
  cooldownSeconds?: number;
  deliveryStatus?: 'sent' | 'failed' | 'pending';
  messageId?: string;
  error?: string;
}

export interface VerifyOtpParams {
  userId?: number;
  targetPhone?: string;
  otpCode: string;
  purpose: OtpPurpose;
}

export interface VerifyOtpResult {
  success: boolean;
  error?: string;
  remainingAttempts?: number;
  userId?: number;
}

/**
 * Buat kode OTP numerik 6 digit acak yang aman secara kriptografis
 */
export function generateNumericOtp(length = 6): string {
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length);
  const randomNum = crypto.randomInt(min, max);
  return randomNum.toString();
}

/**
 * Hash kode OTP menggunakan SHA-256
 */
export function hashOtp(otpCode: string): string {
  return crypto.createHash('sha256').update(otpCode.trim()).digest('hex');
}

/**
 * Perbandingan hash OTP yang aman terhadap serangan timing attack (constant-time comparison)
 */
export function compareOtpHash(plainOtp: string, expectedHash: string): boolean {
  if (!plainOtp || !expectedHash) return false;
  const currentHash = hashOtp(plainOtp);
  if (currentHash.length !== expectedHash.length) return false;

  const bufA = Buffer.from(currentHash, 'hex');
  const bufB = Buffer.from(expectedHash, 'hex');
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Membuat OTP baru, menyimpan hash ke database, dan mengirimkannya via WhatsApp Fonnte.
 */
export async function createAndSendOtp(params: CreateOtpParams): Promise<CreateOtpResult> {
  const { userId, targetPhone, purpose } = params;
  const normalizedPhone = normalizePhoneNumber(targetPhone);

  // 1. Periksa batas cooldown (60 detik dari OTP terakhir untuk pengguna & tujuan yang sama)
  const recentOtps = await query<any[]>(
    `SELECT id, created_at, TIMESTAMPDIFF(SECOND, created_at, NOW()) AS elapsed_seconds
     FROM user_otps
     WHERE user_id = ? AND purpose = ?
     ORDER BY id DESC LIMIT 1`,
    [userId, purpose]
  );

  if (recentOtps.length > 0) {
    const elapsed = Number(recentOtps[0].elapsed_seconds);
    if (elapsed < OTP_COOLDOWN_SECONDS) {
      const waitSeconds = OTP_COOLDOWN_SECONDS - elapsed;
      return {
        success: false,
        cooldownSeconds: waitSeconds,
        error: `Silakan tunggu ${waitSeconds} detik sebelum meminta kode OTP baru.`,
      };
    }
  }

  // 2. Periksa batas kuota permohonan OTP (maks 5 request dalam 15 menit)
  const windowRequests = await query<any[]>(
    `SELECT COUNT(*) AS total
     FROM user_otps
     WHERE user_id = ? AND purpose = ?
       AND created_at >= NOW() - INTERVAL ? MINUTE`,
    [userId, purpose, OTP_WINDOW_MINUTES]
  );

  if (windowRequests[0]?.total >= OTP_MAX_REQUESTS_IN_WINDOW) {
    return {
      success: false,
      error: `Batas permohonan OTP tercapai (maksimal ${OTP_MAX_REQUESTS_IN_WINDOW} kali dalam ${OTP_WINDOW_MINUTES} menit). Silakan coba lagi beberapa saat lagi.`,
    };
  }

  // 3. Batalkan/kedaluwarsa-kan seluruh OTP aktif sebelumnya untuk user & purpose ini
  await query(
    `UPDATE user_otps
     SET expires_at = NOW()
     WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL AND expires_at > NOW()`,
    [userId, purpose]
  );

  // 4. Generate kode OTP kriptografis 6 digit dan hash
  const otpCode = generateNumericOtp(6);
  const otpHash = hashOtp(otpCode);

  // 5. Simpan record OTP baru ke database
  const insertRes: any = await query(
    `INSERT INTO user_otps (
      user_id,
      target_phone,
      otp_hash,
      purpose,
      attempts,
      delivery_status,
      expires_at,
      created_at
    ) VALUES (?, ?, ?, ?, 0, 'pending', NOW() + INTERVAL ? MINUTE, NOW())`,
    [userId, normalizedPhone, otpHash, purpose, OTP_EXPIRY_MINUTES]
  );

  const otpRecordId = insertRes.insertId;

  // 6. Kirim pesan ke WhatsApp via Fonnte Gateway
  const sendResult = await sendOtpWhatsApp(normalizedPhone, otpCode, OTP_EXPIRY_MINUTES);

  // 7. Perbarui status pengiriman di database
  if (sendResult.success) {
    await query(
      `UPDATE user_otps
       SET delivery_status = 'sent', fonnte_message_id = ?
       WHERE id = ?`,
      [sendResult.messageId || null, otpRecordId]
    );

    return {
      success: true,
      cooldownSeconds: OTP_COOLDOWN_SECONDS,
      deliveryStatus: 'sent',
      messageId: sendResult.messageId,
    };
  } else {
    await query(
      `UPDATE user_otps
       SET delivery_status = 'failed', delivery_error = ?
       WHERE id = ?`,
      [sendResult.error?.slice(0, 255) || 'Gagal mengirim OTP via Fonnte', otpRecordId]
    );

    return {
      success: false,
      cooldownSeconds: OTP_COOLDOWN_SECONDS,
      deliveryStatus: 'failed',
      error: sendResult.error || 'Gagal mengirim kode OTP ke WhatsApp Anda. Silakan coba kirim ulang.',
    };
  }
}

/**
 * Verifikasi kode OTP secara atomik menggunakan database transaction & row lock (FOR UPDATE).
 * Mencegah eksploitasi race condition (dua verifikasi simultan).
 */
export async function verifyOtpCode(params: VerifyOtpParams): Promise<VerifyOtpResult> {
  const { userId, targetPhone, otpCode, purpose } = params;

  if (!otpCode || otpCode.trim().length !== 6) {
    return {
      success: false,
      error: 'Kode OTP harus berupa 6 digit angka.',
    };
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Cari baris OTP aktif terkini dengan penguncian baris eksklusif FOR UPDATE
    let sql = `
      SELECT id, user_id, otp_hash, attempts, expires_at, consumed_at,
             TIMESTAMPDIFF(SECOND, NOW(), expires_at) AS remaining_seconds
      FROM user_otps
      WHERE purpose = ?
        AND consumed_at IS NULL
    `;
    const sqlParams: any[] = [purpose];

    if (userId) {
      sql += ' AND user_id = ?';
      sqlParams.push(userId);
    } else if (targetPhone) {
      const normalizedPhone = normalizePhoneNumber(targetPhone);
      sql += ' AND target_phone = ?';
      sqlParams.push(normalizedPhone);
    } else {
      await connection.rollback();
      return { success: false, error: 'Identitas pengguna atau nomor telepon harus disertakan.' };
    }

    sql += ' ORDER BY id DESC LIMIT 1 FOR UPDATE';

    const [rows]: any = await connection.execute(sql, sqlParams);

    if (!rows || rows.length === 0) {
      await connection.rollback();
      return {
        success: false,
        error: 'Tidak ditemukan permohonan kode OTP aktif. Silakan minta kode baru.',
      };
    }

    const otpRecord = rows[0];
    const targetUserId = otpRecord.user_id;

    // 2. Cek apakah OTP sudah kedaluwarsa
    if (Number(otpRecord.remaining_seconds) <= 0) {
      await connection.rollback();
      return {
        success: false,
        error: 'Kode OTP telah kedaluwarsa. Silakan minta kode verifikasi baru.',
      };
    }

    // 3. Cek apakah sudah melebihi batas percobaan gagal (max 5x)
    if (Number(otpRecord.attempts) >= OTP_MAX_ATTEMPTS) {
      // Invalides OTP record
      await connection.execute(
        'UPDATE user_otps SET expires_at = NOW() WHERE id = ?',
        [otpRecord.id]
      );
      await connection.commit();
      return {
        success: false,
        error: 'Kode OTP telah dibatalkan karena terlalu banyak percobaan salah. Silakan minta kode baru.',
        remainingAttempts: 0,
      };
    }

    // 4. Verifikasi hash menggunakan constant-time comparison
    const isMatch = compareOtpHash(otpCode.trim(), otpRecord.otp_hash);

    if (!isMatch) {
      const newAttempts = Number(otpRecord.attempts) + 1;
      const remaining = Math.max(0, OTP_MAX_ATTEMPTS - newAttempts);

      await connection.execute(
        'UPDATE user_otps SET attempts = ? WHERE id = ?',
        [newAttempts, otpRecord.id]
      );
      await connection.commit();

      return {
        success: false,
        error: `Kode OTP yang Anda masukkan salah. Sisa percobaan: ${remaining} kali.`,
        remainingAttempts: remaining,
      };
    }

    // 5. Berhasil! Tandai OTP consumed (Single-use atomik)
    await connection.execute(
      'UPDATE user_otps SET consumed_at = NOW() WHERE id = ?',
      [otpRecord.id]
    );

    // 6. Tandai pengguna terverifikasi kontak di tabel users
    await connection.execute(
      `UPDATE users
       SET is_verified = TRUE,
           status = CASE WHEN status = 'pending_verification' THEN 'active' ELSE status END,
           updated_at = NOW()
       WHERE id = ?`,
      [targetUserId]
    );

    await connection.commit();

    return {
      success: true,
      userId: targetUserId,
    };
  } catch (err: any) {
    await connection.rollback();
    return {
      success: false,
      error: err.message || 'Terjadi kesalahan sistem saat memvalidasi kode OTP.',
    };
  } finally {
    connection.release();
  }
}

