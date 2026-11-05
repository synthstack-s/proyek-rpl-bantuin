import { z } from 'zod';

/**
 * Helper untuk membuat slug otomatis yang ramah URL dari nama layanan
 */
export function generateServiceSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Hapus karakter non-alfanumerik kecuali spasi & tanda hubung
    .replace(/[\s_-]+/g, '-') // Ganti spasi & underscore dengan satu tanda hubung
    .replace(/^-+|-+$/g, ''); // Hapus tanda hubung di awal/akhir
}

export const createServiceSchema = z.object({
  category_id: z.coerce
    .number({
      message: 'Kategori peralatan wajib dipilih',
    })
    .int('ID kategori harus bilangan bulat')
    .positive('ID kategori tidak valid'),
  name: z
    .string({
      message: 'Nama layanan wajib diisi',
    })
    .trim()
    .min(2, 'Nama layanan minimal 2 karakter')
    .max(150, 'Nama layanan maksimal 150 karakter'),
  slug: z
    .string()
    .trim()
    .max(180, 'Slug maksimal 180 karakter')
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      'Slug hanya boleh berisi huruf kecil, angka, dan tanda hubung (-)'
    )
    .optional()
    .or(z.literal('')),
  description: z
    .string()
    .trim()
    .optional()
    .nullable()
    .or(z.literal('')),
  base_price: z.coerce
    .number({
      message: 'Tarif dasar (base price) wajib diisi',
    })
    .min(0, 'Tarif dasar tidak boleh bernilai negatif')
    .max(999999999.99, 'Tarif dasar melebihi batas maksimum sistem'),
  estimated_duration_min: z.coerce
    .number({
      message: 'Estimasi durasi pengerjaan wajib diisi',
    })
    .int('Estimasi durasi harus bilangan bulat')
    .min(1, 'Estimasi durasi minimal 1 menit')
    .max(1440, 'Estimasi durasi maksimal 1440 menit (24 jam)')
    .optional()
    .default(60),
  is_active: z.boolean().optional().default(true),
});

export const updateServiceSchema = z.object({
  category_id: z.coerce
    .number()
    .int('ID kategori harus bilangan bulat')
    .positive('ID kategori tidak valid')
    .optional(),
  name: z
    .string()
    .trim()
    .min(2, 'Nama layanan minimal 2 karakter')
    .max(150, 'Nama layanan maksimal 150 karakter')
    .optional(),
  slug: z
    .string()
    .trim()
    .max(180, 'Slug maksimal 180 karakter')
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      'Slug hanya boleh berisi huruf kecil, angka, dan tanda hubung (-)'
    )
    .optional(),
  description: z
    .string()
    .trim()
    .optional()
    .nullable(),
  base_price: z.coerce
    .number()
    .min(0, 'Tarif dasar tidak boleh bernilai negatif')
    .max(999999999.99, 'Tarif dasar melebihi batas maksimum sistem')
    .optional(),
  estimated_duration_min: z.coerce
    .number()
    .int('Estimasi durasi harus bilangan bulat')
    .min(1, 'Estimasi durasi minimal 1 menit')
    .max(1440, 'Estimasi durasi maksimal 1440 menit (24 jam)')
    .optional(),
  is_active: z.boolean().optional(),
});

export type CreateServiceInput = z.infer<typeof createServiceSchema>;
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;
