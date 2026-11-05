import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { recordAdminAudit } from '@/lib/audit';

/**
 * GET /api/admin/payments
 * Mengambil daftar invoice tagihan dan log transaksi pembayaran dengan pencarian, filter status, metode, dan pagination.
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
    const method = searchParams.get('method') || 'all';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '10', 10)));
    const offset = (page - 1) * limit;

    const whereConditions: string[] = ['1=1'];
    const queryParams: any[] = [];

    if (search) {
      whereConditions.push(
        '(inv.invoice_number LIKE ? OR rr.order_code LIKE ? OR cp.full_name LIKE ? OR u.phone_number LIKE ? OR p.payment_reference LIKE ?)'
      );
      const wildcard = `%${search}%`;
      queryParams.push(wildcard, wildcard, wildcard, wildcard, wildcard);
    }

    if (status && status !== 'all') {
      whereConditions.push('inv.status = ?');
      queryParams.push(status);
    }

    if (method && method !== 'all') {
      whereConditions.push('p.payment_method = ?');
      queryParams.push(method);
    }

    const whereClause = whereConditions.join(' AND ');

    // 1. Total Count
    const countSql = `
      SELECT COUNT(DISTINCT inv.id) AS total
      FROM invoices inv
      JOIN repair_requests rr ON inv.repair_request_id = rr.id
      LEFT JOIN users u ON inv.customer_id = u.id
      LEFT JOIN customer_profiles cp ON inv.customer_id = cp.user_id
      LEFT JOIN payments p ON inv.id = p.invoice_id
      WHERE ${whereClause}
    `;
    const countRes: any = await query(countSql, queryParams);
    const total = Number(countRes[0]?.total || 0);

    // 2. Data Invoices & Latest Payment
    const dataSql = `
      SELECT 
        inv.id,
        inv.invoice_number,
        inv.repair_request_id,
        inv.customer_id,
        inv.subtotal_labor,
        inv.subtotal_parts,
        inv.service_fee,
        inv.discount_amount,
        inv.total_amount,
        inv.status AS invoice_status,
        inv.due_date,
        inv.paid_at,
        inv.created_at,
        rr.order_code,
        rr.device_brand,
        rr.device_model,
        rr.current_status AS repair_status,
        COALESCE(cp.full_name, 'Pelanggan #' + inv.customer_id) AS customer_name,
        u.phone_number AS customer_phone,
        u.email AS customer_email,
        p.id AS payment_id,
        p.payment_reference,
        p.payment_method,
        p.gateway_provider,
        p.gateway_transaction_id,
        p.payment_status,
        p.settled_at
      FROM invoices inv
      JOIN repair_requests rr ON inv.repair_request_id = rr.id
      LEFT JOIN users u ON inv.customer_id = u.id
      LEFT JOIN customer_profiles cp ON inv.customer_id = cp.user_id
      LEFT JOIN (
        SELECT p1.*
        FROM payments p1
        INNER JOIN (
          SELECT invoice_id, MAX(id) as max_id
          FROM payments
          GROUP BY invoice_id
        ) p2 ON p1.id = p2.max_id
      ) p ON inv.id = p.invoice_id
      WHERE ${whereClause}
      ORDER BY inv.id DESC
      LIMIT ? OFFSET ?
    `;

    const dataParams = [...queryParams, limit, offset];
    const invoices: any = await query(dataSql, dataParams);

    // 3. KPI Aggregates
    const statsSql = `
      SELECT 
        COUNT(*) AS total_invoices,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN total_amount ELSE 0 END), 0) AS total_revenue,
        COALESCE(SUM(CASE WHEN status = 'unpaid' THEN total_amount ELSE 0 END), 0) AS pending_amount,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN service_fee ELSE 0 END), 0) AS platform_fees_collected,
        COUNT(CASE WHEN status IN ('cancelled', 'refunded') THEN 1 END) AS cancelled_invoices
      FROM invoices
    `;
    const statsRes: any = await query(statsSql);
    const stats = statsRes[0] || {
      total_invoices: 0,
      total_revenue: 0,
      pending_amount: 0,
      platform_fees_collected: 0,
      cancelled_invoices: 0,
    };

    return NextResponse.json({
      success: true,
      data: invoices,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
      stats: {
        total_invoices: Number(stats.total_invoices || 0),
        total_revenue: Number(stats.total_revenue || 0),
        pending_amount: Number(stats.pending_amount || 0),
        platform_fees_collected: Number(stats.platform_fees_collected || 0),
        cancelled_invoices: Number(stats.cancelled_invoices || 0),
      },
    });
  } catch (error: any) {
    console.error('[Admin Payments GET Error]:', error);
    return NextResponse.json(
      { success: false, message: 'Gagal memuat data pembayaran: ' + (error?.message || 'Server error') },
      { status: 500 }
    );
  }
}
