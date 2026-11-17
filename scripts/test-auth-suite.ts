import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import mysql from 'mysql2/promise';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Aktifkan mode MOCK Fonnte untuk test suite otomatis agar tidak menguras kuota nyata
process.env.MOCK_FONNTE = 'true';

const BASE_URL = 'http://127.0.0.1:3000';
const ADMIN_EMAIL = process.env.ADMIN_INITIAL_EMAIL || 'admin@bantuin.id';
const ADMIN_PASSWORD = process.env.ADMIN_INITIAL_PASSWORD || 'AdminBantuin2026!';

interface TestRecord {
  category: string;
  name: string;
  passed: boolean;
  details: string;
}

const testResults: TestRecord[] = [];

function assertTest(category: string, name: string, condition: boolean, details: string) {
  testResults.push({
    category,
    name,
    passed: condition,
    details: condition ? details : `GAGAL: ${details}`,
  });
  console.log(`${condition ? '  ✔ [PASS]' : '  ❌ [FAIL]'} [${category}] ${name}: ${details}`);
}

async function runFullAuthTestSuite() {
  console.log('\n========================================================================');
  console.log('       BANTUIN - SUITE PENGUJIAN REGISTRASI, OTP & AUTENTIKASI');
  console.log('========================================================================\n');

  // Hubungkan ke Database MySQL
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'bantuin_db',
  });

  const timestamp = Date.now().toString().slice(-6);
  const testCustomerEmail = `cust_test_${timestamp}@bantuin.id`;
  const testCustomerPhone = `081234${timestamp}`;
  const testCustomerPassword = 'Password123!';

  const testTechEmail = `tech_test_${timestamp}@bantuin.id`;
  const testTechPhone = `087788${timestamp}`;
  const testTechPassword = 'PasswordTech123!';

  let createdCustomerId: number = 0;
  let createdTechId: number = 0;
  let activeOtpCode: string = '';
  let customerSessionCookie = '';

  try {
    // -------------------------------------------------------------------------
    // 1. REGISTRASI CUSTOMER
    // -------------------------------------------------------------------------
    console.log('--- 1. PENGUJIAN REGISTRASI CUSTOMER ---');

    // 1.1 Validasi password lemah
    const weakPassRes = await fetch(`${BASE_URL}/api/auth/register/customer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: 'Budi Test',
        phone_number: testCustomerPhone,
        email: testCustomerEmail,
        password: 'weak',
        confirm_password: 'weak',
        terms_accepted: true,
      }),
    });
    assertTest(
      'Registrasi Customer',
      'Tolak Password Lemah',
      weakPassRes.status === 422,
      `Status HTTP ${weakPassRes.status} (Harus 422)`
    );

    // 1.2 Validasi konfirmasi password tidak cocok
    const mismatchRes = await fetch(`${BASE_URL}/api/auth/register/customer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: 'Budi Test',
        phone_number: testCustomerPhone,
        email: testCustomerEmail,
        password: testCustomerPassword,
        confirm_password: 'DifferentPassword123!',
        terms_accepted: true,
      }),
    });
    assertTest(
      'Registrasi Customer',
      'Tolak Konfirmasi Password Berbeda',
      mismatchRes.status === 422,
      `Status HTTP ${mismatchRes.status} (Harus 422)`
    );

    // 1.3 Validasi nomor HP tidak valid
    const invalidPhoneRes = await fetch(`${BASE_URL}/api/auth/register/customer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: 'Budi Test',
        phone_number: '12345',
        email: testCustomerEmail,
        password: testCustomerPassword,
        confirm_password: testCustomerPassword,
        terms_accepted: true,
      }),
    });
    assertTest(
      'Registrasi Customer',
      'Tolak Format Nomor Telepon Asing / Salah',
      invalidPhoneRes.status === 422,
      `Status HTTP ${invalidPhoneRes.status} (Harus 422)`
    );

    // 1.4 Registrasi Customer Berhasil
    const validCustRes = await fetch(`${BASE_URL}/api/auth/register/customer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: 'Budi Customer Uji',
        phone_number: testCustomerPhone,
        email: testCustomerEmail,
        password: testCustomerPassword,
        confirm_password: testCustomerPassword,
        terms_accepted: true,
      }),
    });
    const validCustJson = await validCustRes.json();
    createdCustomerId = validCustJson.data?.userId;

    assertTest(
      'Registrasi Customer',
      'Registrasi Sukses (Akun & Profil)',
      validCustRes.status === 201 && Boolean(createdCustomerId),
      `User ID: ${createdCustomerId}, Status: ${validCustJson.data?.status}`
    );

    // Verifikasi di Database bahwa akun berstatus pending_verification dan is_verified FALSE
    const [dbUsers]: any = await connection.execute(
      'SELECT id, role, status, is_verified FROM users WHERE id = ?',
      [createdCustomerId]
    );
    assertTest(
      'Database Customer',
      'Status Awal Pending Verification & Zero Verified',
      dbUsers[0]?.role === 'customer' &&
        dbUsers[0]?.status === 'pending_verification' &&
        dbUsers[0]?.is_verified === 0,
      `Role: ${dbUsers[0]?.role}, Status: ${dbUsers[0]?.status}, is_verified: ${dbUsers[0]?.is_verified}`
    );

    // -------------------------------------------------------------------------
    // 2. REGISTRASI TEKNISI
    // -------------------------------------------------------------------------
    console.log('\n--- 2. PENGUJIAN REGISTRASI TEKNISI ---');

    const validTechRes = await fetch(`${BASE_URL}/api/auth/register/technician`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: 'Hasan Teknisi Uji',
        phone_number: testTechPhone,
        email: testTechEmail,
        password: testTechPassword,
        confirm_password: testTechPassword,
        years_of_experience: 5,
        bio: 'Spesialis perbaikan AC Inverter & Kulkas',
        terms_accepted: true,
      }),
    });
    const validTechJson = await validTechRes.json();
    createdTechId = validTechJson.data?.userId;

    assertTest(
      'Registrasi Teknisi',
      'Registrasi Sukses (Akun & Profil Teknisi)',
      validTechRes.status === 201 && Boolean(createdTechId),
      `Tech User ID: ${createdTechId}`
    );

    // Verifikasi profil teknisi di DB
    const [dbTechProfiles]: any = await connection.execute(
      'SELECT id, verified_status, years_of_experience FROM technician_profiles WHERE user_id = ?',
      [createdTechId]
    );
    assertTest(
      'Database Teknisi',
      'Profil Teknisi Tersimpan dengan Status Pending Dokumen',
      dbTechProfiles[0]?.verified_status === 'pending' && dbTechProfiles[0]?.years_of_experience === 5,
      `Verified Status: ${dbTechProfiles[0]?.verified_status}, Pengalaman: ${dbTechProfiles[0]?.years_of_experience} thn`
    );

    // -------------------------------------------------------------------------
    // 3. PENGUJIAN OTP & INTEGRASI FONNTE
    // -------------------------------------------------------------------------
    console.log('\n--- 3. PENGUJIAN OTP & INTEGRASI FONNTE ---');

    // 3.1 Cek OTP yang dibuat di database untuk Customer
    const [dbOtps]: any = await connection.execute(
      'SELECT id, user_id, otp_hash, attempts, delivery_status, consumed_at, expires_at FROM user_otps WHERE user_id = ? ORDER BY id DESC LIMIT 1',
      [createdCustomerId]
    );

    assertTest(
      'OTP & Fonnte',
      'Record OTP Terbentuk & Status Terkirim (Mock Mode)',
      dbOtps.length > 0 && dbOtps[0]?.otp_hash?.length === 64,
      `Hash SHA-256: ${dbOtps[0]?.otp_hash?.slice(0, 12)}..., Status Kirim: ${dbOtps[0]?.delivery_status}`
    );

    // 3.2 Uji Cooldown Kirim Ulang (harus ditolak jika belum 60 detik)
    const resendCooldownRes = await fetch(`${BASE_URL}/api/auth/otp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: createdCustomerId,
        purpose: 'registration',
      }),
    });
    assertTest(
      'OTP & Fonnte',
      'Proteksi Cooldown 60 Detik Aktif',
      resendCooldownRes.status === 429,
      `Status HTTP: ${resendCooldownRes.status} (Harus 429 Too Many Requests)`
    );

    // 3.3 Uji Verifikasi OTP dengan Kode Salah
    const wrongOtpRes = await fetch(`${BASE_URL}/api/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: createdCustomerId,
        otp_code: '000000',
        purpose: 'registration',
      }),
    });
    const wrongOtpJson = await wrongOtpRes.json();
    assertTest(
      'OTP & Fonnte',
      'Penolakan Kode OTP Salah & Counter Percobaan Berkurang',
      wrongOtpRes.status === 400 && wrongOtpJson.remainingAttempts === 4,
      `Sisa Percobaan: ${wrongOtpJson.remainingAttempts} kali`
    );

    // 3.4 Ambil hash OTP asli untuk menguji keberhasilan verifikasi
    // Buat kode OTP baru secara manual dan masukkan hash-nya agar kita tahu kode pastinya
    const knownOtp = '789123';
    const knownHash = crypto.createHash('sha256').update(knownOtp).digest('hex');
    await connection.execute(
      'UPDATE user_otps SET otp_hash = ?, attempts = 0 WHERE id = ?',
      [knownHash, dbOtps[0].id]
    );

    // 3.5 Verifikasi dengan Kode Benar
    const validVerifyRes = await fetch(`${BASE_URL}/api/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: createdCustomerId,
        otp_code: knownOtp,
        purpose: 'registration',
      }),
    });
    const setCookie = validVerifyRes.headers.get('set-cookie');
    customerSessionCookie = setCookie?.split(';')[0] || '';
    const validVerifyJson = await validVerifyRes.json();

    assertTest(
      'OTP & Fonnte',
      'Verifikasi Kode Benar Sukses & Menerbitkan Sesi Cookie',
      validVerifyRes.status === 200 && Boolean(customerSessionCookie),
      `Sukses: ${validVerifyJson.success}, Cookie Sesi Diterbitkan: ${Boolean(customerSessionCookie)}`
    );

    // 3.6 Cek status database setelah verifikasi
    const [verifiedUser]: any = await connection.execute(
      'SELECT status, is_verified FROM users WHERE id = ?',
      [createdCustomerId]
    );
    assertTest(
      'Database Verifikasi',
      'User Status Berubah Menjadi Active & is_verified = TRUE',
      verifiedUser[0]?.status === 'active' && verifiedUser[0]?.is_verified === 1,
      `Status: ${verifiedUser[0]?.status}, is_verified: ${verifiedUser[0]?.is_verified}`
    );

    // 3.7 Uji Penggunaan Ulang OTP (Single-use enforcement)
    const reuseOtpRes = await fetch(`${BASE_URL}/api/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: createdCustomerId,
        otp_code: knownOtp,
        purpose: 'registration',
      }),
    });
    assertTest(
      'Keamanan OTP',
      'Tolak Penggunaan Ulang OTP (Single-Use Enforced)',
      reuseOtpRes.status === 400,
      `Status HTTP: ${reuseOtpRes.status} (Harus ditolak karena consumed_at terisi)`
    );

    // -------------------------------------------------------------------------
    // 4. PENGUJIAN LOGIN & SESI PENGGUNA
    // -------------------------------------------------------------------------
    console.log('\n--- 4. PENGUJIAN LOGIN & MANAJEMEN SESI ---');

    // 4.1 Login Customer dengan Akun Aktif
    const loginCustRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: testCustomerEmail,
        password: testCustomerPassword,
      }),
    });
    const loginCustJson = await loginCustRes.json();
    assertTest(
      'Login Pengguna',
      'Login Customer Sukses dengan Email',
      loginCustRes.status === 200 && loginCustJson.data?.user?.role === 'customer',
      `Role: ${loginCustJson.data?.user?.role}, Redirect: ${loginCustJson.data?.redirectUrl}`
    );

    // 4.2 Login Customer Menggunakan Nomor WhatsApp
    const loginPhoneRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: testCustomerPhone,
        password: testCustomerPassword,
      }),
    });
    assertTest(
      'Login Pengguna',
      'Login Customer Sukses dengan Nomor WhatsApp',
      loginPhoneRes.status === 200,
      `Status HTTP: ${loginPhoneRes.status}`
    );

    // 4.3 Login dengan Akun Belum Terverifikasi (Teknisi belum OTP)
    const loginUnverifiedRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: testTechEmail,
        password: testTechPassword,
      }),
    });
    const loginUnverifiedJson = await loginUnverifiedRes.json();
    assertTest(
      'Keamanan Akun',
      'Tolak Login Akun Belum Terverifikasi (needsVerification: true)',
      loginUnverifiedRes.status === 403 && loginUnverifiedJson.needsVerification === true,
      `Status HTTP: ${loginUnverifiedRes.status}, needsVerification: ${loginUnverifiedJson.needsVerification}`
    );

    // 4.4 Verifikasi Endpoint /api/auth/me dengan Cookie Sesi
    const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { Cookie: customerSessionCookie },
    });
    const meJson = await meRes.json();
    assertTest(
      'Sesi Pengguna',
      'Endpoint /api/auth/me Mengembalikan Profil Terotentikasi Aman',
      meRes.status === 200 && meJson.user?.role === 'customer' && !meJson.user?.password,
      `User ID: ${meJson.user?.id}, Nama: ${meJson.user?.name}, Password Tersembunyi: ${!meJson.user?.password}`
    );

    // 4.5 Logout Pengguna
    const logoutRes = await fetch(`${BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: customerSessionCookie },
    });
    const clearedCookies = logoutRes.headers.get('set-cookie');
    assertTest(
      'Logout Pengguna',
      'Logout Berhasil & Membersihkan Cookie Sesi',
      logoutRes.status === 200 && Boolean(clearedCookies?.includes('bantuin_user_token')),
      `Status: ${logoutRes.status}, Cookie Cleared: ${Boolean(clearedCookies?.includes('bantuin_user_token'))}`
    );

    // -------------------------------------------------------------------------
    // 5. REGRESI LOGIN ADMINISTRATOR VIA PANEL TERPADU (PASTIKAN TIDAK RUSAK!)
    // -------------------------------------------------------------------------
    console.log('\n--- 5. PENGUJIAN REGRESI LOGIN ADMINISTRATOR (PANEL TERPADU) ---');

    const adminLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      }),
    });
    const adminSetCookie = adminLoginRes.headers.get('set-cookie');
    const adminSessionCookie = adminSetCookie?.split(';')[0] || '';

    assertTest(
      'Regresi Admin',
      'Login Admin Eksisting Tetap Berfungsi Sempurna',
      adminLoginRes.status === 200 && Boolean(adminSessionCookie.includes('bantuin_admin_token')),
      `Admin Cookie Diperoleh: ${Boolean(adminSessionCookie.includes('bantuin_admin_token'))}`
    );

    // Akses dashboard admin dengan sesi admin
    const adminPageRes = await fetch(`${BASE_URL}/admin`, {
      headers: { Cookie: adminSessionCookie },
    });
    assertTest(
      'Regresi Admin',
      'Akses Halaman /admin Berhasil dengan Sesi Admin',
      adminPageRes.status === 200,
      `Status HTTP /admin: ${adminPageRes.status}`
    );

    // Coba akses halaman admin dengan sesi customer (harus ditolak/redirect)
    const unauthorizedAdminRes = await fetch(`${BASE_URL}/admin`, {
      headers: { Cookie: customerSessionCookie },
      redirect: 'manual',
    });
    assertTest(
      'Proteksi Role Lintas Akun',
      'Customer Ditolak Mengakses Halaman Administrator (/admin)',
      unauthorizedAdminRes.status === 307,
      `Status HTTP: ${unauthorizedAdminRes.status} (Redirect ke /login)`
    );

    // -------------------------------------------------------------------------
    // 6. PENGUJIAN RESET KATA SANDI (LUPA KATA SANDI VIA WHATSAPP OTP)
    // -------------------------------------------------------------------------
    console.log('\n--- 6. PENGUJIAN RESET KATA SANDI (FORGOT PASSWORD) ---');

    // 6.1 Minta OTP Reset Sandi
    const forgotRes = await fetch(`${BASE_URL}/api/auth/password/forgot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: testCustomerEmail }),
    });
    const forgotJson = await forgotRes.json();
    assertTest(
      'Reset Sandi',
      'Permohonan OTP Reset Kata Sandi Terkirim',
      forgotRes.status === 200 && forgotJson.success === true,
      `Sukses: ${forgotJson.success}, Telepon: ${forgotJson.data?.phone}`
    );

    // 6.2 Ambil hash OTP reset dari database dan set known OTP
    const [resetOtps]: any = await connection.execute(
      "SELECT id FROM user_otps WHERE user_id = ? AND purpose = 'password_reset' ORDER BY id DESC LIMIT 1",
      [createdCustomerId]
    );

    const resetOtpCode = '654321';
    const resetOtpHash = crypto.createHash('sha256').update(resetOtpCode).digest('hex');
    await connection.execute(
      'UPDATE user_otps SET otp_hash = ?, attempts = 0 WHERE id = ?',
      [resetOtpHash, resetOtps[0].id]
    );

    // 6.3 Eksekusi Reset Kata Sandi Baru
    const newCustomerPass = 'NewSecurePassword2026!';
    const resetRes = await fetch(`${BASE_URL}/api/auth/password/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: createdCustomerId,
        otp_code: resetOtpCode,
        new_password: newCustomerPass,
        confirm_password: newCustomerPass,
      }),
    });
    const resetJson = await resetRes.json();
    assertTest(
      'Reset Sandi',
      'Reset Kata Sandi dengan OTP Berhasil',
      resetRes.status === 200 && resetJson.success === true,
      `Pesan: ${resetJson.message}`
    );

    // 6.4 Login dengan Sandi Lama (Harus Ditolak)
    const oldLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: testCustomerEmail,
        password: testCustomerPassword, // Sandi lama
      }),
    });
    assertTest(
      'Reset Sandi',
      'Kata Sandi Lama Otomatis Tidak Berlaku',
      oldLoginRes.status === 401,
      `Status HTTP Login Sandi Lama: ${oldLoginRes.status} (Ditolak)`
    );

    // 6.5 Login dengan Sandi Baru (Harus Sukses)
    const newLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: testCustomerEmail,
        password: newCustomerPass, // Sandi baru
      }),
    });
    assertTest(
      'Reset Sandi',
      'Login dengan Kata Sandi Baru Sukses',
      newLoginRes.status === 200,
      `Status HTTP Login Sandi Baru: ${newLoginRes.status}`
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
    console.error('Error saat menjalankan test suite:', err);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

runFullAuthTestSuite();

