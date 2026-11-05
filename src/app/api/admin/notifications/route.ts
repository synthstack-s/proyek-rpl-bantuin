import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { recordAdminAudit } from '@/lib/audit';

interface NotificationListItem {
  id: number;
  user_id: number;
  title: string;
  message: string;
  type: string;
  target_url: string | null;
  entity_type: string | null;
  entity_id: number | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
  recipient_email: string;
  recipient_role: string;
  recipient_name: string;
}

/**
 * GET /api/admin/notifications
 * Mengambil daftar notifikasi dengan pagination, filter tipe, status baca, peran penerima, dan pencarian.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session || session.role !== 'admin') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: sesi administrator tidak valid.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '15', 10)));
    const offset = (page - 1) * limit;

    const type = searchParams.get('type')?.trim() || 'all';
    const status = searchParams.get('status')?.trim() || 'all'; // 'all' | 'unread' | 'read'
    const role = searchParams.get('role')?.trim() || 'all'; // 'all' | 'customer' | 'technician' | 'admin'
    const search = searchParams.get('search')?.trim() || '';

    const whereConditions: string[] = [];
    const queryParams: any[] = [];

    if (type !== 'all') {
      whereConditions.push('n.type = ?');
      queryParams.push(type);
    }

    if (status === 'unread') {
      whereConditions.push('n.is_read = FALSE');
    } else if (status === 'read') {
      whereConditions.push('n.is_read = TRUE');
    }

    if (role !== 'all') {
      whereConditions.push('u.role = ?');
      queryParams.push(role);
    }

    if (search) {
      whereConditions.push(
        '(n.title LIKE ? OR n.message LIKE ? OR u.email LIKE ? OR cp.full_name LIKE ? OR tp.full_name LIKE ?)'
      );
      const wildcard = `%${search}%`;
      queryParams.push(wildcard, wildcard, wildcard, wildcard, wildcard);
    }

    const whereSql = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Hitung total filtered
    const countRows = await query<[{ total: number }]>(
      `SELECT COUNT(*) AS total
       FROM notifications n
       JOIN users u ON n.user_id = u.id
       LEFT JOIN customer_profiles cp ON u.id = cp.user_id
       LEFT JOIN technician_profiles tp ON u.id = tp.user_id
       ${whereSql}`,
      queryParams
    );
    const total = Number(countRows[0]?.total || 0);

    // Ambil data notifikasi
    const notifications = await query<NotificationListItem[]>(
      `SELECT 
        n.id,
        n.user_id,
        n.title,
        n.message,
        n.type,
        n.target_url,
        n.entity_type,
        n.entity_id,
        n.is_read,
        n.read_at,
        n.created_at,
        u.email AS recipient_email,
        u.role AS recipient_role,
        COALESCE(cp.full_name, tp.full_name, u.email) AS recipient_name
       FROM notifications n
       JOIN users u ON n.user_id = u.id
       LEFT JOIN customer_profiles cp ON u.id = cp.user_id
       LEFT JOIN technician_profiles tp ON u.id = tp.user_id
       ${whereSql}
       ORDER BY n.created_at DESC
       LIMIT ? OFFSET ?`,
      [...queryParams, limit, offset]
    );

    // Hitung ringkasan statistik
    const statsRows = await query<any[]>(
      `SELECT 
        COUNT(*) AS total_all,
        SUM(CASE WHEN is_read = FALSE THEN 1 ELSE 0 END) AS total_unread,
        SUM(CASE WHEN type = 'system' THEN 1 ELSE 0 END) AS total_system,
        SUM(CASE WHEN type = 'order_status' THEN 1 ELSE 0 END) AS total_order,
        SUM(CASE WHEN type = 'payment' THEN 1 ELSE 0 END) AS total_payment,
        SUM(CASE WHEN type = 'complaint' THEN 1 ELSE 0 END) AS total_complaint
       FROM notifications`
    );

    const stats = {
      totalAll: Number(statsRows[0]?.total_all || 0),
      totalUnread: Number(statsRows[0]?.total_unread || 0),
      totalSystem: Number(statsRows[0]?.total_system || 0),
      totalOrder: Number(statsRows[0]?.total_order || 0),
      totalPayment: Number(statsRows[0]?.total_payment || 0),
      totalComplaint: Number(statsRows[0]?.total_complaint || 0),
    };

    return NextResponse.json({
      success: true,
      data: {
        notifications,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit) || 1,
        },
        stats,
      },
    });
  } catch (error: any) {
    console.error('[Get Notifications Error]:', error);
    return NextResponse.json(
      { success: false, message: 'Gagal mengambil data notifikasi: ' + error.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/notifications
 * Menghapus massal notifikasi (berdasarkan daftar ID atau yang telah dibaca).
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session || session.role !== 'admin') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: sesi administrator tidak valid.' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ success: false, message: 'Payload tidak valid.' }, { status: 400 });
    }

    const { ids, deleteReadOlderThanDays } = body;

    let deletedCount = 0;

    if (Array.isArray(ids) && ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      const res: any = await query(`DELETE FROM notifications WHERE id IN (${placeholders})`, ids);
      deletedCount = res.affectedRows || 0;
    } else if (typeof deleteReadOlderThanDays === 'number' && deleteReadOlderThanDays >= 0) {
      const res: any = await query(
        `DELETE FROM notifications WHERE is_read = TRUE AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
        [deleteReadOlderThanDays]
      );
      deletedCount = res.affectedRows || 0;
    } else {
      return NextResponse.json(
        { success: false, message: 'Parameter penghapusan tidak valid. Berikan daftar ids atau deleteReadOlderThanDays.' },
        { status: 400 }
      );
    }

    const clientIp = request.headers.get('x-forwarded-for') || '127.0.0.1';
    const userAgent = request.headers.get('user-agent') || 'Admin Browser';

    await recordAdminAudit({
      adminUserId: session.userId,
      action: 'BULK_DELETE_NOTIFICATIONS',
      entityName: 'notifications',
      entityId: 0,
      oldValues: { deletedCount },
      newValues: null,
      ipAddress: clientIp,
      userAgent,
    });

    return NextResponse.json({
      success: true,
      message: `Berhasil menghapus ${deletedCount} notifikasi.`,
      deletedCount,
    });
  } catch (error: any) {
    console.error('[Bulk Delete Notifications Error]:', error);
    return NextResponse.json(
      { success: false, message: 'Gagal menghapus notifikasi: ' + error.message },
      { status: 500 }
    );
  }
}
