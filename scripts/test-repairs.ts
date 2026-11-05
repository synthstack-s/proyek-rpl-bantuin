import dotenv from 'dotenv';
import path from 'path';
import mysql from 'mysql2/promise';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const BASE_URL = 'http://127.0.0.1:3000';

interface TestRecord {
  name: string;
  passed: boolean;
  details: string;
}

const testResults: TestRecord[] = [];

function assertTest(name: string, condition: boolean, details: string) {
  testResults.push({
    name,
    passed: condition,
    details: condition ? details : `GAGAL: ${details}`,
  });
  console.log(`${condition ? '  ✔ [PASS]' : '  ❌ [FAIL]'} ${name}: ${details}`);
}

async function runRepairTestSuite() {
  console.log('\n========================================================================');
  console.log('       BANTUIN - SUITE PENGUJIAN PEMESANAN SERVIS PELANGGAN');
  console.log('========================================================================\n');

  // Hubungkan ke database
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'bantuin_db',
  });

  try {
    // 1. Ambil atau buat akun customer aktif untuk pengujian
    const testCustomerEmail = 'cust_order_test@bantuin.id';
    const testCustomerPass = 'Password123!';
    const testCustomerPhone = '6281299887766';

    const [existing]: any = await connection.execute(
      'SELECT id FROM users WHERE email = ? LIMIT 1',
      [testCustomerEmail]
    );

    let customerId: number;
    if (existing.length === 0) {
      const bcrypt = await import('bcryptjs');
      const hash = await bcrypt.hash(testCustomerPass, 12);
      const [insertUser]: any = await connection.execute(
        `INSERT INTO users (uuid, email, phone_number, password_hash, role, status, is_verified, created_at, updated_at)
         VALUES (UUID(), ?, ?, ?, 'customer', 'active', TRUE, NOW(), NOW())`,
        [testCustomerEmail, testCustomerPhone, hash]
      );
      customerId = insertUser.insertId;
      await connection.execute(
        `INSERT INTO customer_profiles (user_id, full_name, default_address, created_at, updated_at)
         VALUES (?, 'Pelanggan Uji Pesanan', 'Jl. Sudirman No 123, Jakarta', NOW(), NOW())`,
        [customerId]
      );
    } else {
      customerId = existing[0].id;
    }

    // 2. Login untuk memperoleh session cookie customer
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: testCustomerEmail,
        password: testCustomerPass,
      }),
    });
    const setCookie = loginRes.headers.get('set-cookie');
    const sessionCookie = setCookie?.split(';')[0] || '';

    assertTest(
      'Autentikasi Customer',
      loginRes.status === 200 && Boolean(sessionCookie),
      `Status HTTP ${loginRes.status}, Cookie Diperoleh: ${Boolean(sessionCookie)}`
    );

    // 3. Uji Endpoint Katalog (/api/customer/catalog)
    const catalogRes = await fetch(`${BASE_URL}/api/customer/catalog`);
    const catalogJson = await catalogRes.json();
    const categories = catalogJson.data?.categories || [];

    assertTest(
      'Katalog Layanan',
      catalogRes.status === 200 && categories.length >= 6,
      `Jumlah Kategori Aktif: ${categories.length}`
    );

    const firstCat = categories[0];
    const firstService = firstCat?.services?.[0];

    // 4. Uji Penolakan Pemesanan Tanpa Sesi
    const unauthOrderRes = await fetch(`${BASE_URL}/api/customer/repairs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category_id: firstCat.id,
        problem_description: 'AC tidak dingin sama sekali sejak kemarin',
        address_text: 'Jl. Melati No. 10 Jakarta Pusat',
      }),
    });
    assertTest(
      'Keamanan Pesanan',
      unauthOrderRes.status === 401,
      `Tolak Permintaan Tanpa Sesi (HTTP: ${unauthOrderRes.status})`
    );

    // 5. Uji Penolakan Validasi (Deskripsi Kurang dari 10 Karakter)
    const shortDescRes = await fetch(`${BASE_URL}/api/customer/repairs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
      },
      body: JSON.stringify({
        category_id: firstCat.id,
        problem_description: 'rusak',
        address_text: 'Jl. Melati No. 10 Jakarta Pusat',
      }),
    });
    assertTest(
      'Validasi Pesanan',
      shortDescRes.status === 422,
      `Tolak Deskripsi Kurang dari 10 Karakter (HTTP: ${shortDescRes.status})`
    );

    // 6. Uji Penolakan Inkonsistensi Kategori & Layanan (Foreign Key Cross-Check)
    const mismatchedSvcRes = await fetch(`${BASE_URL}/api/customer/repairs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
      },
      body: JSON.stringify({
        category_id: firstCat.id,
        service_id: 9999, // ID tidak ada / tidak cocok
        problem_description: 'AC tidak dingin sama sekali sejak kemarin',
        address_text: 'Jl. Melati No. 10 Jakarta Pusat',
      }),
    });
    assertTest(
      'Integritas Relasi',
      mismatchedSvcRes.status === 400,
      `Tolak Service ID yang Tidak Cocok dengan Kategori (HTTP: ${mismatchedSvcRes.status})`
    );

    // 7. Uji Pembuatan Pesanan Berhasil (Valid)
    const validOrderRes = await fetch(`${BASE_URL}/api/customer/repairs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
      },
      body: JSON.stringify({
        category_id: firstCat.id,
        service_id: firstService?.id || null,
        device_brand: 'Panasonic',
        device_model: 'Inverter 1 PK',
        problem_description: 'Unit indoor mengeluarkan suara berisik dan angin tidak dingin sama sekali',
        problem_photos: ['https://images.unsplash.com/photo-1581092160607-ee22621dd758'],
        address_text: 'Apartemen Sudirman Tower Lt. 12 No. 1205, Jakarta Pusat',
        latitude: -6.2146,
        longitude: 106.8451,
      }),
    });
    const validOrderJson = await validOrderRes.json();
    const createdOrderId = validOrderJson.data?.id;
    const createdOrderCode = validOrderJson.data?.orderCode;

    assertTest(
      'Pembuatan Pesanan',
      validOrderRes.status === 201 && Boolean(createdOrderId),
      `Order ID: ${createdOrderId}, Kode Order: ${createdOrderCode}`
    );

    assertTest(
      'Format Kode Pesanan',
      Boolean(createdOrderCode?.startsWith('BAN-')),
      `Format Kode Sesuai: ${createdOrderCode}`
    );

    // 8. Verifikasi Data di Database (repair_requests & repair_status_history)
    const [dbRequests]: any = await connection.execute(
      'SELECT id, order_code, current_status, customer_id, category_id, service_id FROM repair_requests WHERE id = ?',
      [createdOrderId]
    );
    assertTest(
      'Database Transaksi',
      dbRequests.length > 0 && dbRequests[0].current_status === 'submitted',
      `Tersimpan di repair_requests dengan status: ${dbRequests[0]?.current_status}`
    );

    const [dbHistory]: any = await connection.execute(
      'SELECT id, previous_status, new_status, actor_role, notes FROM repair_status_history WHERE repair_request_id = ?',
      [createdOrderId]
    );
    assertTest(
      'Database Audit Linimasa',
      dbHistory.length > 0 && dbHistory[0].new_status === 'submitted' && dbHistory[0].actor_role === 'customer',
      `Tercatat di repair_status_history (Role: ${dbHistory[0]?.actor_role})`
    );

    // 9. Uji Detail Pesanan (/api/customer/repairs/[id])
    const detailRes = await fetch(`${BASE_URL}/api/customer/repairs/${createdOrderId}`, {
      headers: { Cookie: sessionCookie },
    });
    const detailJson = await detailRes.json();
    assertTest(
      'Detail Pesanan',
      detailRes.status === 200 && detailJson.data?.orderCode === createdOrderCode,
      `Detail Sesuai: ${detailJson.data?.orderCode}, Kategori: ${detailJson.data?.category?.name}`
    );

    // 10. Uji Daftar Pesanan Pelanggan (/api/customer/repairs)
    const listRes = await fetch(`${BASE_URL}/api/customer/repairs`, {
      headers: { Cookie: sessionCookie },
    });
    const listJson = await listRes.json();
    const foundInList = listJson.data?.some((r: any) => r.id === createdOrderId);
    assertTest(
      'Daftar Riwayat Pesanan',
      listRes.status === 200 && Boolean(foundInList),
      `Pesanan baru ditemukan dalam list pelanggan (Total: ${listJson.data?.length})`
    );

    // 11. Uji Pembatalan Pesanan (/api/customer/repairs/[id]/cancel)
    const cancelRes = await fetch(`${BASE_URL}/api/customer/repairs/${createdOrderId}/cancel`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
      },
      body: JSON.stringify({
        cancellation_reason: 'Unit AC sudah berfungsi normal kembali setelah di-reset remote.',
      }),
    });
    const cancelJson = await cancelRes.json();
    assertTest(
      'Pembatalan Pesanan',
      cancelRes.status === 200 && cancelJson.data?.status === 'cancelled',
      `Status Terupdate Menjadi: ${cancelJson.data?.status}`
    );

    // Verifikasi status di database setelah dibatalkan
    const [cancelledDb]: any = await connection.execute(
      'SELECT current_status FROM repair_requests WHERE id = ?',
      [createdOrderId]
    );
    assertTest(
      'Database Pasca Pembatalan',
      cancelledDb[0]?.current_status === 'cancelled',
      `Status di Database: ${cancelledDb[0]?.current_status}`
    );

    console.log('\n========================================================================');
    const allPassed = testResults.every((t) => t.passed);
    console.log(`TOTAL PENGUJIAN: ${testResults.length}`);
    console.log(`LULUS (PASS)   : ${testResults.filter((t) => t.passed).length}`);
    console.log(`GAGAL (FAIL)   : ${testResults.filter((t) => !t.passed).length}`);
    console.log(`STATUS AKHIR   : ${allPassed ? '🎉 SEMUA PENGUJIAN SUKSES BESAR (100% PASS)' : '❌ ADA PENGUJIAN GAGAL'}`);
    console.log('========================================================================\n');

    if (!allPassed) {
      process.exit(1);
    }
  } catch (err: any) {
    console.error('Error saat pengujian pesanan:', err);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

runRepairTestSuite();

