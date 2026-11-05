import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { pool, query } from '../src/lib/db';
import { createAdminToken, createUserToken, ADMIN_COOKIE_NAME, USER_COOKIE_NAME } from '../src/lib/auth';

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, message: string) {
  totalTests++;
  if (condition) {
    console.log(`  ✔ [PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    throw new Error(`Assertion Failed: ${message}`);
  }
}

async function assertRes(res: Response, expectedStatus: number, message: string) {
  totalTests++;
  if (res.status === expectedStatus) {
    console.log(`  ✔ [PASS] ${message}`);
    passedTests++;
  } else {
    const body = await res.text();
    console.error(`  ❌ [FAIL] ${message} (Status: ${res.status}, Body: ${body})`);
    throw new Error(`Assertion Failed: ${message}`);
  }
}

async function runOperationsTestSuite() {
  console.log('========================================================================');
  console.log('🛠️ BANTUIN - PENGUJIAN OTOMATIS 5 MODUL UTAMA PANEL OPERASIONAL ADMIN');
  console.log('1. Permintaan Perbaikan (/admin/repairs)');
  console.log('2. Penugasan Teknisi (/admin/assignments)');
  console.log('3. Pembayaran & Invoice (/admin/payments)');
  console.log('4. Pengaduan Layanan (/admin/complaints)');
  console.log('5. Jejak Rekam Audit Administrator (/admin/audit-logs)');
  console.log('========================================================================\n');

  try {
    // 1. Kredensial Admin & Customer
    const adminRows = await query<any[]>(
      `SELECT id, uuid, email, role FROM users WHERE role = 'admin' LIMIT 1`
    );
    if (adminRows.length === 0) {
      throw new Error('Pengguna admin tidak ditemukan. Jalankan seed:admin terlebih dahulu.');
    }
    const admin = adminRows[0];
    const adminToken = await createAdminToken({
      userId: admin.id,
      uuid: admin.uuid,
      email: admin.email,
      role: 'admin',
    });

    const customerRows = await query<any[]>(
      `SELECT id, uuid, email, phone_number, role, status, is_verified FROM users WHERE role = 'customer' LIMIT 1`
    );
    const customer = customerRows[0];
    const customerToken = customer
      ? await createUserToken({
          userId: customer.id,
          uuid: customer.uuid,
          email: customer.email,
          phoneNumber: customer.phone_number || '',
          role: 'customer',
          status: customer.status || 'active',
          isVerified: Boolean(customer.is_verified),
        })
      : '';

    const techRows = await query<any[]>(
      `SELECT u.id, tp.full_name FROM users u JOIN technician_profiles tp ON u.id = tp.user_id WHERE u.role = 'technician' LIMIT 2`
    );
    if (techRows.length === 0) {
      throw new Error('Teknisi mitra belum tersedia.');
    }
    const tech1 = techRows[0];
    const tech2 = techRows[1] || tech1;

    const baseUrl = 'http://localhost:3000';
    const adminHeaders = {
      Cookie: `${ADMIN_COOKIE_NAME}=${adminToken}`,
      'Content-Type': 'application/json',
    };
    const guestHeaders: Record<string, string> = customerToken ? { Cookie: `${USER_COOKIE_NAME}=${customerToken}` } : {};

    // -------------------------------------------------------------------------
    // TEST SUITE 1: PERLINDUNGAN RBAC (ROLE-BASED ACCESS CONTROL)
    // -------------------------------------------------------------------------
    console.log('--- TEST SUITE 1: Keamanan & Autentikasi Admin (RBAC Guard) ---');

    const protectedEndpoints = [
      '/api/admin/repairs',
      '/api/admin/assignments',
      '/api/admin/payments',
      '/api/admin/complaints',
      '/api/admin/audit-logs',
    ];

    for (const ep of protectedEndpoints) {
      const res = await fetch(`${baseUrl}${ep}`, { headers: guestHeaders });
      await assertRes(res, 401, `Non-admin/Tamu ditolak 401 saat mengakses ${ep}`);
    }

    // -------------------------------------------------------------------------
    // TEST SUITE 2: MODUL PERMINTAAN PERBAIKAN (/api/admin/repairs)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST SUITE 2: Modul Permintaan Perbaikan (/api/admin/repairs) ---');

    // 2.1 GET List
    const repairsRes = await fetch(`${baseUrl}/api/admin/repairs`, { headers: adminHeaders });
    await assertRes(repairsRes, 200, 'Admin berhasil 200 OK saat mengakses /api/admin/repairs');
    const repairsData = await repairsRes.json();
    assert(repairsData.success === true, 'Response repairs API berstatus success: true');
    assert(Array.isArray(repairsData.data) && repairsData.data.length > 0, 'Daftar perbaikan mengembalikan array pesanan');
    assert(repairsData.stats && typeof repairsData.stats.total === 'number', 'Menyertakan KPI metrik pesanan (total, submitted, in_progress, completed)');

    const targetOrder = repairsData.data[0];

    // 2.2 GET Detail
    const repairDetailRes = await fetch(`${baseUrl}/api/admin/repairs/${targetOrder.id}`, { headers: adminHeaders });
    await assertRes(repairDetailRes, 200, `Admin berhasil 200 OK mengambil detail pesanan #${targetOrder.order_code}`);
    const repairDetailData = await repairDetailRes.json();
    assert(repairDetailData.data.id === targetOrder.id, 'Data detail pesanan sesuai dengan ID target');
    assert(Array.isArray(repairDetailData.data.statusHistory), 'Menyertakan linimasa riwayat status pesanan');

    // 2.3 PATCH Override Status
    const updateStatusRes = await fetch(`${baseUrl}/api/admin/repairs/${targetOrder.id}`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({
        action: 'update_status',
        status: 'in_repair',
        notes: 'Uji pembaruan status oleh Admin Suite Test',
      }),
    });
    await assertRes(updateStatusRes, 200, 'Admin berhasil memperbarui status pesanan menjadi in_repair');

    // 2.4 PATCH Tugaskan Teknisi Langsung
    const assignDirectRes = await fetch(`${baseUrl}/api/admin/repairs/${targetOrder.id}`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({
        action: 'assign_technician',
        technician_id: tech1.id,
        notes: 'Penugasan langsung dari detail pesanan perbaikan',
      }),
    });
    await assertRes(assignDirectRes, 200, `Admin berhasil menugaskan teknisi ${tech1.full_name} langsung dari pesanan`);

    // -------------------------------------------------------------------------
    // TEST SUITE 3: MODUL PENUGASAN TEKNISI (/api/admin/assignments)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST SUITE 3: Modul Penugasan Teknisi (/api/admin/assignments) ---');

    // 3.1 GET List
    const assignRes = await fetch(`${baseUrl}/api/admin/assignments`, { headers: adminHeaders });
    await assertRes(assignRes, 200, 'Admin berhasil 200 OK saat mengakses /api/admin/assignments');
    const assignData = await assignRes.json();
    assert(assignData.success === true, 'Response assignments API berstatus success: true');
    assert(assignData.stats && typeof assignData.stats.total === 'number', 'Menyertakan KPI metrik penugasan');

    // 3.2 POST Create Assignment
    const newAssignRes = await fetch(`${baseUrl}/api/admin/assignments`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        repair_request_id: targetOrder.id,
        technician_id: tech2.id,
        notes: 'Uji penugasan manual melalui API penugasan',
      }),
    });
    await assertRes(newAssignRes, 200, `Admin berhasil membuat penugasan teknisi baru ke ${tech2.full_name}`);
    const newAssignData = await newAssignRes.json();
    const createdAssignmentId = newAssignData.data.id;

    // 3.3 GET Assignment Detail
    const assignDetailRes = await fetch(`${baseUrl}/api/admin/assignments/${createdAssignmentId}`, { headers: adminHeaders });
    await assertRes(assignDetailRes, 200, 'Berhasil mengambil detail rekaman penugasan');

    // 3.4 PATCH Reassign / Cancel
    const reassignRes = await fetch(`${baseUrl}/api/admin/assignments/${createdAssignmentId}`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({
        action: 'reassign',
        new_technician_id: tech1.id,
        reason: 'Pengalihan beban kerja operasional teknisi',
      }),
    });
    await assertRes(reassignRes, 200, 'Admin berhasil mengalihkan penugasan teknisi');

    // -------------------------------------------------------------------------
    // TEST SUITE 4: MODUL PEMBAYARAN & INVOICE (/api/admin/payments)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST SUITE 4: Modul Pembayaran & Transaksi (/api/admin/payments) ---');

    // 4.1 GET List
    const paymentsRes = await fetch(`${baseUrl}/api/admin/payments`, { headers: adminHeaders });
    await assertRes(paymentsRes, 200, 'Admin berhasil 200 OK saat mengakses /api/admin/payments');
    const paymentsData = await paymentsRes.json();
    assert(paymentsData.success === true, 'Response payments API berstatus success: true');
    assert(paymentsData.stats && typeof paymentsData.stats.total_revenue === 'number', 'Menyertakan KPI keuangan (total omset lunas, pending, platform fee)');

    // 4.2 Cari atau Buat Invoice Unpaid untuk Tes Verifikasi
    let testInvoice = paymentsData.data.find((inv: any) => inv.invoice_status === 'unpaid');
    if (!testInvoice && paymentsData.data.length > 0) {
      // Pastikan ada invoice berstatus unpaid untuk menguji settlement
      const invToReset = paymentsData.data[0];
      await query(`UPDATE invoices SET status = 'unpaid', paid_at = NULL WHERE id = ?`, [invToReset.id]);
      testInvoice = { id: invToReset.id, invoice_number: invToReset.invoice_number };
    } else if (!testInvoice) {
      const newInvRes: any = await query(
        `INSERT INTO invoices (invoice_number, repair_request_id, customer_id, subtotal_labor, subtotal_parts, service_fee, total_amount, status, due_date)
         VALUES (?, ?, ?, 100000.00, 50000.00, 10000.00, 160000.00, 'unpaid', DATE_ADD(NOW(), INTERVAL 2 DAY))
         ON DUPLICATE KEY UPDATE status='unpaid', paid_at=NULL, id=LAST_INSERT_ID(id)`,
        [`INV-TEST-${Date.now().toString().slice(-6)}`, targetOrder.id, targetOrder.customer_id]
      );
      testInvoice = { id: newInvRes.insertId, invoice_number: 'INV-TEST' };
    }

    // 4.3 GET Detail Invoice
    const invoiceDetailRes = await fetch(`${baseUrl}/api/admin/payments/${testInvoice.id}`, { headers: adminHeaders });
    await assertRes(invoiceDetailRes, 200, `Admin berhasil 200 OK melihat detail invoice #${testInvoice.id}`);
    const invoiceDetailData = await invoiceDetailRes.json();
    assert(Array.isArray(invoiceDetailData.data.payments), 'Menyertakan daftar riwayat transaksi pembayaran invoice');

    // 4.4 PATCH Verifikasi Pembayaran Manual
    const settleRes = await fetch(`${baseUrl}/api/admin/payments/${testInvoice.id}`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({
        action: 'manual_settlement',
        payment_method: 'cash_on_delivery',
        notes: 'Verifikasi pelunasan tunai diterima oleh teknisi di lokasi pengerjaan',
      }),
    });
    await assertRes(settleRes, 200, 'Admin berhasil memverifikasi pelunasan manual tagihan');

    // -------------------------------------------------------------------------
    // TEST SUITE 5: MODUL PENGADUAN LAYANAN (/api/admin/complaints)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST SUITE 5: Modul Pengaduan Layanan (/api/admin/complaints) ---');

    // 5.1 GET List
    const complaintsRes = await fetch(`${baseUrl}/api/admin/complaints`, { headers: adminHeaders });
    await assertRes(complaintsRes, 200, 'Admin berhasil 200 OK saat mengakses /api/admin/complaints');
    const complaintsData = await complaintsRes.json();
    assert(complaintsData.success === true, 'Response complaints API berstatus success: true');
    assert(complaintsData.stats && typeof complaintsData.stats.total === 'number', 'Menyertakan KPI pengaduan');

    let testComplaint = complaintsData.data[0];
    if (!testComplaint) {
      // Buat data mock aduan jika kosong
      const cmpRes: any = await query(
        `INSERT INTO repair_complaints (complaint_code, repair_request_id, complainant_user_id, category, description, status)
         VALUES (?, ?, ?, 'poor_workmanship', 'Uji komplain otomatis', 'submitted')`,
        [`CMP-TEST-${Date.now().toString().slice(-6)}`, targetOrder.id, targetOrder.customer_id]
      );
      testComplaint = { id: cmpRes.insertId, complaint_code: 'CMP-TEST' };
    }

    // 5.2 GET Detail Aduan
    const complaintDetailRes = await fetch(`${baseUrl}/api/admin/complaints/${testComplaint.id}`, { headers: adminHeaders });
    await assertRes(complaintDetailRes, 200, `Admin berhasil 200 OK mengambil detail pengaduan #${testComplaint.id}`);
    const complaintDetailData = await complaintDetailRes.json();
    assert(complaintDetailData.data.id === testComplaint.id, 'Data aduan sesuai dengan ID target');

    // 5.3 PATCH Tindak Lanjut & Resolusi
    const updateComplaintRes = await fetch(`${baseUrl}/api/admin/complaints/${testComplaint.id}`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({
        status: 'resolved',
        resolution_summary: 'Teknisi senior telah dikirim ulang untuk perbaikan garansi tanpa biaya tambahan.',
      }),
    });
    await assertRes(updateComplaintRes, 200, 'Admin berhasil menyelesaikan dan memberikan ringkasan resolusi aduan');

    // -------------------------------------------------------------------------
    // TEST SUITE 6: JEJAK REKAM AUDIT ADMINISTRATOR (/api/admin/audit-logs)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST SUITE 6: Modul Audit Log Administrator (/api/admin/audit-logs) ---');

    // 6.1 GET List
    const auditRes = await fetch(`${baseUrl}/api/admin/audit-logs`, { headers: adminHeaders });
    await assertRes(auditRes, 200, 'Admin berhasil 200 OK saat mengakses /api/admin/audit-logs');
    const auditData = await auditRes.json();
    assert(auditData.success === true, 'Response audit-logs API berstatus success: true');
    assert(Array.isArray(auditData.data) && auditData.data.length > 0, 'Daftar audit logs mengembalikan rekaman jejak audit');
    assert(auditData.stats && auditData.stats.total_logs > 0, 'Menyertakan KPI total audit logs dan aktivitas');
    assert(Array.isArray(auditData.filters?.actions), 'Menyertakan daftar kategori aksi untuk dropdown filter');

    // 6.2 GET Detail Snapshot Diff
    const targetLog = auditData.data[0];
    const auditDetailRes = await fetch(`${baseUrl}/api/admin/audit-logs/${targetLog.id}`, { headers: adminHeaders });
    await assertRes(auditDetailRes, 200, `Admin berhasil 200 OK melihat snapshot diff audit #${targetLog.id}`);
    const auditDetailData = await auditDetailRes.json();
    assert(auditDetailData.data.id === targetLog.id, 'Data detail audit log sesuai');
    assert(auditDetailData.data.admin_email !== undefined, 'Menyertakan email administrator yang mengeksekusi');

    // 6.3 Verifikasi Pencatatan Aksi yang Baru Dijalankan
    const recentActions = auditData.data.map((l: any) => l.action);
    assert(
      recentActions.includes('OVERRIDE_REPAIR_STATUS') ||
      recentActions.includes('ASSIGN_TECHNICIAN') ||
      recentActions.includes('MANUAL_PAYMENT_SETTLEMENT') ||
      recentActions.includes('UPDATE_COMPLAINT_STATUS'),
      'Jejak aksi mutasi terbukti tercatat secara otomatis ke dalam admin_audit_logs'
    );

    // -------------------------------------------------------------------------
    // TEST SUITE 7: VERIFIKASI HALAMAN FRONTEND (HTML RENDER)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST SUITE 7: Verifikasi Halaman Frontend Admin ---');

    const adminPages = [
      '/admin/repairs',
      '/admin/assignments',
      '/admin/payments',
      '/admin/complaints',
      '/admin/audit-logs',
    ];

    for (const pagePath of adminPages) {
      const pageRes = await fetch(`${baseUrl}${pagePath}`, {
        headers: { Cookie: `${ADMIN_COOKIE_NAME}=${adminToken}` },
      });
      await assertRes(pageRes, 200, `Halaman ${pagePath} berhasil dimuat dengan status 200 OK`);
      const html = await pageRes.text();
      assert(
        !html.includes('Under Construction') && !html.includes('PlaceholderPage'),
        `Halaman ${pagePath} telah terbebas dari PlaceholderPage`
      );
    }

    console.log('\n========================================================================');
    console.log(`🎉 SELURUH PENGUJIAN SELESAI DENGAN SUKSES!`);
    console.log(`Total Pengujian: ${totalTests} | Berhasil: ${passedTests} | Gagal: 0`);
    console.log('========================================================================');

    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Pengujian gagal dengan error:', error);
    process.exit(1);
  }
}

runOperationsTestSuite();
