import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { createCategorySchema, generateSlug } from '@/lib/validations/category';
import { recordAdminAudit } from '@/lib/audit';

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
 * GET /api/admin/categories
 * Mengambil daftar kategori dengan fitur pencarian, filter status, dan pagination.
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
    const status = searchParams.get('status') || 'all'; // 'all' | 'active' | 'inactive'
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '10', 10)));
    const offset = (page - 1) * limit;

    // 3. Bangun Klausa WHERE Dinamis Menggunakan Prepared Statement
    const whereConditions: string[] = ['c.deleted_at IS NULL'];
    const queryParams: any[] = [];

    if (search) {
      whereConditions.push('(c.name LIKE ? OR c.description LIKE ? OR c.slug LIKE ?)');
      const searchWildcard = `%${search}%`;
      queryParams.push(searchWildcard, searchWildcard, searchWildcard);
    }

    if (status === 'active') {
      whereConditions.push('c.is_active = 1');
    } else if (status === 'inactive') {
      whereConditions.push('c.is_active = 0');
    }

    const whereClause = whereConditions.join(' AND ');

    // 4. Hitung Total Data untuk Metadata Pagination
    const countSql = `SELECT COUNT(*) as total FROM appliance_categories c WHERE ${whereClause}`;
    const countResult = await query<{ total: number }[]>(countSql, queryParams);
    const total = Number(countResult[0]?.total || 0);
    const totalPages = Math.ceil(total / limit) || 1;

    // 5. Query Daftar Data Kategori beserta Agregasi Layanan Terkait
    const dataSql = `
      SELECT 
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
      WHERE ${whereClause}
      ORDER BY c.id ASC
      LIMIT ? OFFSET ?
    `;

    const dataParams = [...queryParams, limit, offset];
    const rows = await query<CategoryRow[]>(dataSql, dataParams);

    // Format nilai boolean is_active
    const formattedCategories = rows.map((cat) => ({
      ...cat,
      is_active: Boolean(cat.is_active),
      service_count: Number(cat.service_count || 0),
      technician_count: Number(cat.technician_count || 0),
    }));

    return NextResponse.json(
      {
        success: true,
        data: formattedCategories,
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
    console.error('[GET /api/admin/categories Error]:', error.message || error);
    return NextResponse.json(
      { success: false, message: 'Terjadi kegagalan sistem saat mengambil data kategori' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/categories
 * Menambahkan kategori peralatan baru ke dalam database MySQL.
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

    const validation = createCategorySchema.safeParse(body);
    if (!validation.success) {
      const firstError = validation.error.issues[0]?.message || 'Input data kategori tidak valid';
      return NextResponse.json(
        { success: false, message: firstError },
        { status: 400 }
      );
    }

    const { name, icon_url, description, is_active } = validation.data;
    const slug = validation.data.slug?.trim() ? validation.data.slug.trim() : generateSlug(name);

    if (!slug) {
      return NextResponse.json(
        { success: false, message: 'Slug tidak dapat dibuat dari nama yang diberikan' },
        { status: 400 }
      );
    }

    // 3. Periksa Duplikasi Nama atau Slug di Database
    const existing = await query<CategoryRow[]>(
      'SELECT id, name, slug FROM appliance_categories WHERE (name = ? OR slug = ?) AND deleted_at IS NULL LIMIT 1',
      [name, slug]
    );

    if (existing && existing.length > 0) {
      const duplicateField = existing[0].name.toLowerCase() === name.toLowerCase() ? 'Nama' : 'Slug';
      return NextResponse.json(
        { success: false, message: `${duplicateField} kategori sudah digunakan. Gunakan nama atau slug yang berbeda.` },
        { status: 409 }
      );
    }

    // 4. Eksekusi Penambahan Kategori
    const insertResult: any = await query(
      `INSERT INTO appliance_categories (name, slug, icon_url, description, is_active)
       VALUES (?, ?, ?, ?, ?)`,
      [name, slug, icon_url || null, description || null, is_active ? 1 : 0]
    );

    const newCategoryId = insertResult.insertId;

    // 5. Catat Aksi ke Audit Log Administrator
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      '127.0.0.1';
    const userAgent = request.headers.get('user-agent') || 'Unknown';

    await recordAdminAudit({
      adminUserId: session.userId,
      action: 'CREATE_CATEGORY',
      entityName: 'appliance_categories',
      entityId: newCategoryId,
      newValues: {
        id: newCategoryId,
        name,
        slug,
        icon_url,
        description,
        is_active,
      },
      ipAddress: ip,
      userAgent,
    });

    // 6. Ambil Data Kategori Baru yang Berhasil Dibuat
    const created = await query<CategoryRow[]>(
      'SELECT id, name, slug, icon_url, description, is_active, created_at, updated_at FROM appliance_categories WHERE id = ?',
      [newCategoryId]
    );

    const categoryData = created[0];
    return NextResponse.json(
      {
        success: true,
        message: 'Kategori peralatan baru berhasil ditambahkan',
        data: {
          ...categoryData,
          is_active: Boolean(categoryData.is_active),
          service_count: 0,
          technician_count: 0,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('[POST /api/admin/categories Error]:', error.message || error);
    return NextResponse.json(
      { success: false, message: 'Terjadi kegagalan sistem saat menyimpan kategori baru' },
      { status: 500 }
    );
  }
}
