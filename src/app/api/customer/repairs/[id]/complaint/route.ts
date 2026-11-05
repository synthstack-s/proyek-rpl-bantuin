import { NextRequest, NextResponse } from 'next/server';
import { getUserSession } from '@/lib/auth';
import { query } from '@/lib/db';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
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
    const { category, description, evidence_photos } = body;

    const validCategories = [
      'poor_workmanship',
      'tardiness',
      'overcharging',
      'technician_misbehavior',
      'recurring_damage',
      'other',
    ];

    if (!validCategories.includes(category)) {
      return NextResponse.json(
        { success: false, message: 'Kategori komplain/aduan tidak valid' },
        { status: 400 }
      );
    }

    if (!description || description.trim().length < 10) {
      return NextResponse.json(
        { success: false, message: 'Deskripsi keluhan wajib diisi minimal 10 karakter' },
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

    // 2. Generate kode aduan unik (CMP-YYYYMMDD-XXXXX)
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(10000 + Math.random() * 90000);
    const complaintCode = `CMP-${dateStr}-${randomSuffix}`;

    const photosJson = Array.isArray(evidence_photos) ? JSON.stringify(evidence_photos) : null;

    // 3. Masukkan rekaman aduan
    const insertRes: any = await query(
      `INSERT INTO repair_complaints (
        complaint_code,
        repair_request_id,
        complainant_user_id,
        category,
        description,
        evidence_photos,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, 'submitted')`,
      [
        complaintCode,
        repairId,
        session.userId,
        category,
        description.trim(),
        photosJson,
      ]
    );

    // 4. Update status order menjadi 'complained' jika belum
    await query(
      `UPDATE repair_requests SET current_status = 'complained' WHERE id = ?`,
      [repairId]
    );

    // 5. Catat riwayat status
    await query(
      `INSERT INTO repair_status_history (repair_request_id, previous_status, new_status, changed_by_user_id, actor_role, notes)
       VALUES (?, ?, 'complained', ?, 'customer', ?)`,
      [repairId, order.current_status, session.userId, `Pelanggan mengajukan keluhan/klaim garansi: ${description.trim().slice(0, 80)}`]
    );

    // 6. Notifikasi ke pengguna bahwa aduan sedang diproses
    await query(
      `INSERT INTO notifications (user_id, title, message, entity_type, entity_id)
       VALUES (?, 'Laporan Pengaduan Diterima', ?, 'complaint', ?)`,
      [
        session.userId,
        `Pengaduan Anda #${complaintCode} untuk pesanan #${order.order_code} telah diterima oleh tim BANTUIN dan segera diinvestigasi.`,
        insertRes.insertId,
      ]
    );

    return NextResponse.json({
      success: true,
      message: 'Pengaduan berhasil diajukan dan sedang ditangani oleh tim pengawas BANTUIN.',
      data: {
        complaintId: insertRes.insertId,
        complaintCode,
        status: 'submitted',
      },
    });
  } catch (error: any) {
    console.error('Error in customer complaint API:', error);
    return NextResponse.json(
      { success: false, message: 'Gagal mengajukan pengaduan: ' + error.message },
      { status: 500 }
    );
  }
}
