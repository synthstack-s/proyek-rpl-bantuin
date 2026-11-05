import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import {
  getAllProviderConfigsAdmin,
  getGlobalAISettings,
  saveProviderConfig,
  deleteProviderConfig,
} from '@/lib/ai/repository';
import { AIProviderType } from '@/lib/ai/types';

/**
 * GET /api/admin/ai/configs
 * Mengambil status dan konfigurasi seluruh provider AI untuk panel admin (termasuk API Key terdekripsi agar bisa dilihat & diedit)
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

    const [providerData, globalSettings] = await Promise.all([
      getAllProviderConfigsAdmin(),
      getGlobalAISettings(),
    ]);

    return NextResponse.json({
      success: true,
      configs: providerData.configs,
      configList: providerData.configList,
      globalSettings,
      data: {
        configs: providerData.configs,
        configList: providerData.configList,
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
      config: result.config,
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

    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    const userAgent = req.headers.get('user-agent') || 'AdminBrowser';

    const result = await deleteProviderConfig(provider, adminSession.userId, { ip, userAgent });

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
