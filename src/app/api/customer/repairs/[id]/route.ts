import { NextRequest, NextResponse } from 'next/server';
import { getUserSession } from '@/lib/auth';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getUserSession();
    if (!session || session.role !== 'customer') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: sesi pelanggan tidak valid' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const repairId = Number(id);

    if (!repairId || isNaN(repairId)) {
      return NextResponse.json(
        { success: false, message: 'ID pesanan tidak valid' },
        { status: 400 }
      );
    }

    // 1. Ambil data pesanan utama milik pelanggan
    const repairs = await query<any[]>(
      `SELECT r.id, r.order_code, r.customer_id, r.category_id, r.service_id,
              r.device_brand, r.device_model, r.problem_description, r.problem_photos,
              r.address_text, r.latitude, r.longitude, r.current_status,
              r.created_at, r.updated_at,
              c.name AS category_name, c.slug AS category_slug, c.icon_url AS category_icon,
              s.name AS service_name, s.base_price, s.estimated_duration_min
       FROM repair_requests r
       JOIN appliance_categories c ON r.category_id = c.id
       LEFT JOIN services s ON r.service_id = s.id
       WHERE r.id = ? AND r.customer_id = ? AND r.deleted_at IS NULL
       LIMIT 1`,
      [repairId, session.userId]
    );

    if (!repairs || repairs.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Pesanan servis tidak ditemukan' },
        { status: 404 }
      );
    }

    const repair = repairs[0];

    // 2. Ambil riwayat status kronologis
    const history = await query<any[]>(
      `SELECT h.id, h.previous_status, h.new_status, h.actor_role, h.notes, h.created_at,
              u.email AS actor_email
       FROM repair_status_history h
       JOIN users u ON h.changed_by_user_id = u.id
       WHERE h.repair_request_id = ?
       ORDER BY h.id ASC`,
      [repairId]
    );

    // 3. Ambil info penugasan teknisi (jika ada)
    const assignments = await query<any[]>(
      `SELECT ta.id AS assignment_id, ta.status AS assignment_status, ta.created_at AS assigned_at,
              u.id AS technician_user_id, u.phone_number AS technician_phone,
              tp.full_name AS technician_name, tp.avatar_url, tp.years_of_experience,
              tp.rating_avg, tp.rating_count
       FROM technician_assignments ta
       JOIN users u ON ta.technician_id = u.id
       JOIN technician_profiles tp ON u.id = tp.user_id
       WHERE ta.repair_request_id = ?
       ORDER BY ta.id DESC LIMIT 1`,
      [repairId]
    );

    // 4. Ambil hasil diagnosis lapangan teknisi (jika ada)
    const diagnoses = await query<any[]>(
      `SELECT id, damage_details, required_parts_json, labor_cost, parts_cost, total_estimate,
              evidence_photos, customer_approval, rejection_reason, created_at
       FROM repair_diagnoses
       WHERE repair_request_id = ?
       ORDER BY id DESC LIMIT 1`,
      [repairId]
    );

    // 5. Ambil invoice tagihan (jika ada)
    const invoices = await query<any[]>(
      `SELECT id, invoice_number, subtotal_labor, subtotal_parts, service_fee,
              discount_amount, total_amount, status, due_date, paid_at
       FROM invoices
       WHERE repair_request_id = ?
       LIMIT 1`,
      [repairId]
    );

    let photos: string[] = [];
    try {
      if (typeof repair.problem_photos === 'string') {
        photos = JSON.parse(repair.problem_photos);
      } else if (Array.isArray(repair.problem_photos)) {
        photos = repair.problem_photos;
      }
    } catch {
      photos = [];
    }

    return NextResponse.json({
      success: true,
      data: {
        id: Number(repair.id),
        orderCode: repair.order_code,
        status: repair.current_status,
        deviceBrand: repair.device_brand || '-',
        deviceModel: repair.device_model || '-',
        problemDescription: repair.problem_description,
        problemPhotos: photos,
        addressText: repair.address_text,
        latitude: Number(repair.latitude),
        longitude: Number(repair.longitude),
        createdAt: repair.created_at,
        updatedAt: repair.updated_at,
        category: {
          id: Number(repair.category_id),
          name: repair.category_name,
          slug: repair.category_slug,
          iconUrl: repair.category_icon,
        },
        service: repair.service_id
          ? {
              id: Number(repair.service_id),
              name: repair.service_name,
              basePrice: Number(repair.base_price),
              estimatedDurationMin: Number(repair.estimated_duration_min),
            }
          : null,
        history: history.map((h) => ({
          id: Number(h.id),
          previousStatus: h.previous_status,
          newStatus: h.new_status,
          actorRole: h.actor_role,
          notes: h.notes,
          createdAt: h.created_at,
        })),
        technician: assignments.length > 0
          ? {
              name: assignments[0].technician_name,
              phone: assignments[0].technician_phone,
              avatarUrl: assignments[0].avatar_url,
              yearsOfExperience: assignments[0].years_of_experience,
              ratingAvg: Number(assignments[0].rating_avg || 0),
              ratingCount: assignments[0].rating_count,
              assignmentStatus: assignments[0].assignment_status,
            }
          : null,
        diagnosis: diagnoses.length > 0
          ? {
              id: Number(diagnoses[0].id),
              damageDetails: diagnoses[0].damage_details,
              laborCost: Number(diagnoses[0].labor_cost),
              partsCost: Number(diagnoses[0].parts_cost),
              totalEstimate: Number(diagnoses[0].total_estimate),
              customerApproval: diagnoses[0].customer_approval,
              rejectionReason: diagnoses[0].rejection_reason,
            }
          : null,
        invoice: invoices.length > 0
          ? {
              invoiceNumber: invoices[0].invoice_number,
              totalAmount: Number(invoices[0].total_amount),
              status: invoices[0].status,
              paidAt: invoices[0].paid_at,
            }
          : null,
      },
    });
  } catch (error: any) {
    console.error('[Get Single Repair Error]:', error);
    return NextResponse.json(
      { success: false, message: 'Gagal mengambil detail pesanan' },
      { status: 500 }
    );
  }
}

