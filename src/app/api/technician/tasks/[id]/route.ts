import { NextRequest, NextResponse } from 'next/server';
import { getUserSession } from '@/lib/auth';
import { query } from '@/lib/db';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await getUserSession();
    if (!session || session.role !== 'technician') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: sesi mitra teknisi tidak valid' },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    const assignmentId = parseInt(id, 10);
    if (isNaN(assignmentId)) {
      return NextResponse.json({ success: false, message: 'ID penugasan tidak valid' }, { status: 400 });
    }

    const rows = await query<any[]>(
      `SELECT ta.*, rr.order_code, rr.current_status AS order_status, rr.problem_description,
              rr.device_brand, rr.device_model, rr.address_text, rr.latitude, rr.longitude,
              rr.problem_photos, ac.name AS category_name, s.name AS service_name,
              COALESCE(cp.full_name, 'Pelanggan') AS customer_name, u.phone_number AS customer_phone
       FROM technician_assignments ta
       JOIN repair_requests rr ON ta.repair_request_id = rr.id
       JOIN appliance_categories ac ON rr.category_id = ac.id
       LEFT JOIN services s ON rr.service_id = s.id
       LEFT JOIN users u ON rr.customer_id = u.id
       LEFT JOIN customer_profiles cp ON rr.customer_id = cp.user_id
       WHERE ta.id = ? AND ta.technician_id = ? AND rr.deleted_at IS NULL
       LIMIT 1`,
      [assignmentId, session.userId]
    );

    if (rows.length === 0) {
      return NextResponse.json({ success: false, message: 'Data penugasan tidak ditemukan' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: rows[0] });
  } catch (error: any) {
    console.error('Error fetching technician task detail:', error);
    return NextResponse.json(
      { success: false, message: 'Gagal mengambil detail tugas: ' + error.message },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await getUserSession();
    if (!session || session.role !== 'technician') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: sesi mitra teknisi tidak valid' },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    const assignmentId = parseInt(id, 10);
    if (isNaN(assignmentId)) {
      return NextResponse.json({ success: false, message: 'ID penugasan tidak valid' }, { status: 400 });
    }

    const body = await request.json();
    const { action, rejection_reason, damage_details, labor_cost, parts_cost, required_parts_json, notes } = body;

    // 1. Ambil data penugasan dan pesanan
    const rows = await query<any[]>(
      `SELECT ta.id, ta.status AS assignment_status, ta.repair_request_id,
              rr.id AS repair_id, rr.order_code, rr.current_status, rr.customer_id,
              s.name AS service_name, ac.name AS category_name
       FROM technician_assignments ta
       JOIN repair_requests rr ON ta.repair_request_id = rr.id
       JOIN appliance_categories ac ON rr.category_id = ac.id
       LEFT JOIN services s ON rr.service_id = s.id
       WHERE ta.id = ? AND ta.technician_id = ? AND rr.deleted_at IS NULL
       LIMIT 1`,
      [assignmentId, session.userId]
    );

    if (rows.length === 0) {
      return NextResponse.json({ success: false, message: 'Penugasan tidak ditemukan' }, { status: 404 });
    }

    const task = rows[0];
    const repairId = task.repair_id;

    // 2. Eksekusi Berdasarkan Aksi Alur Kerja
    switch (action) {
      case 'accept': {
        // Terima tawaran tugas
        await query(
          `UPDATE technician_assignments
           SET status = 'accepted', responded_at = NOW()
           WHERE id = ?`,
          [assignmentId]
        );

        await query(
          `UPDATE repair_requests SET current_status = 'assigned' WHERE id = ?`,
          [repairId]
        );

        await query(
          `INSERT INTO repair_status_history (repair_request_id, previous_status, new_status, changed_by_user_id, actor_role, notes)
           VALUES (?, ?, 'assigned', ?, 'technician', 'Mitra teknisi menerima tawaran penugasan perbaikan')`,
          [repairId, task.current_status, session.userId]
        );

        // Notifikasi ke Pelanggan
        await query(
          `INSERT INTO notifications (user_id, title, message, entity_type, entity_id)
           VALUES (?, 'Teknisi Menerima Pesanan Anda', ?, 'repair_request', ?)`,
          [
            task.customer_id,
            `Mitra teknisi resmi telah menerima pesanan #${task.order_code} dan segera mempersiapkan peralatan inspeksi.`,
            repairId,
          ]
        );

        return NextResponse.json({
          success: true,
          message: 'Tugas perbaikan berhasil diterima.',
        });
      }

      case 'reject': {
        // Tolak tawaran tugas
        const reason = (rejection_reason || 'Sedang menangani pekerjaan lain').trim();

        await query(
          `UPDATE technician_assignments
           SET status = 'rejected', rejection_reason = ?, responded_at = NOW()
           WHERE id = ?`,
          [reason, assignmentId]
        );

        // Reset status order ke submitted agar bisa ditugaskan ke teknisi lain
        await query(
          `UPDATE repair_requests SET current_status = 'submitted' WHERE id = ?`,
          [repairId]
        );

        await query(
          `INSERT INTO repair_status_history (repair_request_id, previous_status, new_status, changed_by_user_id, actor_role, notes)
           VALUES (?, ?, 'submitted', ?, 'technician', ?)`,
          [repairId, task.current_status, session.userId, `Teknisi berhalangan: ${reason}`]
        );

        return NextResponse.json({
          success: true,
          message: 'Tawaran tugas perbaikan telah ditolak.',
        });
      }

      case 'on_the_way': {
        // Teknisi berangkat ke lokasi pelanggan
        await query(
          `UPDATE repair_requests SET current_status = 'scheduled' WHERE id = ?`,
          [repairId]
        );

        await query(
          `INSERT INTO repair_status_history (repair_request_id, previous_status, new_status, changed_by_user_id, actor_role, notes)
           VALUES (?, ?, 'scheduled', ?, 'technician', 'Teknisi sedang dalam perjalanan menuju lokasi pelanggan')`,
          [repairId, task.current_status, session.userId]
        );

        await query(
          `INSERT INTO notifications (user_id, title, message, entity_type, entity_id)
           VALUES (?, 'Teknisi Sedang Menuju Rumah Anda', ?, 'repair_request', ?)`,
          [
            task.customer_id,
            `Teknisi BANTUIN sedang dalam perjalanan ke alamat Anda untuk pesanan #${task.order_code}. Mohon pastikan unit dapat diakses dengan aman.`,
            repairId,
          ]
        );

        return NextResponse.json({
          success: true,
          message: 'Status diperbarui: Dalam perjalanan ke lokasi.',
        });
      }

      case 'start_diagnosis': {
        // Tiba di lokasi dan mulai inspeksi fisik
        await query(
          `UPDATE repair_requests SET current_status = 'in_diagnosis' WHERE id = ?`,
          [repairId]
        );

        await query(
          `INSERT INTO repair_status_history (repair_request_id, previous_status, new_status, changed_by_user_id, actor_role, notes)
           VALUES (?, ?, 'in_diagnosis', ?, 'technician', 'Teknisi tiba di lokasi dan memulai inspeksi fisik unit')`,
          [repairId, task.current_status, session.userId]
        );

        return NextResponse.json({
          success: true,
          message: 'Status diperbarui: Pemeriksaan fisik unit dimulai.',
        });
      }

      case 'submit_diagnosis': {
        // Input hasil diagnosa & estimasi biaya
        const details = (damage_details || '').trim();
        if (!details) {
          return NextResponse.json(
            { success: false, message: 'Rincian temuan kerusakan wajib diisi' },
            { status: 400 }
          );
        }

        const labor = Math.max(0, Number(labor_cost) || 0);
        const parts = Math.max(0, Number(parts_cost) || 0);
        const total = labor + parts;

        const partsJson = required_parts_json
          ? typeof required_parts_json === 'string'
            ? required_parts_json
            : JSON.stringify(required_parts_json)
          : null;

        // Masukkan atau update di repair_diagnoses
        await query(
          `INSERT INTO repair_diagnoses (
            repair_request_id, technician_id, damage_details, required_parts_json,
            labor_cost, parts_cost, total_estimate, customer_approval
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
          ON DUPLICATE KEY UPDATE
            damage_details = VALUES(damage_details),
            required_parts_json = VALUES(required_parts_json),
            labor_cost = VALUES(labor_cost),
            parts_cost = VALUES(parts_cost),
            total_estimate = VALUES(total_estimate),
            customer_approval = 'pending'`,
          [repairId, session.userId, details, partsJson, labor, parts, total]
        );

        // Update status order menjadi 'estimated'
        await query(
          `UPDATE repair_requests SET current_status = 'estimated' WHERE id = ?`,
          [repairId]
        );

        await query(
          `INSERT INTO repair_status_history (repair_request_id, previous_status, new_status, changed_by_user_id, actor_role, notes)
           VALUES (?, ?, 'estimated', ?, 'technician', ?)`,
          [
            repairId,
            task.current_status,
            session.userId,
            `Estimasi biaya diajukan: Ongkos Rp ${labor.toLocaleString('id-ID')}, Sparepart Rp ${parts.toLocaleString('id-ID')} (Total Rp ${total.toLocaleString('id-ID')})`,
          ]
        );

        // Notifikasi ke Pelanggan untuk Persetujuan
        await query(
          `INSERT INTO notifications (user_id, title, message, entity_type, entity_id)
           VALUES (?, 'Estimasi Biaya Perbaikan Menunggu Persetujuan', ?, 'repair_request', ?)`,
          [
            task.customer_id,
            `Teknisi telah menyelesaikan inspeksi #${task.order_code} dengan total estimasi Rp ${total.toLocaleString('id-ID')}. Silakan periksa dan setujui di aplikasi.`,
            repairId,
          ]
        );

        return NextResponse.json({
          success: true,
          message: 'Estimasi biaya berhasil diajukan ke pelanggan.',
        });
      }

      case 'start_repair': {
        // Mulai eksekusi perbaikan setelah disetujui pelanggan
        await query(
          `UPDATE repair_requests SET current_status = 'in_repair' WHERE id = ?`,
          [repairId]
        );

        await query(
          `INSERT INTO repair_status_history (repair_request_id, previous_status, new_status, changed_by_user_id, actor_role, notes)
           VALUES (?, ?, 'in_repair', ?, 'technician', 'Teknisi memulai pengerjaan fisik perbaikan unit')`,
          [repairId, task.current_status, session.userId]
        );

        return NextResponse.json({
          success: true,
          message: 'Status diperbarui: Proses perbaikan sedang berlangsung.',
        });
      }

      case 'complete': {
        // Selesaikan perbaikan dan terbitkan invoice
        // 1. Ambil data diagnosa biaya terakhir
        const diagRows = await query<any[]>(
          `SELECT labor_cost, parts_cost, total_estimate
           FROM repair_diagnoses
           WHERE repair_request_id = ?
           ORDER BY id DESC LIMIT 1`,
          [repairId]
        );

        const labor = diagRows.length > 0 ? Number(diagRows[0].labor_cost) : 100000;
        const parts = diagRows.length > 0 ? Number(diagRows[0].parts_cost) : 0;
        const platformFee = 10000; // Standar biaya platform BANTUIN
        const grandTotal = labor + parts + platformFee;

        // 2. Terbitkan atau Update Invoice
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const invNumber = `INV-${dateStr}-${repairId.toString().padStart(4, '0')}`;

        await query(
          `INSERT INTO invoices (
            invoice_number, repair_request_id, customer_id,
            subtotal_labor, subtotal_parts, service_fee, total_amount, status, due_date
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'unpaid', DATE_ADD(NOW(), INTERVAL 3 DAY))
          ON DUPLICATE KEY UPDATE
            subtotal_labor = VALUES(subtotal_labor),
            subtotal_parts = VALUES(subtotal_parts),
            service_fee = VALUES(service_fee),
            total_amount = VALUES(total_amount)`,
          [invNumber, repairId, task.customer_id, labor, parts, platformFee, grandTotal]
        );

        // 3. Update status order & assignment menjadi completed
        await query(
          `UPDATE repair_requests SET current_status = 'completed' WHERE id = ?`,
          [repairId]
        );

        await query(
          `UPDATE technician_assignments SET status = 'completed' WHERE id = ?`,
          [assignmentId]
        );

        await query(
          `INSERT INTO repair_status_history (repair_request_id, previous_status, new_status, changed_by_user_id, actor_role, notes)
           VALUES (?, ?, 'completed', ?, 'technician', ?)`,
          [
            repairId,
            task.current_status,
            session.userId,
            notes || 'Perbaikan selesai tuntas dan unit telah diuji coba berfungsi baik.',
          ]
        );

        // 4. Notifikasi ke Pelanggan
        await query(
          `INSERT INTO notifications (user_id, title, message, entity_type, entity_id)
           VALUES (?, 'Perbaikan Selesai & Tagihan Diterbitkan', ?, 'invoice', ?)`,
          [
            task.customer_id,
            `Perbaikan unit untuk pesanan #${task.order_code} telah selesai. Tagihan resmi ${invNumber} senilai Rp ${grandTotal.toLocaleString('id-ID')} siap dilunasi. Garansi resmi 30 hari aktif!`,
            repairId,
          ]
        );

        return NextResponse.json({
          success: true,
          message: 'Pekerjaan perbaikan berhasil diselesaikan dan invoice telah diterbitkan.',
        });
      }

      default:
        return NextResponse.json(
          { success: false, message: 'Aksi alur kerja teknisi tidak dikenali' },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error('Error updating technician task:', error);
    return NextResponse.json(
      { success: false, message: 'Gagal memperbarui status tugas: ' + error.message },
      { status: 500 }
    );
  }
}
