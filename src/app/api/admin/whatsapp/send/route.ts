import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { recordAdminAudit } from '@/lib/audit';
import { checkAdminWaRateLimit } from '@/lib/rate-limiter';
import {
  sendManualWhatsAppMessage,
  WA_MANUAL_MESSAGE_MAX_LENGTH,
  WA_MANUAL_TITLE_MAX_LENGTH,
} from '@/lib/wa-notifications';

/**
 * POST /api/admin/whatsapp/send
 * Mengirim pesan WhatsApp manual dari admin ke satu pengguna (lewat Fonnte).
 *
 * Body: { userId: number, message: string, title?: string, repairRequestId?: number }
 * - Penerima dipilih berdasarkan userId; nomor telepon SELALU diambil dari
 *   database — klien tidak boleh mengirim nomor sembarang.
 * - Status respons jujur: kegagalan Fonnte mengembalikan 502 beserta detail
 *   error dan ID baris log 'failed' (bukan sukses palsu).
 * - Rate limit 10/menit per admin (checkAdminWaRateLimit).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session || session.role !== 'admin') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: sesi administrator tidak valid' },
        { status: 401 }
      );
    }

    const rate = checkAdminWaRateLimit(`wa-send:${session.userId}`);
    if (!rate.allowed) {
      return NextResponse.json(
        {
          success: false,
          message: `Terlalu banyak pengiriman. Coba lagi dalam ${rate.retryAfterSeconds || 60} detik.`,
        },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { userId, message, title, repairRequestId } = body;

    const recipientId = parseInt(userId, 10);
    if (isNaN(recipientId) || recipientId <= 0) {
      return NextResponse.json(
        { success: false, message: 'ID pengguna penerima wajib diisi secara valid' },
        { status: 400 }
      );
    }

    if (typeof message !== 'string' || !message.trim()) {
      return NextResponse.json(
        { success: false, message: 'Isi pesan WhatsApp wajib diisi' },
        { status: 400 }
      );
    }
    if (message.trim().length > WA_MANUAL_MESSAGE_MAX_LENGTH) {
      return NextResponse.json(
        { success: false, message: `Isi pesan maksimal ${WA_MANUAL_MESSAGE_MAX_LENGTH} karakter` },
        { status: 400 }
      );
    }
    if (typeof title === 'string' && title.trim().length > WA_MANUAL_TITLE_MAX_LENGTH) {
      return NextResponse.json(
        { success: false, message: `Judul pesan maksimal ${WA_MANUAL_TITLE_MAX_LENGTH} karakter` },
        { status: 400 }
      );
    }

    let orderId: number | undefined;
    if (repairRequestId !== undefined && repairRequestId !== null && repairRequestId !== '') {
      orderId = parseInt(repairRequestId, 10);
      if (isNaN(orderId) || orderId <= 0) {
        return NextResponse.json(
          { success: false, message: 'ID pesanan terkait tidak valid' },
          { status: 400 }
        );
      }
    }

    const result = await sendManualWhatsAppMessage({
      adminUserId: session.userId,
      userId: recipientId,
      message,
      title: typeof title === 'string' ? title : undefined,
      repairRequestId: orderId,
    });

    // Audit: dicatat untuk kiriman berhasil maupun gagal (bila ada baris log).
    // Isi pesan TIDAK dimasukkan ke audit log (bisa mengandung data pribadi).
    if (result.notificationId) {
      await recordAdminAudit({
        adminUserId: session.userId,
        action: 'SEND_WHATSAPP',
        entityName: 'whatsapp_notifications',
        entityId: result.notificationId,
        newValues: {
          recipient_user_id: recipientId,
          masked_phone: result.maskedPhone || null,
          status: result.success ? 'sent' : 'failed',
          repair_request_id: orderId || null,
        },
        ipAddress: request.headers.get('x-forwarded-for') || null,
        userAgent: request.headers.get('user-agent') || null,
      });
    }

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: `Pesan WhatsApp berhasil dikirim ke ${result.maskedPhone || 'penerima'}`,
        data: {
          notificationId: result.notificationId,
          maskedPhone: result.maskedPhone,
          status: 'sent',
        },
      });
    }

    return NextResponse.json(
      {
        success: false,
        message: result.error || 'Gagal mengirim pesan WhatsApp',
        data: {
          notificationId: result.notificationId || null,
          maskedPhone: result.maskedPhone || null,
          status: 'failed',
        },
      },
      { status: result.httpStatus }
    );
  } catch (error: any) {
    console.error('[Admin WhatsApp Send Error]:', error);
    return NextResponse.json(
      { success: false, message: 'Gagal mengirim pesan WhatsApp: ' + (error?.message || 'Server error') },
      { status: 500 }
    );
  }
}
