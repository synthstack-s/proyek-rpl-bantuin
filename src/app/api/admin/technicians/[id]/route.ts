import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { pool, query } from '@/lib/db';
import { updateTechnicianSchema } from '@/lib/validations/technician';
import { recordAdminAudit } from '@/lib/audit';

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface TechProfileRow {
  id: number;
  user_id: number;
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
  // User fields
  user_uuid: string;
  email: string;
  phone_number: string;
  account_status: string;
  is_verified: number | boolean;
  user_created_at: string;
  verifier_email?: string | null;
}

interface DocumentRow {
  id: number;
  technician_profile_id: number;
  document_type: string;
  document_title: string;
  file_name: string;
  file_path: string;
  file_size_bytes: number | null;
  file_mime_type: string | null;
  issuing_organization: string | null;
  document_number: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  verification_status: string;
  admin_notes: string | null;
  verified_by_admin_id: number | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
  verifier_email?: string | null;
}

interface SpecializationRow {
  id: number;
  technician_profile_id: number;
  category_id: number;
  category_name: string;
  category_slug: string;
  category_icon_url: string | null;
  supporting_document_id: number | null;
  supporting_document_title: string | null;
  created_at: string;
}

/**
 * GET /api/admin/technicians/[id]
 * Mengambil detail lengkap teknisi meliputi data akun, profil, dokumen pendukung,
 * daftar spesialisasi perbaikan, serta metrik riwayat penugasan.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    // 1. Verifikasi Autentikasi Admin
    const session = await getAdminSession();
    if (!session || session.role !== 'admin') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: sesi administrator tidak valid atau telah berakhir' },
        { status: 401 }
      );
    }

    const { id: rawId } = await params;
    const technicianProfileId = parseInt(rawId, 10);

    if (isNaN(technicianProfileId) || technicianProfileId <= 0) {
      return NextResponse.json(
        { success: false, message: 'Parameter ID teknisi tidak valid' },
        { status: 400 }
      );
    }

    // 2. Query Data Profil dan Akun Teknisi
    const profileRows = await query<TechProfileRow[]>(
      `SELECT 
        tp.id,
        tp.user_id,
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
        u.uuid AS user_uuid,
        u.email,
        u.phone_number,
        u.status AS account_status,
        u.is_verified,
        u.created_at AS user_created_at,
        v.email AS verifier_email
      FROM technician_profiles tp
      JOIN users u ON u.id = tp.user_id
      LEFT JOIN users v ON v.id = tp.verified_by_admin_id
      WHERE tp.id = ? AND u.role = 'technician' AND u.deleted_at IS NULL
      LIMIT 1`,
      [technicianProfileId]
    );

    if (!profileRows || profileRows.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Data teknisi tidak ditemukan atau telah dihapus' },
        { status: 404 }
      );
    }

    const profile = profileRows[0];

    // 3. Query Dokumen Terkait Teknisi
    const documents = await query<DocumentRow[]>(
      `SELECT 
        td.id,
        td.technician_profile_id,
        td.document_type,
        td.document_title,
        td.file_name,
        td.file_path,
        td.file_size_bytes,
        td.file_mime_type,
        td.issuing_organization,
        td.document_number,
        td.issue_date,
        td.expiry_date,
        td.verification_status,
        td.admin_notes,
        td.verified_by_admin_id,
        td.verified_at,
        td.created_at,
        td.updated_at,
        v.email AS verifier_email
      FROM technician_documents td
      LEFT JOIN users v ON v.id = td.verified_by_admin_id
      WHERE td.technician_profile_id = ?
      ORDER BY td.created_at DESC`,
      [technicianProfileId]
    );

    // 4. Query Spesialisasi Kategori Peralatan
    const specializations = await query<SpecializationRow[]>(
      `SELECT 
        ts.id,
        ts.technician_profile_id,
        ts.category_id,
        ac.name AS category_name,
        ac.slug AS category_slug,
        ac.icon_url AS category_icon_url,
        ts.supporting_document_id,
        td.document_title AS supporting_document_title,
        ts.created_at
      FROM technician_specializations ts
      JOIN appliance_categories ac ON ac.id = ts.category_id
      LEFT JOIN technician_documents td ON td.id = ts.supporting_document_id
      WHERE ts.technician_profile_id = ?
      ORDER BY ac.name ASC`,
      [technicianProfileId]
    );

    // 5. Query Statistik Penugasan Perbaikan
    const statsRows = await query<
      { total: number; completed: number; active: number; rejected: number }[]
    >(
      `SELECT 
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN status IN ('offered', 'accepted') THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected
      FROM technician_assignments
      WHERE technician_id = ?`,
      [profile.user_id]
    );

    const stats = statsRows[0] || { total: 0, completed: 0, active: 0, rejected: 0 };

    return NextResponse.json(
      {
        success: true,
        data: {
          id: profile.id,
          user_id: profile.user_id,
          user_uuid: profile.user_uuid,
          email: profile.email,
          phone_number: profile.phone_number,
          account_status: profile.account_status,
          is_verified: Boolean(profile.is_verified),
          user_created_at: profile.user_created_at,
          full_name: profile.full_name,
          avatar_url: profile.avatar_url,
          bio: profile.bio,
          years_of_experience: Number(profile.years_of_experience) || 0,
          rating_avg: Number(profile.rating_avg) || 0,
          rating_count: Number(profile.rating_count) || 0,
          is_available: Boolean(profile.is_available),
          verified_status: profile.verified_status,
          rejection_reason: profile.rejection_reason,
          verified_by_admin_id: profile.verified_by_admin_id,
          verified_at: profile.verified_at,
          verifier_email: profile.verifier_email || null,
          current_latitude: profile.current_latitude !== null ? Number(profile.current_latitude) : null,
          current_longitude: profile.current_longitude !== null ? Number(profile.current_longitude) : null,
          created_at: profile.created_at,
          updated_at: profile.updated_at,
          documents: documents.map((doc) => ({
            ...doc,
            file_size_bytes: doc.file_size_bytes !== null ? Number(doc.file_size_bytes) : null,
          })),
          specializations,
          stats: {
            total_assignments: Number(stats.total || 0),
            completed_assignments: Number(stats.completed || 0),
            active_assignments: Number(stats.active || 0),
            rejected_assignments: Number(stats.rejected || 0),
          },
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[GET /api/admin/technicians/[id] Error]:', error.message || error);
    return NextResponse.json(
      { success: false, message: 'Terjadi kegagalan sistem saat memuat detail teknisi' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/technicians/[id]
 * Memperbarui status verifikasi teknisi, status akun pengguna, atau detail profil.
 * Menggunakan transaksi database agar konsisten di tabel technician_profiles dan users.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  let connection: any = null;
  try {
    // 1. Verifikasi Autentikasi Admin
    const session = await getAdminSession();
    if (!session || session.role !== 'admin') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: sesi administrator tidak valid atau telah berakhir' },
        { status: 401 }
      );
    }

    const { id: rawId } = await params;
    const technicianProfileId = parseInt(rawId, 10);

    if (isNaN(technicianProfileId) || technicianProfileId <= 0) {
      return NextResponse.json(
        { success: false, message: 'Parameter ID teknisi tidak valid' },
        { status: 400 }
      );
    }

    // 2. Parse & Validasi Payload dengan Zod
    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, message: 'Format data JSON tidak valid' },
        { status: 400 }
      );
    }

    const validation = updateTechnicianSchema.safeParse(body);
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
        { success: false, message: 'Tidak ada perubahan data yang dikirim' },
        { status: 400 }
      );
    }

    // 3. Ambil Snapshot Data Saat Ini
    const existing = await query<TechProfileRow[]>(
      `SELECT 
        tp.id, tp.user_id, tp.full_name, tp.bio, tp.years_of_experience,
        tp.is_available, tp.verified_status, tp.rejection_reason,
        u.email, u.phone_number, u.status AS account_status, u.is_verified
      FROM technician_profiles tp
      JOIN users u ON u.id = tp.user_id
      WHERE tp.id = ? AND u.role = 'technician' AND u.deleted_at IS NULL
      LIMIT 1`,
      [technicianProfileId]
    );

    if (!existing || existing.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Teknisi tidak ditemukan atau telah dihapus' },
        { status: 404 }
      );
    }

    const current = existing[0];

    // Jika nomor telepon diubah, pastikan tidak konflik dengan pengguna lain
    if (updateData.phone_number && updateData.phone_number !== current.phone_number) {
      const phoneConflict = await query<{ id: number }[]>(
        'SELECT id FROM users WHERE phone_number = ? AND id != ? LIMIT 1',
        [updateData.phone_number, current.user_id]
      );
      if (phoneConflict && phoneConflict.length > 0) {
        return NextResponse.json(
          { success: false, message: 'Nomor telepon sudah digunakan oleh akun lain' },
          { status: 409 }
        );
      }
    }

    // 4. Buka Transaksi Database
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const profileUpdates: string[] = [];
    const profileParams: any[] = [];
    const userUpdates: string[] = [];
    const userParams: any[] = [];

    // Perubahan profil teknisi
    if (updateData.full_name !== undefined) {
      profileUpdates.push('full_name = ?');
      profileParams.push(updateData.full_name);
    }
    if (updateData.bio !== undefined) {
      profileUpdates.push('bio = ?');
      profileParams.push(updateData.bio);
    }
    if (updateData.years_of_experience !== undefined) {
      profileUpdates.push('years_of_experience = ?');
      profileParams.push(updateData.years_of_experience);
    }
    if (updateData.is_available !== undefined) {
      profileUpdates.push('is_available = ?');
      profileParams.push(updateData.is_available ? 1 : 0);
    }

    // Logika Status Verifikasi Teknisi
    if (updateData.verified_status !== undefined) {
      profileUpdates.push('verified_status = ?');
      profileParams.push(updateData.verified_status);

      if (updateData.verified_status === 'verified') {
        profileUpdates.push('verified_by_admin_id = ?', 'verified_at = NOW()', 'rejection_reason = NULL');
        profileParams.push(session.userId);

        // Jika status akun sebelumnya pending_verification, otomatis aktifkan akun
        if (current.account_status === 'pending_verification' && updateData.account_status === undefined) {
          userUpdates.push('status = ?', 'is_verified = 1');
          userParams.push('active');
        }
      } else if (updateData.verified_status === 'rejected') {
        profileUpdates.push('verified_by_admin_id = ?', 'verified_at = NOW()', 'rejection_reason = ?');
        profileParams.push(session.userId, updateData.rejection_reason || null);
      } else if (updateData.verified_status === 'suspended') {
        profileUpdates.push('verified_by_admin_id = ?', 'verified_at = NOW()');
        profileParams.push(session.userId);
        // Otomatis buat is_available = false saat disuspend
        profileUpdates.push('is_available = 0');
      } else if (updateData.verified_status === 'pending') {
        profileUpdates.push('verified_by_admin_id = NULL', 'verified_at = NULL');
      }
    } else if (updateData.rejection_reason !== undefined) {
      profileUpdates.push('rejection_reason = ?');
      profileParams.push(updateData.rejection_reason);
    }

    // Perubahan status atau data akun pengguna (users)
    if (updateData.account_status !== undefined) {
      userUpdates.push('status = ?');
      userParams.push(updateData.account_status);

      // Jika disuspend pada tingkat akun, sinkronkan ketersediaan teknisi
      if (updateData.account_status === 'suspended') {
        profileUpdates.push('is_available = 0');
      }
    }

    if (updateData.phone_number !== undefined) {
      userUpdates.push('phone_number = ?');
      userParams.push(updateData.phone_number);
    }

    // Eksekusi update profile jika ada klausa
    if (profileUpdates.length > 0) {
      profileParams.push(technicianProfileId);
      await connection.execute(
        `UPDATE technician_profiles SET ${profileUpdates.join(', ')}, updated_at = NOW() WHERE id = ?`,
        profileParams
      );
    }

    // Eksekusi update user jika ada klausa
    if (userUpdates.length > 0) {
      userParams.push(current.user_id);
      await connection.execute(
        `UPDATE users SET ${userUpdates.join(', ')}, updated_at = NOW() WHERE id = ?`,
        userParams
      );
    }

    await connection.commit();

    // 5. Catat Log Audit Administrator
    const actionName = updateData.verified_status
      ? `VERIFY_TECH_${updateData.verified_status.toUpperCase()}`
      : updateData.account_status
      ? `UPDATE_TECH_ACCOUNT_${updateData.account_status.toUpperCase()}`
      : 'UPDATE_TECH_PROFILE';

    const clientIp =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      '127.0.0.1';
    const clientUserAgent = request.headers.get('user-agent') || '';

    await recordAdminAudit({
      adminUserId: session.userId,
      action: actionName,
      entityName: 'technician_profiles',
      entityId: technicianProfileId,
      oldValues: {
        verified_status: current.verified_status,
        account_status: current.account_status,
        full_name: current.full_name,
        is_available: Boolean(current.is_available),
      },
      newValues: {
        verified_status: updateData.verified_status ?? current.verified_status,
        account_status: updateData.account_status ?? current.account_status,
        full_name: updateData.full_name ?? current.full_name,
        is_available: updateData.is_available ?? Boolean(current.is_available),
        rejection_reason: updateData.rejection_reason,
      },
      ipAddress: clientIp,
      userAgent: clientUserAgent,
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Data teknisi berhasil diperbarui',
      },
      { status: 200 }
    );
  } catch (error: any) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rbErr) {
        console.error('Rollback failed:', rbErr);
      }
    }
    console.error('[PATCH /api/admin/technicians/[id] Error]:', error.message || error);
    return NextResponse.json(
      { success: false, message: 'Gagal memperbarui data teknisi' },
      { status: 500 }
    );
  } finally {
    if (connection) {
      connection.release();
    }
  }
}
