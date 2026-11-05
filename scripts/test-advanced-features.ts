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

async function runAdvancedFeaturesTestSuite() {
  console.log('========================================================================');
  console.log('🚀 BANTUIN - PENGUJIAN OTOMATIS: ADVANCED PROFESSIONAL ENGINEERING FEATURES');
  console.log('1. Native File/Image Upload Service (/api/upload)');
  console.log('2. In-App Chat Pelanggan vs Teknisi (/api/repairs/[id]/chat)');
  console.log('3. Penjadwalan Kunjungan Fisik Teknisi (/api/repairs/[id]/schedule)');
  console.log('4. Ulasan & Rating Bintang Pelanggan (/api/customer/repairs/[id]/review)');
  console.log('5. Payment Gateway Webhook Rekonsiliasi Otomatis (/api/webhooks/payment)');
  console.log('========================================================================\n');

  const baseUrl = 'http://localhost:3000';

  // 1. Ambil data Customer dan Teknisi
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
  };

  const techHeaders = {
    Cookie: `${USER_COOKIE_NAME}=${techToken}`,
  };

  // 2. Siapkan Data Uji Pesanan Perbaikan
  const testOrderCode = `BAN-TEST-ADV-${Math.floor(100000 + Math.random() * 900000)}`;
  const orderInsert = await query<any>(
    `INSERT INTO repair_requests (
      order_code, customer_id, category_id, device_brand, device_model,
      problem_description, address_text, latitude, longitude, current_status, created_at
    ) VALUES (?, ?, 1, 'Panasonic', 'Econavi 2 Pintu', 'Kompresor bising dan tidak dingin', 'Jl. Gatot Subroto No. 88, Jakarta', -6.2200, 106.8200, 'assigned', NOW())`,
    [testOrderCode, customerUser.id]
  );
  const testRepairId = orderInsert.insertId;

  // Tugaskan Teknisi
  const assignInsert = await query<any>(
    `INSERT INTO technician_assignments (
      repair_request_id, technician_id, assignment_type, status, created_at
    ) VALUES (?, ?, 'manual_admin', 'accepted', NOW())`,
    [testRepairId, techUser.id]
  );
  const testAssignmentId = assignInsert.insertId;

  try {
    // -------------------------------------------------------------------------
    // TEST SUITE 1: Native File/Image Upload Service
    // -------------------------------------------------------------------------
    console.log('--- TEST SUITE 1: Native File/Image Upload Service (/api/upload) ---');

    // 1.1 Tamu ditolak saat upload tanpa login
    const guestUpload = await fetch(`${baseUrl}/api/upload`, {
      method: 'POST',
      body: new FormData(),
    });
    await assertRes(guestUpload, 401, 'Tamu tanpa sesi ditolak 401 saat upload file');

    // 1.2 User terautentikasi berhasil upload file gambar
    const formData = new FormData();
    const mockImageBlob = new Blob(['mock-image-binary-content-12345'], { type: 'image/jpeg' });
    formData.append('file', mockImageBlob, 'kerusakan_ac.jpg');
    formData.append('folder', 'repairs');

    const authUpload = await fetch(`${baseUrl}/api/upload`, {
      method: 'POST',
      headers: customerHeaders,
      body: formData,
    });
    await assertRes(authUpload, 200, 'Customer terautentikasi berhasil upload foto kerusakan (200 OK)');
    const uploadJson = await authUpload.json();
    assert(uploadJson.success === true, 'Upload response success = true');
    assert(Boolean(uploadJson.data?.url && uploadJson.data.url.startsWith('/uploads/repairs/')), 'Menghasilkan URL publik file yang valid');

    // 1.3 Tolak tipe berkas yang tidak diizinkan (.exe / .bat)
    const invalidForm = new FormData();
    const mockExeBlob = new Blob(['malicious'], { type: 'application/x-msdownload' });
    invalidForm.append('file', mockExeBlob, 'virus.exe');

    const rejectedUpload = await fetch(`${baseUrl}/api/upload`, {
      method: 'POST',
      headers: customerHeaders,
      body: invalidForm,
    });
    await assertRes(rejectedUpload, 400, 'Menolak upload berkas dengan format ilegal / berbahaya (400 Bad Request)');

    // -------------------------------------------------------------------------
    // TEST SUITE 2: Penjadwalan Kunjungan Fisik Teknisi
    // -------------------------------------------------------------------------
    console.log('\n--- TEST SUITE 2: Penjadwalan Kunjungan Fisik Teknisi (/api/repairs/[id]/schedule) ---');

    // 2.1 Tolak jika jam selesai <= jam mulai
    const invalidScheduleRes = await fetch(`${baseUrl}/api/repairs/${testRepairId}/schedule`, {
      method: 'POST',
      headers: { ...techHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scheduled_date: '2026-11-05',
        time_slot_start: '14:00',
        time_slot_end: '10:00',
      }),
    });
    await assertRes(invalidScheduleRes, 400, 'Menolak rentang waktu kunjungan tidak logis (jam selesai < jam mulai)');

    // 2.2 Teknisi berhasil menetapkan jadwal kunjungan
    const scheduleRes = await fetch(`${baseUrl}/api/repairs/${testRepairId}/schedule`, {
      method: 'POST',
      headers: { ...techHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scheduled_date: '2026-11-05',
        time_slot_start: '10:00',
        time_slot_end: '12:00',
      }),
    });
    await assertRes(scheduleRes, 200, 'Teknisi berhasil menetapkan jadwal kunjungan fisik 200 OK');
    const scheduleJson = await scheduleRes.json();
    assert(scheduleJson.success === true, 'Response schedule success = true');

    // 2.3 Pelanggan dapat melihat jadwal kunjungan yang telah ditetapkan
    const getSchedRes = await fetch(`${baseUrl}/api/repairs/${testRepairId}/schedule`, {
      headers: customerHeaders,
    });
    await assertRes(getSchedRes, 200, 'Pelanggan berhasil melihat rincian jadwal kunjungan teknisi');
    const getSchedJson = await getSchedRes.json();
    assert(getSchedJson.data.length > 0, 'Daftar jadwal mengembalikan agenda kunjungan');
    assert(getSchedJson.data[0].scheduledDate.startsWith('2026-11-05'), 'Tanggal kunjungan sesuai');

    // 2.4 Teknisi dapat mengambil daftar seluruh agenda kunjungannya
    const techAgendaRes = await fetch(`${baseUrl}/api/technician/schedules`, {
      headers: techHeaders,
    });
    await assertRes(techAgendaRes, 200, 'Teknisi berhasil mengambil agenda seluruh jadwal kerjanya');

    // -------------------------------------------------------------------------
    // TEST SUITE 3: In-App Chat Pelanggan vs Teknisi
    // -------------------------------------------------------------------------
    console.log('\n--- TEST SUITE 3: In-App Chat Pelanggan vs Teknisi (/api/repairs/[id]/chat) ---');

    // 3.1 Customer mengirim pesan ke Teknisi
    const custChatRes = await fetch(`${baseUrl}/api/repairs/${testRepairId}/chat`, {
      method: 'POST',
      headers: { ...customerHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: 'Halo Pak Teknisi, nanti masuk lewat pos satpam timur ya.',
        message_type: 'text',
      }),
    });
    await assertRes(custChatRes, 200, 'Customer berhasil mengirim pesan chat in-app');
    const custChatJson = await custChatRes.json();
    assert(custChatJson.success === true, 'Pesan customer berhasil disimpan');

    // 3.2 Teknisi membaca dan membalas pesan
    const techChatRes = await fetch(`${baseUrl}/api/repairs/${testRepairId}/chat`, {
      method: 'POST',
      headers: { ...techHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: 'Baik Bu, saya perkirakan tiba pukul 10:15 WIB membawa toolkit lengkap.',
        message_type: 'text',
      }),
    });
    await assertRes(techChatRes, 200, 'Teknisi berhasil membalas pesan chat');

    // 3.3 Ambil riwayat percakapan
    const historyChatRes = await fetch(`${baseUrl}/api/repairs/${testRepairId}/chat`, {
      headers: customerHeaders,
    });
    await assertRes(historyChatRes, 200, 'Berhasil mengambil riwayat chat room terisolasi');
    const historyChatJson = await historyChatRes.json();
    assert(historyChatJson.data.messages.length >= 2, 'Riwayat chat memuat percakapan dua arah');
    assert(historyChatJson.data.otherParty.name.length > 0, 'Menyertakan identitas lawan bicara');

    // -------------------------------------------------------------------------
    // TEST SUITE 4: Payment Gateway Webhook & Dynamic Settlement
    // -------------------------------------------------------------------------
    console.log('\n--- TEST SUITE 4: Payment Gateway Webhook (/api/webhooks/payment) ---');

    // Buat invoice untuk pesanan
    const invNumber = `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;
    const invInsert = await query<any>(
      `INSERT INTO invoices (
        invoice_number, repair_request_id, customer_id, subtotal_labor, subtotal_parts,
        service_fee, total_amount, status, due_date, created_at
      ) VALUES (?, ?, ?, 150000.00, 50000.00, 15000.00, 215000.00, 'unpaid', DATE_ADD(NOW(), INTERVAL 1 DAY), NOW())`,
      [invNumber, testRepairId, customerUser.id]
    );
    const testInvoiceId = invInsert.insertId;

    // Perbarui status pesanan ke completed
    await query(
      `UPDATE repair_requests SET current_status = 'completed' WHERE id = ?`,
      [testRepairId]
    );
    await query(
      `UPDATE technician_assignments SET status = 'completed' WHERE id = ?`,
      [testAssignmentId]
    );

    // 4.1 Kirim webhook pembayaran sukses dari gateway
    const webhookRes = await fetch(`${baseUrl}/api/webhooks/payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_id: invNumber,
        transaction_status: 'settlement',
        status_code: '200',
        gross_amount: 215000.00,
        transaction_id: `GW-TEST-${Date.now()}`,
        payment_type: 'qris',
      }),
    });
    await assertRes(webhookRes, 200, 'Webhook gateway diproses sukses 200 OK');
    const webhookJson = await webhookRes.json();
    assert(webhookJson.success === true, 'Webhook response success = true');
    assert(webhookJson.data.isSettled === true, 'Status pembayaran terkonfirmasi lunas');

    // 4.2 Verifikasi invoice status di database berubah menjadi paid
    const updatedInvoice = await query<any[]>(
      `SELECT status, paid_at FROM invoices WHERE id = ?`,
      [testInvoiceId]
    );
    assert(updatedInvoice[0].status === 'paid', 'Status invoice otomatis terverifikasi PAID');
    assert(Boolean(updatedInvoice[0].paid_at), 'Tanggal pelunasan paid_at tercatat');

    // 4.3 Verifikasi pencatatan pembayaran di tabel payments
    const paymentRecords = await query<any[]>(
      `SELECT payment_status, settled_at FROM payments WHERE invoice_id = ?`,
      [testInvoiceId]
    );
    assert(paymentRecords.length > 0, 'Rekaman pembayaran tercatat di tabel payments');
    assert(paymentRecords[0].payment_status === 'settlement', 'Status transaksi payment bernilai settlement');
    assert(Boolean(paymentRecords[0].settled_at), 'Tanggal settled_at tercatat');

    // 4.4 Idempotency Test: Webhook ganda tidak menimbulkan error duplikasi
    const duplicateWebhookRes = await fetch(`${baseUrl}/api/webhooks/payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_id: invNumber,
        transaction_status: 'settlement',
        status_code: '200',
        gross_amount: 215000.00,
        transaction_id: webhookJson.data?.transactionId || `GW-TEST-DUP-${Date.now()}`,
        payment_type: 'qris',
      }),
    });
    await assertRes(duplicateWebhookRes, 200, 'Idempotensi webhook terbukti aman dari duplikasi');

    // -------------------------------------------------------------------------
    // TEST SUITE 5: Ulasan & Rating Bintang Pelanggan
    // -------------------------------------------------------------------------
    console.log('\n--- TEST SUITE 5: Ulasan & Rating Bintang Pelanggan (/api/customer/repairs/[id]/review) ---');

    // 5.1 Pelanggan memberikan ulasan bintang 5
    const reviewRes = await fetch(`${baseUrl}/api/customer/repairs/${testRepairId}/review`, {
      method: 'POST',
      headers: { ...customerHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rating: 5,
        review_text: 'Pelayanan teknisi sangat ramah, datang tepat waktu, dan kulkas langsung dingin normal!',
        photos: ['https://images.unsplash.com/photo-1581092160607-ee22621dd758'],
      }),
    });
    await assertRes(reviewRes, 200, 'Pelanggan berhasil memberikan ulasan bintang 5 (200 OK)');
    const reviewJson = await reviewRes.json();
    assert(reviewJson.success === true, 'Response review success = true');
    assert(reviewJson.data.rating === 5, 'Rating bintang 5 tersimpan akurat');

    // 5.2 Mencegah duplikasi ulasan pada pesanan yang sama
    const duplicateReviewRes = await fetch(`${baseUrl}/api/customer/repairs/${testRepairId}/review`, {
      method: 'POST',
      headers: { ...customerHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rating: 4,
        review_text: 'Mencoba review kedua',
      }),
    });
    await assertRes(duplicateReviewRes, 409, 'Menolak duplikasi ulasan untuk pesanan yang sama (409 Conflict)');

    // 5.3 Verifikasi kalkulasi rating rata-rata teknisi di technician_profiles
    const techProfile = await query<any[]>(
      `SELECT rating_avg, rating_count FROM technician_profiles WHERE user_id = ?`,
      [techUser.id]
    );
    assert(techProfile.length > 0, 'Profil teknisi ditemukan');
    assert(Number(techProfile[0].rating_avg) > 0, 'Rating rata-rata teknisi berhasil dihitung otomatis');
    assert(techProfile[0].rating_count >= 1, 'Total akumulasi ulasan teknisi bertambah');

    // 5.4 Public review endpoint dapat diakses untuk profil teknisi
    const publicReviewRes = await fetch(`${baseUrl}/api/public/technicians/${techUser.id}/reviews`);
    await assertRes(publicReviewRes, 200, 'Ulasan teknisi dapat diakses publik 200 OK');
    const publicReviewJson = await publicReviewRes.json();
    assert(publicReviewJson.data.reviews.length >= 1, 'Publik review mengembalikan daftar testimoni');

    console.log('\n========================================================================');
    console.log('🎉 SELURUH PENGUJIAN FITUR ADVANCED SENIOR SOFTWARE ENGINEER PASS 100%!');
    console.log('========================================================================');
    process.exit(0);
  } finally {
    // Bersihkan data uji secara aman
    await query(`DELETE FROM repair_reviews WHERE repair_request_id = ?`, [testRepairId]);
    await query(`DELETE FROM repair_chat_messages WHERE chat_room_id IN (SELECT id FROM repair_chat_rooms WHERE repair_request_id = ?)`, [testRepairId]);
    await query(`DELETE FROM repair_chat_rooms WHERE repair_request_id = ?`, [testRepairId]);
    await query(`DELETE FROM technician_schedules WHERE repair_request_id = ?`, [testRepairId]);
    await query(`DELETE FROM payments WHERE invoice_id IN (SELECT id FROM invoices WHERE repair_request_id = ?)`, [testRepairId]);
    await query(`DELETE FROM invoices WHERE repair_request_id = ?`, [testRepairId]);
    await query(`DELETE FROM repair_status_history WHERE repair_request_id = ?`, [testRepairId]);
    await query(`DELETE FROM technician_assignments WHERE repair_request_id = ?`, [testRepairId]);
    await query(`DELETE FROM repair_requests WHERE id = ?`, [testRepairId]);
  }
}

runAdvancedFeaturesTestSuite().catch((err) => {
  console.error('\n❌ Pengujian Gagal:', err);
  process.exit(1);
});
