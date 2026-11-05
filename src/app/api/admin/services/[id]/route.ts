import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { updateServiceSchema } from '@/lib/validations/service';
import { recordAdminAudit } from '@/lib/audit';

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface ServiceRow {
  id: number;
  category_id: number;
  category_name?: string;
  category_slug?: string;
  name: string;
  slug: string;
  description: string | null;
  base_price: number | string;
  estimated_duration_min: number;
  is_active: number | boolean;
  created_at: string;
  updated_at: string;
  repair_count?: number;
}

interface CategoryCheckRow {
  id: number;
  name: string;
}

/**
 * GET /api/admin/services/[id]
 * Mengambil informasi detail satu layanan beserta kategori dan riwayat transaksi terkait.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    // 1. Verifikasi Autentikasi dan Peran Admin di Server
    const session = await getAdminSession();
    if (!session || session.role !== 'admin') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: sesi administrator tidak valid atau telah berakhir' },
        { status: 401 }
      );
    }

    const { id: rawId } = await params;
    const serviceId = parseInt(rawId, 10);

    if (isNaN(serviceId) || serviceId <= 0) {
      return NextResponse.json(
        { success: false, message: 'Parameter ID layanan tidak valid' },
        { status: 400 }
      );
    }

    // 2. Query Detail Layanan dari Database MySQL
    const rows = await query<ServiceRow[]>(
      `SELECT 
        s.id,
        s.category_id,
        c.name AS category_name,
        c.slug AS category_slug,
        s.name,
        s.slug,
        s.description,
        s.base_price,
        s.estimated_duration_min,
        s.is_active,
        s.created_at,
        s.updated_at,
        (SELECT COUNT(*) FROM repair_requests rr WHERE rr.service_id = s.id AND rr.deleted_at IS NULL) AS repair_count
      FROM services s
      JOIN appliance_categories c ON c.id = s.category_id
      WHERE s.id = ? AND s.deleted_at IS NULL
      LIMIT 1`,
      [serviceId]
    );

    if (!rows || rows.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Layanan tidak ditemukan atau telah dihapus' },
        { status: 404 }
      );
    }

    const service = rows[0];
    return NextResponse.json(
      {
        success: true,
        data: {
          ...service,
          base_price: Number(service.base_price) || 0,
          estimated_duration_min: Number(service.estimated_duration_min) || 60,
          is_active: Boolean(service.is_active),
          repair_count: Number(service.repair_count || 0),
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[GET /api/admin/services/[id] Error]:', error.message || error);
    return NextResponse.json(
      { success: false, message: 'Terjadi kegagalan sistem saat memuat detail layanan' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/services/[id]
 * Memperbarui data layanan (nama, kategori, tarif dasar, durasi, deskripsi, status aktif).
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    // 1. Verifikasi Autentikasi dan Peran Admin di Server
    const session = await getAdminSession();
    if (!session || session.role !== 'admin') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: sesi administrator tidak valid atau telah berakhir' },
        { status: 401 }
      );
    }

    const { id: rawId } = await params;
    const serviceId = parseInt(rawId, 10);

    if (isNaN(serviceId) || serviceId <= 0) {
      return NextResponse.json(
        { success: false, message: 'Parameter ID layanan tidak valid' },
        { status: 400 }
      );
    }

    // 2. Parse & Validasi Body
    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, message: 'Format data JSON tidak valid' },
        { status: 400 }
      );
    }

    const validation = updateServiceSchema.safeParse(body);
    if (!validation.success) {
      const firstError = validation.error.issues[0]?.message || 'Input pembaruan tidak valid';
      return NextResponse.json(
        { success: false, message: firstError },
        { status: 400 }
      );
    }

    const updateData = validation.data;
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { success: false, message: 'Tidak ada data perubahan yang dikirim' },
        { status: 400 }
      );
    }

    // 3. Ambil Snapshot Layanan Saat Ini
    const existingRows = await query<ServiceRow[]>(
      `SELECT s.id, s.category_id, s.name, s.slug, s.description, s.base_price, s.estimated_duration_min, s.is_active
       FROM services s
       WHERE s.id = ? AND s.deleted_at IS NULL LIMIT 1`,
      [serviceId]
    );

    if (!existingRows || existingRows.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Layanan tidak ditemukan atau telah dihapus' },
        { status: 404 }
      );
    }

    const current = existingRows[0];

    // 4. Jika category_id Diubah, Pastikan Kategori Baru Ada
    if (updateData.category_id !== undefined && updateData.category_id !== current.category_id) {
      const catCheck = await query<CategoryCheckRow[]>(
        'SELECT id, name FROM appliance_categories WHERE id = ? AND deleted_at IS NULL LIMIT 1',
        [updateData.category_id]
      );
      if (!catCheck || catCheck.length === 0) {
        return NextResponse.json(
          { success: false, message: 'Kategori peralatan baru yang dipilih tidak ditemukan atau telah dihapus' },
          { status: 404 }
        );
      }
    }

    // 5. Periksa Konflik Unik (Nama atau Slug terhadap baris layanan lain)
    if (updateData.name || updateData.slug) {
      const checkName = updateData.name || current.name;
      const checkSlug = updateData.slug || current.slug;

      const conflicts = await query<ServiceRow[]>(
        'SELECT id, name, slug FROM services WHERE (name = ? OR slug = ?) AND id != ? AND deleted_at IS NULL LIMIT 1',
        [checkName, checkSlug, serviceId]
      );

      if (conflicts && conflicts.length > 0) {
        return NextResponse.json(
          { success: false, message: 'Nama atau slug layanan sudah digunakan oleh layanan lain' },
          { status: 409 }
        );
      }
    }

    // 6. Susun Query Pembaruan Dinamis
    const updateClauses: string[] = [];
    const queryParams: any[] = [];

    if (updateData.category_id !== undefined) {
      updateClauses.push('category_id = ?');
      queryParams.push(updateData.category_id);
    }
    if (updateData.name !== undefined) {
      updateClauses.push('name = ?');
      queryParams.push(updateData.name);
    }
    if (updateData.slug !== undefined) {
      updateClauses.push('slug = ?');
      queryParams.push(updateData.slug);
    }
    if (updateData.description !== undefined) {
      updateClauses.push('description = ?');
      queryParams.push(updateData.description || null);
    }
    if (updateData.base_price !== undefined) {
      updateClauses.push('base_price = ?');
      queryParams.push(updateData.base_price);
    }
    if (updateData.estimated_duration_min !== undefined) {
      updateClauses.push('estimated_duration_min = ?');
      queryParams.push(updateData.estimated_duration_min);
    }
    if (updateData.is_active !== undefined) {
      updateClauses.push('is_active = ?');
      queryParams.push(updateData.is_active ? 1 : 0);
    }

    queryParams.push(serviceId);

    await query(
      `UPDATE services SET ${updateClauses.join(', ')} WHERE id = ?`,
      queryParams
    );

    // 7. Tentukan Kode Aksi Audit Log
    let auditAction = 'UPDATE_SERVICE';
    if (updateData.is_active !== undefined && Object.keys(updateData).length === 1) {
      auditAction = updateData.is_active ? 'ACTIVATE_SERVICE' : 'DEACTIVATE_SERVICE';
    } else if (updateData.base_price !== undefined && Object.keys(updateData).length === 1) {
      auditAction = 'UPDATE_SERVICE_RATE';
    } else if (updateData.category_id !== undefined && Object.keys(updateData).length === 1) {
      auditAction = 'UPDATE_SERVICE_CATEGORY';
    }

    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      '127.0.0.1';
    const userAgent = request.headers.get('user-agent') || 'Unknown';

    await recordAdminAudit({
      adminUserId: session.userId,
      action: auditAction,
      entityName: 'services',
      entityId: serviceId,
      oldValues: {
        category_id: current.category_id,
        name: current.name,
        slug: current.slug,
        description: current.description,
        base_price: Number(current.base_price),
        estimated_duration_min: current.estimated_duration_min,
        is_active: Boolean(current.is_active),
      },
      newValues: {
        category_id: updateData.category_id ?? current.category_id,
        name: updateData.name ?? current.name,
        slug: updateData.slug ?? current.slug,
        description: updateData.description !== undefined ? updateData.description : current.description,
        base_price: updateData.base_price !== undefined ? updateData.base_price : Number(current.base_price),
        estimated_duration_min: updateData.estimated_duration_min ?? current.estimated_duration_min,
        is_active: updateData.is_active !== undefined ? updateData.is_active : Boolean(current.is_active),
      },
      ipAddress: ip,
      userAgent,
    });

    // 8. Ambil Data Hasil Pembaruan
    const updatedRows = await query<ServiceRow[]>(
      `SELECT 
        s.id,
        s.category_id,
        c.name AS category_name,
        c.slug AS category_slug,
        s.name,
        s.slug,
        s.description,
        s.base_price,
        s.estimated_duration_min,
        s.is_active,
        s.created_at,
        s.updated_at,
        (SELECT COUNT(*) FROM repair_requests rr WHERE rr.service_id = s.id AND rr.deleted_at IS NULL) AS repair_count
       FROM services s
       JOIN appliance_categories c ON c.id = s.category_id
       WHERE s.id = ? LIMIT 1`,
      [serviceId]
    );

    const updated = updatedRows[0];
    return NextResponse.json(
      {
        success: true,
        message: 'Layanan perbaikan berhasil diperbarui',
        data: {
          ...updated,
          base_price: Number(updated.base_price) || 0,
          estimated_duration_min: Number(updated.estimated_duration_min) || 60,
          is_active: Boolean(updated.is_active),
          repair_count: Number(updated.repair_count || 0),
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[PATCH /api/admin/services/[id] Error]:', error.message || error);
    return NextResponse.json(
      { success: false, message: 'Terjadi kegagalan sistem saat memperbarui layanan' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/services/[id]
 * Menghapus layanan atau menonaktifkannya jika masih terikat riwayat transaksi permintaan perbaikan.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    // 1. Verifikasi Autentikasi dan Peran Admin di Server
    const session = await getAdminSession();
    if (!session || session.role !== 'admin') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: sesi administrator tidak valid atau telah berakhir' },
        { status: 401 }
      );
    }

    const { id: rawId } = await params;
    const serviceId = parseInt(rawId, 10);

    if (isNaN(serviceId) || serviceId <= 0) {
      return NextResponse.json(
        { success: false, message: 'Parameter ID layanan tidak valid' },
        { status: 400 }
      );
    }

    // 2. Periksa Keberadaan Layanan
    const existing = await query<ServiceRow[]>(
      'SELECT id, category_id, name, slug, base_price, is_active FROM services WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      [serviceId]
    );

    if (!existing || existing.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Layanan tidak ditemukan atau telah dihapus' },
        { status: 404 }
      );
    }

    const current = existing[0];

    // 3. Periksa Relasi Foreign Key di repair_requests
    const [repairCountResult]: any = await query(
      'SELECT COUNT(*) as count FROM repair_requests WHERE service_id = ? AND deleted_at IS NULL',
      [serviceId]
    );

    const repairCount = Number(repairCountResult?.count || 0);

    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode'); // 'deactivate' jika admin memilih opsi nonaktifkan

    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      '127.0.0.1';
    const userAgent = request.headers.get('user-agent') || 'Unknown';

    // 4. Jika Layanan Masih Digunakan dan Mode Deactivate Dipilih: Nonaktifkan Status
    if (mode === 'deactivate') {
      await query(
        'UPDATE services SET is_active = 0 WHERE id = ?',
        [serviceId]
      );

      await recordAdminAudit({
        adminUserId: session.userId,
        action: 'DEACTIVATE_SERVICE',
        entityName: 'services',
        entityId: serviceId,
        oldValues: { is_active: Boolean(current.is_active) },
        newValues: { is_active: false },
        ipAddress: ip,
        userAgent,
      });

      return NextResponse.json(
        {
          success: true,
          message: `Layanan "${current.name}" berhasil dinonaktifkan untuk menjaga integritas data riwayat pesanan.`,
          action: 'deactivated',
        },
        { status: 200 }
      );
    }

    // 5. Jika Masih Digunakan dan Tidak Memilih Deactivate: Tolak Penghapusan Fisik
    if (repairCount > 0) {
      return NextResponse.json(
        {
          success: false,
          inUse: true,
          canDeactivate: true,
          message: `Layanan "${current.name}" tidak dapat dihapus permanen karena masih terhubung dengan ${repairCount} transaksi pesanan perbaikan. Disarankan untuk menonaktifkan layanan agar tidak merusak integritas relasi data transaksi.`,
          usage: {
            repairs: repairCount,
          },
        },
        { status: 400 }
      );
    }

    // 6. Jika Benar-Benar Bersih Tanpa Relasi Transaksi: Lakukan Penghapusan
    await query(
      'DELETE FROM services WHERE id = ?',
      [serviceId]
    );

    await recordAdminAudit({
      adminUserId: session.userId,
      action: 'DELETE_SERVICE',
      entityName: 'services',
      entityId: serviceId,
      oldValues: {
        id: current.id,
        category_id: current.category_id,
        name: current.name,
        slug: current.slug,
        base_price: Number(current.base_price),
      },
      newValues: null,
      ipAddress: ip,
      userAgent,
    });

    return NextResponse.json(
      {
        success: true,
        message: `Layanan "${current.name}" berhasil dihapus permanen dari sistem.`,
        action: 'deleted',
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[DELETE /api/admin/services/[id] Error]:', error.message || error);
    return NextResponse.json(
      { success: false, message: 'Terjadi kegagalan sistem saat memproses penghapusan layanan' },
      { status: 500 }
    );
  }
}
