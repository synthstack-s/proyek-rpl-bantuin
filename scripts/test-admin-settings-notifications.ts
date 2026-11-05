import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { pool, query } from '../src/lib/db';
import { createAdminToken, createUserToken, ADMIN_COOKIE_NAME, USER_COOKIE_NAME } from '../src/lib/auth';

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, message: string) {
  totalTests++;
  if (condition) {
    console.log(`  ✔ [PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    throw new Error(`Assertion Failed: ${message}`);
  }
}

async function runTestSuite() {
  console.log('========================================================================');
  console.log('🛠️ BANTUIN - PENGUJIAN OTOMATIS: KONFIGURASI SISTEM & NOTIFIKASI ADMIN');
  console.log('========================================================================\n');

  try {
    // 1. Dapatkan Kredensial Pengguna untuk Simulasi Request
    const adminRows = await query<any[]>(
      `SELECT id, uuid, email, role FROM users WHERE role = 'admin' LIMIT 1`
    );
    if (adminRows.length === 0) {
      throw new Error('Admin user tidak ditemukan. Jalankan npm run seed:admin terlebih dahulu.');
    }
    const admin = adminRows[0];
    const adminToken = await createAdminToken({
      userId: admin.id,
      uuid: admin.uuid,
      email: admin.email,
      role: 'admin',
    });

    const customerRows = await query<any[]>(
      `SELECT id, uuid, email, phone_number, role, status, is_verified FROM users WHERE role = 'customer' AND status = 'active' LIMIT 1`
    );
    const customer = customerRows[0];
    const customerToken = customer
      ? await createUserToken({
          userId: customer.id,
          uuid: customer.uuid,
          email: customer.email,
          phoneNumber: customer.phone_number || '',
          role: 'customer',
          status: customer.status || 'active',
          isVerified: Boolean(customer.is_verified),
        })
      : '';

    const baseUrl = 'http://localhost:3000';

    // -------------------------------------------------------------------------
    // TEST SUITE 1: KONFIGURASI SISTEM (SYSTEM SETTINGS)
    // -------------------------------------------------------------------------
    console.log('--- TEST SUITE 1: API Konfigurasi Sistem (/api/admin/settings) ---');

    // 1.1 Non-Admin Ditolak
    const unauthorizedSettingsRes = await fetch(`${baseUrl}/api/admin/settings`, {
      headers: customerToken ? { Cookie: `${USER_COOKIE_NAME}=${customerToken}` } : {},
    });
    assert(
      unauthorizedSettingsRes.status === 401,
      'Pengguna non-admin (Customer/Tamu) ditolak 401 saat mengakses konfigurasi'
    );

    // 1.2 Admin Berhasil Mendapatkan Daftar Konfigurasi
    const adminSettingsRes = await fetch(`${baseUrl}/api/admin/settings`, {
      headers: { Cookie: `${ADMIN_COOKIE_NAME}=${adminToken}` },
    });
    assert(adminSettingsRes.status === 200, 'Admin berhasil 200 OK saat mengakses /api/admin/settings');
    const settingsData = await adminSettingsRes.json();
    assert(settingsData.success === true, 'Respons API settings berstatus success: true');
    assert(
      Array.isArray(settingsData.data.settings) && settingsData.data.settings.length >= 8,
      'Mengembalikan seluruh parameter konfigurasi (minimal 8 parameter default)'
    );
    assert(
      Array.isArray(settingsData.data.groups) && settingsData.data.groups.length >= 5,
      'Menyertakan ringkasan grup kategori parameter (fee, dispatch, service, ai, complaint)'
    );

    // 1.3 Filter Berdasarkan Grup
    const feeGroupRes = await fetch(`${baseUrl}/api/admin/settings?group=fee`, {
      headers: { Cookie: `${ADMIN_COOKIE_NAME}=${adminToken}` },
    });
    const feeData = await feeGroupRes.json();
    assert(
      feeData.data.settings.every((s: any) => s.group_name === 'fee'),
      'Filter parameter berdasarkan grup "fee" berfungsi dengan tepat'
    );

    // 1.4 Validasi Pembaruan Nilai Tidak Valid (Negative/Range check)
    const invalidPercentRes = await fetch(`${baseUrl}/api/admin/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `${ADMIN_COOKIE_NAME}=${adminToken}`,
      },
      body: JSON.stringify({
        settings: [{ key: 'platform_fee_percent', value: '150' }], // Persentase > 100
      }),
    });
    assert(
      invalidPercentRes.status === 400,
      'Menolak persentase komisi platform yang melebihi batas 100% (400 Bad Request)'
    );

    const invalidModelRes = await fetch(`${baseUrl}/api/admin/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `${ADMIN_COOKIE_NAME}=${adminToken}`,
      },
      body: JSON.stringify({
        settings: [{ key: 'ai_model_name', value: 'unsupported-chatgpt-4' }],
      }),
    });
    assert(
      invalidModelRes.status === 400,
      'Menolak model AI yang tidak didukung atau tidak valid'
    );

    // 1.5 Pembaruan Nilai Valid Berhasil Disimpan
    const updateSuccessRes = await fetch(`${baseUrl}/api/admin/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `${ADMIN_COOKIE_NAME}=${adminToken}`,
      },
      body: JSON.stringify({
        settings: [
          { key: 'warranty_period_days', value: '35' },
          { key: 'ai_model_name', value: 'gemini-3.5-flash' },
        ],
      }),
    });
    assert(updateSuccessRes.status === 200, 'Berhasil memperbarui nilai parameter konfigurasi');

    // Kembalikan warranty_period_days ke 30
    await query(`UPDATE system_settings SET setting_value = '30' WHERE setting_key = 'warranty_period_days'`);

    // 1.6 Tambah Parameter Kustom Baru
    const customKey = 'test_discount_promo_code';
    await query(`DELETE FROM system_settings WHERE setting_key = ?`, [customKey]);

    const addSettingRes = await fetch(`${baseUrl}/api/admin/settings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `${ADMIN_COOKIE_NAME}=${adminToken}`,
      },
      body: JSON.stringify({
        setting_key: customKey,
        setting_value: 'BANTUINHEMAT2026',
        value_type: 'string',
        group_name: 'general',
        description: 'Kode promo diskon pengujian sistem',
      }),
    });
    assert(addSettingRes.status === 200, 'Berhasil membuat parameter konfigurasi kustom baru');
    const addedData = await addSettingRes.json();
    const createdId = addedData.data.id;

    // 1.7 Mencegah Duplikasi Kunci Parameter
    const duplicateSettingRes = await fetch(`${baseUrl}/api/admin/settings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `${ADMIN_COOKIE_NAME}=${adminToken}`,
      },
      body: JSON.stringify({
        setting_key: customKey,
        setting_value: 'DUPLIKAT',
      }),
    });
    assert(
      duplicateSettingRes.status === 409,
      'Menolak pembuatan parameter dengan setting_key yang sudah ada (409 Conflict)'
    );

    // 1.8 Perlindungan Parameter Inti (Core) dari Penghapusan
    const coreSettingRow = await query<any[]>(
      `SELECT id FROM system_settings WHERE setting_key = 'platform_fee_fixed' LIMIT 1`
    );
    const deleteCoreRes = await fetch(`${baseUrl}/api/admin/settings/${coreSettingRow[0].id}`, {
      method: 'DELETE',
      headers: { Cookie: `${ADMIN_COOKIE_NAME}=${adminToken}` },
    });
    assert(
      deleteCoreRes.status === 403,
      'Parameter inti (Core System) DILINDUNGI secara ketat dari penghapusan (403 Forbidden)'
    );

    // 1.9 Hapus Parameter Kustom yang Baru Dibuat
    const deleteCustomRes = await fetch(`${baseUrl}/api/admin/settings/${createdId}`, {
      method: 'DELETE',
      headers: { Cookie: `${ADMIN_COOKIE_NAME}=${adminToken}` },
    });
    assert(deleteCustomRes.status === 200, 'Berhasil menghapus parameter kustom yang tidak lagi digunakan');

    console.log('');

    // -------------------------------------------------------------------------
    // TEST SUITE 2: MANAJEMEN NOTIFIKASI (NOTIFICATIONS)
    // -------------------------------------------------------------------------
    console.log('--- TEST SUITE 2: API Manajemen Notifikasi (/api/admin/notifications) ---');

    // 2.1 Non-Admin Ditolak
    const unauthorizedNotifRes = await fetch(`${baseUrl}/api/admin/notifications`, {
      headers: customerToken ? { Cookie: `${USER_COOKIE_NAME}=${customerToken}` } : {},
    });
    assert(
      unauthorizedNotifRes.status === 401,
      'Pengguna non-admin ditolak 401 saat mengakses API notifikasi admin'
    );

    // 2.2 Admin Mengambil Daftar Notifikasi
    const adminNotifRes = await fetch(`${baseUrl}/api/admin/notifications`, {
      headers: { Cookie: `${ADMIN_COOKIE_NAME}=${adminToken}` },
    });
    assert(adminNotifRes.status === 200, 'Admin berhasil 200 OK saat mengakses /api/admin/notifications');
    const notifData = await adminNotifRes.json();
    assert(notifData.success === true, 'Respons API notifications berstatus success: true');
    assert(Array.isArray(notifData.data.notifications), 'Mengembalikan array daftar notifikasi');
    assert(typeof notifData.data.stats.totalAll === 'number', 'Menyertakan ringkasan statistik notifikasi');

    // 2.3 Kirim Pengumuman Siaran (Broadcast) ke Seluruh Pengguna Aktif
    const broadcastRes = await fetch(`${baseUrl}/api/admin/notifications/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `${ADMIN_COOKIE_NAME}=${adminToken}`,
      },
      body: JSON.stringify({
        targetAudience: 'all',
        title: 'Pemeliharaan Sistem Terjadwal BANTUIN',
        message: 'Aplikasi BANTUIN akan melakukan pemeliharaan server rutin pada pukul 01:00 - 02:00 WIB.',
        type: 'system',
        targetUrl: '/announcements',
      }),
    });
    assert(broadcastRes.status === 200, 'Berhasil mengirimkan notifikasi siaran (broadcast) ke semua pengguna');
    const broadcastData = await broadcastRes.json();
    assert(
      broadcastData.recipientCount > 0,
      `Notifikasi berhasil didistribusikan ke ${broadcastData.recipientCount} pengguna aktif`
    );

    // Dapatkan ID notifikasi broadcast yang baru masuk untuk tes selanjutnya
    const newestNotifRows = await query<any[]>(
      `SELECT id, is_read FROM notifications WHERE title LIKE '%Pemeliharaan Sistem Terjadwal%' ORDER BY id DESC LIMIT 1`
    );
    const testNotifId = newestNotifRows[0]?.id;
    assert(Boolean(testNotifId), 'Notifikasi broadcast terverifikasi masuk ke dalam tabel notifications');

    // 2.4 Toggle Status Baca (PATCH /api/admin/notifications/[id]/read)
    const toggleReadRes = await fetch(`${baseUrl}/api/admin/notifications/${testNotifId}/read`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `${ADMIN_COOKIE_NAME}=${adminToken}`,
      },
      body: JSON.stringify({ is_read: true }),
    });
    assert(toggleReadRes.status === 200, 'Berhasil mengubah status notifikasi menjadi dibaca (is_read = true)');
    const toggleData = await toggleReadRes.json();
    assert(toggleData.data.is_read === true, 'Data status baca terkonfirmasi bernilai TRUE');

    // 2.5 Tandai Semua Dibaca (PATCH /api/admin/notifications/read-all)
    const markAllReadRes = await fetch(`${baseUrl}/api/admin/notifications/read-all`, {
      method: 'PATCH',
      headers: { Cookie: `${ADMIN_COOKIE_NAME}=${adminToken}` },
    });
    assert(markAllReadRes.status === 200, 'Berhasil menjalankan aksi tandai semua notifikasi sudah dibaca');

    // 2.6 Hapus Satu Notifikasi (DELETE /api/admin/notifications/[id])
    const deleteSingleNotifRes = await fetch(`${baseUrl}/api/admin/notifications/${testNotifId}`, {
      method: 'DELETE',
      headers: { Cookie: `${ADMIN_COOKIE_NAME}=${adminToken}` },
    });
    assert(deleteSingleNotifRes.status === 200, 'Berhasil menghapus notifikasi spesifik');

    // 2.7 Pembersihan Data Notifikasi Broadcast Sisa Uji Coba
    await query(`DELETE FROM notifications WHERE title LIKE '%Pemeliharaan Sistem Terjadwal%'`);
    console.log('  ✔ Data pengujian notifikasi dibersihkan secara aman');

    // 2.8 Verifikasi Pencatatan Audit Log
    const auditLogs = await query<any[]>(
      `SELECT id, action, entity_name FROM admin_audit_logs 
       WHERE admin_user_id = ? AND entity_name IN ('system_settings', 'notifications') 
       ORDER BY id DESC LIMIT 5`,
      [admin.id]
    );
    assert(
      auditLogs.length > 0,
      'Aktivitas admin pada konfigurasi dan notifikasi tercatat secara akurat di admin_audit_logs'
    );

    console.log('');
    console.log('========================================================================');
    console.log(`🎉 SEMUA PENGUJIAN KONFIGURASI & NOTIFIKASI SUKSES: ${passedTests}/${totalTests} PASS!`);
    console.log('========================================================================\n');
  } catch (error: any) {
    console.error('\n❌ PENGUJIAN GAGAL DENGAN KESALAHAN:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runTestSuite();
