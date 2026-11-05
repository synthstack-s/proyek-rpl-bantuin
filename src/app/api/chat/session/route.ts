import { NextRequest, NextResponse } from 'next/server';
import { getUserSession, getAdminSession } from '@/lib/auth';
import { getOrCreateSession } from '@/lib/chatbot/repository';
import { ChatUserContext } from '@/lib/chatbot/types';
import { getPageContextSuggestions } from '@/lib/chatbot/engine';

export async function POST(req: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // Body kosong diperbolehkan untuk membuat sesi baru
    }

    const { sessionUuid, categoryId, pageContext } = body;

    // Cek sesi autentikasi
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

    const session = await getOrCreateSession(
      sessionUuid,
      userContext.userId || null,
      categoryId ? Number(categoryId) : null
    );

    const suggestions = getPageContextSuggestions(
      userContext.pageContext?.pathname,
      userContext.role
    );

    return NextResponse.json({
      success: true,
      session,
      user: {
        role: userContext.role,
        name: userContext.name || null,
      },
      suggestions,
    });
  } catch (error: any) {
    console.error('Error in POST /api/chat/session:', error);
    return NextResponse.json(
      { success: false, message: 'Gagal menginisialisasi sesi chat.' },
      { status: 500 }
    );
  }
}
