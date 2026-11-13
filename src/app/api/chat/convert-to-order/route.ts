import { NextRequest, NextResponse } from 'next/server';
import { getUserSession } from '@/lib/auth';
import { checkChatRateLimit } from '@/lib/rate-limiter';
import { getOrCreateSession, isSessionForbiddenError, markSessionConverted } from '@/lib/chatbot/repository';

export async function POST(req: NextRequest) {
  try {
    const userSession = await getUserSession();
    if (!userSession || !userSession.userId) {
      return NextResponse.json(
        {
          success: false,
          requiresLogin: true,
          message: 'Silakan masuk ke akun pelanggan Anda untuk melanjutkan pemesanan teknisi.',
        },
        { status: 401 }
      );
    }

    // F9: batasi konversi per pengguna (10/menit) — tanpa ini, endpoint
    // bisa dipanggil berulang tanpa batas untuk menandai sesi sebagai
    // terkonversi.
    const convertLimit = checkChatRateLimit(`convert:${userSession.userId}`, 10);
    if (!convertLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          message: `Terlalu banyak permintaan konversi. Silakan tunggu ${convertLimit.retryAfterSeconds} detik sebelum mencoba lagi.`,
        },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { sessionUuid } = body;

    if (!sessionUuid) {
      return NextResponse.json(
        { success: false, message: 'sessionUuid wajib disertakan.' },
        { status: 400 }
      );
    }

    // F1/F2: getOrCreateSession menolak (403) bila sesi dimiliki pengguna lain.
    // Sesi guest boleh dikonversi (alur guest → booking yang sah), tetapi TIDAK
    // diikat ke peminta — konversi hanya menautkan ai_session_id ke pesanan.
    const session = await getOrCreateSession(sessionUuid, userSession.userId);
    await markSessionConverted(session.id);

    const searchParams = new URLSearchParams();
    if (session.categoryId) searchParams.set('category_id', String(session.categoryId));
    if (session.initialSymptoms) searchParams.set('symptoms', session.initialSymptoms);
    searchParams.set('ai_session_id', String(session.id));

    const bookingUrl = `/customer/repairs/new?${searchParams.toString()}`;

    return NextResponse.json({
      success: true,
      message: 'Sesi konsultasi AI berhasil dihubungkan ke formulir pemesanan.',
      bookingUrl,
      session,
    });
  } catch (error: any) {
    console.error('Error in POST /api/chat/convert-to-order:', error);
    // F1: sesi milik pengguna lain tidak boleh dikonversi peminta ini.
    if (isSessionForbiddenError(error)) {
      return NextResponse.json(
        { success: false, message: 'Sesi chat ini milik pengguna lain.' },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { success: false, message: 'Gagal mengonversi sesi ke pesanan.' },
      { status: 500 }
    );
  }
}
