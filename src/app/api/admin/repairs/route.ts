import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { recordAdminAudit } from '@/lib/audit';
import { generateOrderCode } from '@/lib/validations/repair';

/**
 * GET /api/admin/repairs
 * Mengambil daftar permintaan perbaikan dengan pencarian, filter status, kategori, dan pagination.
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
    const categoryId = searchParams.get('category_id');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '10', 10)));
    const offset = (page - 1) * limit;

    const whereConditions: string[] = ['rr.deleted_at IS NULL'];
    const queryParams: any[] = [];

    if (search) {
      whereConditions.push(
        '(rr.order_code LIKE ? OR rr.device_brand LIKE ? OR rr.device_model LIKE ? OR cp.full_name LIKE ? OR u.phone_number LIKE ? OR rr.address_text LIKE ?)'
      );
      const wildcard = `%${search}%`;
      queryParams.push(wildcard, wildcard, wildcard, wildcard, wildcard, wildcard);
    }

    if (status && status !== 'all') {
      whereConditions.push('rr.current_status = ?');
      queryParams.push(status);
    }

    if (categoryId && categoryId !== 'all') {
      whereConditions.push('rr.category_id = ?');
      queryParams.push(Number(categoryId));
    }

    const whereClause = whereConditions.join(' AND ');

    // 1. Hitung total data
    const countSql = `
      SELECT COUNT(*) AS total
      FROM repair_requests rr
      LEFT JOIN users u ON rr.customer_id = u.id
      LEFT JOIN customer_profiles cp ON rr.customer_id = cp.user_id
      WHERE ${whereClause}
    `;
    const countResult: any = await query(countSql, queryParams);
    const total = Number(countResult[0]?.total || 0);

    // 2. Ambil data dengan relasi lengkap
    const dataSql = `
      SELECT 
        rr.id,
        rr.order_code,
        rr.customer_id,
        rr.category_id,
        rr.service_id,
        rr.device_brand,
        rr.device_model,
        rr.problem_description,
        rr.problem_photos,
        rr.address_text,
        rr.latitude,
        rr.longitude,
        rr.current_status,
        rr.created_at,
        rr.updated_at,
        COALESCE(cp.full_name, 'Pelanggan #' + rr.customer_id) AS customer_name,
        u.phone_number AS customer_phone,
        u.email AS customer_email,
        ac.name AS category_name,
        s.name AS service_name,
        (
          SELECT tp.full_name 
          FROM technician_assignments ta
          JOIN technician_profiles tp ON ta.technician_id = tp.user_id
          WHERE ta.repair_request_id = rr.id
          ORDER BY ta.id DESC LIMIT 1
        ) AS assigned_technician_name,
        (
          SELECT ta.technician_id 
          FROM technician_assignments ta
          WHERE ta.repair_request_id = rr.id
          ORDER BY ta.id DESC LIMIT 1
        ) AS assigned_technician_id,
        (
          SELECT ta.status 
          FROM technician_assignments ta
          WHERE ta.repair_request_id = rr.id
          ORDER BY ta.id DESC LIMIT 1
        ) AS assignment_status,
        inv.id AS invoice_id,
        inv.invoice_number,
        inv.total_amount AS invoice_amount,
        inv.status AS invoice_status
      FROM repair_requests rr
      LEFT JOIN users u ON rr.customer_id = u.id
      LEFT JOIN customer_profiles cp ON rr.customer_id = cp.user_id
      LEFT JOIN appliance_categories ac ON rr.category_id = ac.id
      LEFT JOIN services s ON rr.service_id = s.id
      LEFT JOIN invoices inv ON rr.id = inv.repair_request_id
      WHERE ${whereClause}
      ORDER BY rr.id DESC
      LIMIT ? OFFSET ?
    `;

    const dataParams = [...queryParams, limit, offset];
    const repairs: any = await query(dataSql, dataParams);

    // 3. Ringkasan statistik cepat (KPI)
    const statsSql = `
      SELECT 
        COUNT(*) AS total,
        SUM(CASE WHEN current_status = 'submitted' THEN 1 ELSE 0 END) AS submitted,
        SUM(CASE WHEN current_status IN ('assigned', 'scheduled', 'in_diagnosis', 'estimated', 'customer_approved', 'in_repair') THEN 1 ELSE 0 END) AS in_progress,
        SUM(CASE WHEN current_status = 'completed' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN current_status IN ('cancelled', 'complained') THEN 1 ELSE 0 END) AS issues_or_cancelled
      FROM repair_requests
      WHERE deleted_at IS NULL
    `;
    const statsResult: any = await query(statsSql);
    const stats = statsResult[0] || { total: 0, submitted: 0, in_progress: 0, completed: 0, issues_or_cancelled: 0 };

    return NextResponse.json({
      success: true,
      data: repairs.map((r: any) => ({
        ...r,
        problem_photos: typeof r.problem_photos === 'string' ? JSON.parse(r.problem_photos) : (r.problem_photos || []),
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
      stats: {
        total: Number(stats.total || 0),
        submitted: Number(stats.submitted || 0),
        in_progress: Number(stats.in_progress || 0),
        completed: Number(stats.completed || 0),
        issues_or_cancelled: Number(stats.issues_or_cancelled || 0),
      },
    });
  } catch (error: any) {
    console.error('[Admin Repairs GET Error]:', error);
    return NextResponse.json(
      { success: false, message: 'Gagal memuat daftar permintaan perbaikan: ' + (error?.message || 'Server error') },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/repairs
 * Membuat tiket perbaikan manual oleh admin.
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
    const {
      customer_id,
      category_id,
      service_id,
      device_brand,
      device_model,
      problem_description,
      address_text,
      latitude,
      longitude,
    } = body;

    if (!customer_id || !category_id || !problem_description || !address_text) {
      return NextResponse.json(
        { success: false, message: 'Parameter pelanggan, kategori, deskripsi kendala, dan alamat wajib diisi' },
        { status: 400 }
      );
    }

    const orderCode = generateOrderCode();

    const insertSql = `
      INSERT INTO repair_requests (
        order_code,
        customer_id,
        category_id,
        service_id,
        device_brand,
        device_model,
        problem_description,
        address_text,
        latitude,
        longitude,
        current_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted')
    `;

    const result: any = await query(insertSql, [
      orderCode,
      Number(customer_id),
      Number(category_id),
      service_id ? Number(service_id) : null,
      device_brand || null,
      device_model || null,
      problem_description,
      address_text,
      latitude ? Number(latitude) : -6.2088,
      longitude ? Number(longitude) : 106.8456,
    ]);

    const newRepairId = result.insertId;

    // Catat ke riwayat status
    await query(
      `INSERT INTO repair_status_history (repair_request_id, previous_status, new_status, changed_by_user_id, actor_role, notes)
       VALUES (?, NULL, 'submitted', ?, 'admin', 'Tiket pesanan dibuat manual oleh Administrator')`,
      [newRepairId, session.userId]
    );

    // Catat audit log
    await recordAdminAudit({
      adminUserId: session.userId,
      action: 'CREATE_REPAIR_ORDER',
      entityName: 'repair_requests',
      entityId: newRepairId,
      newValues: { orderCode, customer_id, category_id, service_id, device_brand, device_model },
      ipAddress: request.headers.get('x-forwarded-for') || null,
      userAgent: request.headers.get('user-agent') || null,
    });

    return NextResponse.json({
      success: true,
      message: `Pesanan perbaikan ${orderCode} berhasil dibuat`,
      data: { id: newRepairId, order_code: orderCode },
    });
  } catch (error: any) {
    console.error('[Admin Repairs POST Error]:', error);
    return NextResponse.json(
      { success: false, message: 'Gagal membuat pesanan: ' + (error?.message || 'Server error') },
      { status: 500 }
    );
  }
}
