import { z } from 'zod';
import { isValidIndonesianPhone, normalizePhoneNumber } from '@/lib/fonnte';

// Skema login admin terpisah (adminLoginSchema) DIHAPUS bersama panel
// login admin terpisah — semua peran login lewat userLoginSchema di
// bawah (identifier = email atau nomor WhatsApp) dan satu endpoint
// POST /api/auth/login.

// Password regex: minimal 8 karakter, ada huruf besar, huruf kecil, dan angka
export const passwordPolicy = z
  .string()
  .min(8, 'Kata sandi minimal 8 karakter')
  .max(100, 'Kata sandi maksimal 100 karakter')
  .regex(/[A-Z]/, 'Kata sandi harus mengandung minimal 1 huruf besar')
  .regex(/[a-z]/, 'Kata sandi harus mengandung minimal 1 huruf kecil')
  .regex(/[0-9]/, 'Kata sandi harus mengandung minimal 1 angka');

// Skema nomor telepon seluler Indonesia
export const phonePolicy = z
  .string()
  .trim()
  .min(1, 'Nomor WhatsApp wajib diisi')
  .refine(
    (val) => isValidIndonesianPhone(val),
    'Nomor WhatsApp tidak valid. Masukkan nomor seluler Indonesia aktif (contoh: 08123456789 atau 628123456789).'
  )
  .transform((val) => normalizePhoneNumber(val));

export const customerRegisterSchema = z
  .object({
    full_name: z
      .string()
      .trim()
      .min(2, 'Nama lengkap minimal 2 karakter')
      .max(150, 'Nama lengkap maksimal 150 karakter')
      .refine((val) => val.trim().length > 0, 'Nama tidak boleh hanya berisi spasi'),
    phone_number: phonePolicy,
    email: z
      .string()
      .trim()
      .min(1, 'Email wajib diisi')
      .email('Format alamat email tidak valid')
      .toLowerCase(),
    password: passwordPolicy,
    confirm_password: z.string().min(1, 'Konfirmasi kata sandi wajib diisi'),
    terms_accepted: z.literal(true, {
      message: 'Anda harus menyetujui syarat & ketentuan layanan',
    }),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: 'Konfirmasi kata sandi tidak cocok dengan kata sandi',
    path: ['confirm_password'],
  });

export type CustomerRegisterInput = z.infer<typeof customerRegisterSchema>;

export const technicianRegisterSchema = z
  .object({
    full_name: z
      .string()
      .trim()
      .min(2, 'Nama lengkap minimal 2 karakter')
      .max(150, 'Nama lengkap maksimal 150 karakter')
      .refine((val) => val.trim().length > 0, 'Nama tidak boleh hanya berisi spasi'),
    phone_number: phonePolicy,
    email: z
      .string()
      .trim()
      .min(1, 'Email wajib diisi')
      .email('Format alamat email tidak valid')
      .toLowerCase(),
    password: passwordPolicy,
    confirm_password: z.string().min(1, 'Konfirmasi kata sandi wajib diisi'),
    years_of_experience: z.coerce.number().min(0, 'Pengalaman minimal 0 tahun').default(0),
    bio: z.string().trim().max(1000, 'Bio maksimal 1000 karakter').optional().default(''),
    terms_accepted: z.literal(true, {
      message: 'Anda harus menyetujui syarat & ketentuan kemitraan teknisi',
    }),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: 'Konfirmasi kata sandi tidak cocok dengan kata sandi',
    path: ['confirm_password'],
  });

export type TechnicianRegisterInput = z.infer<typeof technicianRegisterSchema>;

export const userLoginSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1, 'Email atau Nomor WhatsApp wajib diisi'),
  password: z.string().min(1, 'Kata sandi wajib diisi'),
  rememberMe: z.boolean().optional().default(false),
});

export type UserLoginInput = z.infer<typeof userLoginSchema>;

export const otpSendSchema = z.object({
  user_id: z.coerce.number().optional(),
  phone_number: z.string().trim().optional(),
  purpose: z.enum(['registration', 'password_reset', 'login', 'phone_verification']).default('registration'),
});

export type OtpSendInput = z.infer<typeof otpSendSchema>;

export const otpVerifySchema = z.object({
  user_id: z.coerce.number().optional(),
  phone_number: z.string().trim().optional(),
  otp_code: z
    .string()
    .trim()
    .length(6, 'Kode OTP harus tepat 6 digit')
    .regex(/^\d{6}$/, 'Kode OTP hanya boleh berisi angka'),
  purpose: z.enum(['registration', 'password_reset', 'login', 'phone_verification']).default('registration'),
});

export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;

export const forgotPasswordSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1, 'Email atau Nomor WhatsApp wajib diisi'),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    user_id: z.coerce.number().optional(),
    phone_number: z.string().trim().optional(),
    otp_code: z
      .string()
      .trim()
      .length(6, 'Kode OTP harus tepat 6 digit')
      .regex(/^\d{6}$/, 'Kode OTP hanya boleh berisi angka'),
    new_password: passwordPolicy,
    confirm_password: z.string().min(1, 'Konfirmasi kata sandi wajib diisi'),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: 'Konfirmasi kata sandi tidak cocok dengan kata sandi baru',
    path: ['confirm_password'],
  });

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

