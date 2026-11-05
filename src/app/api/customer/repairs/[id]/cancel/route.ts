import { NextRequest, NextResponse } from 'next/server';
import { getUserSession } from '@/lib/auth';
import { pool, query } from '@/lib/db';
import { cancelRepairSchema } from '@/lib/validations/repair';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getUserSession();
    if (!session || session.role !== 'customer') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: sesi pelanggan tidak valid' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const repairId = Number(id);

    if (!repairId || isNaN(repairId)) {
      return NextResponse.json(
        { success: false, message: 'ID pesanan tidak valid' },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const validation = cancelRepairSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          message: validation.error.issues[0]?.message || 'Alasan pembatalan wajib diisi',
        },
        { status: 422 }
      );
    }

    const { cancellation_reason } = validation.data;

    // 1. Ambil data pesanan
    const repairs = await query<any[]>(
      `SELECT id, order_code, current_status FROM repair_requests
       WHERE id = ? AND customer_id = ? AND deleted_at IS NULL LIMIT 1`,
      [repairId, session.userId]
    );

    if (!repairs || repairs.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Pesanan tidak ditemukan' },
        { status: 404 }
      );
    }

    const repair = repairs[0];

    // 2. Periksa apakah status masih mengizinkan pembatalan
    const cancelableStatuses = ['draft', 'submitted', 'assigned'];
    if (!cancelableStatuses.includes(repair.current_status)) {
      return NextResponse.json(
        {
          success: false,
          message: `Pesanan tidak dapat dibatalkan secara langsung karena saat ini berstatus "${repair.current_status}". Silakan hubungi layanan bantuan atau teknisi terkait.`,
        },
        { status: 400 }
      );
    }

    // 3. Batalkan dalam transaksi database atomik
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      await connection.execute(
        `UPDATE repair_requests
         SET current_status = 'cancelled', updated_at = NOW()
         WHERE id = ?`,
        [repairId]
      );

      // Catat di riwayat status
      await connection.execute(
        `INSERT INTO repair_status_history (
          repair_request_id,
          previous_status,
          new_status,
          changed_by_user_id,
          actor_role,
          notes,
          created_at
        ) VALUES (?, ?, 'cancelled', ?, 'customer', ?, NOW())`,
        [
          repairId,
          repair.current_status,
          session.userId,
          `Dibatalkan oleh pelanggan. Alasan: ${cancellation_reason}`,
        ]
      );

      // Batalkan juga penugasan teknisi aktif jika ada
      await connection.execute(
        `UPDATE technician_assignments
         SET status = 'cancelled'
         WHERE repair_request_id = ? AND status IN ('offered', 'accepted')`,
        [repairId]
      );

      await connection.commit();
    } catch (dbErr: any) {
      await connection.rollback();
      throw dbErr;
    } finally {
      connection.release();
    }

    return NextResponse.json({
      success: true,
      message: `Pesanan ${repair.order_code} berhasil dibatalkan.`,
      data: {
        id: repairId,
        orderCode: repair.order_code,
        status: 'cancelled',
      },
    });
  } catch (error: any) {
    console.error('[Cancel Customer Repair Error]:', error);
    return NextResponse.json(
      { success: false, message: 'Terjadi kesalahan sistem saat membatalkan pesanan' },
      { status: 500 }
    );
  }
}

