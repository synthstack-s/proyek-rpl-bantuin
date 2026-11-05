import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const codeParam = searchParams.get('code');

    if (!codeParam || !codeParam.trim()) {
      return NextResponse.json(
        { success: false, message: 'Kode pesanan wajib diisi (contoh: BAN-20261031-10001)' },
        { status: 400 }
      );
    }

    const cleanCode = codeParam.trim().replace(/^#/, '');

    // Cari pesanan berdasarkan order_code
    const orderRows = await query<any[]>(
      `SELECT rr.id, rr.order_code, rr.current_status, rr.device_brand, rr.device_model,
              rr.problem_description, rr.created_at, rr.updated_at,
              ac.name AS category_name, ac.icon_url AS category_icon,
              s.name AS service_name,
              tp.full_name AS technician_name,
              inv.status AS invoice_status, inv.total_amount AS invoice_amount
       FROM repair_requests rr
       JOIN appliance_categories ac ON rr.category_id = ac.id
       LEFT JOIN services s ON rr.service_id = s.id
       LEFT JOIN technician_assignments ta ON (ta.repair_request_id = rr.id AND ta.status IN ('accepted', 'completed'))
       LEFT JOIN technician_profiles tp ON ta.technician_id = tp.user_id
       LEFT JOIN invoices inv ON inv.repair_request_id = rr.id
       WHERE rr.order_code = ? AND rr.deleted_at IS NULL
       LIMIT 1`,
      [cleanCode]
    );

    if (orderRows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: `Pesanan dengan kode "${cleanCode}" tidak ditemukan. Pastikan format nomor pesanan Anda benar.`,
        },
        { status: 404 }
      );
    }

    const order = orderRows[0];

    // Ambil linimasa status publik
    const historyRows = await query<any[]>(
      `SELECT new_status, actor_role, notes, created_at
       FROM repair_status_history
       WHERE repair_request_id = ?
       ORDER BY id ASC`,
      [order.id]
    );

    return NextResponse.json({
      success: true,
      data: {
        orderCode: order.order_code,
        currentStatus: order.current_status,
        categoryName: order.category_name,
        categoryIcon: order.category_icon,
        serviceName: order.service_name || 'Pemeriksaan & Perbaikan Elektronik',
        device: [order.device_brand, order.device_model].filter(Boolean).join(' ') || 'Elektronik Rumah Tangga',
        problemDescription: order.problem_description,
        technicianName: order.technician_name ? `${order.technician_name.slice(0, 3)}*** (Mitra Resmi BANTUIN)` : 'Menunggu Penugasan Mitra',
        invoiceStatus: order.invoice_status || null,
        invoiceAmount: order.invoice_amount ? Number(order.invoice_amount) : null,
        createdAt: order.created_at,
        updatedAt: order.updated_at,
        timeline: historyRows.map((h) => ({
          status: h.new_status,
          actor: h.actor_role,
          notes: h.notes || null,
          time: h.created_at,
        })),
      },
    });
  } catch (error: any) {
    console.error('Error tracking public order:', error);
    return NextResponse.json(
      { success: false, message: 'Gagal melacak pesanan: ' + error.message },
      { status: 500 }
    );
  }
}

