import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { AIProviderManager } from '@/lib/ai/provider-manager';
import { AIProviderType } from '@/lib/ai/types';

/**
 * POST /api/admin/ai/fallback
 * Mengatur konfigurasi Automatic Fallback
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
    const { enableFallback, fallbackProvider } = body;

    if (typeof enableFallback !== 'boolean') {
      return NextResponse.json(
        { success: false, message: "Parameter 'enableFallback' (boolean) wajib." },
        { status: 400 }
      );
    }

    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    const userAgent = req.headers.get('user-agent') || 'AdminBrowser';

    const manager = AIProviderManager.getInstance();
    const result = await manager.updateFallbackSettings(
      enableFallback,
      (fallbackProvider || 'groq') as AIProviderType,
      adminSession.userId,
      { ip, userAgent }
    );

    return NextResponse.json({
      success: true,
      message: result.message,
      version: result.version,
    });
  } catch (err: any) {
    console.error('Error in POST /api/admin/ai/fallback:', err);
    return NextResponse.json(
      { success: false, message: err.message || 'Gagal mengubah pengaturan fallback.' },
      { status: 400 }
    );
  }
}
