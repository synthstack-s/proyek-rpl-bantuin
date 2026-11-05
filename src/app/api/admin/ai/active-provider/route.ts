import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { AIProviderManager } from '@/lib/ai/provider-manager';
import { AIProviderType } from '@/lib/ai/types';

/**
 * POST /api/admin/ai/active-provider
 * Mengganti provider AI aktif secara atomik di database
 */
export async function POST(req: NextRequest) {
  try {
    const adminSession = await getAdminSession();
    if (!adminSession || adminSession.role !== 'admin') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: Hanya administrator yang dapat mengganti provider aktif.' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { activeProvider } = body;

    if (!activeProvider || typeof activeProvider !== 'string' || !activeProvider.trim()) {
      return NextResponse.json(
        { success: false, message: "Parameter 'activeProvider' wajib diisi." },
        { status: 400 }
      );
    }

    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    const userAgent = req.headers.get('user-agent') || 'AdminBrowser';

    const manager = AIProviderManager.getInstance();
    const result = await manager.switchActiveProvider(
      activeProvider as AIProviderType,
      adminSession.userId,
      { ip, userAgent }
    );

    return NextResponse.json({
      success: true,
      message: result.message,
      version: result.version,
    });
  } catch (err: any) {
    console.error('Error in POST /api/admin/ai/active-provider:', err);
    return NextResponse.json(
      { success: false, message: err.message || 'Gagal mengubah provider aktif.' },
      { status: 400 }
    );
  }
}
