import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { recordAdminAudit } from '@/lib/audit';

interface SettingRow {
  id: number;
  setting_key: string;
  setting_value: string;
  value_type: 'string' | 'number' | 'boolean' | 'json';
  group_name: string;
  description: string | null;
  updated_by_admin_id: number | null;
  updated_at: string;
  admin_email?: string | null;
}

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
 * GET /api/admin/settings
 * Mengambil daftar seluruh konfigurasi sistem BANTUIN dengan filter grup atau pencarian.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session || session.role !== 'admin') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: sesi administrator tidak valid atau telah berakhir.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const group = searchParams.get('group')?.trim() || 'all';
    const search = searchParams.get('search')?.trim() || '';

    const whereConditions: string[] = [];
    const queryParams: any[] = [];

    if (group !== 'all') {
      whereConditions.push('s.group_name = ?');
      queryParams.push(group);
    }

    if (search) {
      whereConditions.push('(s.setting_key LIKE ? OR s.description LIKE ? OR s.setting_value LIKE ?)');
      const wildcard = `%${search}%`;
      queryParams.push(wildcard, wildcard, wildcard);
    }

    const whereSql = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const rows = await query<SettingRow[]>(
      `SELECT 
        s.id,
        s.setting_key,
        s.setting_value,
        s.value_type,
        s.group_name,
        s.description,
        s.updated_by_admin_id,
        s.updated_at,
        u.email AS admin_email
       FROM system_settings s
       LEFT JOIN users u ON s.updated_by_admin_id = u.id
       ${whereSql}
       ORDER BY 
        CASE s.group_name
          WHEN 'fee' THEN 1
          WHEN 'dispatch' THEN 2
          WHEN 'service' THEN 3
          WHEN 'ai' THEN 4
          WHEN 'complaint' THEN 5
          ELSE 6
        END,
        s.id ASC`,
      queryParams
    );

    // Ambil daftar grup yang tersedia
    const groupsRaw = await query<{ group_name: string; count: number }[]>(
      `SELECT group_name, COUNT(*) as count FROM system_settings GROUP BY group_name ORDER BY group_name ASC`
    );

    const formattedSettings = rows.map((r) => ({
      ...r,
      isCore: CORE_SETTING_KEYS.includes(r.setting_key),
    }));

    return NextResponse.json({
      success: true,
      data: {
        settings: formattedSettings,
        groups: groupsRaw,
        total: formattedSettings.length,
      },
    });
  } catch (error: any) {
    console.error('[Get Settings Error]:', error);
    return NextResponse.json(
      { success: false, message: 'Gagal mengambil data konfigurasi sistem: ' + error.message },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/settings
 * Memperbarui nilai konfigurasi sistem (mendukung single atau batch updates).
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session || session.role !== 'admin') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: sesi administrator tidak valid.' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { success: false, message: 'Payload data tidak valid.' },
        { status: 400 }
      );
    }

    // Mendukung pembaruan array settings [{ key, value }] atau single { key, value }
    const updates: Array<{ key?: string; id?: number; value: any }> = Array.isArray(body.settings)
      ? body.settings
      : [body];

    if (updates.length === 0 || (!updates[0].key && !updates[0].id)) {
      return NextResponse.json(
        { success: false, message: 'Format data perubahan tidak valid. Parameter key atau id wajib disertakan.' },
        { status: 400 }
      );
    }

    const updatedResults: Array<{ key: string; value: string }> = [];

    for (const item of updates) {
      const settingIdentifier = item.key ? 'setting_key = ?' : 'id = ?';
      const settingParam = item.key || item.id;

      // Ambil nilai lama untuk validasi tipe dan audit log
      const existingRows = await query<SettingRow[]>(
        `SELECT id, setting_key, setting_value, value_type, group_name, description FROM system_settings WHERE ${settingIdentifier} LIMIT 1`,
        [settingParam]
      );

      if (existingRows.length === 0) {
        return NextResponse.json(
          { success: false, message: `Parameter konfigurasi '${settingParam}' tidak ditemukan.` },
          { status: 404 }
        );
      }

      const existing = existingRows[0];
      const stringValue = String(item.value).trim();

      // Validasi tipe data sesuai skema
      if (existing.value_type === 'number') {
        const num = Number(stringValue);
        if (isNaN(num)) {
          return NextResponse.json(
            { success: false, message: `Nilai parameter '${existing.setting_key}' harus berupa angka valid.` },
            { status: 400 }
          );
        }

        // Validasi spesifik batas angka
        if (existing.setting_key === 'platform_fee_percent' && (num < 0 || num > 100)) {
          return NextResponse.json(
            { success: false, message: 'Persentase komisi platform harus berada di rentang 0% hingga 100%.' },
            { status: 400 }
          );
        }
        if (num < 0) {
          return NextResponse.json(
            { success: false, message: `Nilai parameter '${existing.setting_key}' tidak boleh bernilai negatif.` },
            { status: 400 }
          );
        }
      } else if (existing.value_type === 'boolean') {
        if (!['true', 'false', '1', '0'].includes(stringValue.toLowerCase())) {
          return NextResponse.json(
            { success: false, message: `Nilai parameter '${existing.setting_key}' harus berupa nilai boolean (true/false).` },
            { status: 400 }
          );
        }
      } else if (existing.value_type === 'json') {
        try {
          JSON.parse(stringValue);
        } catch {
          return NextResponse.json(
            { success: false, message: `Nilai parameter '${existing.setting_key}' harus berupa format JSON yang valid.` },
            { status: 400 }
          );
        }
      }

      // Validasi nama model AI
      if (existing.setting_key === 'ai_model_name') {
        const validModels = [
          'gemini-3.5-flash',
          'gemini-3.5-flash-lite',
          'gemini-2.5-flash',
          'gemini-flash-latest',
          'gemini-1.5-flash',
        ];
        if (!validModels.includes(stringValue)) {
          return NextResponse.json(
            {
              success: false,
              message: `Model AI '${stringValue}' tidak dikenali. Pilih salah satu model yang didukung: ${validModels.join(', ')}.`,
            },
            { status: 400 }
          );
        }
      }

      // Eksekusi pembaruan
      await query(
        `UPDATE system_settings 
         SET setting_value = ?, updated_by_admin_id = ?, updated_at = NOW() 
         WHERE id = ?`,
        [stringValue, session.userId, existing.id]
      );

      // Catat ke log audit
      const clientIp = request.headers.get('x-forwarded-for') || '127.0.0.1';
      const userAgent = request.headers.get('user-agent') || 'Admin Browser';

      await recordAdminAudit({
        adminUserId: session.userId,
        action: 'UPDATE_SYSTEM_SETTING',
        entityName: 'system_settings',
        entityId: existing.id,
        oldValues: { [existing.setting_key]: existing.setting_value },
        newValues: { [existing.setting_key]: stringValue },
        ipAddress: clientIp,
        userAgent,
      });

      updatedResults.push({ key: existing.setting_key, value: stringValue });
    }

    return NextResponse.json({
      success: true,
      message: `Berhasil memperbarui ${updatedResults.length} parameter konfigurasi.`,
      data: updatedResults,
    });
  } catch (error: any) {
    console.error('[Update Settings Error]:', error);
    return NextResponse.json(
      { success: false, message: 'Gagal memperbarui konfigurasi: ' + error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/settings
 * Menambahkan parameter konfigurasi kustom baru ke dalam sistem.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session || session.role !== 'admin') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: sesi administrator tidak valid.' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ success: false, message: 'Payload tidak valid.' }, { status: 400 });
    }

    const { setting_key, setting_value, value_type = 'string', group_name = 'general', description = '' } = body;

    if (!setting_key || typeof setting_key !== 'string') {
      return NextResponse.json({ success: false, message: 'Nama parameter (setting_key) wajib diisi.' }, { status: 400 });
    }

    // Normalisasi format setting_key: lowercase snake_case
    const cleanKey = setting_key.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (cleanKey.length < 3) {
      return NextResponse.json({ success: false, message: 'Panjang nama parameter minimal 3 karakter.' }, { status: 400 });
    }

    const validTypes = ['string', 'number', 'boolean', 'json'];
    if (!validTypes.includes(value_type)) {
      return NextResponse.json({ success: false, message: 'Tipe nilai harus salah satu dari: string, number, boolean, json.' }, { status: 400 });
    }

    // Periksa apakah key sudah ada
    const existingKey = await query<any[]>(
      `SELECT id FROM system_settings WHERE setting_key = ? LIMIT 1`,
      [cleanKey]
    );

    if (existingKey.length > 0) {
      return NextResponse.json(
        { success: false, message: `Parameter dengan nama '${cleanKey}' sudah terdaftar.` },
        { status: 409 }
      );
    }

    const cleanValue = String(setting_value ?? '').trim();
    const cleanGroup = String(group_name || 'general').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const cleanDesc = description ? String(description).trim() : null;

    const result: any = await query(
      `INSERT INTO system_settings (
        setting_key, setting_value, value_type, group_name, description, updated_by_admin_id, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [cleanKey, cleanValue, value_type, cleanGroup, cleanDesc, session.userId]
    );

    const clientIp = request.headers.get('x-forwarded-for') || '127.0.0.1';
    const userAgent = request.headers.get('user-agent') || 'Admin Browser';

    await recordAdminAudit({
      adminUserId: session.userId,
      action: 'CREATE_SYSTEM_SETTING',
      entityName: 'system_settings',
      entityId: Number(result.insertId),
      oldValues: null,
      newValues: {
        setting_key: cleanKey,
        setting_value: cleanValue,
        value_type,
        group_name: cleanGroup,
      },
      ipAddress: clientIp,
      userAgent,
    });

    return NextResponse.json({
      success: true,
      message: `Parameter konfigurasi '${cleanKey}' berhasil dibuat.`,
      data: {
        id: result.insertId,
        setting_key: cleanKey,
        setting_value: cleanValue,
        value_type,
        group_name: cleanGroup,
        description: cleanDesc,
      },
    });
  } catch (error: any) {
    console.error('[Create Setting Error]:', error);
    return NextResponse.json(
      { success: false, message: 'Gagal membuat parameter konfigurasi: ' + error.message },
      { status: 500 }
    );
  }
}
