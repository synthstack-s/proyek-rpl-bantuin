import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { recordAdminAudit } from '@/lib/audit';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/admin/assignments/[id]
 * Mengambil detail penugasan teknisi tertentu.
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
    const assignmentId = parseInt(id, 10);
    if (isNaN(assignmentId)) {
      return NextResponse.json({ success: false, message: 'ID penugasan tidak valid' }, { status: 400 });
    }

    const rows: any = await query(
      `SELECT 
        ta.*,
        rr.order_code,
        rr.device_brand,
        rr.device_model,
        rr.current_status AS repair_status,
        rr.problem_description,
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
      WHERE ta.id = ?`,
      [assignmentId]
    );

    if (rows.length === 0) {
      return NextResponse.json({ success: false, message: 'Penugasan tidak ditemukan' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: rows[0],
    });
  } catch (error: any) {
    console.error('[Admin Assignment Detail Error]:', error);
    return NextResponse.json(
      { success: false, message: 'Gagal memuat detail penugasan: ' + (error?.message || 'Server error') },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/assignments/[id]
 * Memperbarui status penugasan atau membatalkan / mengalihkan ke teknisi lain.
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
    const assignmentId = parseInt(id, 10);
    if (isNaN(assignmentId)) {
      return NextResponse.json({ success: false, message: 'ID penugasan tidak valid' }, { status: 400 });
    }

    const body = await request.json();
    const { action, status, reason, new_technician_id } = body;

    const existing: any = await query('SELECT * FROM technician_assignments WHERE id = ?', [assignmentId]);
    if (existing.length === 0) {
      return NextResponse.json({ success: false, message: 'Data penugasan tidak ditemukan' }, { status: 404 });
    }
    const current = existing[0];

    if (action === 'cancel') {
      // Batalkan penugasan
      await query(
        'UPDATE technician_assignments SET status = "cancelled", rejection_reason = ? WHERE id = ?',
        [reason || 'Dibatalkan oleh Administrator', assignmentId]
      );

      // Audit log
      await recordAdminAudit({
        adminUserId: session.userId,
        action: 'CANCEL_ASSIGNMENT',
        entityName: 'technician_assignments',
        entityId: assignmentId,
        oldValues: { status: current.status },
        newValues: { status: 'cancelled', reason },
        ipAddress: request.headers.get('x-forwarded-for') || null,
        userAgent: request.headers.get('user-agent') || null,
      });

      return NextResponse.json({
        success: true,
        message: 'Penugasan teknisi berhasil dibatalkan',
      });
    }

    if (action === 'reassign') {
      const newTechId = parseInt(new_technician_id, 10);
      if (isNaN(newTechId)) {
        return NextResponse.json({ success: false, message: 'Teknisi baru wajib dipilih' }, { status: 400 });
      }

      // Verifikasi teknisi baru
      const newTechRows: any = await query(
        `SELECT u.id, tp.full_name 
         FROM users u
         JOIN technician_profiles tp ON u.id = tp.user_id
         WHERE u.id = ? AND u.role = 'technician'`,
        [newTechId]
      );
      if (newTechRows.length === 0) {
        return NextResponse.json({ success: false, message: 'Teknisi pengganti tidak valid' }, { status: 400 });
      }
      const newTech = newTechRows[0];

      // Update penugasan lama jadi 'reassigned'
      await query(
        'UPDATE technician_assignments SET status = "reassigned", rejection_reason = ? WHERE id = ?',
        [reason || 'Dialihkan ke teknisi lain oleh Administrator', assignmentId]
      );

      // Buat penugasan baru
      const insertRes: any = await query(
        `INSERT INTO technician_assignments (
          repair_request_id,
          technician_id,
          assigned_by_user_id,
          assignment_type,
          status,
          rejection_reason
        ) VALUES (?, ?, ?, 'manual_admin', 'offered', ?)`,
        [current.repair_request_id, newTechId, session.userId, `Pengalihan dari tugas #${assignmentId}: ${reason || ''}`]
      );

      // Notifikasi teknisi baru
      await query(
        `INSERT INTO notifications (user_id, title, message, type, entity_type, entity_id)
         VALUES (?, 'Pengalihan Tugas Perbaikan', ?, 'technician_assignment', 'repair_requests', ?)`,
        [
          newTechId,
          `Anda mendapatkan tugas pengalihan perbaikan. Silakan tinjau dan konfirmasi.`,
          current.repair_request_id,
        ]
      );

      // Audit log
      await recordAdminAudit({
        adminUserId: session.userId,
        action: 'REASSIGN_TECHNICIAN',
        entityName: 'technician_assignments',
        entityId: assignmentId,
        oldValues: { technician_id: current.technician_id, status: current.status },
        newValues: { new_technician_id: newTechId, new_assignment_id: insertRes.insertId, reason },
        ipAddress: request.headers.get('x-forwarded-for') || null,
        userAgent: request.headers.get('user-agent') || null,
      });

      return NextResponse.json({
        success: true,
        message: `Tugas berhasil dialihkan ke ${newTech.full_name}`,
      });
    }

    if (action === 'update_status') {
      const allowed = ['offered', 'accepted', 'rejected', 'reassigned', 'completed', 'cancelled'];
      if (!status || !allowed.includes(status)) {
        return NextResponse.json({ success: false, message: 'Status tidak valid' }, { status: 400 });
      }

      await query(
        'UPDATE technician_assignments SET status = ?, rejection_reason = ? WHERE id = ?',
        [status, reason || null, assignmentId]
      );

      await recordAdminAudit({
        adminUserId: session.userId,
        action: 'UPDATE_ASSIGNMENT_STATUS',
        entityName: 'technician_assignments',
        entityId: assignmentId,
        oldValues: { status: current.status },
        newValues: { status, reason },
        ipAddress: request.headers.get('x-forwarded-for') || null,
        userAgent: request.headers.get('user-agent') || null,
      });

      return NextResponse.json({
        success: true,
        message: `Status penugasan diubah menjadi '${status}'`,
      });
    }

    return NextResponse.json({ success: false, message: 'Aksi tidak didukung' }, { status: 400 });
  } catch (error: any) {
    console.error('[Admin Assignment Update Error]:', error);
    return NextResponse.json(
      { success: false, message: 'Gagal memperbarui status penugasan: ' + (error?.message || 'Server error') },
      { status: 500 }
    );
  }
}
