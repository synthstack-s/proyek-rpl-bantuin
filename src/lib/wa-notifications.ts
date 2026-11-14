/**
 * wa-notifications.ts — Layanan notifikasi WhatsApp (Fonnte) untuk BANTUIN.
 *
 * Dua jalur pengiriman:
 *  1. MANUAL — admin mengirim pesan dari panel (route /api/admin/whatsapp/send).
 *  2. OTOMATIS — dipicu perubahan status pesanan / penugasan / jadwal.
 *
 * Prinsip:
 *  - Semua template pesan terpusat di file ini (tidak ada string tersebar).
 *  - Setiap percobaan pengiriman dicatat di tabel `whatsapp_notifications`
 *    (migrasi 006): pending -> sent (+fonnte_message_id) atau failed
 *    (+error_message). Status TIDAK PERNAH dilaporkan sukses bila Fonnte
 *    gagal.
 *  - Nomor penerima SELALU diambil dari database (users.phone_number),
 *    tidak pernah dari input klien — kecuali validasi format.
 *  - Notifikasi otomatis bersifat best-effort: fungsi notify* TIDAK PERNAH
 *    throw; kegagalan dicatat di log server dan di tabel, perubahan status
 *    pesanan tidak pernah dibatalkan karenanya.
 *  - Anti-spam: transisi no-op (status tidak berubah) tidak memicu
 *    notifikasi, dan pengiriman otomatis yang sama untuk pesanan yang sama
 *    di-dedupe dalam jendela singkat (dua jalur — HTTP dan chatbot — bisa
 *    memicu satu transisi yang sama).
 *
 * Tidak ada preferensi/opt-out notifikasi di skema saat ini — dicatat
 * sebagai tindak lanjut, bukan dibuatkan UI pengaturan di sini.
 */

import { query } from '@/lib/db';
import {
  sendWhatsAppMessage,
  normalizePhoneNumber,
  isValidIndonesianPhone,
  maskPhoneNumber,
} from '@/lib/fonnte';

/** Batas panjang pesan manual admin (Fonnte menerima pesan panjang; 1000 cukup untuk pemberitahuan operasional). */
export const WA_MANUAL_MESSAGE_MAX_LENGTH = 1000;
/** Batas panjang judul pesan manual (sama seperti judul notifikasi in-app). */
export const WA_MANUAL_TITLE_MAX_LENGTH = 150;
/** Jendela dedupe pengiriman otomatis: notifikasi yang sama untuk pesanan yang sama dalam 5 menit dianggap duplikat. */
export const WA_DEDUPE_WINDOW_MINUTES = 5;
/** Batas panjang error_message (kolom VARCHAR(500)). */
const WA_ERROR_MAX_LENGTH = 500;

export type WaEvent =
  | 'order_status'
  | 'assignment_offered'
  | 'assignment_cancelled'
  | 'schedule_set'
  | 'order_created'
  | 'manual';

export type WaNotificationSource = 'manual' | 'auto';

export interface WaSendOutcome {
  /** true bila pesan berhasil dikirim ke Fonnte (atau di-dedupe / di-skip dengan sengaja). */
  success: boolean;
  /** ID baris log di whatsapp_notifications (tidak ada bila di-skip/dedupe/tanpa penerima). */
  notificationId?: number;
  /** true bila pengiriman dilewati karena duplikat dalam jendela dedupe. */
  deduped?: boolean;
  /** Alasan skip: 'no-op' (status tidak berubah), 'no-template', 'no-phone', 'user-not-found'. */
  skipped?: string;
  /** Nomor tujuan tersensor (mis. 62812****7890) — aman untuk log/respons. */
  maskedPhone?: string;
  /** Pesan error yang jujur bila success = false. */
  error?: string;
}

export interface WaTemplateContext {
  orderCode: string;
  /** Total estimasi (Rp) — dipakai template 'estimated'. */
  totalEstimate?: number;
  /** Nomor invoice — dipakai template 'completed'. */
  invoiceNumber?: string;
  /** Total tagihan (Rp) — dipakai template 'completed'. */
  grandTotal?: number;
}

const formatRupiah = (amount: number): string =>
  `Rp ${Math.round(amount).toLocaleString('id-ID')}`;

/**
 * Template notifikasi status pesanan untuk PELANGGAN.
 * Kunci: `order_<status-baru>`; plus `order_technician_declined` (varian
 * 'submitted' saat teknisi menolak tawaran — pesanan kembali mengantre).
 * Status 'draft' sengaja tidak punya template: tidak pernah dinotifikasi.
 */
export const WA_ORDER_STATUS_TEMPLATES: Record<string, (ctx: WaTemplateContext) => string> = {
  order_submitted: (ctx) =>
    `*BANTUIN — Pesanan Diterima*\n\nHalo! Pesanan perbaikan Anda *${ctx.orderCode}* telah kami terima dan sedang menunggu penugasan teknisi. Kami akan memberi kabar saat teknisi ditugaskan.\n\nTerima kasih telah mempercayai BANTUIN.`,

  order_technician_declined: (ctx) =>
    `*BANTUIN — Penugasan Teknisi*\n\nPesanan *${ctx.orderCode}*: teknisi yang ditugaskan berhalangan, jadi pesanan Anda kembali menunggu penugasan. Kami sedang mencarikan teknisi pengganti.\n\nMohon maaf atas keterlambatannya.`,

  order_assigned: (ctx) =>
    `*BANTUIN — Teknisi Ditugaskan*\n\nPesanan *${ctx.orderCode}*: teknisi telah ditugaskan dan akan segera mempersiapkan kunjungan ke lokasi Anda. Mohon siapkan perangkat yang akan diperbaiki.\n\nTerima kasih.`,

  order_scheduled: (ctx) =>
    `*BANTUIN — Teknisi Dalam Perjalanan*\n\nPesanan *${ctx.orderCode}*: teknisi sedang menuju lokasi Anda. Mohon pastikan alamat dapat dihubungi dan perangkat mudah diakses.\n\nTerima kasih.`,

  order_in_diagnosis: (ctx) =>
    `*BANTUIN — Pemeriksaan Dimulai*\n\nPesanan *${ctx.orderCode}*: teknisi sudah tiba di lokasi dan sedang memeriksa perangkat Anda. Estimasi biaya akan segera kami sampaikan.\n\nTerima kasih.`,

  order_estimated: (ctx) =>
    `*BANTUIN — Estimasi Biaya Tersedia*\n\nPesanan *${ctx.orderCode}*: estimasi biaya perbaikan sudah tersedia${ctx.totalEstimate !== undefined ? ` (${formatRupiah(ctx.totalEstimate)})` : ''}. Silakan tinjau dan setujui melalui aplikasi BANTUIN agar perbaikan dapat dimulai.\n\nTerima kasih.`,

  order_customer_approved: (ctx) =>
    `*BANTUIN — Persetujuan Diterima*\n\nPesanan *${ctx.orderCode}*: persetujuan Anda telah kami terima. Teknisi akan segera memulai perbaikan.\n\nTerima kasih.`,

  order_in_repair: (ctx) =>
    `*BANTUIN — Perbaikan Berlangsung*\n\nPesanan *${ctx.orderCode}*: teknisi sedang mengerjakan perbaikan perangkat Anda. Kami akan memberi kabar saat selesai.\n\nTerima kasih.`,

  order_completed: (ctx) =>
    `*BANTUIN — Perbaikan Selesai*\n\nPesanan *${ctx.orderCode}*: perbaikan telah selesai dan perangkat sudah diuji berfungsi baik.${ctx.invoiceNumber ? ` Tagihan ${ctx.invoiceNumber}${ctx.grandTotal !== undefined ? ` senilai ${formatRupiah(ctx.grandTotal)}` : ''} tersedia di aplikasi.` : ''} Garansi 30 hari aktif sejak hari ini.\n\nTerima kasih telah mempercayai BANTUIN.`,

  order_cancelled: (ctx) =>
    `*BANTUIN — Pesanan Dibatalkan*\n\nPesanan *${ctx.orderCode}* telah dibatalkan. Jika ini bukan keinginan Anda atau ada pertanyaan, silakan hubungi tim kami.\n\nTerima kasih.`,

  order_complained: (ctx) =>
    `*BANTUIN — Pengaduan Diterima*\n\nPengaduan untuk pesanan *${ctx.orderCode}* telah kami terima dan sedang ditindaklanjuti tim kami. Kami akan menghubungi Anda kembali.\n\nTerima kasih.`,
};

/** Template penugasan untuk TEKNISI. */
export const WA_TECHNICIAN_TEMPLATES = {
  assignment_offered: (orderCode: string, isReassignment: boolean): string =>
    isReassignment
      ? `*BANTUIN — Tugas Dialihkan ke Anda*\n\nAnda mendapat pengalihan tugas perbaikan untuk pesanan *${orderCode}*. Silakan tinjau dan konfirmasi melalui aplikasi BANTUIN.\n\nTerima kasih.`
      : `*BANTUIN — Tugas Perbaikan Baru*\n\nAnda mendapat tawaran tugas baru untuk pesanan *${orderCode}*. Silakan tinjau dan konfirmasi melalui aplikasi BANTUIN.\n\nTerima kasih.`,

  assignment_cancelled: (orderCode: string, reason?: string): string =>
    `*BANTUIN — Penugasan Dibatalkan*\n\nPenugasan Anda untuk pesanan *${orderCode}* telah dibatalkan oleh admin.${reason ? ` Alasan: ${reason}` : ''}\n\nTerima kasih.`,

  assignment_transferred: (orderCode: string): string =>
    `*BANTUIN — Tugas Dialihkan*\n\nTugas perbaikan pesanan *${orderCode}* telah dialihkan ke teknisi lain oleh admin. Terima kasih atas kerja sama Anda.`,
};

/** Template jadwal kunjungan untuk PELANGGAN. */
export function buildScheduleTemplate(params: {
  orderCode: string;
  technicianName?: string | null;
  scheduledDate: string;
  timeSlotStart: string;
  timeSlotEnd: string;
  rescheduled: boolean;
}): string {
  const tech = params.technicianName ? ` Teknisi ${params.technicianName}` : ' Teknisi kami';
  const verb = params.rescheduled ? 'dijadwalkan ulang' : 'dijadwalkan';
  return (
    `*BANTUIN — Jadwal Kunjungan ${params.rescheduled ? 'Diubah' : 'Ditetapkan'}*\n\n` +
    `Pesanan *${params.orderCode}*: kunjungan${tech} ${verb} pada *${params.scheduledDate}* pukul *${params.timeSlotStart}–${params.timeSlotEnd}* WIB. Mohon pastikan Anda berada di lokasi.\n\nTerima kasih.`
  );
}

interface SendWaNotificationParams {
  userId: number;
  event: WaEvent;
  templateKey: string | null;
  message: string;
  title?: string | null;
  entityType?: string | null;
  entityId?: number | null;
  source: WaNotificationSource;
  sentByAdminId?: number | null;
  /** Dedupe hanya untuk pengiriman otomatis (kirim manual admin selalu diproses). */
  dedupe?: boolean;
}

/**
 * Inti pengiriman: ambil nomor dari DB -> cek dedupe (bila auto) -> catat
 * 'pending' -> kirim via Fonnte -> perbarui 'sent'/'failed'.
 *
 * Mengembalikan hasil yang jujur; HANYA melempar (throw) bila operasi
 * database gagal — kegagalan Fonnte dikembalikan sebagai { success: false }.
 * Pemanggil otomatis (notify*) membungkus ini dengan try/catch sehingga
 * kegagalan apa pun tidak pernah membatalkan perubahan status pesanan.
 */
export async function sendWhatsAppNotification(
  params: SendWaNotificationParams
): Promise<WaSendOutcome> {
  // 1. Nomor penerima SELALU dari database, tidak pernah dari input klien.
  const users: any = await query(
    'SELECT id, phone_number FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1',
    [params.userId]
  );
  if (!users || users.length === 0) {
    return { success: false, skipped: 'user-not-found', error: 'Penerima tidak ditemukan' };
  }

  const rawPhone = String(users[0].phone_number || '');
  const normalizedPhone = normalizePhoneNumber(rawPhone);

  // 2. Dedupe pengiriman otomatis: (pesanan, event, template, penerima) yang
  // sama dalam jendela singkat dianggap duplikat — menangani jalur ganda
  // (HTTP + chatbot) yang memicu satu transisi yang sama. Upaya 'failed'
  // tidak memblokir percobaan ulang.
  if (params.dedupe && params.entityType && params.entityId && params.templateKey) {
    const dupes: any = await query(
      `SELECT id FROM whatsapp_notifications
       WHERE entity_type = ? AND entity_id = ? AND event = ? AND template_key = ?
         AND user_id = ? AND status IN ('pending', 'sent')
         AND created_at >= NOW() - INTERVAL ? MINUTE
       LIMIT 1`,
      [
        params.entityType,
        params.entityId,
        params.event,
        params.templateKey,
        params.userId,
        WA_DEDUPE_WINDOW_MINUTES,
      ]
    );
    if (dupes && dupes.length > 0) {
      console.info(
        `[WA] Duplikat dilewati: event=${params.event} template=${params.templateKey} entity=${params.entityType}#${params.entityId} user=${params.userId}`
      );
      return { success: true, deduped: true, maskedPhone: maskPhoneNumber(normalizedPhone) };
    }
  }

  // 3. Catat percobaan sebagai 'pending' — target_phone menyimpan nomor
  // mentah bila normalisasi gagal, agar baris log tetap menjelaskan
  // kegagalan (kolom NOT NULL; string kosong bila penerima tanpa nomor).
  const insertRes: any = await query(
    `INSERT INTO whatsapp_notifications (
      user_id, target_phone, source, event, template_key, title, message,
      entity_type, entity_id, status, sent_by_admin_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    [
      params.userId,
      normalizedPhone || rawPhone || '',
      params.source,
      params.event,
      params.templateKey,
      params.title || null,
      params.message,
      params.entityType || null,
      params.entityId || null,
      params.sentByAdminId || null,
    ]
  );
  const notificationId = Number(insertRes.insertId);

  // 4. Nomor tidak valid -> gagal tercatat, tanpa memanggil Fonnte.
  if (!isValidIndonesianPhone(normalizedPhone)) {
    const error = 'Nomor WhatsApp penerima tidak tersedia atau tidak valid';
    await query(
      `UPDATE whatsapp_notifications SET status = 'failed', error_message = ? WHERE id = ?`,
      [error.slice(0, WA_ERROR_MAX_LENGTH), notificationId]
    );
    console.warn(`[WA] Gagal (nomor tidak valid): notif=${notificationId} user=${params.userId}`);
    return { success: false, notificationId, skipped: 'no-phone', error };
  }

  // 5. Kirim via Fonnte, lalu perbarui status dengan jujur.
  const result = await sendWhatsAppMessage(normalizedPhone, params.message);
  if (result.success) {
    await query(
      `UPDATE whatsapp_notifications SET status = 'sent', fonnte_message_id = ? WHERE id = ?`,
      [result.messageId ? String(result.messageId).slice(0, 100) : null, notificationId]
    );
    return {
      success: true,
      notificationId,
      maskedPhone: maskPhoneNumber(normalizedPhone),
    };
  }

  const error = result.error || 'Gagal mengirim pesan WhatsApp';
  await query(
    `UPDATE whatsapp_notifications SET status = 'failed', error_message = ? WHERE id = ?`,
    [error.slice(0, WA_ERROR_MAX_LENGTH), notificationId]
  );
  console.warn(`[WA] Gagal terkirim: notif=${notificationId} user=${params.userId} error=${error}`);
  return { success: false, notificationId, maskedPhone: maskPhoneNumber(normalizedPhone), error };
}

// -----------------------------------------------------------------------------
// Notifikasi otomatis — semuanya best-effort dan TIDAK PERNAH throw.
// Panggil SETELAH transisi status ter-commit; kegagalan di sini tidak boleh
// membatalkan atau mengulang perubahan status pesanan.
// -----------------------------------------------------------------------------

export interface OrderStatusChangeParams {
  repairRequestId: number;
  orderCode: string;
  customerId: number;
  prevStatus: string;
  newStatus: string;
  /** 'technician_declined' memakai template khusus (pesanan kembali mengantre). */
  variant?: 'technician_declined';
  totalEstimate?: number;
  invoiceNumber?: string;
  grandTotal?: number;
}

/**
 * Notifikasi ke PELANGGAN saat status pesanan berubah.
 * Dilewati bila: status tidak berubah (no-op), status baru tanpa template
 * (mis. 'draft'), atau duplikat dalam jendela dedupe.
 */
export async function notifyOrderStatusChange(
  params: OrderStatusChangeParams
): Promise<WaSendOutcome> {
  try {
    if (params.prevStatus === params.newStatus) {
      return { success: true, skipped: 'no-op' };
    }
    const templateKey =
      params.variant === 'technician_declined'
        ? 'order_technician_declined'
        : `order_${params.newStatus}`;
    const template = WA_ORDER_STATUS_TEMPLATES[templateKey];
    if (!template) {
      return { success: true, skipped: 'no-template' };
    }
    const message = template({
      orderCode: params.orderCode,
      totalEstimate: params.totalEstimate,
      invoiceNumber: params.invoiceNumber,
      grandTotal: params.grandTotal,
    });
    return await sendWhatsAppNotification({
      userId: params.customerId,
      event: 'order_status',
      templateKey,
      message,
      entityType: 'repair_requests',
      entityId: params.repairRequestId,
      source: 'auto',
      dedupe: true,
    });
  } catch (error: any) {
    // Best-effort: kegagalan notifikasi tidak boleh merusak alur utama.
    console.error(
      `[WA] notifyOrderStatusChange gagal (pesanan ${params.orderCode}):`,
      error?.message || error
    );
    return { success: false, error: error?.message || 'Gagal mengirim notifikasi WhatsApp' };
  }
}

export interface AssignmentOfferParams {
  repairRequestId: number;
  orderCode: string;
  technicianId: number;
  /** true bila tugas ini pengalihan dari teknisi lain (template berbeda). */
  isReassignment?: boolean;
}

/** Notifikasi ke TEKNISI saat mendapat tawaran tugas baru / pengalihan tugas. */
export async function notifyAssignmentOffered(
  params: AssignmentOfferParams
): Promise<WaSendOutcome> {
  try {
    return await sendWhatsAppNotification({
      userId: params.technicianId,
      event: 'assignment_offered',
      templateKey: params.isReassignment ? 'assignment_reassigned' : 'assignment_offered',
      message: WA_TECHNICIAN_TEMPLATES.assignment_offered(
        params.orderCode,
        params.isReassignment === true
      ),
      entityType: 'repair_requests',
      entityId: params.repairRequestId,
      source: 'auto',
      dedupe: true,
    });
  } catch (error: any) {
    console.error(
      `[WA] notifyAssignmentOffered gagal (pesanan ${params.orderCode}):`,
      error?.message || error
    );
    return { success: false, error: error?.message || 'Gagal mengirim notifikasi WhatsApp' };
  }
}

export interface AssignmentCancelledParams {
  repairRequestId: number;
  orderCode: string;
  technicianId: number;
  reason?: string;
}

/** Notifikasi ke TEKNISI saat penugasannya dibatalkan admin. */
export async function notifyAssignmentCancelled(
  params: AssignmentCancelledParams
): Promise<WaSendOutcome> {
  try {
    return await sendWhatsAppNotification({
      userId: params.technicianId,
      event: 'assignment_cancelled',
      templateKey: 'assignment_cancelled',
      message: WA_TECHNICIAN_TEMPLATES.assignment_cancelled(params.orderCode, params.reason),
      entityType: 'repair_requests',
      entityId: params.repairRequestId,
      source: 'auto',
      dedupe: true,
    });
  } catch (error: any) {
    console.error(
      `[WA] notifyAssignmentCancelled gagal (pesanan ${params.orderCode}):`,
      error?.message || error
    );
    return { success: false, error: error?.message || 'Gagal mengirim notifikasi WhatsApp' };
  }
}

export interface AssignmentTransferredParams {
  repairRequestId: number;
  orderCode: string;
  /** Teknisi lama yang tugasnya dialihkan. */
  previousTechnicianId: number;
}

/** Notifikasi ke TEKNISI LAMA saat tugasnya dialihkan (hanya bila ia sudah menerima tugas). */
export async function notifyAssignmentTransferred(
  params: AssignmentTransferredParams
): Promise<WaSendOutcome> {
  try {
    return await sendWhatsAppNotification({
      userId: params.previousTechnicianId,
      event: 'assignment_cancelled',
      templateKey: 'assignment_transferred',
      message: WA_TECHNICIAN_TEMPLATES.assignment_transferred(params.orderCode),
      entityType: 'repair_requests',
      entityId: params.repairRequestId,
      source: 'auto',
      dedupe: true,
    });
  } catch (error: any) {
    console.error(
      `[WA] notifyAssignmentTransferred gagal (pesanan ${params.orderCode}):`,
      error?.message || error
    );
    return { success: false, error: error?.message || 'Gagal mengirim notifikasi WhatsApp' };
  }
}

export interface ScheduleSetParams {
  repairRequestId: number;
  orderCode: string;
  customerId: number;
  technicianName?: string | null;
  scheduledDate: string;
  timeSlotStart: string;
  timeSlotEnd: string;
  rescheduled: boolean;
}

/** Notifikasi ke PELANGGAN saat jadwal kunjungan ditetapkan/diubah. */
export async function notifyScheduleSet(params: ScheduleSetParams): Promise<WaSendOutcome> {
  try {
    return await sendWhatsAppNotification({
      userId: params.customerId,
      event: 'schedule_set',
      templateKey: params.rescheduled ? 'schedule_rescheduled' : 'schedule_set',
      message: buildScheduleTemplate({
        orderCode: params.orderCode,
        technicianName: params.technicianName,
        scheduledDate: params.scheduledDate,
        timeSlotStart: params.timeSlotStart,
        timeSlotEnd: params.timeSlotEnd,
        rescheduled: params.rescheduled,
      }),
      entityType: 'repair_requests',
      entityId: params.repairRequestId,
      source: 'auto',
      dedupe: true,
    });
  } catch (error: any) {
    console.error(
      `[WA] notifyScheduleSet gagal (pesanan ${params.orderCode}):`,
      error?.message || error
    );
    return { success: false, error: error?.message || 'Gagal mengirim notifikasi WhatsApp' };
  }
}

export interface OrderCreatedParams {
  repairRequestId: number;
  orderCode: string;
  customerId: number;
}

/** Notifikasi ke PELANGGAN saat pesanan dibuatkan oleh admin. (Pesanan yang dibuat pelanggan sendiri tidak dinotifikasi — ia baru saja membuatnya.) */
export async function notifyOrderCreated(params: OrderCreatedParams): Promise<WaSendOutcome> {
  try {
    const template = WA_ORDER_STATUS_TEMPLATES.order_submitted;
    return await sendWhatsAppNotification({
      userId: params.customerId,
      event: 'order_created',
      templateKey: 'order_submitted',
      message: template({ orderCode: params.orderCode }),
      entityType: 'repair_requests',
      entityId: params.repairRequestId,
      source: 'auto',
      dedupe: true,
    });
  } catch (error: any) {
    console.error(
      `[WA] notifyOrderCreated gagal (pesanan ${params.orderCode}):`,
      error?.message || error
    );
    return { success: false, error: error?.message || 'Gagal mengirim notifikasi WhatsApp' };
  }
}

// -----------------------------------------------------------------------------
// Pengiriman manual oleh admin (route /api/admin/whatsapp/send).
// -----------------------------------------------------------------------------

export interface ManualWaSendParams {
  adminUserId: number;
  userId: number;
  message: string;
  title?: string;
  repairRequestId?: number;
}

export interface ManualWaSendResult extends WaSendOutcome {
  /** Status HTTP yang disarankan untuk route (200/400/404/502). */
  httpStatus: number;
}

/**
 * Kirim pesan WhatsApp manual dari admin ke satu pengguna.
 * Validasi: pesan tidak kosong & dalam batas panjang, penerima ada,
 * pesanan terkait (bila ada) ada. Nomor penerima diambil dari DB.
 * Kegagalan Fonnte dikembalikan jujur (httpStatus 502 + error + baris log
 * 'failed') — tidak pernah dilaporkan sukses.
 */
export async function sendManualWhatsAppMessage(
  params: ManualWaSendParams
): Promise<ManualWaSendResult> {
  const message = (params.message || '').trim();
  if (!message) {
    return { success: false, httpStatus: 400, error: 'Isi pesan WhatsApp wajib diisi' };
  }
  if (message.length > WA_MANUAL_MESSAGE_MAX_LENGTH) {
    return {
      success: false,
      httpStatus: 400,
      error: `Isi pesan maksimal ${WA_MANUAL_MESSAGE_MAX_LENGTH} karakter`,
    };
  }
  const title = (params.title || '').trim();
  if (title.length > WA_MANUAL_TITLE_MAX_LENGTH) {
    return {
      success: false,
      httpStatus: 400,
      error: `Judul pesan maksimal ${WA_MANUAL_TITLE_MAX_LENGTH} karakter`,
    };
  }

  // Pesanan terkait (bila ada) harus benar-benar ada.
  if (params.repairRequestId !== undefined && params.repairRequestId !== null) {
    const orders: any = await query(
      'SELECT id FROM repair_requests WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      [params.repairRequestId]
    );
    if (!orders || orders.length === 0) {
      return { success: false, httpStatus: 404, error: 'Pesanan terkait tidak ditemukan' };
    }
  }

  const outcome = await sendWhatsAppNotification({
    userId: params.userId,
    event: 'manual',
    templateKey: null,
    title: title || null,
    message,
    entityType: params.repairRequestId ? 'repair_requests' : null,
    entityId: params.repairRequestId || null,
    source: 'manual',
    sentByAdminId: params.adminUserId,
    dedupe: false,
  });

  if (outcome.success) {
    return { ...outcome, httpStatus: 200 };
  }
  if (outcome.skipped === 'user-not-found') {
    return { ...outcome, httpStatus: 404 };
  }
  if (outcome.skipped === 'no-phone') {
    return { ...outcome, httpStatus: 400 };
  }
  // Kegagalan Fonnte (atau DB saat logging): 502 — hulu (Fonnte) gagal.
  return { ...outcome, httpStatus: 502 };
}
