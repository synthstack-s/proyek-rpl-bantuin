import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateSession, getSessionMessages } from '@/lib/chatbot/repository';

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

    const session = await getOrCreateSession(sessionUuid);
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
