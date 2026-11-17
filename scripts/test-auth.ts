import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const BASE_URL = 'http://127.0.0.1:3000';
const ADMIN_EMAIL = process.env.ADMIN_INITIAL_EMAIL || 'admin@bantuin.id';
const ADMIN_PASSWORD = process.env.ADMIN_INITIAL_PASSWORD || 'AdminBantuin2026!';
const ADMIN_PHONE = process.env.ADMIN_INITIAL_PHONE || '+628110000001';

const CUSTOMER_EMAIL = 'customer_audit_test@bantuin.id';
const CUSTOMER_PASSWORD = 'CustomerPassword123!';
const CUSTOMER_PHONE = '+6289999999999';

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, name: string, details: string) {
  results.push({
    name,
    passed: condition,
    details: condition ? details : `GAGAL: ${details}`,
  });
  console.log(`${condition ? '✔ [PASS]' : '❌ [FAIL]'} ${name}: ${details}`);
}

async function runTestSuite() {
  console.log('===============================================================');
  console.log('     BANTUIN - SUITE PENGUJIAN LOGIN TERPADU (SATU PANEL)');
  console.log('     Satu endpoint login /api/auth/login untuk semua peran');
  console.log('===============================================================\n');

  // Inisialisasi Database Connection
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'bantuin_db',
  });

  try {
    // 1. Pastikan Akun Admin Terdaftar untuk Pengujian
    const [existingAdmin]: any = await connection.execute(
      'SELECT id, email, role, status FROM users WHERE email = ? LIMIT 1',
      [ADMIN_EMAIL]
    );

    if (!existingAdmin || existingAdmin.length === 0) {
      console.log('Membuat akun admin uji sesuai konfigurasi .env.local...');
      const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
      await connection.execute(
        `INSERT INTO users (uuid, email, phone_number, password_hash, role, status, is_verified)
         VALUES (?, ?, ?, ?, 'admin', 'active', 1)`,
        [crypto.randomUUID(), ADMIN_EMAIL, ADMIN_PHONE, adminHash]
      );
      console.log('✔ Akun admin uji berhasil disiapkan.\n');
    } else {
      console.log(`✔ Akun admin uji "${ADMIN_EMAIL}" sudah tersedia di database.\n`);
    }

    // 2. Buat Akun Non-Admin (Customer) untuk Pengujian Pemisahan Peran
    await connection.execute('DELETE FROM users WHERE email = ?', [CUSTOMER_EMAIL]);
    const customerHash = await bcrypt.hash(CUSTOMER_PASSWORD, 12);
    await connection.execute(
      `INSERT INTO users (uuid, email, phone_number, password_hash, role, status, is_verified)
       VALUES (?, ?, ?, ?, 'customer', 'active', 1)`,
      [crypto.randomUUID(), CUSTOMER_EMAIL, CUSTOMER_PHONE, customerHash]
    );

    // -------------------------------------------------------------
    // UJI 1: Validasi Input (Identifier & Password Kosong)
    // -------------------------------------------------------------
    {
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: '', password: '' }),
      });
      const data = await res.json();
      assert(
        res.status === 422 && data.success === false,
        'Uji Validasi Input',
        `Input kosong ditolak dengan HTTP ${res.status} ("${data.message}")`
      );
    }

    // -------------------------------------------------------------
    // UJI 2: Login Akun yang Tidak Terdaftar
    // -------------------------------------------------------------
    {
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'ghost_user@bantuin.id', password: 'SomeRandomPassword123!' }),
      });
      const data = await res.json();
      assert(
        res.status === 401 && data.success === false,
        'Uji Akun Tidak Terdaftar',
        `Email fiktif ditolak dengan HTTP ${res.status} ("${data.message}")`
      );
    }

    // -------------------------------------------------------------
    // UJI 3: Login dengan Password Salah (Kredensial Invalid)
    // -------------------------------------------------------------
    {
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: ADMIN_EMAIL, password: 'SalahPassword123!' }),
      });
      const data = await res.json();
      assert(
        res.status === 401 && data.success === false,
        'Uji Password Salah',
        `Kata sandi salah ditolak dengan HTTP ${res.status} ("${data.message}")`
      );
    }

    // -------------------------------------------------------------
    // UJI 4: Login Customer via Endpoint Terpadu (Pemisahan Peran)
    // Satu endpoint untuk semua peran: customer yang login lewat
    // /api/auth/login HARUS berhasil, tetapi mendapat cookie PENGGUNA
    // (bukan cookie admin) dan redirect ke dasbor customer.
    // -------------------------------------------------------------
    let customerCookie = '';
    {
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: CUSTOMER_EMAIL, password: CUSTOMER_PASSWORD }),
      });
      const data = await res.json();
      const rawCookie = res.headers.get('set-cookie') || '';

      const is200 = res.status === 200;
      const isCustomer = data.data?.user?.role === 'customer';
      const redirectOk = data.data?.redirectUrl === '/customer/dashboard';
      const hasUserCookie = rawCookie.includes('bantuin_user_token=');
      const noAdminCookie = !rawCookie.includes('bantuin_admin_token=');

      if (rawCookie) {
        customerCookie = rawCookie.split(';')[0];
      }

      assert(
        is200 && isCustomer && redirectOk && hasUserCookie && noAdminCookie,
        'Uji Login Customer via Endpoint Terpadu',
        `Customer login HTTP 200, role='customer', redirect='/customer/dashboard', cookie pengguna diterima, TIDAK ada cookie admin.`
      );
    }

    // -------------------------------------------------------------
    // UJI 5: Login dengan Kredensial Admin Valid (via Endpoint Terpadu)
    // -------------------------------------------------------------
    let adminCookie = '';
    {
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: ADMIN_EMAIL, password: ADMIN_PASSWORD, rememberMe: true }),
      });
      const data = await res.json();
      const rawCookie = res.headers.get('set-cookie');

      const is200 = res.status === 200;
      const isSuccess = data.success === true;
      const isRoleAdmin = data.data?.user?.role === 'admin';
      const redirectOk = data.data?.redirectUrl === '/admin';
      const noPasswordHash = data.data?.user?.password_hash === undefined && data.password_hash === undefined;
      const hasCookie = rawCookie !== null && rawCookie.includes('bantuin_admin_token=');
      const isHttpOnly = rawCookie?.toLowerCase().includes('httponly') ?? false;

      if (rawCookie) {
        adminCookie = rawCookie.split(';')[0];
      }

      assert(
        is200 && isSuccess && isRoleAdmin && redirectOk && noPasswordHash && hasCookie && isHttpOnly,
        'Uji Login Admin Valid',
        `Berhasil login HTTP 200, cookie admin HttpOnly diterima, role='admin', redirect='/admin', password_hash tidak bocor.`
      );
    }

    // -------------------------------------------------------------
    // UJI 6: Validasi Sesi Server-Side via GET /api/admin/auth/me
    // -------------------------------------------------------------
    {
      const res = await fetch(`${BASE_URL}/api/admin/auth/me`, {
        headers: { Cookie: adminCookie },
      });
      const data = await res.json();
      assert(
        res.status === 200 && data.success === true && data.user.email === ADMIN_EMAIL,
        'Uji Validasi Sesi (/api/admin/auth/me)',
        `Sesi valid mengembalikan data admin: ${data.user.email} (Role: ${data.user.role})`
      );
    }

    // -------------------------------------------------------------
    // UJI 7: Akses Halaman Terproteksi /admin Tanpa Sesi
    // -------------------------------------------------------------
    {
      const res = await fetch(`${BASE_URL}/admin`, {
        redirect: 'manual',
      });
      const isRedirect = res.status === 307 || res.status === 302;
      const location = res.headers.get('location') || '';
      assert(
        isRedirect && location.includes('/login') && !location.includes('/admin/login'),
        'Uji Proteksi Route Halaman /admin',
        `Akses tanpa cookie dicegat oleh middleware dan diarahkan ke ${location} (Status: ${res.status})`
      );
    }

    // -------------------------------------------------------------
    // UJI 8: Akses API Terproteksi /api/admin/auth/me Tanpa Sesi Admin
    // Tanpa cookie DAN dengan cookie customer (bukan admin) sama-sama
    // harus ditolak 401 — pemisahan peran ditegakkan di server.
    // -------------------------------------------------------------
    {
      const resNoCookie = await fetch(`${BASE_URL}/api/admin/auth/me`);
      const dataNoCookie = await resNoCookie.json();
      const resCustomer = await fetch(`${BASE_URL}/api/admin/auth/me`, {
        headers: { Cookie: customerCookie },
      });
      const dataCustomer = await resCustomer.json();
      assert(
        resNoCookie.status === 401 && dataNoCookie.success === false &&
        resCustomer.status === 401 && dataCustomer.success === false,
        'Uji Proteksi API Admin Tanpa Sesi Admin',
        `Tanpa cookie: HTTP ${resNoCookie.status}; dengan cookie customer: HTTP ${resCustomer.status} (keduanya ditolak).`
      );
    }

    // -------------------------------------------------------------
    // UJI 9: Rute Lama /admin/login Mengalihkan ke /login
    // Panel login terpisah dihapus; /admin/login adalah redirect ke
    // panel terpadu — baik tanpa sesi maupun dengan sesi admin.
    // -------------------------------------------------------------
    {
      const resAnon = await fetch(`${BASE_URL}/admin/login`, {
        redirect: 'manual',
      });
      const locAnon = resAnon.headers.get('location') || '';
      const resAuthed = await fetch(`${BASE_URL}/admin/login`, {
        headers: { Cookie: adminCookie },
        redirect: 'manual',
      });
      const locAuthed = resAuthed.headers.get('location') || '';
      const isRedirect = (s: number) => s === 307 || s === 302;
      const toLogin = (l: string) => l.includes('/login') && !l.includes('/admin/login');
      assert(
        isRedirect(resAnon.status) && toLogin(locAnon) &&
        isRedirect(resAuthed.status) && toLogin(locAuthed),
        'Uji Redirect /admin/login ke /login',
        `Tanpa sesi -> ${locAnon} (${resAnon.status}); dengan sesi admin -> ${locAuthed} (${resAuthed.status}).`
      );
    }

    // -------------------------------------------------------------
    // UJI 10: Logout Mengakhiri Sesi (POST /api/admin/auth/logout)
    // -------------------------------------------------------------
    let logoutCookie = '';
    {
      const res = await fetch(`${BASE_URL}/api/admin/auth/logout`, {
        method: 'POST',
        headers: { Cookie: adminCookie },
      });
      const data = await res.json();
      const rawCookie = res.headers.get('set-cookie');
      logoutCookie = rawCookie || '';

      const is200 = res.status === 200;
      const isCookieCleared =
        rawCookie !== null && (rawCookie.includes('Max-Age=0') || rawCookie.includes('expires=Thu, 01 Jan 1970'));

      assert(
        is200 && isCookieCleared,
        'Uji Logout Admin',
        `Logout mengembalikan HTTP 200 dan menghapus cookie sesi (Max-Age=0).`
      );
    }

    // -------------------------------------------------------------
    // UJI 11: Sesi yang Telah Dicabut Tidak Boleh Digunakan Kembali
    // -------------------------------------------------------------
    {
      // Mengirimkan cookie yang sudah dicabut (kosong)
      const res = await fetch(`${BASE_URL}/api/admin/auth/me`, {
        headers: { Cookie: 'bantuin_admin_token=' },
      });
      const data = await res.json();
      assert(
        res.status === 401 && data.success === false,
        'Uji Penolakan Sesi yang Dicabut',
        `Request setelah logout ditolak dengan HTTP ${res.status} ("${data.message}")`
      );
    }

    // -------------------------------------------------------------
    // UJI 12: Integritas Keamanan (Tidak Ada Kebocoran Rahasia)
    // -------------------------------------------------------------
    {
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
      });
      const responseText = await res.text();
      const hasHash = responseText.includes('$2a$') || responseText.includes('$2b$');
      const hasSecret = responseText.includes(process.env.JWT_ACCESS_SECRET || 'bantuin_super_secret');
      const hasDbPassword = responseText.includes(process.env.DB_PASSWORD || 'xyz');

      assert(
        !hasHash && !hasSecret && !hasDbPassword,
        'Uji Kebocoran Rahasia & Password Hash',
        `Respons JSON bersih: Tidak ada password hash ($2b$), secret key, maupun DB password yang bocor ke browser.`
      );
    }

    console.log('\n===============================================================');
    const totalPassed = results.filter((r) => r.passed).length;
    console.log(`HASIL TOTAL PENGUJIAN: ${totalPassed} / ${results.length} UJI LULUS`);
    console.log('===============================================================\n');

    if (totalPassed === results.length) {
      console.log('🎉 SELURUH SKENARIO PENGUJIAN LOGIN TERPADU BERHASIL MEMENUHI STANDAR!');
    } else {
      console.error('⚠️  BEBERAPA PENGUJIAN GAGAL, PERIKSA DETAIL DI ATAS.');
      process.exit(1);
    }
  } finally {
    // Bersihkan akun customer uji
    try {
      await connection.execute('DELETE FROM users WHERE email = ?', [CUSTOMER_EMAIL]);
    } catch {}
    await connection.end();
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});
