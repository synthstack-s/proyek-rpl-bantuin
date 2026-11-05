import { NextRequest } from 'next/server';
import { getUserSession, getAdminSession } from '@/lib/auth';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/notifications/stream
 * Endpoint Server-Sent Events (SSE) untuk streaming notifikasi dan pembaruan status real-time.
 */
export async function GET(request: NextRequest) {
  // 1. Verifikasi Autentikasi Pengguna
  const userSession = await getUserSession();
  const adminSession = !userSession ? await getAdminSession() : null;
  const session = userSession || adminSession;

  if (!session) {
    return new Response(JSON.stringify({ success: false, message: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const userId = session.userId;
  const encoder = new TextEncoder();

  let lastCheckedTime = new Date(Date.now() - 60000); // 1 menit ke belakang
  let isStreamOpen = true;

  const stream = new ReadableStream({
    async start(controller) {
      // Kirim event sambungan awal
      controller.enqueue(
        encoder.encode(`event: connected\ndata: ${JSON.stringify({ userId, connectedAt: new Date().toISOString() })}\n\n`)
      );

      const intervalId = setInterval(async () => {
        if (!isStreamOpen) {
          clearInterval(intervalId);
          return;
        }

        try {
          // Ambil notifikasi baru yang masuk sejak pemeriksaan terakhir
          const newNotifications = await query<any[]>(
            `SELECT id, title, message, type, is_read, created_at
             FROM notifications
             WHERE user_id = ? AND created_at > ?
             ORDER BY created_at ASC`,
            [userId, lastCheckedTime]
          );

          if (newNotifications.length > 0) {
            lastCheckedTime = new Date();
            for (const notif of newNotifications) {
              const eventPayload = `event: notification\ndata: ${JSON.stringify({
                id: notif.id,
                title: notif.title,
                message: notif.message,
                type: notif.type,
                createdAt: notif.created_at,
              })}\n\n`;
              controller.enqueue(encoder.encode(eventPayload));
            }
          } else {
            // Heartbeat untuk menjaga koneksi tetap hidup
            controller.enqueue(encoder.encode(': heartbeat\n\n'));
          }
        } catch (err) {
          console.error('Error in notification stream loop:', err);
        }
      }, 5000);

      // Bersihkan saat koneksi ditutup klien
      request.signal.addEventListener('abort', () => {
        isStreamOpen = false;
        clearInterval(intervalId);
        try {
          controller.close();
        } catch {
          // stream already closed
        }
      });
    },
    cancel() {
      isStreamOpen = false;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
