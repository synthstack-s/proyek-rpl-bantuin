import { NextRequest, NextResponse } from 'next/server';
import { getUserSession, getAdminSession } from '@/lib/auth';
import { checkChatRateLimit, parseClientIpFromForwardedHeader } from '@/lib/rate-limiter';
import { getOrCreateSession, isSessionForbiddenError } from '@/lib/chatbot/repository';
import { processChatMessage } from '@/lib/chatbot/engine';
import { checkDailyAIQuota } from '@/lib/ai/repository';
import { ChatUserContext } from '@/lib/chatbot/types';

/**
 * F21 — IP klien dari request untuk log audit. Mendelegasikan parsing ke
 * `parseClientIpFromForwardedHeader` (S5/F3): entri PERTAMA daftar
 * `x-forwarded-for`, tervalidasi bentuk IPv4/IPv6, `null` bila tidak
 * ada/tidak valid — jangan pernah memakai IP palsu seperti '127.0.0.1'
 * untuk audit. Diekspor agar dapat diuji.
 */
export function getClientIpFromRequest(req: NextRequest): string | null {
  return parseClientIpFromForwardedHeader(req.headers.get('x-forwarded-for'));
}

/**
 * S5/F3 — Rate limit chat berlapis (menggantikan kunci header mentah):
 * - Lapisan 1 (backstop per-IP, dicek SEBELUM parsing body agar banjir
 *   request ditolak murah tanpa menyentuh DB): kunci = IP hasil parsing
 *   ketat (entri pertama, tervalidasi) atau bucket bersama 'unknown'
 *   bila tidak ada IP valid. Batasnya LONGGAR (120/menit) karena lapisan
 *   ini hanya penahan banjir kasar — pembatasan per-pengguna yang adil
 *   dilakukan lapisan 2. Nilai mentah header TIDAK PERNAH lagi dipakai
 *   sebagai kunci (setiap nilai berbeda dulu = kuota baru).
 * - Lapisan 2 (per-identitas, dicek SETELAH sesi didapat): kunci =
 *   `user:<id>` untuk pengguna login, `session:<uuid>` untuk guest.
 *   Batas 30/menit — sama seperti perilaku sebelumnya untuk klien
 *   legitimate. Identitas tidak bisa dipalsukan semudah header (userId
 *   dari sesi login, sessionUuid dari sesi server), dan guest yang
 *   membuat sesi baru terus-menerus tetap tertahan lapisan 1 + kuota
 *   harian (S5/F8).
 */
const CHAT_IP_BACKSTOP_PER_MINUTE = 120;
const CHAT_IDENTITY_PER_MINUTE = 30;

export async function POST(req: NextRequest) {
  try {
    // 1. Rate Limit Chat — Lapisan 1: backstop per-IP (S5/F3). IP diparsing
    // ketat (entri pertama + validasi format); tanpa IP valid, semua
    // request berbagi bucket 'unknown' (lebih ketat, bukan lebih longgar).
    const clientIp = getClientIpFromRequest(req);
    const ipRateLimit = checkChatRateLimit(`ip:${clientIp || 'unknown'}`, CHAT_IP_BACKSTOP_PER_MINUTE);
    if (!ipRateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          message: `Terlalu banyak permintaan pesan dari jaringan Anda. Silakan tunggu ${ipRateLimit.retryAfterSeconds} detik sebelum mengirim pesan berikutnya.`,
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
        visibleContentSummary: pageContext.visibleContentSummary
          ? String(pageContext.visibleContentSummary).slice(0, 3000)
          : undefined,
        activeTab: pageContext.activeTab ? String(pageContext.activeTab) : undefined,
        activeEntityId: pageContext.activeEntityId ? String(pageContext.activeEntityId) : undefined,
        screenData: typeof pageContext.screenData === 'object' ? pageContext.screenData : undefined,
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

    // 3b. Rate Limit Chat — Lapisan 2: per-identitas (S5/F3). Kunci utama
    // adalah identitas yang tidak bisa dipalsukan lewat header: userId
    // login, atau UUID sesi server untuk guest. Berlaku juga untuk
    // permintaan streaming di bawah (tidak boleh dilewati).
    const identityKey = userContext.userId
      ? `user:${userContext.userId}`
      : `session:${session.sessionUuid}`;
    const identityRateLimit = checkChatRateLimit(identityKey, CHAT_IDENTITY_PER_MINUTE);
    if (!identityRateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          message: `Terlalu banyak permintaan pesan. Silakan tunggu ${identityRateLimit.retryAfterSeconds} detik sebelum mengirim pesan berikutnya.`,
        },
        { status: 429 }
      );
    }

    // 3c. Kuota harian AI (S5/F8) — choke point SEBELUM provider dipanggil.
    // Dihitung dari ai_usage_logs hari ini (per userId login / per sesi
    // guest); batas dibaca dari system_settings.ai_daily_free_quota
    // (default 10). Bila DB tidak terbaca, checkDailyAIQuota fail-open
    // dengan peringatan (lihat repository.ts). Berlaku juga untuk streaming.
    const quota = await checkDailyAIQuota({
      userId: userContext.userId || null,
      sessionId: session.id,
    });
    if (!quota.allowed) {
      return NextResponse.json(
        {
          success: false,
          message: `Kuota harian percakapan AI Anda sudah habis (${quota.used}/${quota.limit} permintaan hari ini). Silakan coba lagi besok.`,
        },
        { status: 429 }
      );
    }

    const wantsStream = body.stream === true || req.headers.get('accept')?.includes('text/event-stream');

    // 4. Jika Klien Meminta Streaming Respons Real-Time (SSE)
    if (wantsStream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            const result = await processChatMessage({
              userMessage: message.trim(),
              session,
              userContext,
              onToken: (token: string) => {
                controller.enqueue(
                  encoder.encode(`event: token\ndata: ${JSON.stringify({ text: token })}\n\n`)
                );
              },
            });

            // Kirim metadata, kartu diagnosis, dan sesi
            controller.enqueue(
              encoder.encode(
                `event: metadata\ndata: ${JSON.stringify({
                  metadata: result.metadata,
                  diagnosisCard: result.diagnosisCard || null,
                  session: {
                    sessionUuid: session.sessionUuid,
                    categoryId: session.categoryId,
                    categorySlug: session.categorySlug,
                  },
                })}\n\n`
              )
            );

            controller.enqueue(encoder.encode(`event: done\ndata: {}\n\n`));
            controller.close();
          } catch (streamErr: any) {
            console.error('Error in SSE stream:', streamErr);
            controller.enqueue(
              encoder.encode(
                `event: error\ndata: ${JSON.stringify({
                  message: 'Terjadi kesalahan sistem saat memproses streaming AI.',
                })}\n\n`
              )
            );
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
        },
      });
    }

    // 5. Mode Standar Non-Streaming (JSON Response)
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
