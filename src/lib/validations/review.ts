import { z } from 'zod';

export const createReviewSchema = z.object({
  rating: z
    .number()
    .int('Rating harus berupa bilangan bulat')
    .min(1, 'Rating minimal 1 bintang')
    .max(5, 'Rating maksimal 5 bintang'),
  review_text: z
    .string()
    .max(1000, 'Teks ulasan maksimal 1000 karakter')
    .optional()
    .nullable()
    .transform((val) => (val ? val.trim() : null)),
  photos: z.array(z.string().url('URL foto ulasan tidak valid')).max(5, 'Maksimal 5 foto').optional().default([]),
});

export type CreateReviewInput = z.infer<typeof createReviewSchema>;
