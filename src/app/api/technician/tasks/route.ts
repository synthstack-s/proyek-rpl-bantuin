import { NextRequest, NextResponse } from 'next/server';
import { getUserSession } from '@/lib/auth';
import { query } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const session = await getUserSession();
    if (!session || session.role !== 'technician') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: sesi mitra teknisi tidak valid' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const filterStatus = searchParams.get('status') || 'all'; // all, offered, active, completed
    const search = searchParams.get('search') || '';

    // 1. Ambil seluruh data penugasan untuk teknisi ini
    let whereConditions = ['ta.technician_id = ?', 'rr.deleted_at IS NULL'];
    let queryParams: any[] = [session.userId];

    if (filterStatus === 'offered') {
      whereConditions.push("ta.status = 'offered'");
    } else if (filterStatus === 'active') {
      whereConditions.push("ta.status = 'accepted' AND rr.current_status NOT IN ('completed', 'cancelled')");
    } else if (filterStatus === 'completed') {
      whereConditions.push("ta.status = 'completed' OR rr.current_status = 'completed'");
    }

    if (search.trim()) {
      whereConditions.push('(rr.order_code LIKE ? OR cp.full_name LIKE ? OR ac.name LIKE ?)');
      const wildcard = `%${search.trim()}%`;
      queryParams.push(wildcard, wildcard, wildcard);
    }

    const whereClause = whereConditions.join(' AND ');

    const tasksSql = `
      SELECT 
        ta.id AS assignment_id,
        ta.status AS assignment_status,
        ta.assignment_type,
        ta.rejection_reason,
        ta.created_at AS assigned_at,
        ta.responded_at,
        rr.id AS repair_request_id,
        rr.order_code,
        rr.current_status AS order_status,
        rr.device_brand,
        rr.device_model,
        rr.problem_description,
        rr.problem_photos,
        rr.address_text,
        rr.latitude,
        rr.longitude,
        rr.created_at AS order_created_at,
        ac.name AS category_name,
        ac.icon_url AS category_icon,
        s.name AS service_name,
        COALESCE(cp.full_name, 'Pelanggan') AS customer_name,
        u.phone_number AS customer_phone,
        inv.id AS invoice_id,
        inv.invoice_number,
        inv.total_amount AS invoice_amount,
        inv.status AS invoice_status,
        diag.id AS diagnosis_id,
        diag.damage_details,
        diag.labor_cost,
        diag.parts_cost,
        diag.total_estimate,
        diag.customer_approval
      FROM technician_assignments ta
      JOIN repair_requests rr ON ta.repair_request_id = rr.id
      JOIN appliance_categories ac ON rr.category_id = ac.id
      LEFT JOIN services s ON rr.service_id = s.id
      LEFT JOIN users u ON rr.customer_id = u.id
      LEFT JOIN customer_profiles cp ON rr.customer_id = cp.user_id
      LEFT JOIN invoices inv ON inv.repair_request_id = rr.id
      LEFT JOIN (
        SELECT d1.*
        FROM repair_diagnoses d1
        INNER JOIN (
          SELECT repair_request_id, MAX(id) AS max_id
          FROM repair_diagnoses
          GROUP BY repair_request_id
        ) d2 ON d1.id = d2.max_id
      ) diag ON rr.id = diag.repair_request_id
      WHERE ${whereClause}
      ORDER BY ta.id DESC
    `;

    const tasks = await query<any[]>(tasksSql, queryParams);

    // 2. Hitung statistik KPI teknisi
    const statsSql = `
      SELECT 
        COUNT(DISTINCT ta.id) AS total_assignments,
        SUM(CASE WHEN ta.status = 'offered' THEN 1 ELSE 0 END) AS offered_count,
        SUM(CASE WHEN ta.status = 'accepted' AND rr.current_status NOT IN ('completed', 'cancelled') THEN 1 ELSE 0 END) AS active_count,
        SUM(CASE WHEN ta.status = 'completed' OR rr.current_status = 'completed' THEN 1 ELSE 0 END) AS completed_count,
        COALESCE(SUM(CASE WHEN rr.current_status = 'completed' THEN COALESCE(inv.subtotal_labor, 0) ELSE 0 END), 0) AS estimated_earnings
      FROM technician_assignments ta
      JOIN repair_requests rr ON ta.repair_request_id = rr.id
      LEFT JOIN invoices inv ON inv.repair_request_id = rr.id
      WHERE ta.technician_id = ? AND rr.deleted_at IS NULL
    `;
    const statsRes = await query<any[]>(statsSql, [session.userId]);
    const stats = statsRes[0] || {};

    const formattedTasks = tasks.map((t) => ({
      assignmentId: t.assignment_id,
      assignmentStatus: t.assignment_status,
      assignmentType: t.assignment_type,
      assignedAt: t.assigned_at,
      respondedAt: t.responded_at,
      repairId: t.repair_request_id,
      orderCode: t.order_code,
      orderStatus: t.order_status,
      categoryName: t.category_name,
      serviceName: t.service_name || 'Inspeksi & Perbaikan',
      device: [t.device_brand, t.device_model].filter(Boolean).join(' ') || 'Elektronik Rumah Tangga',
      problemDescription: t.problem_description,
      problemPhotos: typeof t.problem_photos === 'string' ? JSON.parse(t.problem_photos || '[]') : t.problem_photos || [],
      addressText: t.address_text,
      latitude: t.latitude ? Number(t.latitude) : null,
      longitude: t.longitude ? Number(t.longitude) : null,
      customerName: t.customer_name,
      customerPhone: t.customer_phone || '-',
      invoice: t.invoice_id
        ? {
            id: t.invoice_id,
            invoiceNumber: t.invoice_number,
            amount: Number(t.invoice_amount),
            status: t.invoice_status,
          }
        : null,
      diagnosis: t.diagnosis_id
        ? {
            id: t.diagnosis_id,
            damageDetails: t.damage_details,
            laborCost: Number(t.labor_cost),
            partsCost: Number(t.parts_cost),
            totalEstimate: Number(t.total_estimate),
            customerApproval: t.customer_approval,
          }
        : null,
    }));

    return NextResponse.json({
      success: true,
      stats: {
        totalAssignments: Number(stats.total_assignments || 0),
        offeredCount: Number(stats.offered_count || 0),
        activeCount: Number(stats.active_count || 0),
        completedCount: Number(stats.completed_count || 0),
        estimatedEarnings: Number(stats.estimated_earnings || 0),
      },
      data: formattedTasks,
    });
  } catch (error: any) {
    console.error('Error fetching technician tasks:', error);
    return NextResponse.json(
      { success: false, message: 'Gagal mengambil daftar tugas: ' + error.message },
      { status: 500 }
    );
  }
}

