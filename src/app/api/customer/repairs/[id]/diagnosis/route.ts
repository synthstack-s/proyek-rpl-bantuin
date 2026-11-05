import { NextRequest, NextResponse } from 'next/server';
import { getUserSession } from '@/lib/auth';
import { query } from '@/lib/db';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await getUserSession();
    if (!session || session.role !== 'customer') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: sesi pelanggan tidak valid' },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    const repairId = parseInt(id, 10);
    if (isNaN(repairId)) {
      return NextResponse.json({ success: false, message: 'ID pesanan tidak valid' }, { status: 400 });
    }

    const body = await request.json();
    const { action, rejection_reason } = body;

    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { success: false, message: 'Aksi persetujuan tidak valid (pilih approve atau reject)' },
        { status: 400 }
      );
    }

    // 1. Verifikasi pesanan dan kepemilikan
    const orders = await query<any[]>(
      `SELECT id, order_code, customer_id, current_status
       FROM repair_requests
       WHERE id = ? AND customer_id = ? AND deleted_at IS NULL
       LIMIT 1`,
      [repairId, session.userId]
    );

    if (orders.length === 0) {
      return NextResponse.json({ success: false, message: 'Pesanan tidak ditemukan' }, { status: 404 });
    }

    const order = orders[0];

    // 2. Ambil diagnosis terakhir
    const diagnoses = await query<any[]>(
      `SELECT id, customer_approval, total_estimate
       FROM repair_diagnoses
       WHERE repair_request_id = ?
       ORDER BY id DESC LIMIT 1`,
      [repairId]
    );

    if (diagnoses.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Belum ada estimasi diagnosa biaya dari teknisi' },
        { status: 400 }
      );
    }

    const diagnosis = diagnoses[0];

    if (action === 'approve') {
      // Update diagnosis
      await query(
        `UPDATE repair_diagnoses
         SET customer_approval = 'approved', approved_at = NOW()
         WHERE id = ?`,
        [diagnosis.id]
      );

      // Update repair_requests status menjadi 'customer_approved'
      await query(
        `UPDATE repair_requests SET current_status = 'customer_approved' WHERE id = ?`,
        [repairId]
      );

      // Catat linimasa status
      await query(
        `INSERT INTO repair_status_history (repair_request_id, previous_status, new_status, changed_by_user_id, actor_role, notes)
         VALUES (?, ?, 'customer_approved', ?, 'customer', 'Pelanggan menyetujui rincian estimasi biaya perbaikan')`,
        [repairId, order.current_status, session.userId]
      );

      // Notifikasi teknisi
      const techAssign = await query<any[]>(
        `SELECT technician_id FROM technician_assignments WHERE repair_request_id = ? AND status = 'accepted' LIMIT 1`,
        [repairId]
      );
      if (techAssign.length > 0) {
        await query(
          `INSERT INTO notifications (user_id, title, message, entity_type, entity_id)
           VALUES (?, 'Estimasi Biaya Disetujui Pelanggan', ?, 'repair_request', ?)`,
          [
            techAssign[0].technician_id,
            `Pelanggan telah menyetujui estimasi biaya perbaikan #${order.order_code}. Anda dapat mulai melakukan pengerjaan.`,
            repairId,
          ]
        );
      }

      return NextResponse.json({
        success: true,
        message: 'Estimasi biaya berhasil disetujui. Teknisi akan melanjutkan pengerjaan.',
      });
    } else {
      // Reject
      const reason = (rejection_reason || '').trim();
      if (!reason) {
        return NextResponse.json(
          { success: false, message: 'Alasan penolakan estimasi biaya wajib diisi' },
          { status: 400 }
        );
      }

      await query(
        `UPDATE repair_diagnoses
         SET customer_approval = 'rejected', rejection_reason = ?
         WHERE id = ?`,
        [reason, diagnosis.id]
      );

      // Catat linimasa status
      await query(
        `INSERT INTO repair_status_history (repair_request_id, previous_status, new_status, changed_by_user_id, actor_role, notes)
         VALUES (?, ?, ?, ?, 'customer', ?)`,
        [repairId, order.current_status, order.current_status, session.userId, `Pelanggan menolak estimasi biaya: ${reason}`]
      );

      return NextResponse.json({
        success: true,
        message: 'Penolakan estimasi biaya berhasil dicatat.',
      });
    }
  } catch (error: any) {
    console.error('Error in customer diagnosis approval API:', error);
    return NextResponse.json(
      { success: false, message: 'Gagal memperbarui status estimasi: ' + error.message },
      { status: 500 }
    );
  }
}
