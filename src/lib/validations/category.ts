import { z } from 'zod';

export const createCategorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Nama kategori minimal 2 karakter')
    .max(100, 'Nama kategori maksimal 100 karakter'),
  slug: z
    .string()
    .trim()
    .max(120, 'Slug maksimal 120 karakter')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug hanya boleh berisi huruf kecil, angka, dan tanda hubung (-)')
    .optional()
    .or(z.literal('')),
  icon_url: z
    .string()
    .trim()
    .max(255, 'URL icon maksimal 255 karakter')
    .optional()
    .nullable()
    .or(z.literal('')),
  description: z
    .string()
    .trim()
    .optional()
    .nullable()
    .or(z.literal('')),
  is_active: z.boolean().optional().default(true),
});

export const updateCategorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Nama kategori minimal 2 karakter')
    .max(100, 'Nama kategori maksimal 100 karakter')
    .optional(),
  slug: z
    .string()
    .trim()
    .max(120, 'Slug maksimal 120 karakter')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug hanya boleh berisi huruf kecil, angka, dan tanda hubung (-)')
    .optional(),
  icon_url: z
    .string()
    .trim()
    .max(255, 'URL icon maksimal 255 karakter')
    .optional()
    .nullable(),
  description: z
    .string()
    .trim()
    .optional()
    .nullable(),
  is_active: z.boolean().optional(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

/**
 * Helper untuk membuat slug otomatis yang ramah URL dari nama kategori
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Hapus karakter non-alfanumerik kecuali spasi & tanda hubung
    .replace(/[\s_-]+/g, '-') // Ganti spasi & underscore dengan satu tanda hubung
    .replace(/^-+|-+$/g, ''); // Hapus tanda hubung di awal/akhir
}
