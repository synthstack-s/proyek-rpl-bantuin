import { NextRequest, NextResponse } from 'next/server';
import { getUserSession, getAdminSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { createScheduleSchema } from '@/lib/validations/schedule';
import { notifyScheduleSet } from '@/lib/wa-notifications';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/repairs/[id]/schedule
 * Mengambil jadwal kunjungan fisik teknisi untuk pesanan perbaikan.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const userSession = await getUserSession();
    const adminSession = !userSession ? await getAdminSession() : null;
    const session = userSession || adminSession;

    if (!session) {
      return NextResponse.json({ success: false, message: 'Akses ditolak: Anda belum login' }, { status: 401 });
    }

    const { id } = await context.params;
    const repairId = parseInt(id, 10);
    if (isNaN(repairId)) {
      return NextResponse.json({ success: false, message: 'ID pesanan tidak valid' }, { status: 400 });
    }

    const schedules = await query<any[]>(
      `SELECT ts.id, ts.repair_request_id, ts.technician_id, ts.scheduled_date,
              ts.time_slot_start, ts.time_slot_end, ts.status, ts.reschedule_reason,
              ts.created_at, tp.full_name AS technician_name, u.phone_number AS technician_phone
       FROM technician_schedules ts
       JOIN users u ON u.id = ts.technician_id
       LEFT JOIN technician_profiles tp ON tp.user_id = u.id
       WHERE ts.repair_request_id = ?
       ORDER BY ts.id DESC`,
      [repairId]
    );

    return NextResponse.json({
      success: true,
      data: schedules.map((s) => ({
        id: s.id,
        repairRequestId: s.repair_request_id,
        technicianId: s.technician_id,
        technicianName: s.technician_name,
        technicianPhone: s.technician_phone,
        scheduledDate:
          s.scheduled_date instanceof Date
            ? s.scheduled_date.toLocaleDateString('en-CA')
            : String(s.scheduled_date).slice(0, 10),
        timeSlotStart: s.time_slot_start,
        timeSlotEnd: s.time_slot_end,
        status: s.status,
        rescheduleReason: s.reschedule_reason,
        createdAt: s.created_at,
      })),
    });
  } catch (error: any) {
    console.error('Error in GET /api/repairs/[id]/schedule:', error);
    return NextResponse.json(
      { success: false, message: 'Terjadi kesalahan sistem saat mengambil jadwal kunjungan' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/repairs/[id]/schedule
 * Menetapkan atau memperbarui jadwal kunjungan fisik teknisi ke lokasi pelanggan.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const userSession = await getUserSession();
    const adminSession = !userSession ? await getAdminSession() : null;
    const session = userSession || adminSession;

    if (!session) {
      return NextResponse.json({ success: false, message: 'Akses ditolak: Anda belum login' }, { status: 401 });
    }

    // Hanya Teknisi yang bertugas atau Admin yang boleh mengatur jadwal kunjungan
    if (session.role !== 'technician' && session.role !== 'admin') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: Hanya teknisi bertugas atau admin yang dapat menetapkan jadwal kunjungan' },
        { status: 403 }
      );
    }

    const { id } = await context.params;
    const repairId = parseInt(id, 10);
    if (isNaN(repairId)) {
      return NextResponse.json({ success: false, message: 'ID pesanan tidak valid' }, { status: 400 });
    }

    const body = await request.json();
    const validation = createScheduleSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, message: validation.error.issues[0]?.message || 'Input jadwal tidak valid' },
        { status: 400 }
      );
    }

    const { scheduled_date, time_slot_start, time_slot_end, reschedule_reason } = validation.data;

    // 1. Dapatkan pesanan dan penugasan teknisi
    const orders = await query<any[]>(
      `SELECT rr.id, rr.order_code, rr.customer_id, rr.current_status AS repair_status,
              ta.technician_id, tp.full_name AS technician_name
       FROM repair_requests rr
       LEFT JOIN technician_assignments ta ON ta.repair_request_id = rr.id AND ta.status IN ('offered', 'accepted')
       LEFT JOIN technician_profiles tp ON tp.user_id = ta.technician_id
       WHERE rr.id = ? AND rr.deleted_at IS NULL
       ORDER BY ta.id DESC
       LIMIT 1`,
      [repairId]
    );

    if (orders.length === 0) {
      return NextResponse.json({ success: false, message: 'Pesanan perbaikan tidak ditemukan' }, { status: 404 });
    }

    const order = orders[0];
    const technicianId = session.role === 'technician' ? session.userId : order.technician_id;

    if (!technicianId) {
      return NextResponse.json(
        { success: false, message: 'Belum ada teknisi yang ditugaskan pada pesanan ini' },
        { status: 400 }
      );
    }

    // Jika yang request teknisi, pastikan dia yang ditugaskan
    if (session.role === 'technician' && session.userId !== order.technician_id) {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: Anda bukan teknisi yang ditugaskan pada pesanan ini' },
        { status: 403 }
      );
    }

    // 2. Simpan jadwal ke technician_schedules
    const scheduleStatus = reschedule_reason ? 'rescheduled' : 'scheduled';
    const insertResult = await query<any>(
      `INSERT INTO technician_schedules (
        repair_request_id, technician_id, scheduled_date, time_slot_start, time_slot_end, status, reschedule_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [repairId, technicianId, scheduled_date, time_slot_start, time_slot_end, scheduleStatus, reschedule_reason || null]
    );

    // 3. Catat di repair_status_history
    await query(
      `INSERT INTO repair_status_history (
        repair_request_id, previous_status, new_status, changed_by_user_id, actor_role, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [
        repairId,
        order.repair_status,
        order.repair_status,
        session.userId,
        session.role,
        `Jadwal kunjungan fisik ditetapkan: ${scheduled_date} (${time_slot_start} - ${time_slot_end})${
          reschedule_reason ? ` (Alasan: ${reschedule_reason})` : ''
        }`,
      ]
    );

    // 4. Kirim notifikasi ke pelanggan
    await query(
      `INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
       VALUES (?, ?, ?, 'order_status', FALSE, NOW())`,
      [
        order.customer_id,
        'Jadwal Kunjungan Teknisi Ditetapkan 📅',
        `Pesanan #${order.order_code}: Teknisi ${order.technician_name || 'mitra'} dijadwalkan berkunjung pada ${scheduled_date} pukul ${time_slot_start} - ${time_slot_end} WIB.`,
      ]
    );

    // 5. Notifikasi WhatsApp ke pelanggan (best-effort — kegagalan tidak
    // membatalkan penyimpanan jadwal). Bukan perubahan status pesanan,
    // tetapi peristiwa pesanan yang sama pentingnya bagi pelanggan.
    await notifyScheduleSet({
      repairRequestId: repairId,
      orderCode: order.order_code,
      customerId: order.customer_id,
      technicianName: order.technician_name,
      scheduledDate: scheduled_date,
      timeSlotStart: time_slot_start,
      timeSlotEnd: time_slot_end,
      rescheduled: scheduleStatus === 'rescheduled',
    });

    return NextResponse.json({
      success: true,
      message: 'Jadwal kunjungan fisik berhasil ditetapkan',
      data: {
        id: insertResult.insertId,
        repairRequestId: repairId,
        technicianId,
        scheduledDate: scheduled_date,
        timeSlotStart: time_slot_start,
        timeSlotEnd: time_slot_end,
        status: scheduleStatus,
      },
    });
  } catch (error: any) {
    console.error('Error in POST /api/repairs/[id]/schedule:', error);
    return NextResponse.json(
      { success: false, message: 'Terjadi kesalahan sistem saat menyimpan jadwal kunjungan' },
      { status: 500 }
    );
  }
}
