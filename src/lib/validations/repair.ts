import { z } from 'zod';

export const createRepairSchema = z.object({
  category_id: z.coerce.number().min(1, 'Kategori peralatan wajib dipilih'),
  service_id: z.coerce.number().nullable().optional(),
  ai_session_id: z.coerce.number().nullable().optional(),
  device_brand: z
    .string()
    .trim()
    .max(100, 'Merek perangkat maksimal 100 karakter')
    .optional()
    .default(''),
  device_model: z
    .string()
    .trim()
    .max(100, 'Model/tipe perangkat maksimal 100 karakter')
    .optional()
    .default(''),
  problem_description: z
    .string()
    .trim()
    .min(10, 'Deskripsi kerusakan minimal 10 karakter agar teknisi memahami kendala')
    .max(2000, 'Deskripsi kerusakan maksimal 2000 karakter'),
  problem_photos: z
    .array(z.string().url('Format URL foto tidak valid'))
    .max(5, 'Maksimal 5 foto kerusakan')
    .optional()
    .default([]),
  address_text: z
    .string()
    .trim()
    .min(10, 'Alamat pengerjaan servis minimal 10 karakter')
    .max(1000, 'Alamat pengerjaan servis maksimal 1000 karakter'),
  latitude: z.coerce
    .number()
    .min(-90)
    .max(90)
    .default(-6.2088), // Default Jakarta Pusat
  longitude: z.coerce
    .number()
    .min(-180)
    .max(180)
    .default(106.8456),
});

export type CreateRepairInput = z.infer<typeof createRepairSchema>;

export const cancelRepairSchema = z.object({
  cancellation_reason: z
    .string()
    .trim()
    .min(5, 'Alasan pembatalan minimal 5 karakter')
    .max(500, 'Alasan pembatalan maksimal 500 karakter'),
});

export type CancelRepairInput = z.infer<typeof cancelRepairSchema>;

/**
 * Helper untuk men-generate kode pesanan resmi BANTUIN format: BAN-YYYYMMDD-XXXXX
 * Contoh: BAN-20261030-94812
 */
export function generateOrderCode(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const random5 = Math.floor(10000 + Math.random() * 90000); // 5 digit angka acak
  return `BAN-${year}${month}${day}-${random5}`;
}

