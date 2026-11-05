import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { recordAdminAudit } from '@/lib/audit';

const CORE_SETTING_KEYS = [
  'platform_fee_fixed',
  'platform_fee_percent',
  'max_search_radius_km',
  'technician_assignment_timeout_min',
  'warranty_period_days',
  'ai_daily_free_quota',
  'ai_model_name',
  'complaint_auto_escalate_hours',
];

/**
 * DELETE /api/admin/settings/[id]
 * Menghapus parameter konfigurasi kustom (parameter inti dilindungi dari penghapusan).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAdminSession();
    if (!session || session.role !== 'admin') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: sesi administrator tidak valid.' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const settingId = parseInt(id, 10);

    if (isNaN(settingId) || settingId <= 0) {
      return NextResponse.json({ success: false, message: 'ID parameter tidak valid.' }, { status: 400 });
    }

    const rows = await query<any[]>(
      `SELECT id, setting_key, setting_value, group_name FROM system_settings WHERE id = ? LIMIT 1`,
      [settingId]
    );

    if (rows.length === 0) {
      return NextResponse.json({ success: false, message: 'Parameter tidak ditemukan.' }, { status: 404 });
    }

    const target = rows[0];

    // Lindungi parameter inti
    if (CORE_SETTING_KEYS.includes(target.setting_key)) {
      return NextResponse.json(
        {
          success: false,
          message: `Parameter '${target.setting_key}' adalah konfigurasi inti sistem BANTUIN dan tidak boleh dihapus. Anda hanya dapat mengubah nilainya.`,
        },
        { status: 403 }
      );
    }

    await query(`DELETE FROM system_settings WHERE id = ?`, [settingId]);

    const clientIp = request.headers.get('x-forwarded-for') || '127.0.0.1';
    const userAgent = request.headers.get('user-agent') || 'Admin Browser';

    await recordAdminAudit({
      adminUserId: session.userId,
      action: 'DELETE_SYSTEM_SETTING',
      entityName: 'system_settings',
      entityId: settingId,
      oldValues: { setting_key: target.setting_key, setting_value: target.setting_value },
      newValues: null,
      ipAddress: clientIp,
      userAgent,
    });

    return NextResponse.json({
      success: true,
      message: `Parameter konfigurasi '${target.setting_key}' berhasil dihapus.`,
    });
  } catch (error: any) {
    console.error('[Delete Setting Error]:', error);
    return NextResponse.json(
      { success: false, message: 'Gagal menghapus parameter konfigurasi: ' + error.message },
      { status: 500 }
    );
  }
}
