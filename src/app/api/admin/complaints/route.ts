import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { recordAdminAudit } from '@/lib/audit';

/**
 * GET /api/admin/complaints
 * Mengambil daftar pengaduan pelanggan dengan filter kategori, status investigasi, pencarian, dan pagination.
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
    const category = searchParams.get('category') || 'all';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '10', 10)));
    const offset = (page - 1) * limit;

    const whereConditions: string[] = ['1=1'];
    const queryParams: any[] = [];

    if (search) {
      whereConditions.push(
        '(rc.complaint_code LIKE ? OR rr.order_code LIKE ? OR cp.full_name LIKE ? OR u.phone_number LIKE ? OR rc.description LIKE ?)'
      );
      const wildcard = `%${search}%`;
      queryParams.push(wildcard, wildcard, wildcard, wildcard, wildcard);
    }

    if (status && status !== 'all') {
      whereConditions.push('rc.status = ?');
      queryParams.push(status);
    }

    if (category && category !== 'all') {
      whereConditions.push('rc.category = ?');
      queryParams.push(category);
    }

    const whereClause = whereConditions.join(' AND ');

    // 1. Total Count
    const countSql = `
      SELECT COUNT(*) AS total
      FROM repair_complaints rc
      JOIN repair_requests rr ON rc.repair_request_id = rr.id
      LEFT JOIN users u ON rc.complainant_user_id = u.id
      LEFT JOIN customer_profiles cp ON rc.complainant_user_id = cp.user_id
      WHERE ${whereClause}
    `;
    const countRes: any = await query(countSql, queryParams);
    const total = Number(countRes[0]?.total || 0);

    // 2. Data
    const dataSql = `
      SELECT 
        rc.id,
        rc.complaint_code,
        rc.repair_request_id,
        rc.complainant_user_id,
        rc.category,
        rc.description,
        rc.evidence_photos,
        rc.status,
        rc.resolution_summary,
        rc.handled_by_admin_id,
        rc.resolved_at,
        rc.created_at,
        rc.updated_at,
        rr.order_code,
        rr.device_brand,
        rr.device_model,
        rr.current_status AS repair_status,
        COALESCE(cp.full_name, 'Pelanggan #' + rc.complainant_user_id) AS customer_name,
        u.phone_number AS customer_phone,
        u.email AS customer_email,
        admin_u.email AS handler_admin_email
      FROM repair_complaints rc
      JOIN repair_requests rr ON rc.repair_request_id = rr.id
      LEFT JOIN users u ON rc.complainant_user_id = u.id
      LEFT JOIN customer_profiles cp ON rc.complainant_user_id = cp.user_id
      LEFT JOIN users admin_u ON rc.handled_by_admin_id = admin_u.id
      WHERE ${whereClause}
      ORDER BY rc.id DESC
      LIMIT ? OFFSET ?
    `;

    const dataParams = [...queryParams, limit, offset];
    const complaints: any = await query(dataSql, dataParams);

    // 3. Stats Aggregates
    const statsSql = `
      SELECT 
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'submitted' THEN 1 ELSE 0 END) AS submitted,
        SUM(CASE WHEN status IN ('in_investigation', 'waiting_customer') THEN 1 ELSE 0 END) AS in_investigation,
        SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolved,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected
      FROM repair_complaints
    `;
    const statsRes: any = await query(statsSql);
    const stats = statsRes[0] || { total: 0, submitted: 0, in_investigation: 0, resolved: 0, rejected: 0 };

    return NextResponse.json({
      success: true,
      data: complaints.map((c: any) => ({
        ...c,
        evidence_photos: typeof c.evidence_photos === 'string' ? JSON.parse(c.evidence_photos) : (c.evidence_photos || []),
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
        in_investigation: Number(stats.in_investigation || 0),
        resolved: Number(stats.resolved || 0),
        rejected: Number(stats.rejected || 0),
      },
    });
  } catch (error: any) {
    console.error('[Admin Complaints GET Error]:', error);
    return NextResponse.json(
      { success: false, message: 'Gagal memuat daftar pengaduan: ' + (error?.message || 'Server error') },
      { status: 500 }
    );
  }
}
