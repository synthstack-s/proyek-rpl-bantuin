import dotenv from 'dotenv';
import path from 'path';
import mysql from 'mysql2/promise';
import { SignJWT } from 'jose';

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

async function getDbConnection() {
  return mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'bantuin_db',
  });
}

async function runUserTestSuite() {
  console.log('===============================================================');
  console.log('     BANTUIN - SUITE PENGUJIAN MANAJEMEN PENGGUNA & PELANGGAN');
  console.log('===============================================================\n');

  let adminCookie = '';
  let loggedInAdminUserId = 0;
  const createdTestUserIds: number[] = [];

  const conn = await getDbConnection();

  try {
    // -----------------------------------------------------------------
    // UJI 1: Keamanan - Akses tanpa Sesi Admin harus Ditolak (401)
    // -----------------------------------------------------------------
    {
      const res = await fetch(`${BASE_URL}/api/admin/users`);
      const data = await res.json();
      assert(
        res.status === 401 && data.success === false,
        'Uji Keamanan Akses Publik (401)',
        `Permintaan tanpa autentikasi ditolak dengan HTTP ${res.status} ("${data.message}")`
      );
    }

    // -----------------------------------------------------------------
    // UJI 2: Keamanan - Akses dengan Token Non-Admin (Customer) Ditolak (401)
    // -----------------------------------------------------------------
    {
      const secret = new TextEncoder().encode(
        process.env.JWT_ACCESS_SECRET || process.env.AUTH_SECRET || 'bantuin_dev_only_insecure_jwt_secret_key_32chars_min!'
      );
      const customerToken = await new SignJWT({
        userId: 888,
        uuid: '00000000-0000-0000-0000-000000000888',
        email: 'customer.regular@test.com',
        role: 'customer',
        name: 'Pelanggan Biasa',
      })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setExpirationTime('1h')
        .sign(secret);

      const res = await fetch(`${BASE_URL}/api/admin/users`, {
        headers: { Cookie: `bantuin_admin_token=${customerToken}` },
      });
      const data = await res.json();
      assert(
        res.status === 401 && data.success === false,
        'Uji Otorisasi Peran Non-Admin (401)',
        `Token non-admin ditolak oleh server dengan status HTTP ${res.status}`
      );
    }

    // -----------------------------------------------------------------
    // UJI 3: Autentikasi Admin untuk Memperoleh Sesi
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
      const [adminRows]: any = await conn.execute(
        'SELECT id FROM users WHERE email = ? LIMIT 1',
        [ADMIN_EMAIL]
      );
      if (adminRows && adminRows.length > 0) {
        loggedInAdminUserId = Number(adminRows[0].id);
      }

      assert(
        res.status === 200 && data.success === true && Boolean(adminCookie) && loggedInAdminUserId > 0,
        'Login Administrator',
        `Admin "${ADMIN_EMAIL}" (ID: ${loggedInAdminUserId}) berhasil login dan memperoleh cookie sesi HttpOnly`
      );
    }

    if (!adminCookie) {
      console.error('❌ Tidak dapat melanjutkan pengujian karena login admin gagal.');
      process.exit(1);
    }

    // -----------------------------------------------------------------
    // SETUP: Siapkan Data Uji Pengguna & Profil Pelanggan di Database MySQL
    // -----------------------------------------------------------------
    console.log('\n--- Menyiapkan Data Uji Pengguna Terisolasi di Database ---');

    // Pengguna Uji 1: Customer dengan Profil
    const testEmailCustomer = `cust.test.${Date.now()}@bantuin.id`;
    const testPhoneCustomer = `+62817${Math.floor(10000000 + Math.random() * 90000000)}`;
    const [custUserRes]: any = await conn.execute(
      `INSERT INTO users (uuid, email, phone_number, password_hash, role, status, is_verified, created_at)
       VALUES (UUID(), ?, ?, 'hashed_pass_test', 'customer', 'active', 1, NOW())`,
      [testEmailCustomer, testPhoneCustomer]
    );
    const testCustomerUserId = custUserRes.insertId;
    createdTestUserIds.push(testCustomerUserId);

    await conn.execute(
      `INSERT INTO customer_profiles (user_id, full_name, default_address, city, postal_code, created_at)
       VALUES (?, 'Siti Rahma Pelanggan Uji', 'Jl. Sudirman No. 123, Komplek Sakura', 'Jakarta Selatan', '12190', NOW())`,
      [testCustomerUserId]
    );

    // Pengguna Uji 2: Customer Pending
    const testEmailPending = `cust.pending.${Date.now()}@bantuin.id`;
    const testPhonePending = `+62818${Math.floor(10000000 + Math.random() * 90000000)}`;
    const [pendingUserRes]: any = await conn.execute(
      `INSERT INTO users (uuid, email, phone_number, password_hash, role, status, is_verified, created_at)
       VALUES (UUID(), ?, ?, 'hashed_pass_test', 'customer', 'pending_verification', 0, NOW())`,
      [testEmailPending, testPhonePending]
    );
    const testPendingUserId = pendingUserRes.insertId;
    createdTestUserIds.push(testPendingUserId);

    await conn.execute(
      `INSERT INTO customer_profiles (user_id, full_name, default_address, city, postal_code, created_at)
       VALUES (?, 'Ahmad Pending', 'Jl. Melati No. 45', 'Bandung', '40115', NOW())`,
      [testPendingUserId]
    );

    console.log(`✔ Data pengguna uji berhasil dibuat: Customer ID #${testCustomerUserId} & #${testPendingUserId}\n`);

    // -----------------------------------------------------------------
    // UJI 4: GET Daftar Pengguna & Pagination
    // -----------------------------------------------------------------
    {
      const res = await fetch(`${BASE_URL}/api/admin/users`, {
        headers: { Cookie: adminCookie },
      });
      const data = await res.json();

      assert(
        res.status === 200 && data.success === true && Array.isArray(data.data),
        'GET Daftar Pengguna & Metadata Pagination',
        `Berhasil mengambil ${data.data?.length} pengguna (Total: ${data.pagination?.total}, TotalPages: ${data.pagination?.totalPages})`
      );

      const foundCustomer = data.data.find((u: any) => u.id === testCustomerUserId);
      assert(
        Boolean(foundCustomer) && foundCustomer.email === testEmailCustomer && foundCustomer.name === 'Siti Rahma Pelanggan Uji',
        'Integritas Data Profil Pelanggan',
        `Pengguna ID #${testCustomerUserId} ditemukan dengan nama "${foundCustomer?.name}" dan kota "${foundCustomer?.customer_profile?.city}"`
      );

      // Pastikan TIDAK ADA password_hash, password, atau token dalam respons
      const hasSensitiveKeys = data.data.some(
        (u: any) => 'password_hash' in u || 'password' in u || 'otp_hash' in u || 'token_hash' in u
      );
      assert(
        !hasSensitiveKeys,
        'Pencegahan Kebocoran Informasi Sensitif (Password & Token Hash)',
        'Respon API dipastikan bersih tanpa password_hash, password, maupun token sesi'
      );
    }

    // -----------------------------------------------------------------
    // UJI 5: Pencarian Pengguna (Nama, Email, dan Telepon)
    // -----------------------------------------------------------------
    {
      // 1. Pencarian berdasarkan Nama
      const resName = await fetch(`${BASE_URL}/api/admin/users?search=Siti+Rahma`, {
        headers: { Cookie: adminCookie },
      });
      const dataName = await resName.json();
      assert(
        dataName.success && dataName.data.some((u: any) => u.id === testCustomerUserId),
        'Pencarian Pengguna Berdasarkan Nama',
        `Pencarian "Siti Rahma" berhasil menemukan ID #${testCustomerUserId}`
      );

      // 2. Pencarian berdasarkan Email
      const resEmail = await fetch(`${BASE_URL}/api/admin/users?search=${testEmailPending}`, {
        headers: { Cookie: adminCookie },
      });
      const dataEmail = await resEmail.json();
      assert(
        dataEmail.success && dataEmail.data.length === 1 && dataEmail.data[0].id === testPendingUserId,
        'Pencarian Pengguna Berdasarkan Email',
        `Pencarian "${testEmailPending}" mengembalikan tepat 1 pengguna`
      );

      // 3. Pencarian berdasarkan Nomor Telepon
      const resPhone = await fetch(`${BASE_URL}/api/admin/users?search=${testPhoneCustomer}`, {
        headers: { Cookie: adminCookie },
      });
      const dataPhone = await resPhone.json();
      assert(
        dataPhone.success && dataPhone.data.length === 1 && dataPhone.data[0].id === testCustomerUserId,
        'Pencarian Pengguna Berdasarkan Nomor Telepon',
        `Pencarian nomor telepon "${testPhoneCustomer}" berhasil menemukan pengguna`
      );
    }

    // -----------------------------------------------------------------
    // UJI 6: Filter Berdasarkan Role & Status Akun
    // -----------------------------------------------------------------
    {
      // Filter role = customer
      const resRole = await fetch(`${BASE_URL}/api/admin/users?role=customer`, {
        headers: { Cookie: adminCookie },
      });
      const dataRole = await resRole.json();
      assert(
        dataRole.success && dataRole.data.every((u: any) => u.role === 'customer'),
        'Filter Berdasarkan Role (Customer)',
        `Seluruh data yang dikembalikan ber-role 'customer'`
      );

      // Filter status = pending_verification
      const resStatus = await fetch(`${BASE_URL}/api/admin/users?status=pending_verification`, {
        headers: { Cookie: adminCookie },
      });
      const dataStatus = await resStatus.json();
      assert(
        dataStatus.success && dataStatus.data.every((u: any) => u.status === 'pending_verification'),
        'Filter Berdasarkan Status (pending_verification)',
        `Seluruh data yang dikembalikan berstatus 'pending_verification'`
      );
    }

    // -----------------------------------------------------------------
    // UJI 7: GET Detail Pengguna (/api/admin/users/[id])
    // -----------------------------------------------------------------
    {
      const resDetail = await fetch(`${BASE_URL}/api/admin/users/${testCustomerUserId}`, {
        headers: { Cookie: adminCookie },
      });
      const dataDetail = await resDetail.json();

      assert(
        resDetail.status === 200 && dataDetail.success === true && dataDetail.data?.id === testCustomerUserId,
        'GET Detail Pengguna Lengkap',
        `Berhasil mengambil detail pengguna #${testCustomerUserId} beserta profil pelanggan`
      );

      const cust = dataDetail.data;
      assert(
        Boolean(cust.customer_profile) && cust.customer_profile.city === 'Jakarta Selatan',
        'Informasi Alamat Profil Pelanggan',
        `Profil alamat pelanggan tersaji dengan lengkap: Kota "${cust.customer_profile?.city}", Alamat "${cust.customer_profile?.default_address}"`
      );
    }

    // -----------------------------------------------------------------
    // UJI 8: Penanganan ID Tidak Valid & Tidak Ditemukan
    // -----------------------------------------------------------------
    {
      // ID Non-numerik
      const resInvalid = await fetch(`${BASE_URL}/api/admin/users/abc-invalid`, {
        headers: { Cookie: adminCookie },
      });
      assert(
        resInvalid.status === 400,
        'Penolakan ID String Tidak Valid (400)',
        `Permintaan dengan ID non-numerik ditolak dengan HTTP ${resInvalid.status}`
      );

      // ID Tidak Ditemukan
      const resNotFound = await fetch(`${BASE_URL}/api/admin/users/99999999`, {
        headers: { Cookie: adminCookie },
      });
      assert(
        resNotFound.status === 404,
        'Penanganan Pengguna Tidak Ditemukan (404)',
        `Permintaan untuk ID 99999999 mengembalikan status HTTP 404`
      );
    }

    // -----------------------------------------------------------------
    // UJI 9: Keamanan - Penolakan Perubahan Role (Role Escalation Protection)
    // -----------------------------------------------------------------
    {
      const resRoleTamper = await fetch(`${BASE_URL}/api/admin/users/${testCustomerUserId}`, {
        method: 'PATCH',
        headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'admin' }),
      });
      const dataRoleTamper = await resRoleTamper.json();

      assert(
        resRoleTamper.status === 400 && dataRoleTamper.success === false,
        'Proteksi Eskalasi Role (Anti-Role Tampering)',
        `Upaya perubahan role langsung ditolak: "${dataRoleTamper.message}"`
      );
    }

    // -----------------------------------------------------------------
    // UJI 10: Keamanan - Pencegahan Self-Lockout Akun Admin Sedang Login
    // -----------------------------------------------------------------
    {
      const resSelfLockout = await fetch(`${BASE_URL}/api/admin/users/${loggedInAdminUserId}`, {
        method: 'PATCH',
        headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'suspended' }),
      });
      const dataSelfLockout = await resSelfLockout.json();

      assert(
        resSelfLockout.status === 403 && dataSelfLockout.success === false,
        'Proteksi Akun Administrator Aktif (Anti Self-Lockout)',
        `Upaya penangguhan akun admin yang sedang login ditolak dengan HTTP 403: "${dataSelfLockout.message}"`
      );
    }

    // -----------------------------------------------------------------
    // UJI 11: Validasi Input Zod (Format No Telepon Salah & Nama Terlalu Pendek)
    // -----------------------------------------------------------------
    {
      // No telepon format salah
      const resBadPhone = await fetch(`${BASE_URL}/api/admin/users/${testCustomerUserId}`, {
        method: 'PATCH',
        headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone_number: '123' }),
      });
      const dataBadPhone = await resBadPhone.json();

      assert(
        resBadPhone.status === 400 && dataBadPhone.success === false,
        'Validasi Zod: Format Nomor Telepon E.164',
        `Nomor telepon tidak valid ditolak: "${dataBadPhone.message}"`
      );

      // Nama terlalu pendek
      const resShortName = await fetch(`${BASE_URL}/api/admin/users/${testCustomerUserId}`, {
        method: 'PATCH',
        headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: 'A' }),
      });
      const dataShortName = await resShortName.json();

      assert(
        resShortName.status === 400 && dataShortName.success === false,
        'Validasi Zod: Panjang Nama Minimal',
        `Nama 1 karakter ditolak: "${dataShortName.message}"`
      );
    }

    // -----------------------------------------------------------------
    // UJI 12: Pembaruan Status Akun (Suspend & Reaktivasi)
    // -----------------------------------------------------------------
    {
      // 1. Tangguhkan pengguna customer uji
      const resSuspend = await fetch(`${BASE_URL}/api/admin/users/${testCustomerUserId}`, {
        method: 'PATCH',
        headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'suspended' }),
      });
      const dataSuspend = await resSuspend.json();

      assert(
        resSuspend.status === 200 && dataSuspend.success === true,
        'Pembaruan Status Pengguna: Menjadi Suspended',
        `Akun ID #${testCustomerUserId} berhasil ditangguhkan (status='suspended')`
      );

      // Verifikasi di MySQL
      const [checkSuspended]: any = await conn.execute(
        'SELECT status FROM users WHERE id = ?',
        [testCustomerUserId]
      );
      assert(
        checkSuspended[0].status === 'suspended',
        'Verifikasi Konsistensi Status Suspended di MySQL',
        'Kolom users.status di database terverifikasi bernilai "suspended"'
      );

      // 2. Aktifkan kembali akun
      const resReactivate = await fetch(`${BASE_URL}/api/admin/users/${testCustomerUserId}`, {
        method: 'PATCH',
        headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'active' }),
      });
      const dataReactivate = await resReactivate.json();

      assert(
        resReactivate.status === 200 && dataReactivate.success === true,
        'Pembaruan Status Pengguna: Reaktivasi Menjadi Active',
        `Akun ID #${testCustomerUserId} berhasil diaktifkan kembali (status='active')`
      );
    }

    // -----------------------------------------------------------------
    // UJI 13: Pembaruan Profil & Alamat Pelanggan
    // -----------------------------------------------------------------
    {
      const newAddress = 'Jl. Gatot Subroto Kav. 55, Tower B Lt. 10';
      const newCity = 'Jakarta Pusat';
      const newPostal = '10270';
      const newName = 'Siti Rahma Kencana';

      const resUpdateProfile = await fetch(`${BASE_URL}/api/admin/users/${testCustomerUserId}`, {
        method: 'PATCH',
        headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: newName,
          default_address: newAddress,
          city: newCity,
          postal_code: newPostal,
        }),
      });
      const dataUpdateProfile = await resUpdateProfile.json();

      assert(
        resUpdateProfile.status === 200 && dataUpdateProfile.success === true,
        'Pembaruan Data Profil & Alamat Pelanggan',
        `Profil pelanggan #${testCustomerUserId} berhasil diperbarui`
      );

      // Verifikasi di MySQL customer_profiles
      const [checkProfile]: any = await conn.execute(
        'SELECT full_name, default_address, city, postal_code FROM customer_profiles WHERE user_id = ?',
        [testCustomerUserId]
      );
      assert(
        checkProfile[0].full_name === newName &&
          checkProfile[0].city === newCity &&
          checkProfile[0].postal_code === newPostal &&
          checkProfile[0].default_address === newAddress,
        'Verifikasi Konsistensi Profil Pelanggan di MySQL',
        `Data nama "${checkProfile[0].full_name}" dan kota "${checkProfile[0].city}" tersimpan akurat di MySQL`
      );
    }

    // -----------------------------------------------------------------
    // UJI 14: Verifikasi Pencatatan Audit Log Administrator
    // -----------------------------------------------------------------
    {
      const [logs]: any = await conn.execute(
        `SELECT action, entity_name, entity_id, old_values, new_values, created_at
         FROM admin_audit_logs
         WHERE entity_name = 'users' AND entity_id = ?
         ORDER BY id DESC LIMIT 5`,
        [testCustomerUserId]
      );

      assert(
        logs.length > 0,
        'Pencatatan Audit Trail Aktivitas Admin',
        `Ditemukan ${logs.length} rekaman audit log untuk aktivitas pembaruan pengguna #${testCustomerUserId}`
      );

      const hasActions = logs.some((l: any) => l.action.includes('USER') || l.action.includes('SUSPEND') || l.action.includes('ACTIVATE'));
      assert(
        hasActions,
        'Validasi Format Aksi Audit Log',
        `Aksi audit tercatat terstruktur (contoh aksi: "${logs[0]?.action}")`
      );
    }

    // -----------------------------------------------------------------
    // UJI 15: Rendering Halaman /admin/users
    // -----------------------------------------------------------------
    {
      // 1. Unauthenticated -> 307 Redirect ke /admin/login
      const resUnauth = await fetch(`${BASE_URL}/admin/users`, { redirect: 'manual' });
      assert(
        resUnauth.status === 307,
        'Proteksi Middleware Halaman /admin/users (307 Redirect)',
        `Akses unauthenticated dialihkan ke login dengan status HTTP ${resUnauth.status}`
      );

      // 2. Authenticated -> 200 OK dengan HTML
      const resAuth = await fetch(`${BASE_URL}/admin/users`, {
        headers: { Cookie: adminCookie },
      });
      const html = await resAuth.text();
      assert(
        resAuth.status === 200 &&
          (html.includes('Manajemen Pengguna') || html.includes('Modul Identitas')),
        'Rendering Halaman /admin/users dengan Sesi Admin',
        `Halaman admin pengguna berhasil di-render dengan status 200 OK (${html.length} bytes)`
      );
    }

  } catch (err: any) {
    console.error('❌ Terjadi kesalahan fatal selama pengujian:', err);
    assert(false, 'Eksekusi Test Suite', `Fatal Error: ${err.message || err}`);
  } finally {
    // -----------------------------------------------------------------
    // PEMBERSIHAN DATA PENGUJIAN (CLEANUP)
    // -----------------------------------------------------------------
    console.log('\n--- Membersihkan Data Pengujian yang Dibuat ---');
    try {
      if (createdTestUserIds.length > 0) {
        // Hapus customer_profiles uji
        await conn.execute(
          `DELETE FROM customer_profiles WHERE user_id IN (${createdTestUserIds.join(',')})`
        );
        // Hapus users uji
        await conn.execute(
          `DELETE FROM users WHERE id IN (${createdTestUserIds.join(',')})`
        );
      }
      console.log('✔ Pembersihan data pengujian pengguna berhasil tuntas.');
    } catch (cleanErr: any) {
      console.error('Peringatan saat membersihkan data uji:', cleanErr.message);
    }

    await conn.end();
  }

  // -----------------------------------------------------------------
  // REKAPITULASI HASIL PENGUJIAN
  // -----------------------------------------------------------------
  console.log('\n===============================================================');
  console.log('                 REKAPITULASI HASIL PENGUJIAN');
  console.log('===============================================================');

  const totalSteps = steps.length;
  const passedSteps = steps.filter((s) => s.passed).length;
  const failedSteps = totalSteps - passedSteps;

  console.log(`Total Pengujian : ${totalSteps}`);
  console.log(`Lulus (Pass)    : ${passedSteps}`);
  console.log(`Gagal (Fail)    : ${failedSteps}`);

  if (failedSteps === 0) {
    console.log('\n🎉 SELURUH PENGUJIAN MODUL MANAJEMEN PENGGUNA LULUS DENGAN SEMPURNA!\n');
    process.exit(0);
  } else {
    console.log('\n❌ TERDAPAT PENGUJIAN YANG GAGAL. SILAKAN PERIKSA DETAIL DI ATAS.\n');
    process.exit(1);
  }
}

runUserTestSuite();
