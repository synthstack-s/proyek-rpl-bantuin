import { NextRequest, NextResponse } from 'next/server';
import { getUserSession, getAdminSession } from '@/lib/auth';
import { checkChatRateLimit } from '@/lib/rate-limiter';
import { getSessionByUuid, getSessionMessagesPage } from '@/lib/chatbot/repository';

export async function GET(req: NextRequest) {
  try {
    // F9: batasi pembacaan riwayat per IP (30/menit, sama dengan route
    // message) — tanpa ini, endpoint bisa dipakai untuk enumerasi/brute
    // force UUID sesi tanpa batas.
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    const rateLimit = checkChatRateLimit(`history:${ip}`, 30);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          message: `Terlalu banyak permintaan riwayat. Silakan tunggu ${rateLimit.retryAfterSeconds} detik sebelum mencoba lagi.`,
        },
        { status: 429 }
      );
    }

    const { searchParams } = new URL(req.url);
    const sessionUuid = searchParams.get('uuid');

    if (!sessionUuid) {
      return NextResponse.json(
        { success: false, message: 'Parameter uuid diperlukan.' },
        { status: 400 }
      );
    }

    // F17: lookup read-only — GET tidak boleh membuat sesi baru. UUID yang tidak
    // dikenal mengembalikan 404, bukan sesi baru dengan UUID acak.
    const session = await getSessionByUuid(sessionUuid);
    if (!session) {
      return NextResponse.json(
        { success: false, message: 'Sesi tidak ditemukan.' },
        { status: 404 }
      );
    }

    // F1: sesi yang terikat ke seorang pengguna hanya boleh dibaca pemiliknya.
    // Admin TIDAK mendapat akses menyeluruh di sini — admin hanya boleh membaca
    // sesi yang terikat ke userId admin itu sendiri (sesuai kontrak tugas Batch 1).
    if (session.userId !== null && session.userId !== undefined) {
      const adminSession = await getAdminSession();
      const userSession = adminSession ? null : await getUserSession();
      const callerUserId = adminSession?.userId ?? userSession?.userId ?? null;

      if (!callerUserId) {
        return NextResponse.json(
          { success: false, message: 'Silakan masuk untuk melihat riwayat percakapan ini.' },
          { status: 401 }
        );
      }
      if (callerUserId !== session.userId) {
        return NextResponse.json(
          { success: false, message: 'Anda tidak memiliki akses ke sesi ini.' },
          { status: 403 }
        );
      }
    }
    // Sesi guest (user_id NULL) tetap bisa dibaca siapa pun yang memegang UUID-nya
    // — alur guest tidak punya identitas untuk diperiksa. RISIKO RESIDUAL: siapa
    // pun yang memperoleh UUID sesi guest (mis. dari log/URL booking/riwayat
    // browser) bisa membaca riwayatnya. Mitigasi penuh (token klaim/akses per
    // sesi guest) berada di luar cakupan Batch 1 dan dicatat di REPORT.md.

    // S9a/F13 — paginasi berbasis cursor: seluruh riwayat TIDAK LAGI
    // dikembalikan sekaligus. `limit` = ukuran halaman (default 50, maks
    // 100); `before` = cursor ID pesan (ambil halaman pesan yang LEBIH LAMA
    // dari ID itu — isi dengan `pagination.nextCursor` dari respons
    // sebelumnya). Halaman pertama berisi pesan-pesan terbaru.
    const limitParam = searchParams.get('limit');
    const beforeParam = searchParams.get('before');
    let limit = 50;
    if (limitParam !== null) {
      const parsed = Number.parseInt(limitParam, 10);
      if (!Number.isInteger(parsed) || parsed < 1) {
        return NextResponse.json(
          { success: false, message: 'Parameter limit harus berupa bilangan bulat positif.' },
          { status: 400 }
        );
      }
      limit = Math.min(100, parsed);
    }
    let beforeId: number | null = null;
    if (beforeParam !== null) {
      const parsed = Number.parseInt(beforeParam, 10);
      if (!Number.isInteger(parsed)) {
        return NextResponse.json(
          { success: false, message: 'Parameter before harus berupa ID pesan (bilangan bulat).' },
          { status: 400 }
        );
      }
      beforeId = parsed;
    }

    const page = await getSessionMessagesPage(session.id, { limit, beforeId });

    return NextResponse.json({
      success: true,
      session,
      messages: page.messages.map(m => ({
        id: m.id,
        role: m.role,
        message: m.message,
        metadata: m.rawMetadata,
        createdAt: m.createdAt,
      })),
      pagination: {
        limit,
        hasMore: page.hasMore,
        nextCursor: page.nextCursor,
      },
    });
  } catch (error: any) {
    console.error('Error in GET /api/chat/history:', error);
    return NextResponse.json(
      { success: false, message: 'Gagal memuat riwayat percakapan.' },
      { status: 500 }
    );
  }
}
