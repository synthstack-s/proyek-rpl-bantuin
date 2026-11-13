import { NextRequest, NextResponse } from 'next/server';
import { getUserSession, getAdminSession } from '@/lib/auth';
import { checkChatRateLimit } from '@/lib/rate-limiter';
import { getOrCreateSession, isSessionForbiddenError } from '@/lib/chatbot/repository';
import { processChatMessage } from '@/lib/chatbot/engine';
import { ChatUserContext } from '@/lib/chatbot/types';

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';

    // 1. Periksa Rate Limit Chat
    const rateLimit = checkChatRateLimit(ip, 30);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          message: `Terlalu banyak permintaan pesan. Silakan tunggu ${rateLimit.retryAfterSeconds} detik sebelum mengirim pesan berikutnya.`,
        },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { message, sessionUuid, categoryId, pageContext } = body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json(
        { success: false, message: 'Pesan tidak boleh kosong.' },
        { status: 400 }
      );
    }

    if (message.length > 2000) {
      return NextResponse.json(
        { success: false, message: 'Pesan melebihi batas maksimal 2000 karakter.' },
        { status: 400 }
      );
    }

    // 2. Tentukan Konteks Pengguna (Role-Based Context)
    let userContext: ChatUserContext = { role: 'guest' };
    const adminSession = await getAdminSession();
    if (adminSession) {
      userContext = {
        userId: adminSession.userId,
        uuid: adminSession.uuid,
        role: 'admin',
        name: adminSession.name || 'Administrator',
        email: adminSession.email,
      };
    } else {
      const userSession = await getUserSession();
      if (userSession) {
        userContext = {
          userId: userSession.userId,
          uuid: userSession.uuid,
          role: userSession.role,
          name: userSession.name || 'Pengguna',
          email: userSession.email,
          phoneNumber: userSession.phoneNumber,
        };
      }
    }

    if (pageContext && typeof pageContext === 'object') {
      userContext.pageContext = {
        pathname: String(pageContext.pathname || '/'),
        pageTitle: pageContext.pageTitle ? String(pageContext.pageTitle) : undefined,
      };
    }

    // 3. Dapatkan atau Buat Sesi Chat
    const session = await getOrCreateSession(
      sessionUuid,
      userContext.userId || null,
      categoryId ? Number(categoryId) : null
    );

    // 4. Proses Pesan melalui Pipeline Chatbot+
    const result = await processChatMessage({
      userMessage: message.trim(),
      session,
      userContext,
    });

    return NextResponse.json({
      success: true,
      reply: result.reply,
      metadata: result.metadata,
      diagnosisCard: result.diagnosisCard || null,
      session: {
        sessionUuid: session.sessionUuid,
        categoryId: session.categoryId,
        categorySlug: session.categorySlug,
      },
    });
  } catch (error: any) {
    console.error('Error in POST /api/chat/message:', error);
    // F1: sesi milik pengguna lain — getOrCreateSession menolak, bukan 500.
    if (isSessionForbiddenError(error)) {
      return NextResponse.json(
        { success: false, message: 'Sesi chat ini milik pengguna lain.' },
        { status: 403 }
      );
    }
    return NextResponse.json(
      {
        success: false,
        message: 'Terjadi kesalahan sistem saat memproses pesan AI. Silakan coba kembali.',
      },
      { status: 500 }
    );
  }
}
