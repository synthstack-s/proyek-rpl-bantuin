import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { query } from '@/lib/db';

/**
 * PATCH /api/admin/notifications/[id]/read
 * Mengubah status baca notifikasi (is_read = true/false).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAdminSession();
    if (!session || session.role !== 'admin') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: sesi administrator tidak valid.' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const notifId = parseInt(id, 10);

    if (isNaN(notifId) || notifId <= 0) {
      return NextResponse.json({ success: false, message: 'ID notifikasi tidak valid.' }, { status: 400 });
    }

    const rows = await query<any[]>(
      `SELECT id, is_read FROM notifications WHERE id = ? LIMIT 1`,
      [notifId]
    );

    if (rows.length === 0) {
      return NextResponse.json({ success: false, message: 'Notifikasi tidak ditemukan.' }, { status: 404 });
    }

    const currentRead = Boolean(rows[0].is_read);
    const body = await request.json().catch(() => ({}));
    const newRead = typeof body.is_read === 'boolean' ? body.is_read : !currentRead;

    await query(
      `UPDATE notifications 
       SET is_read = ?, read_at = ? 
       WHERE id = ?`,
      [newRead, newRead ? new Date() : null, notifId]
    );

    return NextResponse.json({
      success: true,
      message: `Status notifikasi berhasil diubah menjadi ${newRead ? 'dibaca' : 'belum dibaca'}.`,
      data: {
        id: notifId,
        is_read: newRead,
      },
    });
  } catch (error: any) {
    console.error('[Patch Notification Read Error]:', error);
    return NextResponse.json(
      { success: false, message: 'Gagal memperbarui status notifikasi: ' + error.message },
      { status: 500 }
    );
  }
}
