/**
 * ACTION SERVICE - BANTUIN AI DATABASE ASSISTANT
 *
 * Modul eksekusi tindakan operasional terkontrol (Action Intelligence):
 * 1. Validasi hak akses peran dan verifikasi kepemilikan data (Ownership Guard).
 * 2. Eksekusi mutasi melalui transaksi database yang aman (F4: satu koneksi,
 *    BEGIN/COMMIT/ROLLBACK — kegagalan di tengah jalan membatalkan seluruh
 *    mutasi, bukan menyisakan perubahan parsial).
 * 3. State machine eksplisit untuk transisi status tugas (F5/F11:
 *    TECHNICIAN_TASK_TRANSITIONS — setiap aksi hanya valid dari status
 *    penugasan + status pesanan tertentu; status terminal ditolak; cek
 *    status bersifat atomik lewat UPDATE ... WHERE current_status = ?
 *    + verifikasi affectedRows).
 * 4. Perlindungan 2-step verification untuk tindakan berisiko tinggi (F10:
 *    panggilan tanpa confirmed === true mengembalikan requiresConfirmation
 *    + confirmationPrompt dan TIDAK memutasi apa pun; eksekusi hanya bila
 *    confirmed === true).
 * 5. Pencatatan jejak audit linimasa (repair_status_history & admin_audit_logs).
 */

import { query, pool } from '@/lib/db';
import { ChatUserContext } from './types';

export interface ActionExecutionResult {
  success: boolean;
  message: string;
  data?: any;
  requiresConfirmation?: boolean;
  confirmationPrompt?: string;
  auditLogged?: boolean;
}

export type TechnicianTaskAction =
  | 'accept'
  | 'on_the_way'
  | 'start_diagnosis'
  | 'start_repair';

/**
 * F5/F11 — Matriks transisi status tugas teknisi (satu-satunya sumber
 * kebenaran untuk aksi chatbot; selaras dengan ENUM di schema.sql).
 *
 * - technician_assignments.status: offered, accepted, rejected, reassigned,
 *   completed, cancelled.
 * - repair_requests.current_status: draft, submitted, assigned, scheduled,
 *   in_diagnosis, estimated, customer_approved, in_repair, completed,
 *   cancelled, complained.
 *
 * Alur normal: offered --accept--> accepted/assigned --on_the_way-->
 * scheduled --start_diagnosis--> in_diagnosis --start_repair--> in_repair.
 * `accept` membolehkan pesanan 'assigned' (kasus penugasan ulang: pesanan
 * sudah 'assigned' oleh teknisi sebelumnya, lalu ditawarkan kembali).
 * Status terminal (completed/cancelled) tidak pernah menjadi sumber
 * transisi apa pun.
 */
export interface TechnicianTaskTransition {
  /** Status penugasan yang disyaratkan sebelum aksi. */
  assignmentFrom: 'offered' | 'accepted';
  /** Status pesanan yang disyaratkan sebelum aksi. */
  repairFrom: string[];
  /** Status pesanan setelah aksi. */
  repairTo: string;
  /** Status penugasan setelah aksi (hanya `accept` yang mengubahnya). */
  assignmentTo?: 'accepted';
  /** Label aksi dalam Bahasa Indonesia (untuk prompt konfirmasi). */
  label: string;
  /** Catatan default untuk repair_status_history. */
  defaultNotes: string;
  /** Pesan sukses (parameter: kode pesanan). */
  successMessage: (orderCode: string) => string;
}

export const TERMINAL_REPAIR_STATUSES: readonly string[] = ['completed', 'cancelled'];

export const TECHNICIAN_TASK_TRANSITIONS: Record<TechnicianTaskAction, TechnicianTaskTransition> = {
  accept: {
    assignmentFrom: 'offered',
    repairFrom: ['submitted', 'assigned'],
    repairTo: 'assigned',
    assignmentTo: 'accepted',
    label: 'menerima tugas',
    defaultNotes: 'Teknisi menerima tugas via AI Assistant',
    successMessage: (orderCode) =>
      `Berhasil menerima tugas perbaikan #${orderCode}. Status pesanan kini menjadi 'ASSIGNED'.`,
  },
  on_the_way: {
    assignmentFrom: 'accepted',
    repairFrom: ['assigned'],
    repairTo: 'scheduled',
    label: 'menuju lokasi pelanggan',
    defaultNotes: 'Teknisi sedang dalam perjalanan ke lokasi pelanggan',
    successMessage: (orderCode) =>
      `Status pesanan #${orderCode} berhasil diperbarui: 'Dalam Perjalanan Menuju Lokasi'.`,
  },
  start_diagnosis: {
    assignmentFrom: 'accepted',
    repairFrom: ['scheduled'],
    repairTo: 'in_diagnosis',
    label: 'memulai diagnosa',
    defaultNotes: 'Teknisi tiba dan memulai inspeksi fisik unit',
    successMessage: (orderCode) =>
      `Status pesanan #${orderCode} berhasil diperbarui: 'Inspeksi & Diagnosa Fisik Dimulai'.`,
  },
  start_repair: {
    assignmentFrom: 'accepted',
    repairFrom: ['in_diagnosis'],
    repairTo: 'in_repair',
    label: 'memulai perbaikan',
    defaultNotes: 'Teknisi memulai proses pengerjaan perbaikan unit',
    successMessage: (orderCode) =>
      `Status pesanan #${orderCode} berhasil diperbarui: 'Pengerjaan Perbaikan Sedang Berlangsung'.`,
  },
};

/**
 * F4 — Menjalankan satu statement di dalam koneksi transaksi dan
 * mengembalikan jumlah baris yang terpengaruh (untuk verifikasi atomik
 * UPDATE ... WHERE status = ?).
 */
async function executeInTransaction(
  conn: Awaited<ReturnType<typeof pool.getConnection>>,
  sql: string,
  params: any[]
): Promise<number> {
  const [result]: any = await conn.execute(sql, params);
  return Number(result?.affectedRows ?? 0);
}

/**
 * 1. Aksi Teknisi: Memperbarui Status Tugas Pengerjaan Perbaikan
 *
 * Urutan: cek peran -> muat penugasan (milik teknisi login) -> validasi
 * state machine (F5/F11) -> gerbang konfirmasi dua langkah (F10) ->
 * eksekusi transaksional atomik (F4). Kegagalan pada langkah mana pun
 * sebelum COMMIT berarti TIDAK ADA mutasi yang tersimpan.
 */
export async function executeTechnicianTaskStatusUpdate(
  userContext: ChatUserContext,
  payload: {
    orderCodeOrId: string | number;
    newStatus: TechnicianTaskAction;
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

  const transition = TECHNICIAN_TASK_TRANSITIONS[payload.newStatus];
  if (!transition) {
    return {
      success: false,
      message: 'Aksi status tugas tidak valid.',
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
  const orderCode = String(task.order_code);

  // 3. F5/F11 — Validasi state machine SEBELUM konfirmasi maupun mutasi.
  // Pesanan terminal (completed/cancelled) tidak dapat diubah lagi.
  if (TERMINAL_REPAIR_STATUSES.includes(task.current_status)) {
    return {
      success: false,
      message: `Pesanan #${orderCode} sudah berstatus '${task.current_status}' dan tidak dapat diubah lagi.`,
    };
  }

  // Status penugasan harus sesuai aksi: penugasan yang sudah rejected /
  // cancelled / reassigned / completed tidak bisa memutasi pesanan (F11).
  if (task.assignment_status !== transition.assignmentFrom) {
    const expectedNote =
      payload.newStatus === 'accept'
        ? `tidak dalam posisi menunggu penerimaan`
        : `aksi '${transition.label}' hanya dapat dilakukan saat penugasan berstatus '${transition.assignmentFrom}'`;
    return {
      success: false,
      message: `Penugasan #${orderCode} saat ini berstatus '${task.assignment_status}' dan ${expectedNote}.`,
    };
  }

  // Status pesanan harus sesuai aksi (tanpa lompat status, tanpa pengulangan).
  if (!transition.repairFrom.includes(task.current_status)) {
    return {
      success: false,
      message: `Pesanan #${orderCode} saat ini berstatus '${task.current_status}'; aksi '${transition.label}' hanya dapat dilakukan saat pesanan berstatus ${transition.repairFrom.map((s: string) => `'${s}'`).join(' atau ')}.`,
    };
  }

  // 4. F10 — Two-step verification: tanpa confirmed === true, kembalikan
  // prompt konfirmasi dan JANGAN memutasi apa pun. Pemanggil (engine /
  // tools) menampilkan prompt ini ke teknisi, lalu memanggil ulang dengan
  // confirmed: true setelah teknisi menjawab "ya".
  if (payload.confirmed !== true) {
    const confirmationPrompt =
      `Konfirmasi aksi teknisi:\n` +
      `- Aksi: ${transition.label}\n` +
      `- Pesanan: #${orderCode}\n` +
      `- Status pesanan: '${task.current_status}' → '${transition.repairTo}'\n` +
      `Balas "ya" untuk melanjutkan, atau "tidak" untuk membatalkan.`;
    return {
      success: false,
      message: confirmationPrompt,
      data: {
        orderCode,
        action: payload.newStatus,
        currentRepairStatus: task.current_status,
        newRepairStatus: transition.repairTo,
        assignmentStatus: task.assignment_status,
      },
      requiresConfirmation: true,
      confirmationPrompt,
    };
  }

  // 5. F4 — Eksekusi transaksional: seluruh UPDATE + INSERT history dalam
  // satu transaksi pada satu koneksi. Cek status dibuat atomik lewat
  // WHERE status = ? + verifikasi affectedRows, sehingga balapan dua
  // teknisi/proses tidak bisa menghasilkan mutasi ganda atau lompat status.
  let conn: Awaited<ReturnType<typeof pool.getConnection>> | null = null;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    // 5a. (accept saja) Ubah penugasan offered -> accepted, atomik.
    if (transition.assignmentTo) {
      const assignmentAffected = await executeInTransaction(
        conn,
        `UPDATE technician_assignments SET status = 'accepted', responded_at = NOW() WHERE id = ? AND status = 'offered'`,
        [assignmentId]
      );
      if (assignmentAffected === 0) {
        throw new Error('STATUS_CONFLICT:assignment');
      }
    }

    // 5b. Ubah status pesanan, atomik terhadap status yang divalidasi.
    const repairAffected = await executeInTransaction(
      conn,
      `UPDATE repair_requests SET current_status = ? WHERE id = ? AND current_status = ?`,
      [transition.repairTo, repairId, task.current_status]
    );
    if (repairAffected === 0) {
      throw new Error('STATUS_CONFLICT:repair');
    }

    // 5c. Catat jejak audit linimasa.
    await conn.execute(
      `INSERT INTO repair_status_history (repair_request_id, previous_status, new_status, changed_by_user_id, actor_role, notes)
       VALUES (?, ?, ?, ?, 'technician', ?)`,
      [repairId, task.current_status, transition.repairTo, userContext.userId, payload.notes || transition.defaultNotes]
    );

    await conn.commit();
  } catch (err: any) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {
        // Rollback gagal (mis. koneksi putus) — tidak ada lagi yang bisa
        // dilakukan di sini; transaksi tidak ter-commit.
      }
    }
    if (String(err?.message || '').startsWith('STATUS_CONFLICT')) {
      return {
        success: false,
        message: `Status pesanan #${orderCode} berubah sebelum aksi diproses (kemungkinan diperbarui pihak lain). Silakan periksa status terbaru lalu coba lagi.`,
      };
    }
    console.error('[action-service] executeTechnicianTaskStatusUpdate gagal (di-rollback):', err);
    return {
      success: false,
      message: 'Gagal memperbarui status tugas karena gangguan database. Tidak ada perubahan yang disimpan — silakan coba lagi.',
    };
  } finally {
    if (conn) conn.release();
  }

  return {
    success: true,
    message: transition.successMessage(orderCode),
    data: {
      orderCode,
      action: payload.newStatus,
      previousRepairStatus: task.current_status,
      newRepairStatus: transition.repairTo,
    },
    auditLogged: true,
  };
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

  // F10 — Two-step verification (sama seperti aksi teknisi): tanpa
  // confirmed === true, kembalikan prompt konfirmasi dan JANGAN menulis
  // apa pun ke log audit. Pemeriksaan dilakukan SEBELUM kueri hitung agar
  // panggilan tanpa konfirmasi murni tanpa efek samping.
  if (payload.confirmed !== true) {
    const confirmationPrompt =
      `Konfirmasi: buat snapshot laporan operasional dan bukukan ke log audit admin? ` +
      `Balas "ya" untuk melanjutkan, atau "tidak" untuk membatalkan.`;
    return {
      success: false,
      message: confirmationPrompt,
      requiresConfirmation: true,
      confirmationPrompt,
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

  // F21 — IP klien diteruskan dari route handler lewat userContext.clientIp
  // (disetel di message/route.ts dari x-forwarded-for entri pertama).
  // Jalur tanpa konteks request (pemanggilan langsung / job latar) mencatat
  // NULL (kolom ip_address mengizinkan NULL) — jangan pernah hardcode
  // '127.0.0.1' atau IP palsu lain. Sengaja TIDAK membaca payload: argumen
  // tool berasal dari model AI dan tidak boleh memalsukan IP audit.
  const clientIp = userContext.clientIp ?? null;

  await query(
    `INSERT INTO admin_audit_logs (admin_user_id, action, entity_name, entity_id, new_values, ip_address, created_at)
     VALUES (?, 'CREATE_OPERATIONAL_SNAPSHOT', 'repair_requests', 0, ?, ?, NOW())`,
    [userContext.userId, JSON.stringify(snapshotData), clientIp]
  );

  return {
    success: true,
    message: 'Snapshot laporan operasional berhasil dibukukan ke dalam riwayat log audit administrator.',
    data: snapshotData,
    auditLogged: true,
  };
}
