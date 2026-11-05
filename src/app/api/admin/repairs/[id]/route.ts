import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { recordAdminAudit } from '@/lib/audit';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/admin/repairs/[id]
 * Mengambil detail lengkap pesanan perbaikan, termasuk histori penugasan, linimasa status, invoice, dan komplain.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await getAdminSession();
    if (!session || session.role !== 'admin') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: sesi administrator tidak valid' },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    const repairId = parseInt(id, 10);
    if (isNaN(repairId)) {
      return NextResponse.json({ success: false, message: 'ID pesanan tidak valid' }, { status: 400 });
    }

    // 1. Data utama pesanan
    const repairs: any = await query(
      `SELECT 
        rr.*,
        COALESCE(cp.full_name, 'Pelanggan #' + rr.customer_id) AS customer_name,
        u.phone_number AS customer_phone,
        cp.default_address AS customer_saved_address,
        u.email AS customer_email,
        ac.name AS category_name,
        s.name AS service_name,
        s.base_price AS service_base_price
      FROM repair_requests rr
      LEFT JOIN users u ON rr.customer_id = u.id
      LEFT JOIN customer_profiles cp ON rr.customer_id = cp.user_id
      LEFT JOIN appliance_categories ac ON rr.category_id = ac.id
      LEFT JOIN services s ON rr.service_id = s.id
      WHERE rr.id = ? AND rr.deleted_at IS NULL`,
      [repairId]
    );

    if (repairs.length === 0) {
      return NextResponse.json({ success: false, message: 'Pesanan perbaikan tidak ditemukan' }, { status: 404 });
    }

    const repair = repairs[0];
    repair.problem_photos = typeof repair.problem_photos === 'string' 
      ? JSON.parse(repair.problem_photos) 
      : (repair.problem_photos || []);

    // 2. Histori penugasan teknisi
    const assignments: any = await query(
      `SELECT 
        ta.*,
        tp.full_name AS technician_name,
        u_tech.phone_number AS technician_phone,
        tp.rating_avg,
        admin_u.email AS assigned_by_admin_email
      FROM technician_assignments ta
      JOIN users u_tech ON ta.technician_id = u_tech.id
      JOIN technician_profiles tp ON ta.technician_id = tp.user_id
      LEFT JOIN users admin_u ON ta.assigned_by_user_id = admin_u.id
      WHERE ta.repair_request_id = ?
      ORDER BY ta.id DESC`,
      [repairId]
    );

    // 3. Linimasa riwayat status
    const statusHistory: any = await query(
      `SELECT 
        rsh.*,
        u.email AS changed_by_email,
        COALESCE(cp.full_name, tp.full_name, 'Admin') AS changed_by_name
      FROM repair_status_history rsh
      LEFT JOIN users u ON rsh.changed_by_user_id = u.id
      LEFT JOIN customer_profiles cp ON u.id = cp.user_id
      LEFT JOIN technician_profiles tp ON u.id = tp.user_id
      WHERE rsh.repair_request_id = ?
      ORDER BY rsh.created_at ASC`,
      [repairId]
    );

    // 4. Data tagihan & pembayaran jika ada
    const invoices: any = await query(
      `SELECT 
        inv.*,
        (
          SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', p.id,
              'payment_reference', p.payment_reference,
              'payment_method', p.payment_method,
              'amount', p.amount,
              'payment_status', p.payment_status,
              'settled_at', p.settled_at
            )
          )
          FROM payments p
          WHERE p.invoice_id = inv.id
        ) AS payments_list
      FROM invoices inv
      WHERE inv.repair_request_id = ?`,
      [repairId]
    );

    // 5. Data pengaduan jika ada
    const complaints: any = await query(
      `SELECT rc.*, u.email AS handler_admin_email
       FROM repair_complaints rc
       LEFT JOIN users u ON rc.handled_by_admin_id = u.id
       WHERE rc.repair_request_id = ?`,
      [repairId]
    );

    return NextResponse.json({
      success: true,
      data: {
        ...repair,
        assignments,
        statusHistory,
        invoice: invoices[0] || null,
        complaints,
      },
    });
  } catch (error: any) {
    console.error('[Admin Repair Detail Error]:', error);
    return NextResponse.json(
      { success: false, message: 'Gagal memuat detail pesanan: ' + (error?.message || 'Server error') },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/repairs/[id]
 * Memperbarui status pesanan perbaikan atau menugaskan teknisi langsung secara manual.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await getAdminSession();
    if (!session || session.role !== 'admin') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: sesi administrator tidak valid' },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    const repairId = parseInt(id, 10);
    if (isNaN(repairId)) {
      return NextResponse.json({ success: false, message: 'ID pesanan tidak valid' }, { status: 400 });
    }

    const body = await request.json();
    const { action, status, technician_id, notes } = body;

    // Cek pesanan saat ini
    const existing: any = await query('SELECT * FROM repair_requests WHERE id = ?', [repairId]);
    if (existing.length === 0) {
      return NextResponse.json({ success: false, message: 'Pesanan tidak ditemukan' }, { status: 404 });
    }
    const currentOrder = existing[0];
    const prevStatus = currentOrder.current_status;

    if (action === 'assign_technician') {
      // Penugasan teknisi
      const techId = parseInt(technician_id, 10);
      if (isNaN(techId)) {
        return NextResponse.json({ success: false, message: 'ID teknisi wajib dipilih' }, { status: 400 });
      }

      // Verifikasi teknisi aktif & valid
      const techRows: any = await query(
        `SELECT u.id, tp.full_name, u.is_verified, tp.is_available 
         FROM users u
         JOIN technician_profiles tp ON u.id = tp.user_id
         WHERE u.id = ? AND u.role = 'technician'`,
        [techId]
      );
      if (techRows.length === 0) {
        return NextResponse.json({ success: false, message: 'Teknisi tidak valid atau bukan teknisi aktif' }, { status: 400 });
      }

      const techInfo = techRows[0];

      // Insert ke technician_assignments
      await query(
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

      // Update repair_requests status ke 'assigned' jika sebelumnya draft/submitted
      const nextStatus = ['draft', 'submitted'].includes(prevStatus) ? 'assigned' : prevStatus;
      await query(
        'UPDATE repair_requests SET current_status = ? WHERE id = ?',
        [nextStatus, repairId]
      );

      // Catat ke linimasa status
      await query(
        `INSERT INTO repair_status_history (repair_request_id, previous_status, new_status, changed_by_user_id, actor_role, notes)
         VALUES (?, ?, ?, ?, 'admin', ?)`,
        [repairId, prevStatus, nextStatus, session.userId, `Ditugaskan ke teknisi: ${techInfo.full_name}. ${notes || ''}`]
      );

      // Kirim notifikasi in-app ke teknisi
      await query(
        `INSERT INTO notifications (user_id, title, message, type, entity_type, entity_id)
         VALUES (?, 'Penugasan Perbaikan Baru', ?, 'technician_assignment', 'repair_requests', ?)`,
        [
          techId,
          `Anda mendapatkan tugas perbaikan untuk pesanan ${currentOrder.order_code}. Mohon segera konfirmasi.`,
          repairId,
        ]
      );

      // Catat audit log
      await recordAdminAudit({
        adminUserId: session.userId,
        action: 'ASSIGN_TECHNICIAN',
        entityName: 'repair_requests',
        entityId: repairId,
        oldValues: { status: prevStatus },
        newValues: { status: nextStatus, technician_id: techId, technician_name: techInfo.full_name, notes },
        ipAddress: request.headers.get('x-forwarded-for') || null,
        userAgent: request.headers.get('user-agent') || null,
      });

      return NextResponse.json({
        success: true,
        message: `Teknisi ${techInfo.full_name} berhasil ditugaskan ke pesanan ${currentOrder.order_code}`,
      });
    }

    if (action === 'update_status') {
      const allowedStatuses = [
        'draft',
        'submitted',
        'assigned',
        'scheduled',
        'in_diagnosis',
        'estimated',
        'customer_approved',
        'in_repair',
        'completed',
        'cancelled',
        'complained',
      ];

      if (!status || !allowedStatuses.includes(status)) {
        return NextResponse.json({ success: false, message: 'Status tidak valid' }, { status: 400 });
      }

      await query('UPDATE repair_requests SET current_status = ? WHERE id = ?', [status, repairId]);

      // Catat ke riwayat linimasa
      await query(
        `INSERT INTO repair_status_history (repair_request_id, previous_status, new_status, changed_by_user_id, actor_role, notes)
         VALUES (?, ?, ?, ?, 'admin', ?)`,
        [repairId, prevStatus, status, session.userId, notes || 'Perubahan status manual oleh Administrator']
      );

      // Kirim notifikasi ke pelanggan
      await query(
        `INSERT INTO notifications (user_id, title, message, type, entity_type, entity_id)
         VALUES (?, 'Pembaruan Status Pesanan', ?, 'order_status', 'repair_requests', ?)`,
        [
          currentOrder.customer_id,
          `Status pesanan ${currentOrder.order_code} telah diubah menjadi: ${status.replace('_', ' ').toUpperCase()}.`,
          repairId,
        ]
      );

      // Catat audit log
      await recordAdminAudit({
        adminUserId: session.userId,
        action: 'OVERRIDE_REPAIR_STATUS',
        entityName: 'repair_requests',
        entityId: repairId,
        oldValues: { current_status: prevStatus },
        newValues: { current_status: status, notes },
        ipAddress: request.headers.get('x-forwarded-for') || null,
        userAgent: request.headers.get('user-agent') || null,
      });

      return NextResponse.json({
        success: true,
        message: `Status pesanan ${currentOrder.order_code} berhasil diubah ke ${status}`,
      });
    }

    return NextResponse.json({ success: false, message: 'Aksi tidak didukung' }, { status: 400 });
  } catch (error: any) {
    console.error('[Admin Repair Update Error]:', error);
    return NextResponse.json(
      { success: false, message: 'Gagal memperbarui pesanan: ' + (error?.message || 'Server error') },
      { status: 500 }
    );
  }
}
