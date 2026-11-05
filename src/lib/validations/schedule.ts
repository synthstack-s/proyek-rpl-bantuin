import { z } from 'zod';

export const createScheduleSchema = z
  .object({
    scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD'),
    time_slot_start: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Format jam mulai harus HH:MM atau HH:MM:SS'),
    time_slot_end: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Format jam selesai harus HH:MM atau HH:MM:SS'),
    reschedule_reason: z.string().max(500, 'Alasan penjadwalan ulang maksimal 500 karakter').optional().nullable(),
  })
  .refine(
    (data) => {
      const start = data.time_slot_start.slice(0, 5);
      const end = data.time_slot_end.slice(0, 5);
      return end > start;
    },
    {
      message: 'Jam selesai kunjungan harus lebih besar dari jam mulai',
      path: ['time_slot_end'],
    }
  );

export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;
