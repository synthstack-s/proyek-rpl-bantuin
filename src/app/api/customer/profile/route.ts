import { NextRequest, NextResponse } from 'next/server';
import { getUserSession } from '@/lib/auth';
import { query } from '@/lib/db';

export async function GET() {
  try {
    const session = await getUserSession();
    if (!session || session.role !== 'customer') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: sesi pelanggan tidak valid' },
        { status: 401 }
      );
    }

    const rows = await query<any[]>(
      `SELECT u.id, u.email, u.phone_number, u.is_verified,
              cp.full_name, cp.avatar_url, cp.default_address, cp.city, cp.postal_code, cp.latitude, cp.longitude
       FROM users u
       LEFT JOIN customer_profiles cp ON u.id = cp.user_id
       WHERE u.id = ? LIMIT 1`,
      [session.userId]
    );

    if (rows.length === 0) {
      return NextResponse.json({ success: false, message: 'Pengguna tidak ditemukan' }, { status: 404 });
    }

    const user = rows[0];

    return NextResponse.json({
      success: true,
      data: {
        userId: user.id,
        email: user.email,
        phoneNumber: user.phone_number,
        isVerified: Boolean(user.is_verified),
        fullName: user.full_name || session.name || 'Pelanggan BANTUIN',
        avatarUrl: user.avatar_url,
        defaultAddress: user.default_address || '',
        city: user.city || '',
        postalCode: user.postal_code || '',
        latitude: user.latitude ? Number(user.latitude) : null,
        longitude: user.longitude ? Number(user.longitude) : null,
      },
    });
  } catch (error: any) {
    console.error('Error fetching customer profile:', error);
    return NextResponse.json(
      { success: false, message: 'Gagal mengambil profil: ' + error.message },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getUserSession();
    if (!session || session.role !== 'customer') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: sesi pelanggan tidak valid' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { full_name, default_address, city, postal_code } = body;

    // Pastikan record customer_profiles ada
    await query(
      `INSERT INTO customer_profiles (user_id, full_name, default_address, city, postal_code)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         full_name = COALESCE(?, full_name),
         default_address = COALESCE(?, default_address),
         city = COALESCE(?, city),
         postal_code = COALESCE(?, postal_code)`,
      [
        session.userId,
        full_name || session.name || 'Pelanggan',
        default_address || '',
        city || '',
        postal_code || '',
        full_name !== undefined ? full_name : null,
        default_address !== undefined ? default_address : null,
        city !== undefined ? city : null,
        postal_code !== undefined ? postal_code : null,
      ]
    );

    return NextResponse.json({
      success: true,
      message: 'Profil alamat pelanggan berhasil diperbarui.',
    });
  } catch (error: any) {
    console.error('Error updating customer profile:', error);
    return NextResponse.json(
      { success: false, message: 'Gagal memperbarui profil: ' + error.message },
      { status: 500 }
    );
  }
}
