import { NextRequest, NextResponse } from 'next/server';
import { getUserSession, getAdminSession } from '@/lib/auth';
import { getSessionByUuid, getSessionMessages } from '@/lib/chatbot/repository';

export async function GET(req: NextRequest) {
  try {
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

    const messages = await getSessionMessages(session.id);

    return NextResponse.json({
      success: true,
      session,
      messages: messages.map(m => ({
        id: m.id,
        role: m.role,
        message: m.message,
        metadata: m.rawMetadata,
        createdAt: m.createdAt,
      })),
    });
  } catch (error: any) {
    console.error('Error in GET /api/chat/history:', error);
    return NextResponse.json(
      { success: false, message: 'Gagal memuat riwayat percakapan.' },
      { status: 500 }
    );
  }
}
