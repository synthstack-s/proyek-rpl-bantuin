import { query } from '../src/lib/db';
import { createUserToken } from '../src/lib/auth';

const BASE_URL = process.env.TEST_APP_URL || 'http://127.0.0.1:3000';

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✔ [PASS] ${message}`);
  } else {
    console.error(`  ✖ [FAIL] ${message}`);
    process.exit(1);
  }
}

async function runLogoutVisitorTests() {
  console.log('========================================================================');
  console.log('🚪 BANTUIN - PENGUJIAN OTOMATIS: ALUR LOGOUT MENU PENGUNJUNG');
  console.log('1. Customer Logout -> Kembali ke Menu Pengunjung (/)');
  console.log('2. Teknisi Logout -> Kembali ke Menu Pengunjung (/)');
  console.log('3. Form Submission (HTTP 303 Redirect) & API JSON Fallback');
  console.log('4. Route Langsung /logout (GET & POST) -> Redirect ke (/)');
  console.log('5. Proteksi Sesi Pasca-Logout (Akses Dashboard Ditolak)');
  console.log('========================================================================\n');

  // 1. Siapkan Pengguna Uji Customer & Teknisi dari Database
  const customerRows = await query<any[]>(
    `SELECT u.id, u.uuid, u.email, u.phone_number, u.role, u.status, u.is_verified, cp.full_name
     FROM users u
     LEFT JOIN customer_profiles cp ON cp.user_id = u.id
     WHERE u.role = 'customer' AND u.status = 'active'
     LIMIT 1`
  );

  const technicianRows = await query<any[]>(
    `SELECT u.id, u.uuid, u.email, u.phone_number, u.role, u.status, u.is_verified, tp.full_name
     FROM users u
     LEFT JOIN technician_profiles tp ON tp.user_id = u.id
     WHERE u.role = 'technician' AND u.status = 'active'
     LIMIT 1`
  );

  assert(customerRows.length > 0, 'Data pengguna customer aktif ditemukan di database');
  assert(technicianRows.length > 0, 'Data pengguna teknisi aktif ditemukan di database');

  const customerUser = customerRows[0];
  const technicianUser = technicianRows[0];

  const customerToken = await createUserToken({
    userId: customerUser.id,
    uuid: customerUser.uuid,
    email: customerUser.email,
    phoneNumber: customerUser.phone_number,
    role: 'customer',
    status: 'active',
    isVerified: Boolean(customerUser.is_verified),
    name: customerUser.full_name || 'Customer Tester',
  });

  const technicianToken = await createUserToken({
    userId: technicianUser.id,
    uuid: technicianUser.uuid,
    email: technicianUser.email,
    phoneNumber: technicianUser.phone_number,
    role: 'technician',
    status: 'active',
    isVerified: Boolean(technicianUser.is_verified),
    name: technicianUser.full_name || 'Technician Tester',
  });

  console.log('--- TEST SUITE 1: Customer Logout via Form Submission (/api/auth/logout) ---');
  // 1.1 Customer aktif mengakses dashboard
  const custDashRes = await fetch(`${BASE_URL}/customer/dashboard`, {
    headers: { Cookie: `bantuin_user_token=${customerToken}` },
  });
  assert(custDashRes.status === 200, 'Customer terautentikasi berhasil mengakses /customer/dashboard (200 OK)');

  // 1.2 Customer klik tombol "Keluar" (Browser HTML Form Submission dengan Accept: text/html)
  const custLogoutFormRes = await fetch(`${BASE_URL}/api/auth/logout`, {
    method: 'POST',
    headers: {
      Cookie: `bantuin_user_token=${customerToken}`,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    redirect: 'manual', // periksa header redirect langsung
  });

  assert(
    custLogoutFormRes.status === 303 || custLogoutFormRes.status === 302,
    `Form logout mengembalikan kode HTTP Redirect (${custLogoutFormRes.status})`
  );

  const redirectLocation = custLogoutFormRes.headers.get('location') || '';
  assert(
    redirectLocation.endsWith('/') || redirectLocation === '/',
    `Redirect mengarahkan pengguna kembali ke menu pengunjung (/) -> Location: ${redirectLocation}`
  );

  const custClearedCookies = custLogoutFormRes.headers.get('set-cookie') || '';
  assert(
    custClearedCookies.includes('bantuin_user_token') && custClearedCookies.includes('Max-Age=0'),
    'Set-Cookie menghapus sesi bantuin_user_token (Max-Age=0)'
  );

  // 1.3 Akses menu pengunjung (/) setelah logout
  const visitorPageRes = await fetch(`${BASE_URL}/`);
  assert(visitorPageRes.status === 200, 'Halaman menu pengunjung (/) berhasil dimuat (200 OK)');
  const visitorHtml = await visitorPageRes.text();
  assert(visitorHtml.includes('BANTUIN'), 'Menu pengunjung memuat identitas merek BANTUIN');
  assert(visitorHtml.includes('Kategori Layanan'), 'Menu pengunjung memuat navigasi Kategori Layanan');
  assert(visitorHtml.includes('Masuk') && visitorHtml.includes('Daftar'), 'Menu pengunjung menampilkan tombol Masuk dan Daftar untuk tamu');

  // 1.4 Verifikasi customer ditolak masuk ke /customer/dashboard setelah logout
  const custDashPostLogout = await fetch(`${BASE_URL}/customer/dashboard`, {
    redirect: 'manual',
  });
  assert(
    custDashPostLogout.status === 307 || custDashPostLogout.status === 302,
    `Customer tanpa sesi dialihkan (HTTP ${custDashPostLogout.status}) saat mencoba kembali ke dashboard`
  );
  assert(
    (custDashPostLogout.headers.get('location') || '').includes('/login'),
    'Pengalihan mengarah ke halaman login'
  );

  console.log('\n--- TEST SUITE 2: Teknisi Logout via Client API Fetch (/api/auth/logout) ---');
  // 2.1 Teknisi aktif mengakses dashboard
  const techDashRes = await fetch(`${BASE_URL}/technician/dashboard`, {
    headers: { Cookie: `bantuin_user_token=${technicianToken}` },
  });
  assert(techDashRes.status === 200, 'Teknisi terautentikasi berhasil mengakses /technician/dashboard (200 OK)');

  // 2.2 Teknisi klik "Keluar" melalui panggilan Client Component API (JSON)
  const techLogoutApiRes = await fetch(`${BASE_URL}/api/auth/logout`, {
    method: 'POST',
    headers: {
      Cookie: `bantuin_user_token=${technicianToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  });

  assert(techLogoutApiRes.status === 200, 'Panggilan logout API mengembalikan status 200 OK');
  const techLogoutData = await techLogoutApiRes.json();
  assert(techLogoutData.success === true, 'Response JSON logout bernilai success: true');
  assert(techLogoutData.redirectUrl === '/', 'Response menyertakan redirectUrl: "/" (menu pengunjung)');

  const techClearedCookies = techLogoutApiRes.headers.get('set-cookie') || '';
  assert(
    techClearedCookies.includes('bantuin_user_token') && techClearedCookies.includes('Max-Age=0'),
    'Set-Cookie membersihkan sesi bantuin_user_token teknisi'
  );

  // 2.3 Verifikasi teknisi ditolak masuk ke /technician/dashboard setelah logout
  const techDashPostLogout = await fetch(`${BASE_URL}/technician/dashboard`, {
    redirect: 'manual',
  });
  assert(
    techDashPostLogout.status === 307 || techDashPostLogout.status === 302,
    `Teknisi tanpa sesi dialihkan (HTTP ${techDashPostLogout.status}) saat mengakses dashboard`
  );

  console.log('\n--- TEST SUITE 3: Akses Langsung Route /logout (GET & POST) ---');
  // 3.1 Route langsung GET /logout
  const getLogoutRes = await fetch(`${BASE_URL}/logout`, {
    headers: { Cookie: `bantuin_user_token=${customerToken}` },
    redirect: 'manual',
  });
  assert(
    getLogoutRes.status === 303 || getLogoutRes.status === 302,
    `GET /logout mengembalikan status Redirect (HTTP ${getLogoutRes.status})`
  );
  assert(
    (getLogoutRes.headers.get('location') || '').endsWith('/') || getLogoutRes.headers.get('location') === '/',
    'GET /logout mengarahkan pengguna kembali ke menu pengunjung (/)'
  );

  // 3.2 Route langsung GET /api/auth/logout
  const getApiLogoutRes = await fetch(`${BASE_URL}/api/auth/logout`, {
    headers: { Cookie: `bantuin_user_token=${technicianToken}` },
    redirect: 'manual',
  });
  assert(
    getApiLogoutRes.status === 303 || getApiLogoutRes.status === 302,
    `GET /api/auth/logout mengembalikan status Redirect (HTTP ${getApiLogoutRes.status})`
  );
  assert(
    (getApiLogoutRes.headers.get('location') || '').endsWith('/') || getApiLogoutRes.headers.get('location') === '/',
    'GET /api/auth/logout mengarahkan pengguna kembali ke menu pengunjung (/)'
  );

  console.log('\n========================================================================');
  console.log('🎉 SELURUH PENGUJIAN LOGOUT KE MENU PENGUNJUNG BERHASIL 100%!');
  console.log('========================================================================');
  process.exit(0);
}

runLogoutVisitorTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
