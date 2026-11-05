import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { query } from '@/lib/db';

/**
 * GET /api/admin/audit-logs
 * Mengambil jejak rekam audit aktivitas administrator (IMMUTABLE APPEND-ONLY).
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
    const action = searchParams.get('action') || 'all';
    const entity = searchParams.get('entity') || 'all';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '10', 10)));
    const offset = (page - 1) * limit;

    const whereConditions: string[] = ['1=1'];
    const queryParams: any[] = [];

    if (search) {
      whereConditions.push(
        '(al.action LIKE ? OR al.entity_name LIKE ? OR u.email LIKE ? OR al.ip_address LIKE ?)'
      );
      const wildcard = `%${search}%`;
      queryParams.push(wildcard, wildcard, wildcard, wildcard);
    }

    if (action && action !== 'all') {
      whereConditions.push('al.action = ?');
      queryParams.push(action);
    }

    if (entity && entity !== 'all') {
      whereConditions.push('al.entity_name = ?');
      queryParams.push(entity);
    }

    const whereClause = whereConditions.join(' AND ');

    // 1. Total Count
    const countSql = `
      SELECT COUNT(*) AS total
      FROM admin_audit_logs al
      JOIN users u ON al.admin_user_id = u.id
      WHERE ${whereClause}
    `;
    const countRes: any = await query(countSql, queryParams);
    const total = Number(countRes[0]?.total || 0);

    // 2. Data
    const dataSql = `
      SELECT 
        al.id,
        al.admin_user_id,
        al.action,
        al.entity_name,
        al.entity_id,
        al.old_values,
        al.new_values,
        al.ip_address,
        al.user_agent,
        al.created_at,
        u.email AS admin_email
      FROM admin_audit_logs al
      JOIN users u ON al.admin_user_id = u.id
      WHERE ${whereClause}
      ORDER BY al.id DESC
      LIMIT ? OFFSET ?
    `;

    const dataParams = [...queryParams, limit, offset];
    const logs: any = await query(dataSql, dataParams);

    // 3. Stats Aggregates
    const statsSql = `
      SELECT 
        COUNT(*) AS total_logs,
        SUM(CASE WHEN DATE(created_at) = CURRENT_DATE() THEN 1 ELSE 0 END) AS today_logs,
        COUNT(DISTINCT admin_user_id) AS total_admins,
        COUNT(DISTINCT entity_name) AS unique_entities
      FROM admin_audit_logs
    `;
    const statsRes: any = await query(statsSql);
    const stats = statsRes[0] || { total_logs: 0, today_logs: 0, total_admins: 0, unique_entities: 0 };

    // 4. Distinct actions & entities for dropdowns
    const distinctActions: any = await query('SELECT DISTINCT action FROM admin_audit_logs ORDER BY action ASC');
    const distinctEntities: any = await query('SELECT DISTINCT entity_name FROM admin_audit_logs ORDER BY entity_name ASC');

    return NextResponse.json({
      success: true,
      data: logs.map((l: any) => ({
        ...l,
        old_values: typeof l.old_values === 'string' ? JSON.parse(l.old_values) : l.old_values,
        new_values: typeof l.new_values === 'string' ? JSON.parse(l.new_values) : l.new_values,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
      stats: {
        total_logs: Number(stats.total_logs || 0),
        today_logs: Number(stats.today_logs || 0),
        total_admins: Number(stats.total_admins || 0),
        unique_entities: Number(stats.unique_entities || 0),
      },
      filters: {
        actions: distinctActions.map((r: any) => r.action),
        entities: distinctEntities.map((r: any) => r.entity_name),
      },
    });
  } catch (error: any) {
    console.error('[Admin Audit Logs GET Error]:', error);
    return NextResponse.json(
      { success: false, message: 'Gagal memuat jejak audit: ' + (error?.message || 'Server error') },
      { status: 500 }
    );
  }
}

