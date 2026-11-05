import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { recordAdminAudit } from '@/lib/audit';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/admin/complaints/[id]
 * Mengambil detail lengkap pengaduan pelanggan beserta data pesanan dan teknisi.
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
    const complaintId = parseInt(id, 10);
    if (isNaN(complaintId)) {
      return NextResponse.json({ success: false, message: 'ID pengaduan tidak valid' }, { status: 400 });
    }

    const rows: any = await query(
      `SELECT 
        rc.*,
        rr.order_code,
        rr.device_brand,
        rr.device_model,
        rr.current_status AS repair_status,
        rr.problem_description AS order_problem,
        rr.address_text,
        COALESCE(cp.full_name, 'Pelanggan #' + rc.complainant_user_id) AS customer_name,
        u.phone_number AS customer_phone,
        u.email AS customer_email,
        admin_u.email AS handler_admin_email,
        (
          SELECT tp.full_name
          FROM technician_assignments ta
          JOIN technician_profiles tp ON ta.technician_id = tp.user_id
          WHERE ta.repair_request_id = rc.repair_request_id
          ORDER BY ta.id DESC LIMIT 1
        ) AS technician_name,
        (
          SELECT u_tech.phone_number
          FROM technician_assignments ta
          JOIN users u_tech ON ta.technician_id = u_tech.id
          WHERE ta.repair_request_id = rc.repair_request_id
          ORDER BY ta.id DESC LIMIT 1
        ) AS technician_phone
      FROM repair_complaints rc
      JOIN repair_requests rr ON rc.repair_request_id = rr.id
      LEFT JOIN users u ON rc.complainant_user_id = u.id
      LEFT JOIN customer_profiles cp ON rc.complainant_user_id = cp.user_id
      LEFT JOIN users admin_u ON rc.handled_by_admin_id = admin_u.id
      WHERE rc.id = ?`,
      [complaintId]
    );

    if (rows.length === 0) {
      return NextResponse.json({ success: false, message: 'Pengaduan tidak ditemukan' }, { status: 404 });
    }

    const complaint = rows[0];
    complaint.evidence_photos = typeof complaint.evidence_photos === 'string'
      ? JSON.parse(complaint.evidence_photos)
      : (complaint.evidence_photos || []);

    return NextResponse.json({
      success: true,
      data: complaint,
    });
  } catch (error: any) {
    console.error('[Admin Complaint Detail Error]:', error);
    return NextResponse.json(
      { success: false, message: 'Gagal memuat detail pengaduan: ' + (error?.message || 'Server error') },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/complaints/[id]
 * Memperbarui status penanganan pengaduan dan menyertakan ringkasan resolusi/solusi sengketa.
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
    const complaintId = parseInt(id, 10);
    if (isNaN(complaintId)) {
      return NextResponse.json({ success: false, message: 'ID pengaduan tidak valid' }, { status: 400 });
    }

    const body = await request.json();
    const { status, resolution_summary } = body;

    const allowed = ['submitted', 'in_investigation', 'waiting_customer', 'resolved', 'rejected'];
    if (!status || !allowed.includes(status)) {
      return NextResponse.json({ success: false, message: 'Status pengaduan tidak valid' }, { status: 400 });
    }

    const existing: any = await query('SELECT * FROM repair_complaints WHERE id = ?', [complaintId]);
    if (existing.length === 0) {
      return NextResponse.json({ success: false, message: 'Pengaduan tidak ditemukan' }, { status: 404 });
    }
    const current = existing[0];

    const isDone = ['resolved', 'rejected'].includes(status);

    await query(
      `UPDATE repair_complaints 
       SET status = ?, 
           resolution_summary = ?, 
           handled_by_admin_id = ?, 
           resolved_at = ${isDone ? 'NOW()' : 'resolved_at'}
       WHERE id = ?`,
      [status, resolution_summary || current.resolution_summary || null, session.userId, complaintId]
    );

    // Kirim notifikasi ke pelanggan pelapor
    let notifTitle = 'Pembaruan Penanganan Pengaduan';
    if (status === 'resolved') notifTitle = 'Pengaduan Anda Telah Selesai Ditangani';
    if (status === 'in_investigation') notifTitle = 'Pengaduan Anda Sedang Diinvestigasi Tim BANTUIN';

    await query(
      `INSERT INTO notifications (user_id, title, message, type, entity_type, entity_id)
       VALUES (?, ?, ?, 'complaint', 'repair_complaints', ?)`,
      [
        current.complainant_user_id,
        notifTitle,
        resolution_summary || `Pengaduan ${current.complaint_code} saat ini berstatus: ${status.toUpperCase()}.`,
        current.repair_request_id,
      ]
    );

    // Catat audit log
    await recordAdminAudit({
      adminUserId: session.userId,
      action: 'UPDATE_COMPLAINT_STATUS',
      entityName: 'repair_complaints',
      entityId: complaintId,
      oldValues: { status: current.status, resolution_summary: current.resolution_summary },
      newValues: { status, resolution_summary },
      ipAddress: request.headers.get('x-forwarded-for') || null,
      userAgent: request.headers.get('user-agent') || null,
    });

    return NextResponse.json({
      success: true,
      message: `Status pengaduan ${current.complaint_code} berhasil diperbarui ke '${status}'`,
    });
  } catch (error: any) {
    console.error('[Admin Complaint Update Error]:', error);
    return NextResponse.json(
      { success: false, message: 'Gagal memperbarui pengaduan: ' + (error?.message || 'Server error') },
      { status: 500 }
    );
  }
}
