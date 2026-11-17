import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import {
  getAdminDashboardData,
  type DashboardTimeRange,
} from '@/lib/admin-dashboard';

export const dynamic = 'force-dynamic';

const VALID_TIME_RANGES: DashboardTimeRange[] = ['7d', '30d', 'month', 'year'];

export async function GET(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session || session.role !== 'admin') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: sesi administrator tidak valid' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const requested = searchParams.get('timeRange') || '30d';
    const timeRange: DashboardTimeRange = (VALID_TIME_RANGES as string[]).includes(requested)
      ? (requested as DashboardTimeRange)
      : '30d';

    // Semua angka dibaca dari SATU sumber yang sama dengan halaman SSR
    // (src/lib/admin-dashboard.ts). Bila database error, kembalikan 500
    // yang jujur — jangan pernah membalas dengan angka demo.
    const data = await getAdminDashboardData(timeRange);

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Error fetching admin dashboard real data:', error);
    return NextResponse.json(
      { success: false, message: 'Gagal memuat data dashboard operasional' },
      { status: 500 }
    );
  }
}
