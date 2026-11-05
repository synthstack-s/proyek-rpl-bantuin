import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { query } from '@/lib/db';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/admin/audit-logs/[id]
 * Mengambil detail lengkap satu baris rekaman jejak audit beserta snapshot data JSON.
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
    const logId = parseInt(id, 10);
    if (isNaN(logId)) {
      return NextResponse.json({ success: false, message: 'ID audit log tidak valid' }, { status: 400 });
    }

    const rows: any = await query(
      `SELECT 
        al.*,
        u.email AS admin_email,
        u.role AS admin_role
      FROM admin_audit_logs al
      JOIN users u ON al.admin_user_id = u.id
      WHERE al.id = ?`,
      [logId]
    );

    if (rows.length === 0) {
      return NextResponse.json({ success: false, message: 'Rekaman audit tidak ditemukan' }, { status: 404 });
    }

    const log = rows[0];
    return NextResponse.json({
      success: true,
      data: {
        ...log,
        old_values: typeof log.old_values === 'string' ? JSON.parse(log.old_values) : log.old_values,
        new_values: typeof log.new_values === 'string' ? JSON.parse(log.new_values) : log.new_values,
      },
    });
  } catch (error: any) {
    console.error('[Admin Audit Log Detail Error]:', error);
    return NextResponse.json(
      { success: false, message: 'Gagal memuat detail audit: ' + (error?.message || 'Server error') },
      { status: 500 }
    );
  }
}

