import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const BASE_URL = 'http://127.0.0.1:3000';
const ADMIN_EMAIL = process.env.ADMIN_INITIAL_EMAIL || 'admin@bantuin.id';
const ADMIN_PASSWORD = process.env.ADMIN_INITIAL_PASSWORD || 'AdminBantuin2026!';

async function verifyPageRendering() {
  console.log('=== VERIFIKASI RENDERING HALAMAN & PROTEKSI ROUTE ===\n');

  // 1. Cek proteksi redirect tanpa cookie pada /admin/services
  const unauthRes = await fetch(`${BASE_URL}/admin/services`, {
    redirect: 'manual',
  });
  console.log('1. Proteksi Halaman Unauthenticated:');
  console.log(`   Status: ${unauthRes.status} (Harus 307 Redirect)`);
  const location = unauthRes.headers.get('location');
  console.log(`   Location: ${location} (Harus ke /admin/login?callbackUrl=%2Fadmin%2Fservices)\n`);

  // 2. Login untuk memperoleh cookie sesi HttpOnly
  const loginRes = await fetch(`${BASE_URL}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  const setCookie = loginRes.headers.get('set-cookie');
  const sessionCookie = setCookie?.split(';')[0] || '';
  console.log('2. Autentikasi Admin:');
  console.log(`   Login Status: ${loginRes.status}`);
  console.log(`   Session Cookie Diperoleh: ${Boolean(sessionCookie)}\n`);

  // 3. Akses Halaman /admin/services dengan cookie
  const authRes = await fetch(`${BASE_URL}/admin/services`, {
    headers: { Cookie: sessionCookie },
  });
  const authHtml = await authRes.text();
  console.log('3. Akses Halaman /admin/services dengan Sesi:');
  console.log(`   Status: ${authRes.status}`);
  console.log(`   HTML Length: ${authHtml.length} bytes`);
  console.log(`   Mengandung layout admin: ${authHtml.includes('BANTUIN')}`);
  console.log(`   Status: ${authRes.status === 200 ? '✔ OK' : '❌ Gagal'}\n`);

  // 4. Akses Halaman /admin/categories dengan cookie
  const catRes = await fetch(`${BASE_URL}/admin/categories`, {
    headers: { Cookie: sessionCookie },
  });
  const catHtml = await catRes.text();
  console.log('4. Akses Halaman /admin/categories dengan Sesi:');
  console.log(`   Status: ${catRes.status}`);
  console.log(`   HTML Length: ${catHtml.length} bytes`);
  console.log(`   Status: ${catRes.status === 200 ? '✔ OK' : '❌ Gagal'}\n`);

  // 5. Akses Halaman /admin/technicians dengan cookie
  const techRes = await fetch(`${BASE_URL}/admin/technicians`, {
    headers: { Cookie: sessionCookie },
  });
  const techHtml = await techRes.text();
  console.log('5. Akses Halaman /admin/technicians dengan Sesi:');
  console.log(`   Status: ${techRes.status}`);
  console.log(`   HTML Length: ${techHtml.length} bytes`);
  console.log(`   Mengandung judul: ${techHtml.includes('Manajemen &amp; Verifikasi Teknisi') || techHtml.includes('Zero-NIK')}`);
  console.log(`   Status: ${techRes.status === 200 ? '✔ OK' : '❌ Gagal'}\n`);

  // 6. Akses Halaman /admin/users dengan Sesi
  const userRes = await fetch(`${BASE_URL}/admin/users`, {
    headers: { Cookie: sessionCookie },
  });
  const userHtml = await userRes.text();
  console.log('6. Akses Halaman /admin/users dengan Sesi:');
  console.log(`   Status: ${userRes.status}`);
  console.log(`   HTML Length: ${userHtml.length} bytes`);
  console.log(`   Mengandung judul: ${userHtml.includes('Manajemen Pengguna') || userHtml.includes('Modul Identitas')}`);
  console.log(`   Status: ${userRes.status === 200 ? '✔ OK' : '❌ Gagal'}\n`);

  // 7. Verifikasi API Layanan GET
  const apiRes = await fetch(`${BASE_URL}/api/admin/services?limit=5`, {
    headers: { Cookie: sessionCookie },
  });
  const apiJson = await apiRes.json();
  console.log('7. Akses API /api/admin/services:');
  console.log(`   Status: ${apiRes.status}`);
  console.log(`   Sukses: ${apiJson.success}`);
  console.log(`   Total Layanan di Database: ${apiJson.pagination?.total}`);
  console.log(`   Jumlah Data Diambil: ${apiJson.data?.length}\n`);

  // 8. Verifikasi API Teknisi GET
  const apiTechRes = await fetch(`${BASE_URL}/api/admin/technicians?limit=5`, {
    headers: { Cookie: sessionCookie },
  });
  const apiTechJson = await apiTechRes.json();
  console.log('8. Akses API /api/admin/technicians:');
  console.log(`   Status: ${apiTechRes.status}`);
  console.log(`   Sukses: ${apiTechJson.success}`);
  console.log(`   Total Teknisi di Database: ${apiTechJson.pagination?.total}`);
  console.log(`   Jumlah Data Diambil: ${apiTechJson.data?.length}\n`);

  // 9. Verifikasi API Pengguna GET
  const apiUsersRes = await fetch(`${BASE_URL}/api/admin/users?limit=5`, {
    headers: { Cookie: sessionCookie },
  });
  const apiUsersJson = await apiUsersRes.json();
  console.log('9. Akses API /api/admin/users:');
  console.log(`   Status: ${apiUsersRes.status}`);
  console.log(`   Sukses: ${apiUsersJson.success}`);
  console.log(`   Total Pengguna di Database: ${apiUsersJson.pagination?.total}`);
  console.log(`   Jumlah Data Diambil: ${apiUsersJson.data?.length}\n`);

  if (
    unauthRes.status === 307 &&
    loginRes.status === 200 &&
    authRes.status === 200 &&
    catRes.status === 200 &&
    techRes.status === 200 &&
    userRes.status === 200 &&
    apiRes.status === 200 &&
    apiTechRes.status === 200 &&
    apiUsersRes.status === 200
  ) {
    console.log('🎉 SELURUH PENGUJIAN RENDERING HALAMAN & API SUKSES BESAR!');
  } else {
    console.error('❌ Terdapat pengujian yang tidak memenuhi ekspektasi!');
    process.exit(1);
  }
}

verifyPageRendering().catch((err) => {
  console.error('Error saat verifikasi rendering:', err);
  process.exit(1);
});
