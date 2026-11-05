import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { query } from '@/lib/db';

export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json(
      { success: false, message: 'Sesi administrator tidak valid atau telah berakhir' },
      { status: 401 }
    );
  }

  // Verifikasi status terkini langsung ke database
  const users = await query<any[]>(
    'SELECT id, uuid, email, phone_number, role, status FROM users WHERE uuid = ? AND deleted_at IS NULL LIMIT 1',
    [session.uuid]
  );

  const user = users && users.length > 0 ? users[0] : null;
  if (!user || user.role !== 'admin' || user.status !== 'active') {
    return NextResponse.json(
      { success: false, message: 'Akun administrator tidak aktif atau telah dicabut' },
      { status: 403 }
    );
  }

  return NextResponse.json(
    {
      success: true,
      user: {
        id: user.id,
        uuid: user.uuid,
        email: user.email,
        phone: user.phone_number,
        role: user.role,
        status: user.status,
      },
    },
    { status: 200 }
  );
}
