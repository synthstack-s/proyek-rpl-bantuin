import { NextRequest, NextResponse } from 'next/server';
import { getUserSession } from '@/lib/auth';
import { query } from '@/lib/db';

export async function GET() {
  try {
    const session = await getUserSession();
    if (!session || session.role !== 'technician') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: sesi mitra teknisi tidak valid' },
        { status: 401 }
      );
    }

    const rows = await query<any[]>(
      `SELECT u.id, u.email, u.phone_number, u.is_verified,
              tp.full_name, tp.avatar_url, tp.bio, tp.years_of_experience,
              tp.verified_status, tp.rejection_reason, tp.rating_avg, tp.rating_count,
              tp.is_available, tp.current_latitude, tp.current_longitude
       FROM users u
       LEFT JOIN technician_profiles tp ON u.id = tp.user_id
       WHERE u.id = ? LIMIT 1`,
      [session.userId]
    );

    if (rows.length === 0) {
      return NextResponse.json({ success: false, message: 'Data teknisi tidak ditemukan' }, { status: 404 });
    }

    const t = rows[0];

    return NextResponse.json({
      success: true,
      data: {
        userId: t.id,
        email: t.email,
        phoneNumber: t.phone_number,
        fullName: t.full_name || session.name || 'Mitra Teknisi',
        bio: t.bio || '',
        yearsOfExperience: Number(t.years_of_experience || 0),
        verifiedStatus: t.verified_status || 'pending',
        isAvailable: Boolean(t.is_available),
        ratingAvg: Number(t.rating_avg || 0),
        ratingCount: Number(t.rating_count || 0),
        currentLatitude: t.current_latitude ? Number(t.current_latitude) : null,
        currentLongitude: t.current_longitude ? Number(t.current_longitude) : null,
      },
    });
  } catch (error: any) {
    console.error('Error fetching technician profile:', error);
    return NextResponse.json(
      { success: false, message: 'Gagal memuat profil teknisi: ' + error.message },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getUserSession();
    if (!session || session.role !== 'technician') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: sesi mitra teknisi tidak valid' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { is_available, bio, current_latitude, current_longitude } = body;

    let updates: string[] = [];
    let params: any[] = [];

    if (typeof is_available === 'boolean') {
      updates.push('is_available = ?');
      params.push(is_available ? 1 : 0);
    }

    if (typeof bio === 'string') {
      updates.push('bio = ?');
      params.push(bio.trim());
    }

    if (current_latitude !== undefined && current_longitude !== undefined) {
      updates.push('current_latitude = ?', 'current_longitude = ?');
      params.push(Number(current_latitude), Number(current_longitude));
    }

    if (updates.length === 0) {
      return NextResponse.json({ success: false, message: 'Tidak ada data yang diperbarui' }, { status: 400 });
    }

    params.push(session.userId);

    await query(
      `UPDATE technician_profiles SET ${updates.join(', ')} WHERE user_id = ?`,
      params
    );

    return NextResponse.json({
      success: true,
      message: 'Status kesiapan teknisi berhasil diperbarui.',
      data: { isAvailable: is_available },
    });
  } catch (error: any) {
    console.error('Error updating technician profile:', error);
    return NextResponse.json(
      { success: false, message: 'Gagal memperbarui status teknisi: ' + error.message },
      { status: 500 }
    );
  }
}

