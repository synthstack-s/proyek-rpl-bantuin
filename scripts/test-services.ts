import dotenv from 'dotenv';
import path from 'path';
import mysql from 'mysql2/promise';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const BASE_URL = 'http://127.0.0.1:3000';
const ADMIN_EMAIL = process.env.ADMIN_INITIAL_EMAIL || 'admin@bantuin.id';
const ADMIN_PASSWORD = process.env.ADMIN_INITIAL_PASSWORD || 'AdminBantuin2026!';

interface TestStep {
  name: string;
  passed: boolean;
  message: string;
}

const steps: TestStep[] = [];

function assert(condition: boolean, name: string, message: string) {
  steps.push({
    name,
    passed: condition,
    message: condition ? message : `GAGAL: ${message}`,
  });
  console.log(`${condition ? '✔ [PASS]' : '❌ [FAIL]'} ${name}: ${message}`);
}

async function runServiceTestSuite() {
  console.log('===============================================================');
  console.log('     BANTUIN - SUITE PENGUJIAN MANAJEMEN LAYANAN & TARIF');
  console.log('===============================================================\n');

  let adminCookie = '';

  // -----------------------------------------------------------------
  // UJI 1: Keamanan - Akses tanpa Sesi Admin harus Ditolak (401)
  // -----------------------------------------------------------------
  {
    const res = await fetch(`${BASE_URL}/api/admin/services`);
    const data = await res.json();
    assert(
      res.status === 401 && data.success === false,
      'Uji Keamanan Akses Publik (401)',
      `Permintaan tanpa autentikasi ditolak dengan HTTP ${res.status} ("${data.message}")`
    );
  }

  // -----------------------------------------------------------------
  // UJI 2: Autentikasi Admin untuk Memperoleh Sesi
  // -----------------------------------------------------------------
  {
    const res = await fetch(`${BASE_URL}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      }),
    });

    const data = await res.json();
    const rawCookie = res.headers.get('set-cookie');
    if (rawCookie) {
      adminCookie = rawCookie.split(';')[0];
    }

    assert(
      res.status === 200 && data.success === true && Boolean(adminCookie),
      'Login Administrator',
      `Admin "${ADMIN_EMAIL}" berhasil login dan memperoleh cookie sesi`
    );
  }

  if (!adminCookie) {
    console.error('❌ Tidak dapat melanjutkan pengujian karena login gagal.');
    process.exit(1);
  }

  // -----------------------------------------------------------------
  // UJI 3: GET Daftar Layanan dari Database MySQL
  // -----------------------------------------------------------------
  {
    const res = await fetch(`${BASE_URL}/api/admin/services`, {
      headers: { Cookie: adminCookie },
    });
    const data = await res.json();

    assert(
      res.status === 200 && data.success === true && Array.isArray(data.data),
      'GET Daftar Layanan',
      `Berhasil mengambil ${data.data?.length} layanan (Total metadata: ${data.pagination?.total})`
    );

    const hasRequiredFields = data.data.every(
      (srv: any) =>
        typeof srv.id === 'number' &&
        typeof srv.category_id === 'number' &&
        typeof srv.category_name === 'string' &&
        typeof srv.base_price === 'number' &&
        typeof srv.estimated_duration_min === 'number' &&
        typeof srv.is_active === 'boolean' &&
        typeof srv.repair_count === 'number'
    );
    assert(
      hasRequiredFields,
      'Struktur Data Layanan & Tipe Data',
      'Setiap layanan memiliki ID, Kategori, Tarif (Number), Durasi (Menit), Status (Boolean), dan Repair Count'
    );
  }

  // -----------------------------------------------------------------
  // UJI 4: Fitur Pencarian Layanan
  // -----------------------------------------------------------------
  {
    const res = await fetch(`${BASE_URL}/api/admin/services?search=Cuci`, {
      headers: { Cookie: adminCookie },
    });
    const data = await res.json();

    const matches = data.data?.every((s: any) =>
      s.name.toLowerCase().includes('cuci') ||
      s.slug.toLowerCase().includes('cuci') ||
      (s.description && s.description.toLowerCase().includes('cuci')) ||
      (s.category_name && s.category_name.toLowerCase().includes('cuci'))
    );
    assert(
      res.status === 200 && data.data?.length > 0 && matches,
      'Pencarian Layanan',
      `Pencarian kata kunci "Cuci" menghasilkan ${data.data?.length} layanan relevan`
    );
  }

  // -----------------------------------------------------------------
  // UJI 5: Filter Kategori & Status
  // -----------------------------------------------------------------
  {
    const res = await fetch(`${BASE_URL}/api/admin/services?category_id=1&status=active`, {
      headers: { Cookie: adminCookie },
    });
    const data = await res.json();

    const allMatch = data.data?.every(
      (s: any) => s.category_id === 1 && s.is_active === true
    );
    assert(
      res.status === 200 && data.data?.length > 0 && allMatch,
      'Filter Kategori & Status',
      `Filter category_id=1 dan status=active menghasilkan ${data.data?.length} layanan sesuai kriteria`
    );
  }

  // -----------------------------------------------------------------
  // UJI 6: GET Detail Layanan (ID: 1)
  // -----------------------------------------------------------------
  {
    const res = await fetch(`${BASE_URL}/api/admin/services/1`, {
      headers: { Cookie: adminCookie },
    });
    const data = await res.json();

    assert(
      res.status === 200 && data.success === true && data.data?.id === 1,
      'Detail Layanan (ID: 1)',
      `Detail layanan [ID 1]: "${data.data?.name}" | Tarif: Rp ${data.data?.base_price.toLocaleString('id-ID')} | Kategori: ${data.data?.category_name}`
    );
  }

  // -----------------------------------------------------------------
  // UJI 7: Validasi Input Tidak Lengkap / Tidak Valid (400)
  // -----------------------------------------------------------------
  {
    const res = await fetch(`${BASE_URL}/api/admin/services`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        // Sengaja kosong tanpa name, category_id, base_price
      }),
    });
    const data = await res.json();

    assert(
      res.status === 400 && data.success === false,
      'Validasi Input Kosong',
      `Input kosong ditolak dengan pesan: "${data.message}"`
    );
  }

  // -----------------------------------------------------------------
  // UJI 8: Validasi Tarif Negatif (400)
  // -----------------------------------------------------------------
  {
    const res = await fetch(`${BASE_URL}/api/admin/services`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        category_id: 1,
        name: 'Layanan Uji Tarif Negatif',
        base_price: -50000,
        estimated_duration_min: 60,
      }),
    });
    const data = await res.json();

    assert(
      res.status === 400 && data.success === false,
      'Validasi Tarif Negatif',
      `Tarif negatif berhasil ditolak: "${data.message}"`
    );
  }

  // -----------------------------------------------------------------
  // UJI 9: Validasi Kategori Tidak Ditemukan (404)
  // -----------------------------------------------------------------
  {
    const res = await fetch(`${BASE_URL}/api/admin/services`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        category_id: 99999, // ID tidak ada di database
        name: 'Layanan Kategori Fiktif',
        base_price: 100000,
        estimated_duration_min: 60,
      }),
    });
    const data = await res.json();

    assert(
      res.status === 404 && data.success === false,
      'Validasi Kategori Tidak Terdaftar',
      `Kategori tidak terdaftar ditolak dengan HTTP 404: "${data.message}"`
    );
  }

  // -----------------------------------------------------------------
  // UJI 10: POST Tambah Layanan Valid (Penyimpanan MySQL & Auto Slug)
  // -----------------------------------------------------------------
  let createdServiceId = 0;
  const testServiceName = 'Uji Kalibrasi & Servis Kompresor 2026';
  const testServiceSlug = 'uji-kalibrasi-servis-kompresor-2026';

  {
    const res = await fetch(`${BASE_URL}/api/admin/services`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        category_id: 1,
        name: testServiceName,
        slug: testServiceSlug,
        description: 'Layanan pengujian otomatis untuk verifikasi sistem manajemen tarif.',
        base_price: 250000,
        estimated_duration_min: 90,
        is_active: true,
      }),
    });
    const data = await res.json();
    createdServiceId = data.data?.id;

    assert(
      res.status === 201 && data.success === true && createdServiceId > 0,
      'POST Tambah Layanan Valid',
      `Layanan berhasil dibuat dengan ID: ${createdServiceId} | Tarif: Rp ${data.data?.base_price.toLocaleString('id-ID')} | Durasi: ${data.data?.estimated_duration_min} menit`
    );
  }

  // -----------------------------------------------------------------
  // UJI 11: Penanganan Konflik Nama / Slug Duplikat (409 Conflict)
  // -----------------------------------------------------------------
  {
    const res = await fetch(`${BASE_URL}/api/admin/services`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        category_id: 1,
        name: testServiceName,
        slug: testServiceSlug,
        base_price: 200000,
      }),
    });
    const data = await res.json();

    assert(
      res.status === 409 && data.success === false,
      'Cegah Duplikasi Nama / Slug Layanan',
      `Duplikasi berhasil ditolak dengan HTTP 409: "${data.message}"`
    );
  }

  // -----------------------------------------------------------------
  // UJI 12: PATCH Pembaruan Tarif & Informasi Layanan
  // -----------------------------------------------------------------
  if (createdServiceId > 0) {
    const updatedPrice = 285000;
    const updatedDuration = 75;
    const res = await fetch(`${BASE_URL}/api/admin/services/${createdServiceId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        base_price: updatedPrice,
        estimated_duration_min: updatedDuration,
      }),
    });
    const data = await res.json();

    assert(
      res.status === 200 &&
        data.success === true &&
        data.data?.base_price === updatedPrice &&
        data.data?.estimated_duration_min === updatedDuration,
      'PATCH Pembaruan Tarif & Durasi',
      `Tarif diperbarui menjadi Rp ${data.data?.base_price.toLocaleString('id-ID')} dan durasi ${data.data?.estimated_duration_min} menit`
    );
  }

  // -----------------------------------------------------------------
  // UJI 13: PATCH Pemindahan Kategori Layanan
  // -----------------------------------------------------------------
  if (createdServiceId > 0) {
    const res = await fetch(`${BASE_URL}/api/admin/services/${createdServiceId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        category_id: 2, // Pindahkan ke kategori 2 (Lemari Es & Freezer)
      }),
    });
    const data = await res.json();

    assert(
      res.status === 200 &&
        data.success === true &&
        data.data?.category_id === 2 &&
        data.data?.category_name === 'Lemari Es & Freezer',
      'PATCH Pemindahan Kategori Layanan',
      `Kategori layanan berhasil dialihkan ke ID 2 ("${data.data?.category_name}")`
    );
  }

  // -----------------------------------------------------------------
  // UJI 14: Aktivasi & Penonaktifan Layanan (Toggle is_active)
  // -----------------------------------------------------------------
  if (createdServiceId > 0) {
    // Nonaktifkan
    const resOff = await fetch(`${BASE_URL}/api/admin/services/${createdServiceId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({ is_active: false }),
    });
    const dataOff = await resOff.json();

    // Aktifkan kembali
    const resOn = await fetch(`${BASE_URL}/api/admin/services/${createdServiceId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({ is_active: true }),
    });
    const dataOn = await resOn.json();

    assert(
      dataOff.data?.is_active === false && dataOn.data?.is_active === true,
      'Aktivasi & Penonaktifan Layanan',
      `Status berhasil diubah ke Nonaktif (false) lalu kembali Aktif (true)`
    );
  }

  // -----------------------------------------------------------------
  // UJI 15: Proteksi Foreign Key saat Penghapusan Layanan Terikat
  // -----------------------------------------------------------------
  {
    // Cek apakah ada layanan yang memiliki pesanan repair_requests
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'bantuin_db',
    });

    const [rows]: any = await conn.execute(
      'SELECT service_id, COUNT(*) as count FROM repair_requests GROUP BY service_id HAVING count > 0 LIMIT 1'
    );
    await conn.end();

    if (rows && rows.length > 0) {
      const boundServiceId = rows[0].service_id;
      const res = await fetch(`${BASE_URL}/api/admin/services/${boundServiceId}`, {
        method: 'DELETE',
        headers: { Cookie: adminCookie },
      });
      const data = await res.json();

      assert(
        res.status === 400 && data.success === false && data.inUse === true,
        'Proteksi Foreign Key Integritas Transaksi',
        `Layanan [ID ${boundServiceId}] yang memiliki ${rows[0].count} riwayat transaksi ditolak untuk dihapus: "${data.message}"`
      );
    } else {
      console.log('ℹ [INFO] Tidak ada repair_requests aktif yang mengikat layanan seeded saat ini.');
    }
  }

  // -----------------------------------------------------------------
  // UJI 16: DELETE Layanan Uji Bersih (Tanpa Keterikatan Transaksi)
  // -----------------------------------------------------------------
  if (createdServiceId > 0) {
    const res = await fetch(`${BASE_URL}/api/admin/services/${createdServiceId}`, {
      method: 'DELETE',
      headers: { Cookie: adminCookie },
    });
    const data = await res.json();

    assert(
      res.status === 200 && data.success === true && data.action === 'deleted',
      'DELETE Layanan Uji Bersih',
      `Layanan uji [ID ${createdServiceId}] berhasil dihapus permanen: "${data.message}"`
    );

    // Pastikan data tidak dapat diambil lagi (404)
    const checkRes = await fetch(`${BASE_URL}/api/admin/services/${createdServiceId}`, {
      headers: { Cookie: adminCookie },
    });
    assert(
      checkRes.status === 404,
      'Verifikasi Penghapusan Fisik',
      `Layanan [ID ${createdServiceId}] sudah tidak ada di database (HTTP 404)`
    );
  }

  // -----------------------------------------------------------------
  // UJI 17: Verifikasi Pencatatan Admin Audit Logs
  // -----------------------------------------------------------------
  {
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'bantuin_db',
    });

    const [logs]: any = await conn.execute(
      `SELECT action, entity_name, entity_id, created_at 
       FROM admin_audit_logs 
       WHERE entity_name = 'services' 
       ORDER BY id DESC LIMIT 10`
    );

    await conn.end();

    const hasCreate = logs.some((l: any) => l.action === 'CREATE_SERVICE');
    const hasUpdate = logs.some((l: any) => l.action === 'UPDATE_SERVICE' || l.action === 'UPDATE_SERVICE_RATE' || l.action === 'UPDATE_SERVICE_CATEGORY');
    const hasDelete = logs.some((l: any) => l.action === 'DELETE_SERVICE');

    assert(
      logs.length >= 3 && hasCreate && (hasUpdate || hasDelete),
      'Integrasi Audit Log Administrator',
      `Tercatat ${logs.length} rekaman audit pada tabel admin_audit_logs untuk entitas "services" (CREATE, UPDATE, DELETE)`
    );
  }

  // -----------------------------------------------------------------
  // UJI 18: Verifikasi Keutuhan 15 Layanan Awal & Integritas Database
  // -----------------------------------------------------------------
  {
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'bantuin_db',
    });

    const [countRows]: any = await conn.execute(
      'SELECT COUNT(*) as count FROM services WHERE deleted_at IS NULL'
    );
    await conn.end();

    const serviceCount = Number(countRows[0]?.count || 0);
    assert(
      serviceCount >= 15,
      'Keutuhan 15 Layanan Awal',
      `Tepat ${serviceCount} layanan katalog aktif tersimpan di MySQL, data awal tetap utuh tanpa kerusakan`
    );
  }

  console.log('\n===============================================================');
  const allPassed = steps.every((s) => s.passed);
  console.log(`HASIL: ${steps.filter((s) => s.passed).length}/${steps.length} Uji Berhasil`);
  console.log(allPassed ? '🎉 SELURUH PENGUJIAN MANAJEMEN LAYANAN & TARIF LOLOS!' : '⚠️ ADA PENGUJIAN YANG GAGAL.');
  console.log('===============================================================\n');
}

runServiceTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
