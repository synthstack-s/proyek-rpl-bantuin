import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { query, pool } from '@/lib/db';
import { recordAdminAudit } from '@/lib/audit';

const VALID_TYPES = [
  'system',
  'order_status',
  'payment',
  'technician_assignment',
  'chat',
  'complaint',
  'document_verification',
];

/**
 * POST /api/admin/notifications/broadcast
 * Mengirim notifikasi siaran (broadcast) atau tertarget ke pengguna (Semua, Pelanggan, Teknisi, Admin, atau Pengguna Tertentu).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session || session.role !== 'admin') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: sesi administrator tidak valid.' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ success: false, message: 'Payload tidak valid.' }, { status: 400 });
    }

    const {
      targetAudience = 'all',
      userId,
      title,
      message,
      type = 'system',
      targetUrl = null,
    } = body;

    // 1. Validasi Input
    if (!title || typeof title !== 'string' || title.trim().length < 3) {
      return NextResponse.json(
        { success: false, message: 'Judul notifikasi wajib diisi (minimal 3 karakter).' },
        { status: 400 }
      );
    }
    if (title.trim().length > 150) {
      return NextResponse.json(
        { success: false, message: 'Judul notifikasi maksimal 150 karakter.' },
        { status: 400 }
      );
    }

    if (!message || typeof message !== 'string' || message.trim().length < 5) {
      return NextResponse.json(
        { success: false, message: 'Isi pesan notifikasi wajib diisi (minimal 5 karakter).' },
        { status: 400 }
      );
    }

    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json(
        { success: false, message: `Tipe notifikasi tidak valid. Pilihan: ${VALID_TYPES.join(', ')}.` },
        { status: 400 }
      );
    }

    const cleanTitle = title.trim();
    const cleanMessage = message.trim();
    const cleanUrl = targetUrl ? String(targetUrl).trim() : null;

    // 2. Tentukan Daftar User Penerima
    let recipientIds: number[] = [];

    if (targetAudience === 'specific_user') {
      const targetUserId = parseInt(String(userId), 10);
      if (isNaN(targetUserId) || targetUserId <= 0) {
        return NextResponse.json(
          { success: false, message: 'User ID penerima wajib valid untuk audiens pengguna tertentu.' },
          { status: 400 }
        );
      }
      const userCheck = await query<any[]>(
        `SELECT id FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
        [targetUserId]
      );
      if (userCheck.length === 0) {
        return NextResponse.json(
          { success: false, message: `Pengguna dengan ID ${targetUserId} tidak ditemukan.` },
          { status: 404 }
        );
      }
      recipientIds = [targetUserId];
    } else if (targetAudience === 'customers') {
      const rows = await query<{ id: number }[]>(
        `SELECT id FROM users WHERE role = 'customer' AND status = 'active' AND deleted_at IS NULL`
      );
      recipientIds = rows.map((r) => r.id);
    } else if (targetAudience === 'technicians') {
      const rows = await query<{ id: number }[]>(
        `SELECT id FROM users WHERE role = 'technician' AND status = 'active' AND deleted_at IS NULL`
      );
      recipientIds = rows.map((r) => r.id);
    } else if (targetAudience === 'admins') {
      const rows = await query<{ id: number }[]>(
        `SELECT id FROM users WHERE role = 'admin' AND deleted_at IS NULL`
      );
      recipientIds = rows.map((r) => r.id);
    } else if (targetAudience === 'all') {
      const rows = await query<{ id: number }[]>(
        `SELECT id FROM users WHERE status = 'active' AND deleted_at IS NULL`
      );
      recipientIds = rows.map((r) => r.id);
    } else {
      return NextResponse.json(
        { success: false, message: 'Target audiens tidak valid (pilihan: all, customers, technicians, admins, specific_user).' },
        { status: 400 }
      );
    }

    if (recipientIds.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Tidak ada pengguna aktif yang memenuhi kriteria target audiens yang dipilih.' },
        { status: 400 }
      );
    }

    // 3. Batch Insert Notifikasi ke Database secara Aman Menggunakan Transaksi
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Chunk batch insert jika jumlah penerima banyak (misal per 100 baris)
      const chunkSize = 100;
      for (let i = 0; i < recipientIds.length; i += chunkSize) {
        const chunk = recipientIds.slice(i, i + chunkSize);
        const values: any[] = [];
        const placeholders = chunk
          .map((uid) => {
            values.push(uid, cleanTitle, cleanMessage, type, cleanUrl);
            return `(?, ?, ?, ?, ?, FALSE, NULL, NOW())`;
          })
          .join(', ');

        await connection.execute(
          `INSERT INTO notifications (
            user_id, title, message, type, target_url, is_read, read_at, created_at
          ) VALUES ${placeholders}`,
          values
        );
      }

      await connection.commit();
    } catch (err: any) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }

    // 4. Catat Log Audit Administrator
    const clientIp = request.headers.get('x-forwarded-for') || '127.0.0.1';
    const userAgent = request.headers.get('user-agent') || 'Admin Browser';

    await recordAdminAudit({
      adminUserId: session.userId,
      action: 'BROADCAST_NOTIFICATION',
      entityName: 'notifications',
      entityId: recipientIds[0] || 0,
      oldValues: null,
      newValues: {
        targetAudience,
        recipientCount: recipientIds.length,
        title: cleanTitle,
        type,
        targetUrl: cleanUrl,
      },
      ipAddress: clientIp,
      userAgent,
    });

    return NextResponse.json({
      success: true,
      message: `Notifikasi berhasil dikirimkan ke ${recipientIds.length} pengguna.`,
      recipientCount: recipientIds.length,
    });
  } catch (error: any) {
    console.error('[Broadcast Notification Error]:', error);
    return NextResponse.json(
      { success: false, message: 'Gagal mengirimkan notifikasi: ' + error.message },
      { status: 500 }
    );
  }
}
