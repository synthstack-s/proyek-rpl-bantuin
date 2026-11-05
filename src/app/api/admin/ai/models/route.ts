import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { AIProviderManager } from '@/lib/ai/provider-manager';
import { AIProviderType } from '@/lib/ai/types';

/**
 * GET /api/admin/ai/models?provider=gemini|groq
 * Mengambil daftar model dinamis langsung dari API provider
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
    const apiKey = searchParams.get('apiKey');
    const apiEndpoint = searchParams.get('apiEndpoint');

    if (!provider || typeof provider !== 'string' || !provider.trim()) {
      return NextResponse.json(
        { success: false, message: "Parameter 'provider' wajib diisi." },
        { status: 400 }
      );
    }

    const configOverride: any = {};
    if (apiKey && apiKey.trim()) configOverride.apiKey = apiKey.trim();
    if (apiEndpoint && apiEndpoint.trim()) configOverride.apiEndpoint = apiEndpoint.trim();

    const manager = AIProviderManager.getInstance();
    const models = await manager.getAvailableModels(provider, configOverride);

    return NextResponse.json({
      success: true,
      models,
    });
  } catch (err: any) {
    console.error('Error in GET /api/admin/ai/models:', err);
    return NextResponse.json(
      { success: false, message: 'Gagal mengambil daftar model: ' + err.message },
      { status: 500 }
    );
  }
}
