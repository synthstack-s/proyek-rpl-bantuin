import { NextRequest, NextResponse } from 'next/server';
import { getUserSession } from '@/lib/auth';
import { getOrCreateSession, markSessionConverted } from '@/lib/chatbot/repository';

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

    const body = await req.json();
    const { sessionUuid } = body;

    if (!sessionUuid) {
      return NextResponse.json(
        { success: false, message: 'sessionUuid wajib disertakan.' },
        { status: 400 }
      );
    }

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
    return NextResponse.json(
      { success: false, message: 'Gagal mengonversi sesi ke pesanan.' },
      { status: 500 }
    );
  }
}
