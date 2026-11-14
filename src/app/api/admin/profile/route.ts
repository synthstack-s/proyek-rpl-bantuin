import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { getAdminProfile, saveAdminProfile } from '@/lib/admin-profile';

/**
 * GET /api/admin/profile
 * Mengambil informasi profil lengkap admin yang sedang login
 */
export async function GET() {
  try {
    const session = await getAdminSession();
    if (!session || session.role !== 'admin') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: sesi administrator tidak valid atau telah berakhir.' },
        { status: 401 }
      );
    }

    const users = await query<any[]>(
      'SELECT id, uuid, email, phone_number, role, status, is_verified, created_at, updated_at FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      [session.userId]
    );

    const user = users && users.length > 0 ? users[0] : null;
    if (!user) {
      return NextResponse.json(
        { success: false, message: 'Akun administrator tidak ditemukan.' },
        { status: 404 }
      );
    }

    const profile = await getAdminProfile(session.userId);

    return NextResponse.json({
      success: true,
      data: {
        id: user.id,
        uuid: user.uuid,
        email: user.email,
        phone_number: user.phone_number,
        name: profile?.full_name || (user.email ? user.email.split('@')[0] : 'Admin Bantuin'),
        avatar_url: profile?.avatar_url || null,
        role: user.role,
        status: user.status,
        is_verified: Boolean(user.is_verified),
        created_at: user.created_at,
        updated_at: user.updated_at,
      },
    });
  } catch (error: any) {
    console.error('[GET /api/admin/profile Error]:', error.message || error);
    return NextResponse.json(
      { success: false, message: 'Gagal mengambil profil administrator: ' + error.message },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/profile
 * Memperbarui nama lengkap, nomor telepon, atau foto profil admin yang sedang login
 */
export async function PATCH(req: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session || session.role !== 'admin') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: sesi administrator tidak valid.' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { full_name, phone_number, avatar_url } = body;

    if (full_name !== undefined) {
      const trimmedName = String(full_name).trim();
      if (!trimmedName || trimmedName.length < 2) {
        return NextResponse.json(
          { success: false, message: 'Nama lengkap minimal 2 karakter.' },
          { status: 400 }
        );
      }
      await saveAdminProfile(session.userId, { full_name: trimmedName, avatar_url });
    }

    if (phone_number !== undefined) {
      const trimmedPhone = String(phone_number).trim();
      if (trimmedPhone) {
        // Cek konflik nomor telepon dengan akun lain
        try {
          const conflict = await query<any[]>(
            'SELECT id FROM users WHERE phone_number = ? AND id != ? LIMIT 1',
            [trimmedPhone, session.userId]
          );
          if (conflict && conflict.length > 0) {
            return NextResponse.json(
              { success: false, message: 'Nomor telepon sudah digunakan oleh akun lain.' },
              { status: 409 }
            );
          }
          await query('UPDATE users SET phone_number = ?, updated_at = NOW() WHERE id = ?', [
            trimmedPhone,
            session.userId,
          ]);
        } catch (err: any) {
          console.warn('[PATCH /api/admin/profile Phone Update]:', err.message);
        }
      }
    }

    const updatedProfile = await getAdminProfile(session.userId);

    return NextResponse.json({
      success: true,
      message: 'Profil administrator berhasil diperbarui.',
      data: {
        id: session.userId,
        name: updatedProfile?.full_name || full_name,
        avatar_url: updatedProfile?.avatar_url || avatar_url,
      },
    });
  } catch (error: any) {
    console.error('[PATCH /api/admin/profile Error]:', error.message || error);
    return NextResponse.json(
      { success: false, message: 'Gagal memperbarui profil: ' + error.message },
      { status: 500 }
    );
  }
}

