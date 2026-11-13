import { NextRequest, NextResponse } from 'next/server';
import { getUserSession, getAdminSession } from '@/lib/auth';
import { checkChatRateLimit } from '@/lib/rate-limiter';
import { getOrCreateSession, isSessionForbiddenError } from '@/lib/chatbot/repository';
import { processChatMessage } from '@/lib/chatbot/engine';
import { ChatUserContext } from '@/lib/chatbot/types';

/**
 * F21 — IP klien dari request untuk log audit (bukan untuk rate limit —
 * kunci rate limit di bawah sengaja tidak diubah; itu cakupan F3/Batch 5).
 * Konvensi codebase: `x-forwarded-for`. Ambil entri PERTAMA daftar (asal
 * asli di balik proxy), validasi bentuk IPv4/IPv6, dan kembalikan `null`
 * bila tidak ada/tidak valid — jangan pernah memakai IP palsu seperti
 * '127.0.0.1' untuk audit. Diekspor agar dapat diuji.
 */
export function getClientIpFromRequest(req: NextRequest): string | null {
  const forwarded = req.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  if (!first || first.length > 45) return null;
  const isIPv4 = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(first);
  const isIPv6 =
    /^[0-9a-fA-F:]*[0-9a-fA-F][0-9a-fA-F:]*$/.test(first) &&
    first.includes(':') &&
    !first.includes(':::');
  if (!isIPv4 && !isIPv6) return null;
  return first;
}

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

    // F21 — Teruskan IP klien ke action-service lewat userContext agar log
    // audit admin mencatat asal sebenarnya (bukan '127.0.0.1' hardcode).
    // userContext diteruskan utuh (engine -> tools -> action-service) tanpa
    // dibangun ulang, sehingga tidak perlu perubahan di engine/tools.
    userContext.clientIp = getClientIpFromRequest(req);

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

    // F6 — Teruskan asal penyimpanan pesan ke klien. Engine (Batch 4, agen
    // engine) mengisi `storedIn: 'db' | 'memory'` pada hasil; di base
    // branch hasil belum memilikinya, karena itu dibaca defensif. Bila
    // engine belum mengisinya tetapi sesi ini sendiri hanya ada di memori
    // (DB down saat sesi dibuat), pesan PASTI hanya di memori (repository
    // tidak pernah INSERT untuk sesi fallback) — laporkan 'memory' juga
    // dalam kasus itu. Tanpa bukti apa pun, field tidak disertakan (jangan
    // mengklaim 'db' tanpa bukti).
    // F23-route: route tidak menambahkan detail error apa pun — yang
    // diteruskan hanya output engine (reply/metadata/diagnosisCard) yang
    // sudah disanitasi di sisi engine; tidak ada `aiError` mentah yang
    // ditambahkan di sini.
    const engineStoredIn = (result as { storedIn?: unknown }).storedIn;
    const storedIn: 'db' | 'memory' | undefined =
      engineStoredIn === 'memory'
        ? 'memory'
        : engineStoredIn === 'db' || engineStoredIn === 'database'
          ? 'db'
          : session.storedIn === 'memory'
            ? 'memory'
            : undefined;

    return NextResponse.json({
      success: true,
      reply: result.reply,
      metadata: result.metadata,
      diagnosisCard: result.diagnosisCard || null,
      ...(storedIn ? { storedIn } : {}),
      ...(storedIn === 'memory'
        ? {
            notice:
              'Pesan tersimpan sementara di memori server (database tidak dapat diakses); riwayat ini bisa hilang bila server di-restart.',
          }
        : {}),
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
