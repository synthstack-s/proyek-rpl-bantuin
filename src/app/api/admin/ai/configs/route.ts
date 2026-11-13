import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import {
  getAllProviderConfigsPublic,
  getGlobalAISettings,
  saveProviderConfig,
  deleteProviderConfig,
  toPublicProviderConfig,
} from '@/lib/ai/repository';
import { AIProviderType } from '@/lib/ai/types';

/**
 * GET /api/admin/ai/configs
 * Mengambil status dan konfigurasi seluruh provider AI untuk panel admin.
 *
 * T1: respons TIDAK PERNAH berisi apiKey plaintext — memakai
 * getAllProviderConfigsPublic (maskedKeyPreview + isConfigured saja).
 * API key adalah write-only: dikirim ke server hanya saat save via POST
 * body, tidak pernah dikembalikan ke browser.
 */
export async function GET() {
  try {
    const adminSession = await getAdminSession();
    if (!adminSession || adminSession.role !== 'admin') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: Hanya administrator yang dapat melihat konfigurasi AI.' },
        { status: 403 }
      );
    }

    const [publicConfigList, globalSettings] = await Promise.all([
      getAllProviderConfigsPublic(),
      getGlobalAISettings(),
    ]);

    // Bentuk respons dipertahankan (map `configs` + array `configList`)
    // agar UI tidak berubah — isinya kini tanpa apiKey.
    const configs: Record<string, (typeof publicConfigList)[number]> = {};
    for (const c of publicConfigList) {
      configs[c.provider] = c;
    }

    return NextResponse.json({
      success: true,
      configs,
      configList: publicConfigList,
      globalSettings,
      data: {
        configs,
        configList: publicConfigList,
        globalSettings,
      },
    });
  } catch (err: any) {
    console.error('Error in GET /api/admin/ai/configs:', err);
    return NextResponse.json(
      { success: false, message: 'Gagal mengambil konfigurasi AI: ' + err.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/ai/configs
 * Menyimpan atau memperbarui konfigurasi provider AI spesifik (mendukung Gemini, Groq, dan Custom Providers)
 */
export async function POST(req: NextRequest) {
  try {
    const adminSession = await getAdminSession();
    if (!adminSession || adminSession.role !== 'admin') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: Hanya administrator yang berwenang mengubah konfigurasi AI.' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const {
      provider,
      name,
      apiKey,
      apiEndpoint,
      selectedModel,
      defaultModel,
      temperature,
      maxOutputTokens,
      requestTimeoutMs,
      retryLimit,
    } = body;

    if (!provider || typeof provider !== 'string' || !provider.trim()) {
      return NextResponse.json(
        { success: false, message: "Parameter 'provider' (slug ID) wajib diisi." },
        { status: 400 }
      );
    }

    const sanitizedProvider = provider.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    const userAgent = req.headers.get('user-agent') || 'AdminBrowser';

    const result = await saveProviderConfig(
      sanitizedProvider as AIProviderType,
      {
        name,
        apiKey,
        apiEndpoint,
        selectedModel,
        defaultModel,
        temperature,
        maxOutputTokens,
        requestTimeoutMs,
        retryLimit,
      },
      adminSession.userId,
      { ip, userAgent }
    );

    return NextResponse.json({
      success: true,
      message: result.message,
      maskedKeyPreview: result.maskedKeyPreview,
      // T1: jangan kembalikan result.config apa adanya — objek itu berisi
      // apiKey plaintext. Kirim versi publiknya (tanpa key).
      config: toPublicProviderConfig(result.config),
    });
  } catch (err: any) {
    console.error('Error in POST /api/admin/ai/configs:', err);
    return NextResponse.json(
      { success: false, message: err.message || 'Gagal menyimpan konfigurasi AI.' },
      { status: 400 }
    );
  }
}

/**
 * DELETE /api/admin/ai/configs
 * Menghapus provider AI kustom
 */
export async function DELETE(req: NextRequest) {
  try {
    const adminSession = await getAdminSession();
    if (!adminSession || adminSession.role !== 'admin') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: Hanya administrator yang berwenang menghapus provider AI.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const provider = searchParams.get('provider');

    if (!provider) {
      return NextResponse.json(
        { success: false, message: "Parameter 'provider' query wajib disertakan." },
        { status: 400 }
      );
    }

    // M2: normalisasi slug (trim + lowercase) agar 'GEMINI'/' Gemini ' tidak
    // lolos dari penjaga provider bawaan di deleteProviderConfig.
    const normalizedProvider = provider.trim().toLowerCase();

    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    const userAgent = req.headers.get('user-agent') || 'AdminBrowser';

    const result = await deleteProviderConfig(normalizedProvider, adminSession.userId, { ip, userAgent });

    return NextResponse.json({
      success: true,
      message: result.message,
    });
  } catch (err: any) {
    console.error('Error in DELETE /api/admin/ai/configs:', err);
    return NextResponse.json(
      { success: false, message: err.message || 'Gagal menghapus provider AI.' },
      { status: 400 }
    );
  }
}
