import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { query } from '@/lib/db';

/**
 * PATCH /api/admin/notifications/read-all
 * Menandai semua notifikasi yang belum dibaca menjadi sudah dibaca.
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session || session.role !== 'admin') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: sesi administrator tidak valid.' },
        { status: 401 }
      );
    }

    const result: any = await query(
      `UPDATE notifications 
       SET is_read = TRUE, read_at = NOW() 
       WHERE is_read = FALSE`
    );

    const affected = result?.affectedRows || 0;

    return NextResponse.json({
      success: true,
      message: `Berhasil menandai ${affected} notifikasi sebagai sudah dibaca.`,
      updatedCount: affected,
    });
  } catch (error: any) {
    console.error('[Mark All Read Error]:', error);
    return NextResponse.json(
      { success: false, message: 'Gagal memperbarui notifikasi: ' + error.message },
      { status: 500 }
    );
  }
}
