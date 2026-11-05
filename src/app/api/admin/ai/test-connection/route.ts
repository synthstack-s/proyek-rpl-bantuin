import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { AIProviderManager } from '@/lib/ai/provider-manager';
import { AIProviderType } from '@/lib/ai/types';

/**
 * POST /api/admin/ai/test-connection
 * Menjalankan uji koneksi langsung ke provider AI tanpa mengubah status provider aktif
 */
export async function POST(req: NextRequest) {
  try {
    const adminSession = await getAdminSession();
    if (!adminSession || adminSession.role !== 'admin') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: Hanya administrator yang dapat menguji koneksi AI.' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { provider, apiEndpoint, apiKey, selectedModel } = body;

    if (!provider || typeof provider !== 'string' || !provider.trim()) {
      return NextResponse.json(
        { success: false, message: "Parameter 'provider' wajib diisi." },
        { status: 400 }
      );
    }

    const manager = AIProviderManager.getInstance();
    const result = await manager.testProviderConnection(
      provider as AIProviderType,
      {
        apiEndpoint,
        apiKey,
        selectedModel,
      },
      adminSession.userId
    );

    return NextResponse.json({
      success: true,
      connected: result.status === 'success',
      result,
    });
  } catch (err: any) {
    console.error('Error in POST /api/admin/ai/test-connection:', err);
    return NextResponse.json(
      {
        success: false,
        message: err.message || 'Gagal menjalankan uji koneksi provider AI.',
      },
      { status: 400 }
    );
  }
}
