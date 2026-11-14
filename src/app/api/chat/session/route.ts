import { NextRequest, NextResponse } from 'next/server';
import { getUserSession, getAdminSession } from '@/lib/auth';
import { checkChatRateLimit } from '@/lib/rate-limiter';
import { getOrCreateSession, getSessionById, isSessionForbiddenError } from '@/lib/chatbot/repository';
import { ChatUserContext } from '@/lib/chatbot/types';
import { getPageContextSuggestions } from '@/lib/chatbot/engine';

/**
 * F24 — Muat detail sesi berdasarkan ID numerik (`GET /api/chat/session?id=...`).
 * Dipakai halaman booking (/customer/repairs/new) untuk mengambil gejala awal
 * lewat referensi server-side, setelah teks gejala dihapus dari query string.
 * Read-only: tidak pernah membuat sesi (F17). Wajib login + kepemilikan.
 */
export async function GET(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    const rateLimit = checkChatRateLimit(`session-get:${ip}`, 10);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          message: `Terlalu banyak permintaan. Silakan tunggu ${rateLimit.retryAfterSeconds} detik sebelum mencoba lagi.`,
        },
        { status: 429 }
      );
    }

    const idParam = req.nextUrl.searchParams.get('id');
    const sessionId = idParam ? Number(idParam) : NaN;
    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      return NextResponse.json(
        { success: false, message: 'Parameter id sesi tidak valid.' },
        { status: 400 }
      );
    }

    // Wajib login — tamu tidak boleh mengintip sesi lewat ID numerik
    // (ID berurutan mudah ditebak, berbeda dengan UUID).
    const adminSession = await getAdminSession();
    const userSession = adminSession ? null : await getUserSession();
    const callerUserId = adminSession?.userId ?? userSession?.userId ?? null;
    const isAdmin = Boolean(adminSession);
    if (callerUserId === null) {
      return NextResponse.json(
        { success: false, message: 'Silakan login terlebih dahulu.' },
        { status: 401 }
      );
    }

    const session = await getSessionById(sessionId);
    if (!session) {
      return NextResponse.json(
        { success: false, message: 'Sesi tidak ditemukan.' },
        { status: 404 }
      );
    }

    // Kepemilikan (F1): sesi milik pengguna lain ditolak. Sesi guest
    // (user_id NULL) hanya boleh dibaca bila sudah dikonversi menjadi
    // pesanan — membatasi permukaan enumerasi ID numerik pada sesi yang
    // memang sedang dalam alur booking oleh pemegang referensinya.
    const ownerId = session.userId;
    const isOwner = ownerId !== null && ownerId === callerUserId;
    const isConvertedGuest = ownerId === null && session.isConvertedToOrder;
    if (!isAdmin && !isOwner && !isConvertedGuest) {
      return NextResponse.json(
        { success: false, message: 'Sesi chat ini milik pengguna lain.' },
        { status: 403 }
      );
    }

    // Hanya field yang dibutuhkan halaman booking — bukan seluruh sesi.
    return NextResponse.json({
      success: true,
      session: {
        id: session.id,
        categoryId: session.categoryId,
        categoryName: session.categoryName,
        initialSymptoms: session.initialSymptoms,
        preliminaryDiagnosis: session.preliminaryDiagnosis,
      },
    });
  } catch (error: any) {
    console.error('Error in GET /api/chat/session:', error);
    return NextResponse.json(
      { success: false, message: 'Gagal memuat detail sesi.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    // F9: batasi pembuatan sesi per IP — tanpa ini, penyerang bisa
    // membanjiri tabel ai_consultation_sessions (satu baris baru per
    // panggilan tanpa sessionUuid). 10 sesi/menit/IP sudah longgar untuk
    // pemakaian normal.
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    const rateLimit = checkChatRateLimit(`session:${ip}`, 10);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          message: `Terlalu banyak pembuatan sesi. Silakan tunggu ${rateLimit.retryAfterSeconds} detik sebelum mencoba lagi.`,
        },
        { status: 429 }
      );
    }

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
        visibleContentSummary: pageContext.visibleContentSummary
          ? String(pageContext.visibleContentSummary).slice(0, 3000)
          : undefined,
        activeTab: pageContext.activeTab ? String(pageContext.activeTab) : undefined,
        activeEntityId: pageContext.activeEntityId ? String(pageContext.activeEntityId) : undefined,
        screenData: typeof pageContext.screenData === 'object' ? pageContext.screenData : undefined,
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
    // F1: sesi milik pengguna lain — getOrCreateSession menolak, bukan 500.
    // Objek sesi orang lain tidak pernah dikembalikan.
    if (isSessionForbiddenError(error)) {
      return NextResponse.json(
        { success: false, message: 'Sesi chat ini milik pengguna lain.' },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { success: false, message: 'Gagal menginisialisasi sesi chat.' },
      { status: 500 }
    );
  }
}
