import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { recordAdminAudit } from '@/lib/audit';

/**
 * GET /api/admin/assignments
 * Mengambil daftar penugasan teknisi dengan filter status, teknisi, pencarian, dan pagination.
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
    const search = searchParams.get('search')?.trim() || '';
    const status = searchParams.get('status') || 'all';
    const technicianId = searchParams.get('technician_id');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '10', 10)));
    const offset = (page - 1) * limit;

    const whereConditions: string[] = ['1=1'];
    const queryParams: any[] = [];

    if (search) {
      whereConditions.push(
        '(rr.order_code LIKE ? OR tp.full_name LIKE ? OR u_tech.phone_number LIKE ? OR cp.full_name LIKE ?)'
      );
      const wildcard = `%${search}%`;
      queryParams.push(wildcard, wildcard, wildcard, wildcard);
    }

    if (status && status !== 'all') {
      whereConditions.push('ta.status = ?');
      queryParams.push(status);
    }

    if (technicianId && technicianId !== 'all') {
      whereConditions.push('ta.technician_id = ?');
      queryParams.push(Number(technicianId));
    }

    const whereClause = whereConditions.join(' AND ');

    // Count
    const countSql = `
      SELECT COUNT(*) AS total
      FROM technician_assignments ta
      JOIN repair_requests rr ON ta.repair_request_id = rr.id
      JOIN users u_tech ON ta.technician_id = u_tech.id
      JOIN technician_profiles tp ON ta.technician_id = tp.user_id
      LEFT JOIN customer_profiles cp ON rr.customer_id = cp.user_id
      WHERE ${whereClause}
    `;
    const countRes: any = await query(countSql, queryParams);
    const total = Number(countRes[0]?.total || 0);

    // Data
    const dataSql = `
      SELECT 
        ta.id,
        ta.repair_request_id,
        ta.technician_id,
        ta.assigned_by_user_id,
        ta.assignment_type,
        ta.status,
        ta.rejection_reason,
        ta.created_at,
        ta.responded_at,
        rr.order_code,
        rr.device_brand,
        rr.device_model,
        rr.current_status AS repair_status,
        rr.address_text,
        tp.full_name AS technician_name,
        u_tech.phone_number AS technician_phone,
        tp.rating_avg AS technician_rating,
        COALESCE(cp.full_name, 'Pelanggan #' + rr.customer_id) AS customer_name,
        u_cust.phone_number AS customer_phone,
        admin_u.email AS assigned_by_admin_email
      FROM technician_assignments ta
      JOIN repair_requests rr ON ta.repair_request_id = rr.id
      JOIN users u_tech ON ta.technician_id = u_tech.id
      JOIN technician_profiles tp ON ta.technician_id = tp.user_id
      LEFT JOIN users u_cust ON rr.customer_id = u_cust.id
      LEFT JOIN customer_profiles cp ON rr.customer_id = cp.user_id
      LEFT JOIN users admin_u ON ta.assigned_by_user_id = admin_u.id
      WHERE ${whereClause}
      ORDER BY ta.id DESC
      LIMIT ? OFFSET ?
    `;

    const dataParams = [...queryParams, limit, offset];
    const assignments: any = await query(dataSql, dataParams);

    // KPI Metrics
    const statsSql = `
      SELECT 
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'offered' THEN 1 ELSE 0 END) AS offered,
        SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) AS accepted,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN status IN ('rejected', 'reassigned', 'cancelled') THEN 1 ELSE 0 END) AS rejected_or_cancelled
      FROM technician_assignments
    `;
    const statsRes: any = await query(statsSql);
    const stats = statsRes[0] || { total: 0, offered: 0, accepted: 0, completed: 0, rejected_or_cancelled: 0 };

    return NextResponse.json({
      success: true,
      data: assignments,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
      stats: {
        total: Number(stats.total || 0),
        offered: Number(stats.offered || 0),
        accepted: Number(stats.accepted || 0),
        completed: Number(stats.completed || 0),
        rejected_or_cancelled: Number(stats.rejected_or_cancelled || 0),
      },
    });
  } catch (error: any) {
    console.error('[Admin Assignments GET Error]:', error);
    return NextResponse.json(
      { success: false, message: 'Gagal memuat penugasan: ' + (error?.message || 'Server error') },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/assignments
 * Membuat penugasan manual teknisi baru untuk pesanan perbaikan tertentu.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session || session.role !== 'admin') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: sesi administrator tidak valid' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { repair_request_id, technician_id, notes } = body;

    const repairId = parseInt(repair_request_id, 10);
    const techId = parseInt(technician_id, 10);

    if (isNaN(repairId) || isNaN(techId)) {
      return NextResponse.json(
        { success: false, message: 'ID pesanan perbaikan dan ID teknisi wajib diisi secara valid' },
        { status: 400 }
      );
    }

    // 1. Verifikasi Pesanan
    const orders: any = await query('SELECT * FROM repair_requests WHERE id = ? AND deleted_at IS NULL', [repairId]);
    if (orders.length === 0) {
      return NextResponse.json({ success: false, message: 'Pesanan perbaikan tidak ditemukan' }, { status: 404 });
    }
    const order = orders[0];
    if (['completed', 'cancelled'].includes(order.current_status)) {
      return NextResponse.json(
        { success: false, message: `Pesanan berstatus '${order.current_status}' tidak dapat ditugaskan teknisi baru` },
        { status: 400 }
      );
    }

    // 2. Verifikasi Teknisi
    const techs: any = await query(
      `SELECT u.id, tp.full_name, u.phone_number 
       FROM users u
       JOIN technician_profiles tp ON u.id = tp.user_id
       WHERE u.id = ? AND u.role = 'technician'`,
      [techId]
    );
    if (techs.length === 0) {
      return NextResponse.json({ success: false, message: 'Teknisi tidak ditemukan atau tidak aktif' }, { status: 404 });
    }
    const tech = techs[0];

    // 3. Batalkan penugasan sebelumnya yang masih 'offered' jika ada
    await query(
      `UPDATE technician_assignments 
       SET status = 'reassigned' 
       WHERE repair_request_id = ? AND status = 'offered'`,
      [repairId]
    );

    // 4. Tambahkan rekaman penugasan baru
    const insertRes: any = await query(
      `INSERT INTO technician_assignments (
        repair_request_id,
        technician_id,
        assigned_by_user_id,
        assignment_type,
        status,
        rejection_reason
      ) VALUES (?, ?, ?, 'manual_admin', 'offered', ?)`,
      [repairId, techId, session.userId, notes || null]
    );

    const newAssignmentId = insertRes.insertId;

    // 5. Update status pesanan jika masih baru
    const prevStatus = order.current_status;
    const nextStatus = ['draft', 'submitted'].includes(prevStatus) ? 'assigned' : prevStatus;
    if (nextStatus !== prevStatus) {
      await query('UPDATE repair_requests SET current_status = ? WHERE id = ?', [nextStatus, repairId]);
    }

    // 6. Catat riwayat status
    await query(
      `INSERT INTO repair_status_history (repair_request_id, previous_status, new_status, changed_by_user_id, actor_role, notes)
       VALUES (?, ?, ?, ?, 'admin', ?)`,
      [repairId, prevStatus, nextStatus, session.userId, `Ditugaskan manual ke ${tech.full_name}. ${notes || ''}`]
    );

    // 7. Kirim notifikasi in-app ke teknisi
    await query(
      `INSERT INTO notifications (user_id, title, message, type, entity_type, entity_id)
       VALUES (?, 'Tugas Perbaikan Baru', ?, 'technician_assignment', 'repair_requests', ?)`,
      [
        techId,
        `Admin menugaskan Anda ke pesanan ${order.order_code}. Mohon segera periksa rincian tugas.`,
        repairId,
      ]
    );

    // 8. Catat audit log
    await recordAdminAudit({
      adminUserId: session.userId,
      action: 'CREATE_TECH_ASSIGNMENT',
      entityName: 'technician_assignments',
      entityId: newAssignmentId,
      newValues: { repair_request_id: repairId, technician_id: techId, technician_name: tech.full_name, notes },
      ipAddress: request.headers.get('x-forwarded-for') || null,
      userAgent: request.headers.get('user-agent') || null,
    });

    return NextResponse.json({
      success: true,
      message: `Berhasil menugaskan teknisi ${tech.full_name} ke pesanan ${order.order_code}`,
      data: { id: newAssignmentId },
    });
  } catch (error: any) {
    console.error('[Admin Assignments POST Error]:', error);
    return NextResponse.json(
      { success: false, message: 'Gagal membuat penugasan teknisi: ' + (error?.message || 'Server error') },
      { status: 500 }
    );
  }
}
