import { NextRequest, NextResponse } from 'next/server';
import { getUserSession } from '@/lib/auth';
import { getUserConsultationSessions } from '@/lib/chatbot/repository';

export async function GET(req: NextRequest) {
  try {
    const userSession = await getUserSession();
    if (!userSession || !userSession.userId) {
      return NextResponse.json(
        { success: false, message: 'Silakan masuk untuk melihat riwayat konsultasi AI Anda.' },
        { status: 401 }
      );
    }

    const sessions = await getUserConsultationSessions(userSession.userId);

    return NextResponse.json({
      success: true,
      sessions,
    });
  } catch (error: any) {
    console.error('Error in GET /api/chat/sessions:', error);
    return NextResponse.json(
      { success: false, message: 'Gagal mengambil riwayat sesi konsultasi.' },
      { status: 500 }
    );
  }
}
