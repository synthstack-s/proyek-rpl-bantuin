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

async function runCategoryTestSuite() {
  console.log('===============================================================');
  console.log('   BANTUIN - SUITE PENGUJIAN MANAJEMEN KATEGORI PERALATAN');
  console.log('===============================================================\n');

  let adminCookie = '';

  // -----------------------------------------------------------------
  // UJI 1: Keamanan - Akses tanpa Sesi Admin harus Ditolak (401)
  // -----------------------------------------------------------------
  {
    const res = await fetch(`${BASE_URL}/api/admin/categories`);
    const data = await res.json();
    assert(
      res.status === 401 && data.success === false,
      'Uji Keamanan Akses Publik',
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
  // UJI 3: GET Daftar Kategori dari Database MySQL
  // -----------------------------------------------------------------
  {
    const res = await fetch(`${BASE_URL}/api/admin/categories`, {
      headers: { Cookie: adminCookie },
    });
    const data = await res.json();

    assert(
      res.status === 200 && data.success === true && Array.isArray(data.data),
      'GET Daftar Kategori',
      `Berhasil mengambil ${data.data?.length} kategori (Total metadata: ${data.pagination?.total})`
    );

    const hasServiceCount = data.data.every(
      (cat: any) => typeof cat.service_count === 'number' && typeof cat.technician_count === 'number'
    );
    assert(
      hasServiceCount,
      'Agregasi Relasi Data',
      'Setiap kategori memiliki service_count dan technician_count'
    );
  }

  // -----------------------------------------------------------------
  // UJI 4: Fitur Pencarian Kategori
  // -----------------------------------------------------------------
  {
    const res = await fetch(`${BASE_URL}/api/admin/categories?search=Pendingin`, {
      headers: { Cookie: adminCookie },
    });
    const data = await res.json();

    const matches = data.data?.some((c: any) => c.name.includes('Pendingin') || c.slug.includes('ac'));
    assert(
      res.status === 200 && matches,
      'Pencarian Kategori',
      `Pencarian kata kunci "Pendingin" menghasilkan ${data.data?.length} kategori yang relevan`
    );
  }

  // -----------------------------------------------------------------
  // UJI 5: GET Detail Kategori
  // -----------------------------------------------------------------
  {
    const res = await fetch(`${BASE_URL}/api/admin/categories/1`, {
      headers: { Cookie: adminCookie },
    });
    const data = await res.json();

    assert(
      res.status === 200 && data.success === true && data.data?.id === 1,
      'Detail Kategori (ID: 1)',
      `Detail kategori [ID 1]: "${data.data?.name}" (${data.data?.slug})`
    );
  }

  // -----------------------------------------------------------------
  // UJI 6: POST Tambah Kategori Baru
  // -----------------------------------------------------------------
  let createdCategoryId = 0;
  const testCategoryName = 'Kategori Pengujian Otomatis 2026';
  const testCategorySlug = 'kategori-pengujian-otomatis-2026';

  {
    const res = await fetch(`${BASE_URL}/api/admin/categories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        name: testCategoryName,
        slug: testCategorySlug,
        description: 'Deskripsi kategori pengujian otomatis untuk verifikasi sistem.',
        icon_url: '/icons/categories/test.svg',
        is_active: true,
      }),
    });
    const data = await res.json();
    createdCategoryId = data.data?.id;

    assert(
      res.status === 201 && data.success === true && createdCategoryId > 0,
      'POST Tambah Kategori Baru',
      `Kategori berhasil ditambahkan dengan ID: ${createdCategoryId}`
    );
  }

  // -----------------------------------------------------------------
  // UJI 7: Validasi Duplikasi Nama / Slug (409 Conflict)
  // -----------------------------------------------------------------
  {
    const res = await fetch(`${BASE_URL}/api/admin/categories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        name: testCategoryName,
        slug: testCategorySlug,
      }),
    });
    const data = await res.json();

    assert(
      res.status === 409 && data.success === false,
      'Cegah Duplikasi Nama/Slug',
      `Duplikasi berhasil ditolak dengan HTTP ${res.status} ("${data.message}")`
    );
  }

  // -----------------------------------------------------------------
  // UJI 8: PATCH Edit Kategori & Toggle Status
  // -----------------------------------------------------------------
  if (createdCategoryId > 0) {
    const updatedName = 'Kategori Pengujian Otomatis (Revisi)';
    const res = await fetch(`${BASE_URL}/api/admin/categories/${createdCategoryId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        name: updatedName,
        is_active: false,
      }),
    });
    const data = await res.json();

    assert(
      res.status === 200 && data.success === true && data.data?.name === updatedName && data.data?.is_active === false,
      'PATCH Edit & Toggle Status',
      `Kategori diperbarui: nama="${data.data?.name}", is_active=${data.data?.is_active}`
    );
  }

  // -----------------------------------------------------------------
  // UJI 9: Perlindungan Integritas Foreign Key saat Hapus
  // -----------------------------------------------------------------
  {
    // Coba hapus kategori 1 (Pendingin Ruangan AC) yang memiliki layanan terhubung
    const res = await fetch(`${BASE_URL}/api/admin/categories/1`, {
      method: 'DELETE',
      headers: { Cookie: adminCookie },
    });
    const data = await res.json();

    assert(
      res.status === 400 && data.success === false && data.inUse === true,
      'Proteksi Foreign Key Integritas Data',
      `Penghapusan fisik ditolak karena data masih terikat: "${data.message}"`
    );
  }

  // -----------------------------------------------------------------
  // UJI 10: DELETE Kategori Bersih (Tanpa Relasi Anak)
  // -----------------------------------------------------------------
  if (createdCategoryId > 0) {
    const res = await fetch(`${BASE_URL}/api/admin/categories/${createdCategoryId}`, {
      method: 'DELETE',
      headers: { Cookie: adminCookie },
    });
    const data = await res.json();

    assert(
      res.status === 200 && data.success === true && data.action === 'deleted',
      'DELETE Kategori Bersih',
      `Kategori uji [ID ${createdCategoryId}] berhasil dihapus: "${data.message}"`
    );
  }

  // -----------------------------------------------------------------
  // UJI 11: Verifikasi Integrasi Admin Audit Log
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
       WHERE entity_name = 'appliance_categories' 
       ORDER BY id DESC LIMIT 5`
    );

    await conn.end();

    const hasCreate = logs.some((l: any) => l.action === 'CREATE_CATEGORY');
    const hasUpdate = logs.some((l: any) => l.action === 'UPDATE_CATEGORY' || l.action === 'TOGGLE_CATEGORY_STATUS');
    const hasDelete = logs.some((l: any) => l.action === 'DELETE_CATEGORY');

    assert(
      logs.length >= 3 && hasCreate && (hasUpdate || hasDelete),
      'Integrasi Audit Log Administrator',
      `Tercatat ${logs.length} rekaman audit pada tabel admin_audit_logs (CREATE/UPDATE/DELETE)`
    );
  }

  console.log('\n===============================================================');
  const allPassed = steps.every((s) => s.passed);
  console.log(`HASIL: ${steps.filter((s) => s.passed).length}/${steps.length} Uji Berhasil`);
  console.log(allPassed ? '🎉 SELURUH PENGUJIAN MANAJEMEN KATEGORI LOLOS!' : '⚠️ ADA PENGUJIAN YANG GAGAL.');
  console.log('===============================================================\n');
}

runCategoryTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
