import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { query } from '@/lib/db';

interface TechnicianListRow {
  id: number; // technician_profile_id
  user_id: number;
  user_uuid: string;
  email: string;
  phone_number: string;
  account_status: string;
  is_verified: number | boolean;
  full_name: string;
  avatar_url: string | null;
  bio: string | null;
  years_of_experience: number;
  rating_avg: number | string;
  rating_count: number;
  is_available: number | boolean;
  verified_status: string;
  rejection_reason: string | null;
  verified_by_admin_id: number | null;
  verified_at: string | null;
  current_latitude: number | string | null;
  current_longitude: number | string | null;
  created_at: string;
  updated_at: string;
  total_documents?: number;
  approved_documents?: number;
  pending_documents?: number;
  specialization_names?: string;
  specialization_ids?: string;
  total_assignments?: number;
}

/**
 * GET /api/admin/technicians
 * Mengambil daftar teknisi dengan filter pencarian (nama, email, no HP), filter status akun,
 * filter status verifikasi, filter kategori spesialisasi, dan pagination.
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
    const statusParam = searchParams.get('status')?.trim() || 'all'; // users.status
    const verifiedStatusParam = searchParams.get('verified_status')?.trim() || 'all'; // technician_profiles.verified_status
    const categoryIdParam = searchParams.get('category_id')?.trim();
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '10', 10)));
    const offset = (page - 1) * limit;

    // 3. Bangun Klausa WHERE Dinamis
    const whereConditions: string[] = ['u.role = ?', 'u.deleted_at IS NULL'];
    const queryParams: any[] = ['technician'];

    // Pencarian berdasarkan nama, email, atau nomor telepon
    if (search) {
      whereConditions.push(
        '(tp.full_name LIKE ? OR u.email LIKE ? OR u.phone_number LIKE ?)'
      );
      const wildcard = `%${search}%`;
      queryParams.push(wildcard, wildcard, wildcard);
    }

    // Filter status akun (users.status)
    const validAccountStatuses = ['active', 'inactive', 'suspended', 'pending_verification'];
    if (statusParam !== 'all' && validAccountStatuses.includes(statusParam)) {
      whereConditions.push('u.status = ?');
      queryParams.push(statusParam);
    }

    // Filter status verifikasi profil (technician_profiles.verified_status)
    const validVerifiedStatuses = ['pending', 'verified', 'rejected', 'suspended'];
    if (verifiedStatusParam !== 'all' && validVerifiedStatuses.includes(verifiedStatusParam)) {
      whereConditions.push('tp.verified_status = ?');
      queryParams.push(verifiedStatusParam);
    }

    // Filter spesialisasi kategori
    if (categoryIdParam && categoryIdParam !== 'all') {
      const categoryId = parseInt(categoryIdParam, 10);
      if (!isNaN(categoryId) && categoryId > 0) {
        whereConditions.push(
          'EXISTS (SELECT 1 FROM technician_specializations ts WHERE ts.technician_profile_id = tp.id AND ts.category_id = ?)'
        );
        queryParams.push(categoryId);
      }
    }

    const whereClause = whereConditions.join(' AND ');

    // 4. Hitung Total Data untuk Pagination
    const countSql = `
      SELECT COUNT(DISTINCT tp.id) as total
      FROM technician_profiles tp
      JOIN users u ON u.id = tp.user_id
      WHERE ${whereClause}
    `;
    const countResult = await query<{ total: number }[]>(countSql, queryParams);
    const total = Number(countResult[0]?.total || 0);
    const totalPages = Math.ceil(total / limit) || 1;

    // 5. Query Data Teknisi beserta Agregasi Dokumen & Spesialisasi
    const dataSql = `
      SELECT 
        tp.id,
        tp.user_id,
        u.uuid AS user_uuid,
        u.email,
        u.phone_number,
        u.status AS account_status,
        u.is_verified,
        tp.full_name,
        tp.avatar_url,
        tp.bio,
        tp.years_of_experience,
        tp.rating_avg,
        tp.rating_count,
        tp.is_available,
        tp.verified_status,
        tp.rejection_reason,
        tp.verified_by_admin_id,
        tp.verified_at,
        tp.current_latitude,
        tp.current_longitude,
        tp.created_at,
        tp.updated_at,
        (SELECT COUNT(*) FROM technician_documents td WHERE td.technician_profile_id = tp.id) AS total_documents,
        (SELECT COUNT(*) FROM technician_documents td WHERE td.technician_profile_id = tp.id AND td.verification_status = 'approved') AS approved_documents,
        (SELECT COUNT(*) FROM technician_documents td WHERE td.technician_profile_id = tp.id AND td.verification_status = 'pending') AS pending_documents,
        (SELECT GROUP_CONCAT(ac.name ORDER BY ac.name SEPARATOR ', ')
         FROM technician_specializations ts
         JOIN appliance_categories ac ON ac.id = ts.category_id
         WHERE ts.technician_profile_id = tp.id) AS specialization_names,
        (SELECT GROUP_CONCAT(ts.category_id ORDER BY ts.category_id SEPARATOR ',')
         FROM technician_specializations ts
         WHERE ts.technician_profile_id = tp.id) AS specialization_ids,
        (SELECT COUNT(*) FROM technician_assignments ta WHERE ta.technician_id = u.id) AS total_assignments
      FROM technician_profiles tp
      JOIN users u ON u.id = tp.user_id
      WHERE ${whereClause}
      ORDER BY tp.id DESC
      LIMIT ? OFFSET ?
    `;

    const dataParams = [...queryParams, limit, offset];
    const rows = await query<TechnicianListRow[]>(dataSql, dataParams);

    // Format output aman tanpa password hash atau kredensial internal
    const formattedTechnicians = rows.map((tech) => {
      const specIds = tech.specialization_ids
        ? tech.specialization_ids.split(',').map((id) => parseInt(id, 10)).filter((id) => !isNaN(id))
        : [];
      const specNames = tech.specialization_names
        ? tech.specialization_names.split(', ')
        : [];

      return {
        id: tech.id,
        user_id: tech.user_id,
        user_uuid: tech.user_uuid,
        email: tech.email,
        phone_number: tech.phone_number,
        account_status: tech.account_status,
        is_verified: Boolean(tech.is_verified),
        full_name: tech.full_name,
        avatar_url: tech.avatar_url,
        bio: tech.bio,
        years_of_experience: Number(tech.years_of_experience) || 0,
        rating_avg: Number(tech.rating_avg) || 0,
        rating_count: Number(tech.rating_count) || 0,
        is_available: Boolean(tech.is_available),
        verified_status: tech.verified_status,
        rejection_reason: tech.rejection_reason,
        verified_by_admin_id: tech.verified_by_admin_id,
        verified_at: tech.verified_at,
        current_latitude: tech.current_latitude !== null ? Number(tech.current_latitude) : null,
        current_longitude: tech.current_longitude !== null ? Number(tech.current_longitude) : null,
        created_at: tech.created_at,
        updated_at: tech.updated_at,
        total_documents: Number(tech.total_documents || 0),
        approved_documents: Number(tech.approved_documents || 0),
        pending_documents: Number(tech.pending_documents || 0),
        specializations: specIds.map((id, index) => ({
          category_id: id,
          category_name: specNames[index] || `Kategori #${id}`,
        })),
        total_assignments: Number(tech.total_assignments || 0),
      };
    });

    return NextResponse.json(
      {
        success: true,
        data: formattedTechnicians,
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
    console.error('[GET /api/admin/technicians Error]:', error.message || error);
    return NextResponse.json(
      { success: false, message: 'Terjadi kesalahan sistem saat mengambil data teknisi' },
      { status: 500 }
    );
  }
}
