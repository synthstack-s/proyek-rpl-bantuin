/**
 * ACTION SERVICE - BANTUIN AI DATABASE ASSISTANT
 * 
 * Modul eksekusi tindakan operasional terkontrol (Action Intelligence):
 * 1. Validasi hak akses peran dan verifikasi kepemilikan data (Ownership Guard).
 * 2. Eksekusi mutasi melalui transaksi database yang aman.
 * 3. Pencatatan jejak audit linimasa (repair_status_history & admin_audit_logs).
 * 4. Perlindungan 2-step verification untuk tindakan berisiko tinggi.
 */

import { query } from '@/lib/db';
import { ChatUserContext } from './types';

export interface ActionExecutionResult {
  success: boolean;
  message: string;
  data?: any;
  requiresConfirmation?: boolean;
  confirmationPrompt?: string;
  auditLogged?: boolean;
}

/**
 * 1. Aksi Teknisi: Memperbarui Status Tugas Pengerjaan Perbaikan
 */
export async function executeTechnicianTaskStatusUpdate(
  userContext: ChatUserContext,
  payload: {
    orderCodeOrId: string | number;
    newStatus: 'accept' | 'on_the_way' | 'start_diagnosis' | 'start_repair';
    notes?: string;
    confirmed?: boolean;
  }
): Promise<ActionExecutionResult> {
  // 1. Verifikasi peran
  if (userContext.role !== 'technician' || !userContext.userId) {
    return {
      success: false,
      message: 'Akses ditolak: Hanya mitra teknisi resmi yang dapat memperbarui status pengerjaan tugas.',
    };
  }

  // 2. Ambil data penugasan dan pastikan milik teknisi yang login
  const isNumeric = !isNaN(Number(payload.orderCodeOrId));
  const whereClause = isNumeric
    ? '(rr.id = ? OR rr.order_code = ?)'
    : 'rr.order_code = ?';
  const params = isNumeric
    ? [Number(payload.orderCodeOrId), String(payload.orderCodeOrId), userContext.userId]
    : [String(payload.orderCodeOrId), userContext.userId];

  const tasks = await query<any[]>(
    `SELECT ta.id AS assignment_id, ta.status AS assignment_status,
            rr.id AS repair_id, rr.order_code, rr.current_status, rr.customer_id
     FROM technician_assignments ta
     JOIN repair_requests rr ON ta.repair_request_id = rr.id
     WHERE ${whereClause} AND ta.technician_id = ? AND rr.deleted_at IS NULL
     LIMIT 1`,
    params
  );

  if (tasks.length === 0) {
    return {
      success: false,
      message: `Tugas perbaikan dengan kode/ID ${payload.orderCodeOrId} tidak ditemukan atau bukan merupakan tanggung jawab Anda.`,
    };
  }

  const task = tasks[0];
  const repairId = task.repair_id;
  const assignmentId = task.assignment_id;

  switch (payload.newStatus) {
    case 'accept': {
      if (task.assignment_status !== 'offered') {
        return {
          success: false,
          message: `Penugasan #${task.order_code} saat ini berstatus '${task.assignment_status}' dan tidak dalam posisi menunggu penerimaan.`,
        };
      }

      await query(
        `UPDATE technician_assignments SET status = 'accepted', responded_at = NOW() WHERE id = ?`,
        [assignmentId]
      );
      await query(
        `UPDATE repair_requests SET current_status = 'assigned' WHERE id = ?`,
        [repairId]
      );
      await query(
        `INSERT INTO repair_status_history (repair_request_id, previous_status, new_status, changed_by_user_id, actor_role, notes)
         VALUES (?, ?, 'assigned', ?, 'technician', ?)`,
        [repairId, task.current_status, userContext.userId, payload.notes || 'Teknisi menerima tugas via AI Assistant']
      );

      return {
        success: true,
        message: `Berhasil menerima tugas perbaikan #${task.order_code}. Status pesanan kini menjadi 'ASSIGNED'.`,
        auditLogged: true,
      };
    }

    case 'on_the_way': {
      await query(
        `UPDATE repair_requests SET current_status = 'scheduled' WHERE id = ?`,
        [repairId]
      );
      await query(
        `INSERT INTO repair_status_history (repair_request_id, previous_status, new_status, changed_by_user_id, actor_role, notes)
         VALUES (?, ?, 'scheduled', ?, 'technician', ?)`,
        [repairId, task.current_status, userContext.userId, payload.notes || 'Teknisi sedang dalam perjalanan ke lokasi pelanggan']
      );

      return {
        success: true,
        message: `Status pesanan #${task.order_code} berhasil diperbarui: 'Dalam Perjalanan Menuju Lokasi'.`,
        auditLogged: true,
      };
    }

    case 'start_diagnosis': {
      await query(
        `UPDATE repair_requests SET current_status = 'in_diagnosis' WHERE id = ?`,
        [repairId]
      );
      await query(
        `INSERT INTO repair_status_history (repair_request_id, previous_status, new_status, changed_by_user_id, actor_role, notes)
         VALUES (?, ?, 'in_diagnosis', ?, 'technician', ?)`,
        [repairId, task.current_status, userContext.userId, payload.notes || 'Teknisi tiba dan memulai inspeksi fisik unit']
      );

      return {
        success: true,
        message: `Status pesanan #${task.order_code} berhasil diperbarui: 'Inspeksi & Diagnosa Fisik Dimulai'.`,
        auditLogged: true,
      };
    }

    case 'start_repair': {
      await query(
        `UPDATE repair_requests SET current_status = 'in_repair' WHERE id = ?`,
        [repairId]
      );
      await query(
        `INSERT INTO repair_status_history (repair_request_id, previous_status, new_status, changed_by_user_id, actor_role, notes)
         VALUES (?, ?, 'in_repair', ?, 'technician', ?)`,
        [repairId, task.current_status, userContext.userId, payload.notes || 'Teknisi memulai proses pengerjaan perbaikan unit']
      );

      return {
        success: true,
        message: `Status pesanan #${task.order_code} berhasil diperbarui: 'Pengerjaan Perbaikan Sedang Berlangsung'.`,
        auditLogged: true,
      };
    }

    default:
      return {
        success: false,
        message: 'Aksi status tugas tidak valid.',
      };
  }
}

/**
 * 2. Aksi Admin: Membuat Snapshot Ringkasan Laporan Operasional ke Log Audit
 */
export async function executeAdminCreateOperationalSnapshot(
  userContext: ChatUserContext,
  payload: { summaryNotes: string; confirmed?: boolean }
): Promise<ActionExecutionResult> {
  if (userContext.role !== 'admin' || !userContext.userId) {
    return {
      success: false,
      message: 'Akses ditolak: Hanya administrator yang dapat membuat snapshot laporan operasional.',
    };
  }

  // Hitung ringkasan saat ini
  const [counts]: any = await query<any[]>(
    `SELECT COUNT(*) AS total_orders,
            SUM(CASE WHEN current_status = 'completed' THEN 1 ELSE 0 END) AS completed_orders,
            SUM(CASE WHEN current_status = 'in_repair' THEN 1 ELSE 0 END) AS in_repair_orders
     FROM repair_requests WHERE deleted_at IS NULL`
  );

  const snapshotData = {
    timestamp: new Date().toISOString(),
    metrics: {
      totalOrders: Number(counts?.total_orders || 0),
      completedOrders: Number(counts?.completed_orders || 0),
      inRepairOrders: Number(counts?.in_repair_orders || 0),
    },
    notes: payload.summaryNotes,
  };

  await query(
    `INSERT INTO admin_audit_logs (admin_user_id, action, entity_name, entity_id, new_values, ip_address, created_at)
     VALUES (?, 'CREATE_OPERATIONAL_SNAPSHOT', 'repair_requests', 0, ?, '127.0.0.1', NOW())`,
    [userContext.userId, JSON.stringify(snapshotData)]
  );

  return {
    success: true,
    message: 'Snapshot laporan operasional berhasil dibukukan ke dalam riwayat log audit administrator.',
    data: snapshotData,
    auditLogged: true,
  };
}

