import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { query } from '@/lib/db';

/**
 * GET /api/admin/whatsapp/history
 * Riwayat pengiriman notifikasi WhatsApp (manual & otomatis) untuk panel admin.
 *
 * Query: page, limit (maks 50), status (pending/sent/failed), event, search
 * (kode pesanan / nama penerima / nomor tujuan).
 * Nomor tujuan dikembalikan tersensor — nomor lengkap tidak pernah dikirim
 * ke browser.
 */
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
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const offset = (page - 1) * limit;
    const status = searchParams.get('status') || 'all';
    const event = searchParams.get('event') || 'all';
    const search = searchParams.get('search')?.trim() || '';

    const whereConditions: string[] = ['1=1'];
    const queryParams: any[] = [];

    if (status !== 'all' && ['pending', 'sent', 'failed'].includes(status)) {
      whereConditions.push('wn.status = ?');
      queryParams.push(status);
    }
    if (event !== 'all') {
      whereConditions.push('wn.event = ?');
      queryParams.push(event);
    }
    if (search) {
      whereConditions.push(
        '(rr.order_code LIKE ? OR u.email LIKE ? OR wn.target_phone LIKE ? OR COALESCE(cp.full_name, tp.full_name) LIKE ?)'
      );
      const wildcard = `%${search}%`;
      queryParams.push(wildcard, wildcard, wildcard, wildcard);
    }

    const whereClause = whereConditions.join(' AND ');

    const countRes: any = await query(
      `SELECT COUNT(*) AS total
       FROM whatsapp_notifications wn
       JOIN users u ON wn.user_id = u.id
       LEFT JOIN customer_profiles cp ON wn.user_id = cp.user_id
       LEFT JOIN technician_profiles tp ON wn.user_id = tp.user_id
       LEFT JOIN repair_requests rr ON wn.entity_type = 'repair_requests' AND wn.entity_id = rr.id
       WHERE ${whereClause}`,
      queryParams
    );
    const total = Number(countRes[0]?.total || 0);

    const rows: any = await query(
      `SELECT
        wn.id, wn.user_id, wn.source, wn.event, wn.template_key, wn.title,
        wn.message, wn.entity_type, wn.entity_id, wn.status,
        wn.fonnte_message_id, wn.error_message, wn.sent_by_admin_id, wn.created_at,
        CASE
          WHEN CHAR_LENGTH(wn.target_phone) > 8
          THEN CONCAT(LEFT(wn.target_phone, 5), '****', RIGHT(wn.target_phone, 3))
          ELSE wn.target_phone
        END AS masked_phone,
        u.email AS recipient_email,
        u.role AS recipient_role,
        COALESCE(cp.full_name, tp.full_name) AS recipient_name,
        rr.order_code AS order_code,
        admin_u.email AS sent_by_admin_email
       FROM whatsapp_notifications wn
       JOIN users u ON wn.user_id = u.id
       LEFT JOIN customer_profiles cp ON wn.user_id = cp.user_id
       LEFT JOIN technician_profiles tp ON wn.user_id = tp.user_id
       LEFT JOIN repair_requests rr ON wn.entity_type = 'repair_requests' AND wn.entity_id = rr.id
       LEFT JOIN users admin_u ON wn.sent_by_admin_id = admin_u.id
       WHERE ${whereClause}
       ORDER BY wn.id DESC
       LIMIT ? OFFSET ?`,
      [...queryParams, limit, offset]
    );

    const statsRes: any = await query(
      `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending
       FROM whatsapp_notifications`
    );
    const stats = statsRes[0] || { total: 0, sent: 0, failed: 0, pending: 0 };

    return NextResponse.json({
      success: true,
      data: rows,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
      stats: {
        total: Number(stats.total || 0),
        sent: Number(stats.sent || 0),
        failed: Number(stats.failed || 0),
        pending: Number(stats.pending || 0),
      },
    });
  } catch (error: any) {
    console.error('[Admin WhatsApp History Error]:', error);
    return NextResponse.json(
      { success: false, message: 'Gagal memuat riwayat WhatsApp: ' + (error?.message || 'Server error') },
      { status: 500 }
    );
  }
}
