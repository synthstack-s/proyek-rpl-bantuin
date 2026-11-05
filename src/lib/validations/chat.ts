import { z } from 'zod';

export const sendChatMessageSchema = z.object({
  content: z
    .string()
    .min(1, 'Pesan tidak boleh kosong')
    .max(2000, 'Pesan maksimal 2000 karakter')
    .transform((val) => val.trim()),
  message_type: z.enum(['text', 'image', 'location', 'system']).optional().default('text'),
  attachment_url: z.string().url('URL lampiran tidak valid').optional().nullable(),
});

export type SendChatMessageInput = z.infer<typeof sendChatMessageSchema>;
