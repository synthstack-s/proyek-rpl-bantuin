import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { AIProviderManager } from '@/lib/ai/provider-manager';
import { checkAdminAiRateLimit } from '@/lib/rate-limiter';
import { AIProviderType } from '@/lib/ai/types';

/**
 * GET /api/admin/ai/models?provider=gemini|groq[&apiEndpoint=...]
 * Mengambil daftar model dinamis langsung dari API provider.
 *
 * T2: API key TIDAK PERNAH diterima lewat query string — key yang masuk URL
 * tercatat di access log server, histori browser, dan log proxy. GET ini
 * memakai key TERSIMPAN di server (berdasarkan provider). Bila admin ingin
 * mengambil model dengan key yang BELUM disimpan (masih di form), gunakan
 * POST di bawah (key di body JSON).
 *
 * M4: respons menyertakan `isLive` — false berarti daftar adalah cadangan
 * hardcoded karena pengambilan live gagal (lihat `error`); UI wajib
 * menampilkannya sebagai "daftar cadangan", bukan sukses.
 */
export async function GET(req: NextRequest) {
  try {
    const adminSession = await getAdminSession();
    if (!adminSession || adminSession.role !== 'admin') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const provider = searchParams.get('provider') as AIProviderType;
    const apiEndpoint = searchParams.get('apiEndpoint');

    // T2: tolak key lewat query string secara eksplisit — klien lama yang
    // masih mengirim `?apiKey=` harus diperbarui ke POST, bukan diam-diam
    // diterima (key di URL adalah kebocoran, bukan fitur).
    if (searchParams.has('apiKey')) {
      return NextResponse.json(
        { success: false, message: 'API key tidak boleh dikirim lewat query string. Gunakan POST /api/admin/ai/models dengan key di body JSON.' },
        { status: 400 }
      );
    }

    if (!provider || typeof provider !== 'string' || !provider.trim()) {
      return NextResponse.json(
        { success: false, message: "Parameter 'provider' wajib diisi." },
        { status: 400 }
      );
    }

    // M2: normalisasi slug provider.
    const normalizedProvider = provider.trim().toLowerCase() as AIProviderType;

    // L8: batasi pengambilan daftar model per admin per provider
    // (10/menit) — setiap panggilan memanggil API provider. GET dan POST
    // berbagi kuota yang sama (satu kunci) karena bebannya identik.
    const rateLimit = checkAdminAiRateLimit(`ai-models:${adminSession.userId}:${normalizedProvider}`, 10);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          message: `Terlalu banyak permintaan daftar model untuk provider ${normalizedProvider}. Silakan tunggu ${rateLimit.retryAfterSeconds} detik sebelum mencoba lagi.`,
        },
        { status: 429 }
      );
    }

    const configOverride: any = {};
    if (apiEndpoint && apiEndpoint.trim()) configOverride.apiEndpoint = apiEndpoint.trim();

    const manager = AIProviderManager.getInstance();
    const result = await manager.getAvailableModels(normalizedProvider, configOverride);

    return NextResponse.json({
      success: true,
      models: result.models,
      isLive: result.isLive,
      error: result.isLive ? null : result.error || 'Pengambilan daftar model live gagal.',
    });
  } catch (err: any) {
    console.error('Error in GET /api/admin/ai/models:', err);
    return NextResponse.json(
      { success: false, message: 'Gagal mengambil daftar model: ' + err.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/ai/models
 * Mengambil daftar model dengan kredensial dari body — dipakai panel admin
 * hanya saat admin menguji key yang BELUM disimpan (masih di form).
 * Bila `apiKey` tidak dikirim/kosong, server memakai key tersimpan.
 * Body: { provider, apiKey?, apiEndpoint? }
 */
export async function POST(req: NextRequest) {
  try {
    const adminSession = await getAdminSession();
    if (!adminSession || adminSession.role !== 'admin') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak.' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { provider, apiKey, apiEndpoint } = body;

    if (!provider || typeof provider !== 'string' || !provider.trim()) {
      return NextResponse.json(
        { success: false, message: "Parameter 'provider' wajib diisi." },
        { status: 400 }
      );
    }

    // M2: normalisasi slug provider.
    const normalizedProvider = provider.trim().toLowerCase() as AIProviderType;

    // L8: batasi pengambilan daftar model per admin per provider
    // (10/menit) — berbagi kuota dengan GET (lihat di atas).
    const rateLimit = checkAdminAiRateLimit(`ai-models:${adminSession.userId}:${normalizedProvider}`, 10);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          message: `Terlalu banyak permintaan daftar model untuk provider ${normalizedProvider}. Silakan tunggu ${rateLimit.retryAfterSeconds} detik sebelum mencoba lagi.`,
        },
        { status: 429 }
      );
    }

    const configOverride: any = {};
    if (typeof apiKey === 'string' && apiKey.trim()) configOverride.apiKey = apiKey.trim();
    if (typeof apiEndpoint === 'string' && apiEndpoint.trim()) configOverride.apiEndpoint = apiEndpoint.trim();

    const manager = AIProviderManager.getInstance();
    const result = await manager.getAvailableModels(normalizedProvider, configOverride);

    return NextResponse.json({
      success: true,
      models: result.models,
      isLive: result.isLive,
      error: result.isLive ? null : result.error || 'Pengambilan daftar model live gagal.',
    });
  } catch (err: any) {
    console.error('Error in POST /api/admin/ai/models:', err);
    return NextResponse.json(
      { success: false, message: 'Gagal mengambil daftar model: ' + err.message },
      { status: 500 }
    );
  }
}
