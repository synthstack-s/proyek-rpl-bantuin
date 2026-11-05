import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { recordAdminAudit } from '@/lib/audit';

interface RouteParams {
  params: Promise<{ id: string; specId: string }>;
}

interface SpecRow {
  id: number;
  technician_profile_id: number;
  category_id: number;
  category_name: string;
}

/**
 * DELETE /api/admin/technicians/[id]/specializations/[specId]
 * Menghapus spesialisasi kategori perbaikan tertentu dari teknisi.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    // 1. Verifikasi Autentikasi Admin
    const session = await getAdminSession();
    if (!session || session.role !== 'admin') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: sesi administrator tidak valid atau telah berakhir' },
        { status: 401 }
      );
    }

    const { id: rawId, specId: rawSpecId } = await params;
    const technicianProfileId = parseInt(rawId, 10);
    const specId = parseInt(rawSpecId, 10);

    if (isNaN(technicianProfileId) || technicianProfileId <= 0 || isNaN(specId) || specId <= 0) {
      return NextResponse.json(
        { success: false, message: 'Parameter ID teknisi atau spesialisasi tidak valid' },
        { status: 400 }
      );
    }

    // 2. Ambil Data Spesialisasi yang Akan Dihapus
    const existing = await query<SpecRow[]>(
      `SELECT ts.id, ts.technician_profile_id, ts.category_id, ac.name AS category_name
       FROM technician_specializations ts
       JOIN appliance_categories ac ON ac.id = ts.category_id
       WHERE ts.id = ? AND ts.technician_profile_id = ?
       LIMIT 1`,
      [specId, technicianProfileId]
    );

    if (!existing || existing.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Data spesialisasi tidak ditemukan untuk teknisi ini' },
        { status: 404 }
      );
    }

    const spec = existing[0];

    // 3. Hapus Spesialisasi
    await query(
      'DELETE FROM technician_specializations WHERE id = ? AND technician_profile_id = ?',
      [specId, technicianProfileId]
    );

    // 4. Catat Log Audit
    const clientIp =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      '127.0.0.1';
    const clientUserAgent = request.headers.get('user-agent') || '';

    await recordAdminAudit({
      adminUserId: session.userId,
      action: 'REMOVE_SPECIALIZATION',
      entityName: 'technician_specializations',
      entityId: specId,
      oldValues: {
        technician_profile_id: technicianProfileId,
        category_id: spec.category_id,
        category_name: spec.category_name,
      },
      newValues: null,
      ipAddress: clientIp,
      userAgent: clientUserAgent,
    });

    return NextResponse.json(
      {
        success: true,
        message: `Spesialisasi "${spec.category_name}" berhasil dihapus dari profil teknisi`,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[DELETE /api/admin/technicians/[id]/specializations/[specId] Error]:', error.message || error);
    return NextResponse.json(
      { success: false, message: 'Gagal menghapus data spesialisasi teknisi' },
      { status: 500 }
    );
  }
}
