import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { createServiceSchema, generateServiceSlug } from '@/lib/validations/service';
import { recordAdminAudit } from '@/lib/audit';

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
 * GET /api/admin/services
 * Mengambil katalog layanan perbaikan dengan JOIN kategori, filter pencarian, filter kategori, filter status, dan pagination.
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Verifikasi Autentikasi dan Peran Admin di Server
    const session = await getAdminSession();
    if (!session || session.role !== 'admin') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: sesi administrator tidak valid atau telah berakhir' },
        { status: 401 }
      );
    }

    // 2. Parse Parameter Query
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.trim() || '';
    const categoryIdParam = searchParams.get('category_id')?.trim();
    const status = searchParams.get('status') || 'all'; // 'all' | 'active' | 'inactive'
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '10', 10)));
    const offset = (page - 1) * limit;

    // 3. Bangun Klausa WHERE Dinamis Menggunakan Prepared Statement
    const whereConditions: string[] = ['s.deleted_at IS NULL'];
    const queryParams: any[] = [];

    if (search) {
      whereConditions.push(
        '(s.name LIKE ? OR s.slug LIKE ? OR s.description LIKE ? OR c.name LIKE ?)'
      );
      const searchWildcard = `%${search}%`;
      queryParams.push(searchWildcard, searchWildcard, searchWildcard, searchWildcard);
    }

    if (categoryIdParam && categoryIdParam !== 'all') {
      const categoryId = parseInt(categoryIdParam, 10);
      if (!isNaN(categoryId) && categoryId > 0) {
        whereConditions.push('s.category_id = ?');
        queryParams.push(categoryId);
      }
    }

    if (status === 'active') {
      whereConditions.push('s.is_active = 1');
    } else if (status === 'inactive') {
      whereConditions.push('s.is_active = 0');
    }

    const whereClause = whereConditions.join(' AND ');

    // 4. Hitung Total Data untuk Metadata Pagination
    const countSql = `
      SELECT COUNT(*) as total 
      FROM services s 
      JOIN appliance_categories c ON c.id = s.category_id
      WHERE ${whereClause}
    `;
    const countResult = await query<{ total: number }[]>(countSql, queryParams);
    const total = Number(countResult[0]?.total || 0);
    const totalPages = Math.ceil(total / limit) || 1;

    // 5. Query Data Layanan beserta Informasi Kategori dan Agregasi Pesanan
    const dataSql = `
      SELECT 
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
      WHERE ${whereClause}
      ORDER BY s.id ASC
      LIMIT ? OFFSET ?
    `;

    const dataParams = [...queryParams, limit, offset];
    const rows = await query<ServiceRow[]>(dataSql, dataParams);

    // Format nilai output (boolean, number tarif, integer repair_count)
    const formattedServices = rows.map((srv) => ({
      ...srv,
      base_price: Number(srv.base_price) || 0,
      estimated_duration_min: Number(srv.estimated_duration_min) || 60,
      is_active: Boolean(srv.is_active),
      repair_count: Number(srv.repair_count || 0),
    }));

    return NextResponse.json(
      {
        success: true,
        data: formattedServices,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[GET /api/admin/services Error]:', error.message || error);
    return NextResponse.json(
      { success: false, message: 'Terjadi kegagalan sistem saat mengambil data layanan' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/services
 * Menambahkan paket layanan perbaikan baru ke dalam database MySQL.
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Verifikasi Autentikasi dan Peran Admin di Server
    const session = await getAdminSession();
    if (!session || session.role !== 'admin') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: sesi administrator tidak valid atau telah berakhir' },
        { status: 401 }
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

    const validation = createServiceSchema.safeParse(body);
    if (!validation.success) {
      const firstError = validation.error.issues[0]?.message || 'Input data layanan tidak valid';
      return NextResponse.json(
        { success: false, message: firstError },
        { status: 400 }
      );
    }

    const {
      category_id,
      name,
      description,
      base_price,
      estimated_duration_min,
      is_active,
    } = validation.data;

    const slug = validation.data.slug?.trim()
      ? validation.data.slug.trim()
      : generateServiceSlug(name);

    if (!slug) {
      return NextResponse.json(
        { success: false, message: 'Slug tidak dapat dibuat dari nama yang diberikan' },
        { status: 400 }
      );
    }

    // 3. Pastikan Kategori yang Dipilih Benar-benar Ada di Database
    const categoryRows = await query<CategoryCheckRow[]>(
      'SELECT id, name FROM appliance_categories WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      [category_id]
    );

    if (!categoryRows || categoryRows.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Kategori peralatan yang dipilih tidak ditemukan atau telah dihapus' },
        { status: 404 }
      );
    }

    const targetCategory = categoryRows[0];

    // 4. Periksa Konflik Unik (Nama atau Slug terhadap data layanan aktif)
    const existing = await query<ServiceRow[]>(
      'SELECT id, name, slug FROM services WHERE (name = ? OR slug = ?) AND deleted_at IS NULL LIMIT 1',
      [name, slug]
    );

    if (existing && existing.length > 0) {
      const duplicateField = existing[0].name.toLowerCase() === name.toLowerCase() ? 'Nama' : 'Slug';
      return NextResponse.json(
        {
          success: false,
          message: `${duplicateField} layanan sudah digunakan. Gunakan nama atau slug yang berbeda.`,
        },
        { status: 409 }
      );
    }

    // 5. Eksekusi Penambahan Layanan Baru
    const insertResult: any = await query(
      `INSERT INTO services (category_id, name, slug, description, base_price, estimated_duration_min, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        category_id,
        name,
        slug,
        description || null,
        base_price,
        estimated_duration_min,
        is_active ? 1 : 0,
      ]
    );

    const newServiceId = insertResult.insertId;

    // 6. Catat Aksi ke Audit Log Administrator
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      '127.0.0.1';
    const userAgent = request.headers.get('user-agent') || 'Unknown';

    await recordAdminAudit({
      adminUserId: session.userId,
      action: 'CREATE_SERVICE',
      entityName: 'services',
      entityId: newServiceId,
      newValues: {
        id: newServiceId,
        category_id,
        category_name: targetCategory.name,
        name,
        slug,
        description,
        base_price,
        estimated_duration_min,
        is_active,
      },
      ipAddress: ip,
      userAgent,
    });

    // 7. Ambil Data Layanan Baru yang Berhasil Dibuat
    const created = await query<ServiceRow[]>(
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
        s.updated_at
      FROM services s
      JOIN appliance_categories c ON c.id = s.category_id
      WHERE s.id = ?`,
      [newServiceId]
    );

    const serviceData = created[0];
    return NextResponse.json(
      {
        success: true,
        message: 'Layanan baru berhasil ditambahkan',
        data: {
          ...serviceData,
          base_price: Number(serviceData.base_price) || 0,
          estimated_duration_min: Number(serviceData.estimated_duration_min) || 60,
          is_active: Boolean(serviceData.is_active),
          repair_count: 0,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('[POST /api/admin/services Error]:', error.message || error);
    return NextResponse.json(
      { success: false, message: 'Terjadi kegagalan sistem saat menyimpan layanan baru' },
      { status: 500 }
    );
  }
}
