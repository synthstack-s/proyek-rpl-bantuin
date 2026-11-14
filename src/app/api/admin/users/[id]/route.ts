import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { pool, query } from '@/lib/db';
import { updateUserSchema } from '@/lib/validations/user';
import { recordAdminAudit } from '@/lib/audit';
import { getAdminProfile, saveAdminProfile } from '@/lib/admin-profile';

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface UserDetailRow {
  id: number;
  uuid: string;
  email: string;
  phone_number: string;
  role: 'admin' | 'customer' | 'technician';
  status: 'active' | 'inactive' | 'suspended' | 'pending_verification';
  is_verified: number | boolean;
  created_at: string;
  updated_at: string;
  // Profil Pelanggan
  customer_profile_id: number | null;
  customer_name: string | null;
  customer_avatar: string | null;
  customer_address: string | null;
  customer_city: string | null;
  customer_postal_code: string | null;
  customer_latitude: number | string | null;
  customer_longitude: number | string | null;
  customer_profile_created_at: string | null;
  customer_profile_updated_at: string | null;
  // Profil Teknisi
  technician_profile_id: number | null;
  technician_name: string | null;
  technician_avatar: string | null;
  technician_bio: string | null;
  years_of_experience: number | null;
  rating_avg: number | string | null;
  rating_count: number | null;
  is_available: number | boolean | null;
  verified_status: string | null;
  rejection_reason: string | null;
  verified_at: string | null;
}

/**
 * GET /api/admin/users/[id]
 * Mengambil informasi detail satu pengguna, data profil pelanggan/teknisi, serta riwayat metrik aktivitas.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    // 1. Verifikasi Autentikasi dan Otorisasi Administrator
    const session = await getAdminSession();
    if (!session || session.role !== 'admin') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: sesi administrator tidak valid atau telah berakhir' },
        { status: 401 }
      );
    }

    const { id: rawId } = await params;
    const userId = parseInt(rawId, 10);

    if (isNaN(userId) || userId <= 0) {
      return NextResponse.json(
        { success: false, message: 'Parameter ID pengguna tidak valid' },
        { status: 400 }
      );
    }

    // 2. Query Detail Pengguna dan Profil Terkait
    const userRows = await query<UserDetailRow[]>(
      `SELECT 
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
        cp.latitude AS customer_latitude,
        cp.longitude AS customer_longitude,
        cp.created_at AS customer_profile_created_at,
        cp.updated_at AS customer_profile_updated_at,
        tp.id AS technician_profile_id,
        tp.full_name AS technician_name,
        tp.avatar_url AS technician_avatar,
        tp.bio AS technician_bio,
        tp.years_of_experience,
        tp.rating_avg,
        tp.rating_count,
        tp.is_available,
        tp.verified_status,
        tp.rejection_reason,
        tp.verified_at
      FROM users u
      LEFT JOIN customer_profiles cp ON cp.user_id = u.id
      LEFT JOIN technician_profiles tp ON tp.user_id = u.id
      WHERE u.id = ? AND u.deleted_at IS NULL
      LIMIT 1`,
      [userId]
    );

    if (!userRows || userRows.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Pengguna tidak ditemukan atau telah dihapus' },
        { status: 404 }
      );
    }

    const user = userRows[0];

    // 3. Query Ringkasan Aktivitas Sesuai Role
    let customerStats = null;
    let technicianStats = null;

    if (user.role === 'customer') {
      const stats = await query<
        { total_orders: number; completed_orders: number; active_orders: number; total_spent: number | string }[]
      >(
        `SELECT 
          COUNT(rr.id) AS total_orders,
          SUM(CASE WHEN rr.current_status = 'completed' THEN 1 ELSE 0 END) AS completed_orders,
          SUM(CASE WHEN rr.current_status NOT IN ('completed', 'cancelled') THEN 1 ELSE 0 END) AS active_orders,
          COALESCE((SELECT SUM(i.total_amount) FROM invoices i WHERE i.customer_id = ? AND i.status = 'paid'), 0) AS total_spent
        FROM repair_requests rr
        WHERE rr.customer_id = ? AND rr.deleted_at IS NULL`,
        [userId, userId]
      );
      const s = stats[0] || { total_orders: 0, completed_orders: 0, active_orders: 0, total_spent: 0 };
      customerStats = {
        total_orders: Number(s.total_orders || 0),
        completed_orders: Number(s.completed_orders || 0),
        active_orders: Number(s.active_orders || 0),
        total_spent: Number(s.total_spent || 0),
      };
    } else if (user.role === 'technician') {
      const stats = await query<
        { total_assignments: number; completed_assignments: number; active_assignments: number }[]
      >(
        `SELECT 
          COUNT(*) AS total_assignments,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_assignments,
          SUM(CASE WHEN status IN ('offered', 'accepted') THEN 1 ELSE 0 END) AS active_assignments
        FROM technician_assignments
        WHERE technician_id = ?`,
        [userId]
      );
      const s = stats[0] || { total_assignments: 0, completed_assignments: 0, active_assignments: 0 };
      technicianStats = {
        total_assignments: Number(s.total_assignments || 0),
        completed_assignments: Number(s.completed_assignments || 0),
        active_assignments: Number(s.active_assignments || 0),
      };
    }

    // Resolusi nama dan avatar
    let displayName = 'Pengguna BANTUIN';
    let avatarUrl = null;

    if (user.role === 'customer' && user.customer_name) {
      displayName = user.customer_name;
      avatarUrl = user.customer_avatar;
    } else if (user.role === 'technician' && user.technician_name) {
      displayName = user.technician_name;
      avatarUrl = user.technician_avatar;
    } else if (user.role === 'admin') {
      const adminProf = await getAdminProfile(user.id);
      displayName = adminProf?.full_name || 'Administrator Sistem';
      avatarUrl = adminProf?.avatar_url || null;
    }

    const isCurrentAdmin = session.userId === user.id;
    const isBootstrapAdmin = user.email === (process.env.ADMIN_INITIAL_EMAIL || 'admin@bantuin.id');

    return NextResponse.json(
      {
        success: true,
        data: {
          id: user.id,
          uuid: user.uuid,
          email: user.email,
          phone_number: user.phone_number,
          role: user.role,
          status: user.status,
          is_verified: Boolean(user.is_verified),
          name: displayName,
          avatar_url: avatarUrl,
          created_at: user.created_at,
          updated_at: user.updated_at,
          is_current_admin: isCurrentAdmin,
          is_bootstrap_admin: isBootstrapAdmin,
          customer_profile: user.customer_profile_id
            ? {
                id: user.customer_profile_id,
                full_name: user.customer_name,
                default_address: user.customer_address,
                city: user.customer_city,
                postal_code: user.customer_postal_code,
                latitude: user.customer_latitude !== null ? Number(user.customer_latitude) : null,
                longitude: user.customer_longitude !== null ? Number(user.customer_longitude) : null,
                created_at: user.customer_profile_created_at,
                updated_at: user.customer_profile_updated_at,
                stats: customerStats,
              }
            : null,
          technician_profile: user.technician_profile_id
            ? {
                id: user.technician_profile_id,
                full_name: user.technician_name,
                bio: user.technician_bio,
                years_of_experience: Number(user.years_of_experience || 0),
                rating_avg: Number(user.rating_avg || 0),
                rating_count: Number(user.rating_count || 0),
                is_available: Boolean(user.is_available),
                verified_status: user.verified_status,
                rejection_reason: user.rejection_reason,
                verified_at: user.verified_at,
                stats: technicianStats,
              }
            : null,
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[GET /api/admin/users/[id] Error]:', error.message || error);
    return NextResponse.json(
      { success: false, message: 'Terjadi kegagalan sistem saat mengambil detail pengguna' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/users/[id]
 * Memperbarui status akun pengguna (active, inactive, suspended) atau informasi profil pelanggan.
 * Menerapkan proteksi keamanan anti-lockout akun administrator dan pencatatan audit log lengkap.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  let connection: any = null;
  try {
    // 1. Verifikasi Autentikasi dan Otorisasi Administrator
    const session = await getAdminSession();
    if (!session || session.role !== 'admin') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: sesi administrator tidak valid atau telah berakhir' },
        { status: 401 }
      );
    }

    const { id: rawId } = await params;
    const userId = parseInt(rawId, 10);

    if (isNaN(userId) || userId <= 0) {
      return NextResponse.json(
        { success: false, message: 'Parameter ID pengguna tidak valid' },
        { status: 400 }
      );
    }

    // 2. Parse & Validasi Payload
    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, message: 'Format data JSON tidak valid' },
        { status: 400 }
      );
    }

    // Cegah perubahan role secara sembarangan
    if ('role' in body) {
      return NextResponse.json(
        { success: false, message: 'Perubahan role pengguna tidak diizinkan demi keamanan hak akses' },
        { status: 400 }
      );
    }

    const validation = updateUserSchema.safeParse(body);
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

    // 3. Ambil Snapshot Pengguna Saat Ini
    const existingRows = await query<UserDetailRow[]>(
      `SELECT 
        u.id, u.uuid, u.email, u.phone_number, u.role, u.status, u.is_verified,
        cp.id AS customer_profile_id, cp.full_name AS customer_name,
        cp.default_address AS customer_address, cp.city AS customer_city, cp.postal_code AS customer_postal_code,
        tp.id AS technician_profile_id, tp.full_name AS technician_name
      FROM users u
      LEFT JOIN customer_profiles cp ON cp.user_id = u.id
      LEFT JOIN technician_profiles tp ON tp.user_id = u.id
      WHERE u.id = ? AND u.deleted_at IS NULL
      LIMIT 1`,
      [userId]
    );

    if (!existingRows || existingRows.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Pengguna tidak ditemukan atau telah dihapus' },
        { status: 404 }
      );
    }

    const current = existingRows[0];

    // 4. Proteksi Akun Administrator (Anti Self-Lockout & Bootstrap Protection)
    const isSelfAccount = session.userId === current.id;
    const isBootstrapAdmin = current.email === (process.env.ADMIN_INITIAL_EMAIL || 'admin@bantuin.id');

    if (updateData.status && (updateData.status === 'suspended' || updateData.status === 'inactive')) {
      if (isSelfAccount) {
        return NextResponse.json(
          {
            success: false,
            message: 'Tindakan ditolak: Anda tidak dapat menonaktifkan atau menangguhkan akun administrator yang sedang Anda gunakan saat ini.',
          },
          { status: 403 }
        );
      }
      if (isBootstrapAdmin) {
        return NextResponse.json(
          {
            success: false,
            message: 'Tindakan ditolak: Akun administrator utama sistem (bootstrap) tidak dapat dinonaktifkan atau ditangguhkan.',
          },
          { status: 403 }
        );
      }
    }

    // 5. Cek Konflik Nomor Telepon jika diubah
    if (updateData.phone_number && updateData.phone_number !== current.phone_number) {
      const phoneConflict = await query<{ id: number }[]>(
        'SELECT id FROM users WHERE phone_number = ? AND id != ? LIMIT 1',
        [updateData.phone_number, userId]
      );
      if (phoneConflict && phoneConflict.length > 0) {
        return NextResponse.json(
          { success: false, message: 'Nomor telepon sudah digunakan oleh akun lain' },
          { status: 409 }
        );
      }
    }

    // 6. Jalankan Transaksi MySQL untuk Pembaruan Terpadu
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const userClauses: string[] = [];
    const userParams: any[] = [];

    if (updateData.status !== undefined) {
      userClauses.push('status = ?');
      userParams.push(updateData.status);
    }
    if (updateData.phone_number !== undefined) {
      userClauses.push('phone_number = ?');
      userParams.push(updateData.phone_number);
    }
    if (updateData.is_verified !== undefined) {
      userClauses.push('is_verified = ?');
      userParams.push(updateData.is_verified ? 1 : 0);
    }

    if (userClauses.length > 0) {
      userParams.push(userId);
      await connection.execute(
        `UPDATE users SET ${userClauses.join(', ')}, updated_at = NOW() WHERE id = ?`,
        userParams
      );
    }

    // Pembaruan Data Profil Pelanggan jika peran customer
    if (current.role === 'customer') {
      const hasCustomerProfileChanges =
        updateData.full_name !== undefined ||
        updateData.default_address !== undefined ||
        updateData.city !== undefined ||
        updateData.postal_code !== undefined;

      if (hasCustomerProfileChanges) {
        if (current.customer_profile_id) {
          // Update profile yang sudah ada
          const cpClauses: string[] = [];
          const cpParams: any[] = [];

          if (updateData.full_name !== undefined) {
            cpClauses.push('full_name = ?');
            cpParams.push(updateData.full_name);
          }
          if (updateData.default_address !== undefined) {
            cpClauses.push('default_address = ?');
            cpParams.push(updateData.default_address);
          }
          if (updateData.city !== undefined) {
            cpClauses.push('city = ?');
            cpParams.push(updateData.city);
          }
          if (updateData.postal_code !== undefined) {
            cpClauses.push('postal_code = ?');
            cpParams.push(updateData.postal_code || null);
          }

          if (cpClauses.length > 0) {
            cpParams.push(current.customer_profile_id);
            await connection.execute(
              `UPDATE customer_profiles SET ${cpClauses.join(', ')}, updated_at = NOW() WHERE id = ?`,
              cpParams
            );
          }
        } else if (updateData.full_name) {
          // Buat baris baru customer_profiles jika belum ada
          await connection.execute(
            `INSERT INTO customer_profiles (user_id, full_name, default_address, city, postal_code, created_at)
             VALUES (?, ?, ?, ?, ?, NOW())`,
            [
              userId,
              updateData.full_name,
              updateData.default_address || null,
              updateData.city || null,
              updateData.postal_code || null,
            ]
          );
        }
      }
    } else if (current.role === 'technician' && updateData.full_name !== undefined) {
      // Jika teknisi, update full_name di technician_profiles jika ada
      if (current.technician_profile_id) {
        await connection.execute(
          'UPDATE technician_profiles SET full_name = ?, updated_at = NOW() WHERE id = ?',
          [updateData.full_name, current.technician_profile_id]
        );
      }
    } else if (current.role === 'admin' && updateData.full_name !== undefined) {
      // Simpan pembaruan nama admin ke admin_profiles
      await saveAdminProfile(userId, { full_name: updateData.full_name });
    }

    await connection.commit();

    // 7. Catat Log Audit Administrator
    let auditAction = 'UPDATE_USER_PROFILE';
    if (updateData.status) {
      if (updateData.status === 'suspended') auditAction = 'SUSPEND_USER';
      else if (updateData.status === 'active') auditAction = 'ACTIVATE_USER';
      else if (updateData.status === 'inactive') auditAction = 'DEACTIVATE_USER';
      else auditAction = 'UPDATE_USER_STATUS';
    }

    const clientIp =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      '127.0.0.1';
    const clientUserAgent = request.headers.get('user-agent') || '';

    await recordAdminAudit({
      adminUserId: session.userId,
      action: auditAction,
      entityName: 'users',
      entityId: userId,
      oldValues: {
        status: current.status,
        phone_number: current.phone_number,
        is_verified: Boolean(current.is_verified),
        customer_name: current.customer_name,
        customer_city: current.customer_city,
      },
      newValues: {
        status: updateData.status ?? current.status,
        phone_number: updateData.phone_number ?? current.phone_number,
        is_verified: updateData.is_verified ?? Boolean(current.is_verified),
        full_name: updateData.full_name ?? current.customer_name,
        city: updateData.city ?? current.customer_city,
      },
      ipAddress: clientIp,
      userAgent: clientUserAgent,
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Data pengguna berhasil diperbarui',
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
    console.error('[PATCH /api/admin/users/[id] Error]:', error.message || error);
    return NextResponse.json(
      { success: false, message: 'Gagal memperbarui data pengguna' },
      { status: 500 }
    );
  } finally {
    if (connection) {
      connection.release();
    }
  }
}
