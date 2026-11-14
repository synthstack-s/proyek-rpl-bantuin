import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { getAdminProfile } from '@/lib/admin-profile';

interface UserRow {
  id: number;
  uuid: string;
  email: string;
  phone_number: string;
  role: 'admin' | 'customer' | 'technician';
  status: 'active' | 'inactive' | 'suspended' | 'pending_verification';
  is_verified: number | boolean;
  created_at: string;
  updated_at: string;
  customer_profile_id: number | null;
  customer_name: string | null;
  customer_avatar: string | null;
  customer_address: string | null;
  customer_city: string | null;
  customer_postal_code: string | null;
  technician_profile_id: number | null;
  technician_name: string | null;
  technician_avatar: string | null;
  technician_verified_status: string | null;
  customer_orders_count: number;
  tech_assignments_count: number;
}

/**
 * GET /api/admin/users
 * Mengambil daftar pengguna sistem multi-role (customer, technician, admin)
 * dengan filter pencarian, filter role, filter status, dan pagination.
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Verifikasi Autentikasi dan Otorisasi Administrator
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
    const roleParam = searchParams.get('role')?.trim() || 'all';
    const statusParam = searchParams.get('status')?.trim() || 'all';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '10', 10)));
    const offset = (page - 1) * limit;

    // 3. Bangun Klausa WHERE Dinamis Menggunakan Parameterized Statement
    const whereConditions: string[] = ['u.deleted_at IS NULL'];
    const queryParams: any[] = [];

    // Filter Pencarian (Nama Lengkap, Email, atau Nomor Telepon)
    if (search) {
      whereConditions.push(
        '(u.email LIKE ? OR u.phone_number LIKE ? OR cp.full_name LIKE ? OR tp.full_name LIKE ?)'
      );
      const wildcard = `%${search}%`;
      queryParams.push(wildcard, wildcard, wildcard, wildcard);
    }

    // Filter Role (admin, customer, technician)
    const validRoles = ['admin', 'customer', 'technician'];
    if (roleParam !== 'all' && validRoles.includes(roleParam)) {
      whereConditions.push('u.role = ?');
      queryParams.push(roleParam);
    }

    // Filter Status Akun (active, inactive, suspended, pending_verification)
    const validStatuses = ['active', 'inactive', 'suspended', 'pending_verification'];
    if (statusParam !== 'all' && validStatuses.includes(statusParam)) {
      whereConditions.push('u.status = ?');
      queryParams.push(statusParam);
    }

    const whereClause = whereConditions.join(' AND ');

    // 4. Hitung Total Data untuk Pagination
    const countSql = `
      SELECT COUNT(DISTINCT u.id) as total
      FROM users u
      LEFT JOIN customer_profiles cp ON cp.user_id = u.id
      LEFT JOIN technician_profiles tp ON tp.user_id = u.id
      WHERE ${whereClause}
    `;
    const countResult = await query<{ total: number }[]>(countSql, queryParams);
    const total = Number(countResult[0]?.total || 0);
    const totalPages = Math.ceil(total / limit) || 1;

    // 5. Query Data Pengguna beserta Informasi Profil Terkait
    const dataSql = `
      SELECT 
        u.id,
        u.uuid,
        u.email,
        u.phone_number,
        u.role,
        u.status,
        u.is_verified,
        u.created_at,
        u.updated_at,
        cp.id AS customer_profile_id,
        cp.full_name AS customer_name,
        cp.avatar_url AS customer_avatar,
        cp.default_address AS customer_address,
        cp.city AS customer_city,
        cp.postal_code AS customer_postal_code,
        tp.id AS technician_profile_id,
        tp.full_name AS technician_name,
        tp.avatar_url AS technician_avatar,
        tp.verified_status AS technician_verified_status,
        (SELECT COUNT(*) FROM repair_requests rr WHERE rr.customer_id = u.id AND rr.deleted_at IS NULL) AS customer_orders_count,
        (SELECT COUNT(*) FROM technician_assignments ta WHERE ta.technician_id = u.id) AS tech_assignments_count
      FROM users u
      LEFT JOIN customer_profiles cp ON cp.user_id = u.id
      LEFT JOIN technician_profiles tp ON tp.user_id = u.id
      WHERE ${whereClause}
      ORDER BY u.id DESC
      LIMIT ? OFFSET ?
    `;

    const dataParams = [...queryParams, limit, offset];
    const rows = await query<UserRow[]>(dataSql, dataParams);

    // Ambil profil admin untuk setiap akun admin yang muncul pada halaman ini
    const adminIds = rows.filter((u) => u.role === 'admin').map((u) => u.id);
    const adminProfilesMap: Record<number, string> = {};
    for (const aId of adminIds) {
      const ap = await getAdminProfile(aId);
      if (ap?.full_name) adminProfilesMap[aId] = ap.full_name;
    }

    // 6. Format Respon Aman (Tanpa password_hash atau rahasia autentikasi)
    const formattedUsers = rows.map((user) => {
      // Resolusi nama tampilan sesuai peran
      let displayName = 'Pengguna BANTUIN';
      let avatarUrl = null;

      if (user.role === 'customer' && user.customer_name) {
        displayName = user.customer_name;
        avatarUrl = user.customer_avatar;
      } else if (user.role === 'technician' && user.technician_name) {
        displayName = user.technician_name;
        avatarUrl = user.technician_avatar;
      } else if (user.role === 'admin') {
        displayName = adminProfilesMap[user.id] || 'Administrator Sistem';
      }

      return {
        id: user.id,
        uuid: user.uuid,
        email: user.email,
        phone_number: user.phone_number,
        role: user.role,
        status: user.status,
        is_verified: Boolean(user.is_verified),
        created_at: user.created_at,
        updated_at: user.updated_at,
        name: displayName,
        avatar_url: avatarUrl,
        customer_profile: user.customer_profile_id
          ? {
              id: user.customer_profile_id,
              full_name: user.customer_name,
              default_address: user.customer_address,
              city: user.customer_city,
              postal_code: user.customer_postal_code,
              orders_count: Number(user.customer_orders_count || 0),
            }
          : null,
        technician_profile: user.technician_profile_id
          ? {
              id: user.technician_profile_id,
              full_name: user.technician_name,
              verified_status: user.technician_verified_status,
              assignments_count: Number(user.tech_assignments_count || 0),
            }
          : null,
      };
    });

    return NextResponse.json(
      {
        success: true,
        data: formattedUsers,
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
    console.error('[GET /api/admin/users Error]:', error.message || error);
    return NextResponse.json(
      { success: false, message: 'Terjadi kesalahan sistem saat mengambil data pengguna' },
      { status: 500 }
    );
  }
}
