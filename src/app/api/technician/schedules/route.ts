import { NextRequest, NextResponse } from 'next/server';
import { getUserSession } from '@/lib/auth';
import { query } from '@/lib/db';

/**
 * GET /api/technician/schedules
 * Mengambil seluruh agenda jadwal kunjungan fisik yang ditugaskan ke teknisi login.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getUserSession();
    if (!session || session.role !== 'technician') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: sesi teknisi tidak valid' },
        { status: 401 }
      );
    }

    const schedules = await query<any[]>(
      `SELECT ts.id, ts.repair_request_id, ts.scheduled_date, ts.time_slot_start, ts.time_slot_end,
              ts.status, ts.reschedule_reason, ts.created_at,
              rr.order_code, rr.device_brand, rr.device_model, rr.address_text AS service_address,
              rr.latitude, rr.longitude,
              cp.full_name AS customer_name, u_cust.phone_number AS customer_phone,
              cat.name AS appliance_category
       FROM technician_schedules ts
       JOIN repair_requests rr ON rr.id = ts.repair_request_id
       JOIN users u_cust ON u_cust.id = rr.customer_id
       LEFT JOIN customer_profiles cp ON cp.user_id = u_cust.id
       LEFT JOIN appliance_categories cat ON cat.id = rr.category_id
       WHERE ts.technician_id = ? AND ts.status NOT IN ('cancelled', 'completed')
       ORDER BY ts.scheduled_date ASC, ts.time_slot_start ASC`,
      [session.userId]
    );

    return NextResponse.json({
      success: true,
      data: schedules.map((s) => ({
        id: s.id,
        repairRequestId: s.repair_request_id,
        orderCode: s.order_code,
        applianceCategory: s.appliance_category,
        deviceBrand: s.device_brand,
        deviceModel: s.device_model,
        customerName: s.customer_name,
        customerPhone: s.customer_phone,
        serviceAddress: s.service_address,
        latitude: s.latitude ? parseFloat(s.latitude) : null,
        longitude: s.longitude ? parseFloat(s.longitude) : null,
        scheduledDate:
          s.scheduled_date instanceof Date
            ? s.scheduled_date.toLocaleDateString('en-CA')
            : String(s.scheduled_date).slice(0, 10),
        timeSlotStart: s.time_slot_start,
        timeSlotEnd: s.time_slot_end,
        status: s.status,
      })),
    });
  } catch (error: any) {
    console.error('Error in GET /api/technician/schedules:', error);
    return NextResponse.json(
      { success: false, message: 'Terjadi kesalahan sistem saat mengambil agenda kunjungan' },
      { status: 500 }
    );
  }
}
