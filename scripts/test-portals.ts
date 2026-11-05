import { query } from '../src/lib/db';
import { createUserToken, USER_COOKIE_NAME } from '../src/lib/auth';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
  console.log(`  ✔ [PASS] ${message}`);
}

async function assertRes(res: Response, expectedStatus: number, message: string) {
  if (res.status !== expectedStatus) {
    const text = await res.text();
    throw new Error(`Assertion Failed: ${message} (Status: ${res.status}, Body: ${text})`);
  }
  console.log(`  ✔ [PASS] ${message}`);
}

async function runPortalsTestSuite() {
  console.log('========================================================================');
  console.log('🌐 BANTUIN - PENGUJIAN OTOMATIS: PORTAL PENGUNJUNG, CUSTOMER & TEKNISI');
  console.log('========================================================================\n');

  const baseUrl = 'http://localhost:3000';

  // 1. Ambil akun customer dan teknisi dari database
  const customerRows = await query<any[]>(
    `SELECT u.id, u.uuid, u.email, u.phone_number, u.role, u.status, u.is_verified, cp.full_name
     FROM users u
     LEFT JOIN customer_profiles cp ON u.id = cp.user_id
     WHERE u.role = 'customer' LIMIT 1`
  );
  if (customerRows.length === 0) throw new Error('Data customer belum tersedia');
  const customerUser = customerRows[0];

  const customerToken = await createUserToken({
    userId: customerUser.id,
    uuid: customerUser.uuid,
    email: customerUser.email,
    phoneNumber: customerUser.phone_number || '',
    role: 'customer',
    status: customerUser.status || 'active',
    isVerified: Boolean(customerUser.is_verified),
    name: customerUser.full_name || 'Customer Uji',
  });

  const techRows = await query<any[]>(
    `SELECT u.id, u.uuid, u.email, u.phone_number, u.role, u.status, u.is_verified, tp.full_name
     FROM users u
     LEFT JOIN technician_profiles tp ON u.id = tp.user_id
     WHERE u.role = 'technician' LIMIT 1`
  );
  if (techRows.length === 0) throw new Error('Data teknisi belum tersedia');
  const techUser = techRows[0];

  const techToken = await createUserToken({
    userId: techUser.id,
    uuid: techUser.uuid,
    email: techUser.email,
    phoneNumber: techUser.phone_number || '',
    role: 'technician',
    status: techUser.status || 'active',
    isVerified: Boolean(techUser.is_verified),
    name: techUser.full_name || 'Teknisi Uji',
  });

  const customerHeaders = {
    Cookie: `${USER_COOKIE_NAME}=${customerToken}`,
    'Content-Type': 'application/json',
  };

  const techHeaders = {
    Cookie: `${USER_COOKIE_NAME}=${techToken}`,
    'Content-Type': 'application/json',
  };

  // -------------------------------------------------------------------------
  // SUITE 1: PORTAL PENGUNJUNG (PUBLIC PORTAL)
  // -------------------------------------------------------------------------
  console.log('--- TEST SUITE 1: Portal Pengunjung & Pelacakan Cepat ---');

  // 1.1 GET Landing Page
  const homeRes = await fetch(`${baseUrl}/`);
  await assertRes(homeRes, 200, 'Beranda publik (/) berhasil diakses publik 200 OK');
  const homeHtml = await homeRes.text();
  assert(homeHtml.includes('BANTUIN'), 'Beranda memuat branding BANTUIN');
  assert(homeHtml.includes('Pendingin Ruangan (AC)'), 'Beranda memuat kategori peralatan elektronik rumah tangga');
  assert(homeHtml.includes('Garansi Resmi'), 'Beranda memuat jaminan garansi 30 hari');

  // 1.2 Public Tracking: Kode Kosong (400)
  const trackEmptyRes = await fetch(`${baseUrl}/api/public/track?code=`);
  await assertRes(trackEmptyRes, 400, 'API pelacakan menolak kode pesanan kosong (400 Bad Request)');

  // 1.3 Public Tracking: Kode Tidak Ditemukan (404)
  const trackNotFoundRes = await fetch(`${baseUrl}/api/public/track?code=BAN-NONEXISTENT-9999`);
  await assertRes(trackNotFoundRes, 404, 'API pelacakan mengembalikan 404 jika kode order tidak ada');

  // 1.4 Ambil 1 pesanan nyata dari database untuk diuji lacak
  const sampleOrderRows = await query<any[]>(
    `SELECT order_code, id FROM repair_requests WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 1`
  );
  if (sampleOrderRows.length > 0) {
    const sampleCode = sampleOrderRows[0].order_code;
    const trackSuccessRes = await fetch(`${baseUrl}/api/public/track?code=${sampleCode}`);
    await assertRes(trackSuccessRes, 200, `API pelacakan publik sukses 200 OK untuk #${sampleCode}`);
    const trackData = await trackSuccessRes.json();
    assert(trackData.success === true, 'Response pelacakan publik berstatus success: true');
    assert(trackData.data.orderCode === sampleCode, 'Data pelacakan memuat orderCode yang sesuai');
    assert(Array.isArray(trackData.data.timeline), 'Data pelacakan menyertakan linimasa status publik');
  }

  // -------------------------------------------------------------------------
  // SUITE 2: PORTAL PELANGGAN (CUSTOMER PORTAL)
  // -------------------------------------------------------------------------
  console.log('\n--- TEST SUITE 2: Portal Pelanggan (Customer Dashboard & Order) ---');

  // 2.1 Akses dashboard customer tanpa login (Redirect ke /login)
  const guestDashRes = await fetch(`${baseUrl}/customer/dashboard`, { redirect: 'manual' });
  assert(guestDashRes.status === 307 || guestDashRes.status === 302, 'Tamu tanpa sesi dialihkan (redirect) dari /customer/dashboard');

  // 2.2 Akses dashboard customer dengan sesi customer (200 OK)
  const custDashRes = await fetch(`${baseUrl}/customer/dashboard`, { headers: customerHeaders });
  await assertRes(custDashRes, 200, 'Customer terautentikasi berhasil 200 OK mengakses /customer/dashboard');

  // 2.3 API Profil Customer: GET & PATCH
  const profGetRes = await fetch(`${baseUrl}/api/customer/profile`, { headers: customerHeaders });
  await assertRes(profGetRes, 200, 'Customer berhasil 200 OK mengambil data profil (/api/customer/profile)');
  const profGetData = await profGetRes.json();
  assert(profGetData.data.email === customerUser.email, 'Data profil customer memuat email yang valid');

  const profPatchRes = await fetch(`${baseUrl}/api/customer/profile`, {
    method: 'PATCH',
    headers: customerHeaders,
    body: JSON.stringify({
      default_address: 'Jl. Melati Uji No. 88, Kebayoran',
      city: 'Jakarta Selatan',
      postal_code: '12150',
    }),
  });
  await assertRes(profPatchRes, 200, 'Customer berhasil 200 OK memperbarui alamat default profil');

  // 2.4 Halaman Pemesanan Servis Baru: /customer/repairs/new
  const newOrderPageRes = await fetch(`${baseUrl}/customer/repairs/new`, { headers: customerHeaders });
  await assertRes(newOrderPageRes, 200, 'Customer berhasil 200 OK mengakses formulir pemesanan baru (/customer/repairs/new)');

  // 2.5 Buat pesanan uji perbaikan untuk menguji alur diagnosis & bayar
  const catRows = await query<any[]>(`SELECT id FROM appliance_categories LIMIT 1`);
  const catId = catRows[0]?.id || 1;
  const testOrderCode = `BAN-TEST-${Date.now().toString().slice(-6)}`;

  const createOrderRes: any = await query(
    `INSERT INTO repair_requests (order_code, customer_id, category_id, device_brand, device_model, problem_description, address_text, latitude, longitude, current_status)
     VALUES (?, ?, ?, 'LG', 'Dual Cool Inverter', 'Uji coba portal customer komplain dan bayar', 'Jl. Melati Uji No. 88', -6.2088, 106.8456, 'submitted')`,
    [testOrderCode, customerUser.id, catId]
  );
  const testRepairId = createOrderRes.insertId;

  // 2.6 Customer Detail Page: /customer/repairs/[id]
  const custDetailRes = await fetch(`${baseUrl}/customer/repairs/${testRepairId}`, { headers: customerHeaders });
  await assertRes(custDetailRes, 200, `Customer berhasil 200 OK melihat rincian pesanan #${testOrderCode}`);

  // 2.7 Simulasi: Masukkan diagnosa estimasi biaya dan uji approval customer
  await query(
    `INSERT INTO repair_diagnoses (repair_request_id, technician_id, damage_details, labor_cost, parts_cost, total_estimate, customer_approval)
     VALUES (?, ?, 'Pipa freon kotor dan butuh cuci servis', 75000.00, 25000.00, 100000.00, 'pending')`,
    [testRepairId, techUser.id]
  );
  await query(`UPDATE repair_requests SET current_status = 'estimated' WHERE id = ?`, [testRepairId]);

  const approveDiagRes = await fetch(`${baseUrl}/api/customer/repairs/${testRepairId}/diagnosis`, {
    method: 'PATCH',
    headers: customerHeaders,
    body: JSON.stringify({ action: 'approve' }),
  });
  await assertRes(approveDiagRes, 200, 'Customer berhasil menyetujui estimasi biaya teknisi');

  // 2.8 Simulasi: Terbitkan invoice dan uji pembayaran customer
  const testInvNumber = `INV-CUST-${Date.now().toString().slice(-6)}`;
  await query(
    `INSERT INTO invoices (invoice_number, repair_request_id, customer_id, subtotal_labor, subtotal_parts, service_fee, total_amount, status, due_date)
     VALUES (?, ?, ?, 75000.00, 25000.00, 10000.00, 110000.00, 'unpaid', DATE_ADD(NOW(), INTERVAL 2 DAY))`,
    [testInvNumber, testRepairId, customerUser.id]
  );

  const payRes = await fetch(`${baseUrl}/api/customer/repairs/${testRepairId}/pay`, {
    method: 'POST',
    headers: customerHeaders,
    body: JSON.stringify({ payment_method: 'qris' }),
  });
  await assertRes(payRes, 200, 'Customer berhasil melunasi tagihan invoice via QRIS');
  const payData = await payRes.json();
  assert(payData.data.status === 'paid', 'Status invoice terverifikasi PAID');

  // 2.9 Simulasi: Uji pengajuan klaim garansi / komplain
  await query(`UPDATE repair_requests SET current_status = 'completed' WHERE id = ?`, [testRepairId]);
  const complaintRes = await fetch(`${baseUrl}/api/customer/repairs/${testRepairId}/complaint`, {
    method: 'POST',
    headers: customerHeaders,
    body: JSON.stringify({
      category: 'recurring_damage',
      description: 'AC kembali mengeluarkan angin kurang dingin setelah 2 hari perbaikan (Klaim garansi 30 hari).',
    }),
  });
  await assertRes(complaintRes, 200, 'Customer berhasil mengajukan klaim garansi 30 hari (/api/customer/repairs/[id]/complaint)');
  const compData = await complaintRes.json();
  assert(compData.data.complaintCode.startsWith('CMP-'), 'Mendapatkan kode pengaduan resmi format CMP-...');

  // -------------------------------------------------------------------------
  // SUITE 3: PORTAL MITRA TEKNISI (TECHNICIAN PORTAL)
  // -------------------------------------------------------------------------
  console.log('\n--- TEST SUITE 3: Portal Mitra Teknisi (Dashboard & Workflow) ---');

  // 3.1 Non-teknisi ditolak saat akses /technician/dashboard (redirect jika tanpa sesi teknisi)
  const nonTechRes = await fetch(`${baseUrl}/technician/dashboard`, { headers: customerHeaders, redirect: 'manual' });
  assert(nonTechRes.status === 307 || nonTechRes.status === 302, 'Customer ditolak & dialihkan dari /technician/dashboard');

  // 3.2 Teknisi terautentikasi berhasil 200 OK akses dashboard
  const techDashRes = await fetch(`${baseUrl}/technician/dashboard`, { headers: techHeaders });
  await assertRes(techDashRes, 200, 'Teknisi terautentikasi berhasil 200 OK mengakses /technician/dashboard');

  // 3.3 API Profil Teknisi & Ketersediaan (is_available)
  const techProfRes = await fetch(`${baseUrl}/api/technician/profile`, { headers: techHeaders });
  await assertRes(techProfRes, 200, 'Teknisi berhasil 200 OK mengambil data profil (/api/technician/profile)');

  const toggleAvailRes = await fetch(`${baseUrl}/api/technician/profile`, {
    method: 'PATCH',
    headers: techHeaders,
    body: JSON.stringify({ is_available: true }),
  });
  await assertRes(toggleAvailRes, 200, 'Teknisi berhasil mengubah status kesiapan kerja (Online)');

  // 3.4 API Daftar Tugas Teknisi (/api/technician/tasks)
  const tasksRes = await fetch(`${baseUrl}/api/technician/tasks`, { headers: techHeaders });
  await assertRes(tasksRes, 200, 'Teknisi berhasil 200 OK mengambil daftar tugas penugasan (/api/technician/tasks)');
  const tasksData = await tasksRes.json();
  assert(tasksData.stats && typeof tasksData.stats.totalAssignments === 'number', 'Menyertakan KPI statistik tugas teknisi');

  // 3.5 Simulasi Alur Kerja Tugas Teknisi Lengkap (Accept -> OTW -> Diagnosis -> Complete)
  const newAssignRes: any = await query(
    `INSERT INTO technician_assignments (repair_request_id, technician_id, status, assignment_type)
     VALUES (?, ?, 'offered', 'manual_admin')`,
    [testRepairId, techUser.id]
  );
  const testAssignId = newAssignRes.insertId;

  // A. Terima Tugas (Accept)
  const acceptTaskRes = await fetch(`${baseUrl}/api/technician/tasks/${testAssignId}`, {
    method: 'PATCH',
    headers: techHeaders,
    body: JSON.stringify({ action: 'accept' }),
  });
  await assertRes(acceptTaskRes, 200, 'Teknisi berhasil menerima tawaran tugas (action: accept)');

  // B. OTW Menuju Lokasi
  const otwTaskRes = await fetch(`${baseUrl}/api/technician/tasks/${testAssignId}`, {
    method: 'PATCH',
    headers: techHeaders,
    body: JSON.stringify({ action: 'on_the_way' }),
  });
  await assertRes(otwTaskRes, 200, 'Teknisi berhasil update status sedang menuju lokasi (action: on_the_way)');

  // C. Tiba di Lokasi & Mulai Diagnosis
  const diagStartRes = await fetch(`${baseUrl}/api/technician/tasks/${testAssignId}`, {
    method: 'PATCH',
    headers: techHeaders,
    body: JSON.stringify({ action: 'start_diagnosis' }),
  });
  await assertRes(diagStartRes, 200, 'Teknisi berhasil memulai inspeksi fisik unit (action: start_diagnosis)');

  // D. Submit Hasil Diagnosa & Estimasi Biaya
  const submitDiagRes = await fetch(`${baseUrl}/api/technician/tasks/${testAssignId}`, {
    method: 'PATCH',
    headers: techHeaders,
    body: JSON.stringify({
      action: 'submit_diagnosis',
      damage_details: 'Inspeksi menemukan motor fan outdoor macet dan kapasitor 30uF melemah',
      labor_cost: 85000,
      parts_cost: 65000,
    }),
  });
  await assertRes(submitDiagRes, 200, 'Teknisi berhasil mengajukan hasil diagnosa & estimasi biaya (action: submit_diagnosis)');

  // E. Selesaikan Pekerjaan & Terbitkan Nota Invoice
  const completeTaskRes = await fetch(`${baseUrl}/api/technician/tasks/${testAssignId}`, {
    method: 'PATCH',
    headers: techHeaders,
    body: JSON.stringify({
      action: 'complete',
      notes: 'Penggantian kapasitor dan dinamo kipas sukses. Unit dingin optimal.',
    }),
  });
  await assertRes(completeTaskRes, 200, 'Teknisi berhasil menyelesaikan pekerjaan dan menerbitkan invoice (action: complete)');

  console.log('\n========================================================================');
  console.log('🎉 SELURUH PENGUJIAN 3 PORTAL SELESAI DENGAN SUKSES!');
  console.log('========================================================================\n');
}

runPortalsTestSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ Pengujian gagal dengan error:', err);
    process.exit(1);
  });
