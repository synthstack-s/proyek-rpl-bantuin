import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { recordAdminAudit } from '@/lib/audit';

/**
 * DELETE /api/admin/notifications/[id]
 * Menghapus notifikasi spesifik berdasarkan ID.
 */
export async function DELETE(
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
      `SELECT id, user_id, title FROM notifications WHERE id = ? LIMIT 1`,
      [notifId]
    );

    if (rows.length === 0) {
      return NextResponse.json({ success: false, message: 'Notifikasi tidak ditemukan.' }, { status: 404 });
    }

    const notif = rows[0];

    await query(`DELETE FROM notifications WHERE id = ?`, [notifId]);

    const clientIp = request.headers.get('x-forwarded-for') || '127.0.0.1';
    const userAgent = request.headers.get('user-agent') || 'Admin Browser';

    await recordAdminAudit({
      adminUserId: session.userId,
      action: 'DELETE_NOTIFICATION',
      entityName: 'notifications',
      entityId: notifId,
      oldValues: { id: notif.id, user_id: notif.user_id, title: notif.title },
      newValues: null,
      ipAddress: clientIp,
      userAgent,
    });

    return NextResponse.json({
      success: true,
      message: 'Notifikasi berhasil dihapus.',
    });
  } catch (error: any) {
    console.error('[Delete Notification Error]:', error);
    return NextResponse.json(
      { success: false, message: 'Gagal menghapus notifikasi: ' + error.message },
      { status: 500 }
    );
  }
}
