import { z } from 'zod';

/**
 * ENUM Role Pengguna sistem BANTUIN (users.role)
 */
export const userRoleEnum = z.enum(['admin', 'customer', 'technician']);

/**
 * ENUM Status Akun Pengguna (users.status)
 */
export const userStatusEnum = z.enum([
  'active',
  'inactive',
  'suspended',
  'pending_verification',
]);

/**
 * Skema validasi untuk pembaruan pengguna oleh administrator (PATCH /api/admin/users/[id])
 */
export const updateUserSchema = z.object({
  status: userStatusEnum.optional(),
  full_name: z
    .string()
    .trim()
    .min(2, 'Nama lengkap minimal 2 karakter')
    .max(150, 'Nama lengkap maksimal 150 karakter')
    .optional(),
  phone_number: z
    .string()
    .trim()
    .regex(
      /^(\+62|62|0)[0-9]{8,15}$/,
      'Format nomor telepon tidak valid (contoh: +628123456789 atau 08123456789)'
    )
    .optional(),
  default_address: z
    .string()
    .trim()
    .max(500, 'Alamat maksimal 500 karakter')
    .optional()
    .nullable(),
  city: z
    .string()
    .trim()
    .max(100, 'Kota maksimal 100 karakter')
    .optional()
    .nullable(),
  postal_code: z
    .string()
    .trim()
    .regex(/^[0-9]{5}$/, 'Kode pos harus 5 digit angka')
    .optional()
    .nullable()
    .or(z.literal('')),
  is_verified: z.boolean().optional(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
