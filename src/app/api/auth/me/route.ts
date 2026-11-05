import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import {
  USER_COOKIE_NAME,
  ADMIN_COOKIE_NAME,
  verifyUserToken,
  verifyAdminToken,
} from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // 1. Cek cookie user
    const userCookie = request.cookies.get(USER_COOKIE_NAME)?.value;
    const adminCookie = request.cookies.get(ADMIN_COOKIE_NAME)?.value;

    let sessionUserId: number | null = null;
    let sessionRole: string | null = null;

    if (userCookie) {
      const userPayload = await verifyUserToken(userCookie);
      if (userPayload) {
        sessionUserId = userPayload.userId;
        sessionRole = userPayload.role;
      }
    }

    if (!sessionUserId && adminCookie) {
      const adminPayload = await verifyAdminToken(adminCookie);
      if (adminPayload) {
        sessionUserId = adminPayload.userId;
        sessionRole = 'admin';
      }
    }

    if (!sessionUserId) {
      return NextResponse.json(
        { success: false, message: 'Tidak ada sesi autentikasi aktif' },
        { status: 401 }
      );
    }

    // 2. Ambil data terkini dari database
    const users = await query<any[]>(
      `SELECT u.id, u.uuid, u.email, u.phone_number, u.role, u.status, u.is_verified,
              cp.full_name AS customer_name,
              tp.full_name AS technician_name,
              tp.verified_status AS technician_verified_status,
              tp.rating_avg,
              tp.rating_count
       FROM users u
       LEFT JOIN customer_profiles cp ON u.id = cp.user_id
       LEFT JOIN technician_profiles tp ON u.id = tp.user_id
       WHERE u.id = ? AND u.deleted_at IS NULL
       LIMIT 1`,
      [sessionUserId]
    );

    if (!users || users.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Data pengguna tidak ditemukan' },
        { status: 404 }
      );
    }

    const user = users[0];
    const fullName = user.customer_name || user.technician_name || (user.role === 'admin' ? 'Administrator' : 'Pengguna BANTUIN');

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        uuid: user.uuid,
        email: user.email,
        phoneNumber: user.phone_number,
        role: user.role,
        status: user.status,
        isVerified: Boolean(user.is_verified),
        name: fullName,
        ...(user.role === 'technician' && {
          technicianVerifiedStatus: user.technician_verified_status,
          ratingAvg: Number(user.rating_avg || 0),
          ratingCount: Number(user.rating_count || 0),
        }),
      },
    });
  } catch (error: any) {
    console.error('[Auth Me Error]:', error);
    return NextResponse.json(
      { success: false, message: 'Terjadi kesalahan sistem saat mengambil profil pengguna' },
      { status: 500 }
    );
  }
}

