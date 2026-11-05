import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { updateCategorySchema } from '@/lib/validations/category';
import { recordAdminAudit } from '@/lib/audit';

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface CategoryRow {
  id: number;
  name: string;
  slug: string;
  icon_url: string | null;
  description: string | null;
  is_active: number | boolean;
  created_at: string;
  updated_at: string;
  service_count?: number;
  technician_count?: number;
}

/**
 * GET /api/admin/categories/[id]
 * Mengambil informasi detail satu kategori peralatan.
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
    const categoryId = parseInt(rawId, 10);

    if (isNaN(categoryId) || categoryId <= 0) {
      return NextResponse.json(
        { success: false, message: 'Parameter ID kategori tidak valid' },
        { status: 400 }
      );
    }

    // 2. Query Detail Kategori dari Database MySQL
    const rows = await query<CategoryRow[]>(
      `SELECT 
        c.id,
        c.name,
        c.slug,
        c.icon_url,
        c.description,
        c.is_active,
        c.created_at,
        c.updated_at,
        (SELECT COUNT(*) FROM services s WHERE s.category_id = c.id AND s.deleted_at IS NULL) AS service_count,
        (SELECT COUNT(*) FROM technician_specializations ts WHERE ts.category_id = c.id) AS technician_count
      FROM appliance_categories c
      WHERE c.id = ? AND c.deleted_at IS NULL
      LIMIT 1`,
      [categoryId]
    );

    if (!rows || rows.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Kategori peralatan tidak ditemukan' },
        { status: 404 }
      );
    }

    const category = rows[0];
    return NextResponse.json(
      {
        success: true,
        data: {
          ...category,
          is_active: Boolean(category.is_active),
          service_count: Number(category.service_count || 0),
          technician_count: Number(category.technician_count || 0),
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[GET /api/admin/categories/[id] Error]:', error.message || error);
    return NextResponse.json(
      { success: false, message: 'Terjadi kegagalan sistem saat memuat detail kategori' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/categories/[id]
 * Memperbarui field kategori peralatan (nama, slug, icon, deskripsi, status aktif).
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
    const categoryId = parseInt(rawId, 10);

    if (isNaN(categoryId) || categoryId <= 0) {
      return NextResponse.json(
        { success: false, message: 'Parameter ID kategori tidak valid' },
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

    const validation = updateCategorySchema.safeParse(body);
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

    // 3. Ambil Snapshot Kategori Saat Ini
    const existingRows = await query<CategoryRow[]>(
      'SELECT id, name, slug, icon_url, description, is_active FROM appliance_categories WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      [categoryId]
    );

    if (!existingRows || existingRows.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Kategori tidak ditemukan atau telah dihapus' },
        { status: 404 }
      );
    }

    const current = existingRows[0];

    // 4. Periksa Konflik Unik (Nama atau Slug terhadap baris kategori lain)
    if (updateData.name || updateData.slug) {
      const checkName = updateData.name || current.name;
      const checkSlug = updateData.slug || current.slug;

      const conflicts = await query<CategoryRow[]>(
        'SELECT id, name, slug FROM appliance_categories WHERE (name = ? OR slug = ?) AND id != ? AND deleted_at IS NULL LIMIT 1',
        [checkName, checkSlug, categoryId]
      );

      if (conflicts && conflicts.length > 0) {
        return NextResponse.json(
          { success: false, message: 'Nama atau slug kategori sudah digunakan oleh kategori lain' },
          { status: 409 }
        );
      }
    }

    // 5. Susun Query Pembaruan Dinamis
    const updateClauses: string[] = [];
    const queryParams: any[] = [];

    if (updateData.name !== undefined) {
      updateClauses.push('name = ?');
      queryParams.push(updateData.name);
    }
    if (updateData.slug !== undefined) {
      updateClauses.push('slug = ?');
      queryParams.push(updateData.slug);
    }
    if (updateData.icon_url !== undefined) {
      updateClauses.push('icon_url = ?');
      queryParams.push(updateData.icon_url || null);
    }
    if (updateData.description !== undefined) {
      updateClauses.push('description = ?');
      queryParams.push(updateData.description || null);
    }
    if (updateData.is_active !== undefined) {
      updateClauses.push('is_active = ?');
      queryParams.push(updateData.is_active ? 1 : 0);
    }

    queryParams.push(categoryId);

    await query(
      `UPDATE appliance_categories SET ${updateClauses.join(', ')} WHERE id = ?`,
      queryParams
    );

    // 6. Catat Aksi ke Audit Log Administrator
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      '127.0.0.1';
    const userAgent = request.headers.get('user-agent') || 'Unknown';

    await recordAdminAudit({
      adminUserId: session.userId,
      action: updateData.is_active !== undefined && Object.keys(updateData).length === 1
        ? 'TOGGLE_CATEGORY_STATUS'
        : 'UPDATE_CATEGORY',
      entityName: 'appliance_categories',
      entityId: categoryId,
      oldValues: {
        name: current.name,
        slug: current.slug,
        icon_url: current.icon_url,
        description: current.description,
        is_active: Boolean(current.is_active),
      },
      newValues: {
        name: updateData.name ?? current.name,
        slug: updateData.slug ?? current.slug,
        icon_url: updateData.icon_url !== undefined ? updateData.icon_url : current.icon_url,
        description: updateData.description !== undefined ? updateData.description : current.description,
        is_active: updateData.is_active !== undefined ? updateData.is_active : Boolean(current.is_active),
      },
      ipAddress: ip,
      userAgent,
    });

    // 7. Ambil Data Hasil Pembaruan
    const updatedRows = await query<CategoryRow[]>(
      `SELECT 
        c.id, c.name, c.slug, c.icon_url, c.description, c.is_active, c.created_at, c.updated_at,
        (SELECT COUNT(*) FROM services s WHERE s.category_id = c.id AND s.deleted_at IS NULL) AS service_count,
        (SELECT COUNT(*) FROM technician_specializations ts WHERE ts.category_id = c.id) AS technician_count
       FROM appliance_categories c 
       WHERE c.id = ? LIMIT 1`,
      [categoryId]
    );

    const updated = updatedRows[0];
    return NextResponse.json(
      {
        success: true,
        message: 'Kategori peralatan berhasil diperbarui',
        data: {
          ...updated,
          is_active: Boolean(updated.is_active),
          service_count: Number(updated.service_count || 0),
          technician_count: Number(updated.technician_count || 0),
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[PATCH /api/admin/categories/[id] Error]:', error.message || error);
    return NextResponse.json(
      { success: false, message: 'Terjadi kegagalan sistem saat memperbarui kategori' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/categories/[id]
 * Menghapus kategori atau menonaktifkannya jika masih terikat data relasi (foreign key integrity).
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
    const categoryId = parseInt(rawId, 10);

    if (isNaN(categoryId) || categoryId <= 0) {
      return NextResponse.json(
        { success: false, message: 'Parameter ID kategori tidak valid' },
        { status: 400 }
      );
    }

    // 2. Periksa Keberadaan Kategori
    const existing = await query<CategoryRow[]>(
      'SELECT id, name, slug, is_active FROM appliance_categories WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      [categoryId]
    );

    if (!existing || existing.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Kategori tidak ditemukan atau telah dihapus' },
        { status: 404 }
      );
    }

    const current = existing[0];

    // 3. Periksa Relasi Foreign Key di Seluruh Tabel Terkait
    const [serviceCountResult]: any = await query(
      'SELECT COUNT(*) as count FROM services WHERE category_id = ? AND deleted_at IS NULL',
      [categoryId]
    );
    const [repairCountResult]: any = await query(
      'SELECT COUNT(*) as count FROM repair_requests WHERE category_id = ? AND deleted_at IS NULL',
      [categoryId]
    );
    const [techSpecCountResult]: any = await query(
      'SELECT COUNT(*) as count FROM technician_specializations WHERE category_id = ?',
      [categoryId]
    );

    const serviceCount = Number(serviceCountResult?.count || 0);
    const repairCount = Number(repairCountResult?.count || 0);
    const techSpecCount = Number(techSpecCountResult?.count || 0);
    const totalRelations = serviceCount + repairCount + techSpecCount;

    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode'); // 'deactivate' jika admin memilih opsi nonaktifkan

    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      '127.0.0.1';
    const userAgent = request.headers.get('user-agent') || 'Unknown';

    // 4. Jika Kategori Masih Digunakan dan Mode Deactivate Dipilih: Nonaktifkan Status
    if (mode === 'deactivate') {
      await query(
        'UPDATE appliance_categories SET is_active = 0 WHERE id = ?',
        [categoryId]
      );

      await recordAdminAudit({
        adminUserId: session.userId,
        action: 'DEACTIVATE_CATEGORY',
        entityName: 'appliance_categories',
        entityId: categoryId,
        oldValues: { is_active: Boolean(current.is_active) },
        newValues: { is_active: false },
        ipAddress: ip,
        userAgent,
      });

      return NextResponse.json(
        {
          success: true,
          message: `Kategori "${current.name}" berhasil dinonaktifkan untuk menjaga integritas data riwayat.`,
          action: 'deactivated',
        },
        { status: 200 }
      );
    }

    // 5. Jika Masih Digunakan dan Tidak Memilih Deactivate: Tolak Penghapusan Fisik
    if (totalRelations > 0) {
      const details: string[] = [];
      if (serviceCount > 0) details.push(`${serviceCount} layanan katalog`);
      if (repairCount > 0) details.push(`${repairCount} transaksi pesanan perbaikan`);
      if (techSpecCount > 0) details.push(`${techSpecCount} sertifikasi spesialisasi teknisi`);

      return NextResponse.json(
        {
          success: false,
          inUse: true,
          canDeactivate: true,
          message: `Kategori "${current.name}" tidak dapat dihapus permanen karena masih terhubung dengan ${details.join(', ')}. Disarankan untuk menonaktifkan kategori agar tidak merusak integritas relasi data.`,
          usage: {
            services: serviceCount,
            repairs: repairCount,
            technicians: techSpecCount,
          },
        },
        { status: 400 }
      );
    }

    // 6. Jika Benar-Benar Bersih Tanpa Relasi Anak: Lakukan Penghapusan
    await query(
      'DELETE FROM appliance_categories WHERE id = ?',
      [categoryId]
    );

    await recordAdminAudit({
      adminUserId: session.userId,
      action: 'DELETE_CATEGORY',
      entityName: 'appliance_categories',
      entityId: categoryId,
      oldValues: {
        id: current.id,
        name: current.name,
        slug: current.slug,
      },
      newValues: null,
      ipAddress: ip,
      userAgent,
    });

    return NextResponse.json(
      {
        success: true,
        message: `Kategori "${current.name}" berhasil dihapus permanen dari sistem.`,
        action: 'deleted',
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[DELETE /api/admin/categories/[id] Error]:', error.message || error);
    return NextResponse.json(
      { success: false, message: 'Terjadi kegagalan sistem saat memproses penghapusan kategori' },
      { status: 500 }
    );
  }
}
