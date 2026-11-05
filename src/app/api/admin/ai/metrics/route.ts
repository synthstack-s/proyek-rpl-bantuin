import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { getAIMonitoringMetrics } from '@/lib/ai/repository';

/**
 * GET /api/admin/ai/metrics
 * Mengambil ringkasan metrik pemantauan performa AI dan riwayat connection test
 */
export async function GET() {
  try {
    const adminSession = await getAdminSession();
    if (!adminSession || adminSession.role !== 'admin') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak.' },
        { status: 403 }
      );
    }

    const metrics = await getAIMonitoringMetrics();

    return NextResponse.json({
      success: true,
      data: metrics,
    });
  } catch (err: any) {
    console.error('Error in GET /api/admin/ai/metrics:', err);
    return NextResponse.json(
      { success: false, message: 'Gagal memuat metrik AI: ' + err.message },
      { status: 500 }
    );
  }
}
