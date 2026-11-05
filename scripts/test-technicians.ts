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

async function runTechnicianTestSuite() {
  console.log('===============================================================');
  console.log('     BANTUIN - SUITE PENGUJIAN MANAJEMEN & VERIFIKASI TEKNISI');
  console.log('===============================================================\n');

  let adminCookie = '';
  const createdTestUserIds: number[] = [];
  const createdTestProfileIds: number[] = [];

  const conn = await getDbConnection();

  try {
    // -----------------------------------------------------------------
    // UJI 1: Keamanan - Akses tanpa Sesi Admin harus Ditolak (401)
    // -----------------------------------------------------------------
    {
      const res = await fetch(`${BASE_URL}/api/admin/technicians`);
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
        userId: 999,
        uuid: '00000000-0000-0000-0000-000000000999',
        email: 'customer@test.com',
        role: 'customer',
        name: 'Pelanggan Uji',
      })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setExpirationTime('1h')
        .sign(secret);

      const res = await fetch(`${BASE_URL}/api/admin/technicians`, {
        headers: { Cookie: `bantuin_admin_token=${customerToken}` },
      });
      const data = await res.json();
      assert(
        res.status === 401 && data.success === false,
        'Uji Otorisasi Peran Non-Admin (401)',
        `Token non-admin ditolak oleh server dengan status ${res.status}`
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

      assert(
        res.status === 200 && data.success === true && Boolean(adminCookie),
        'Login Administrator',
        `Admin "${ADMIN_EMAIL}" berhasil login dan memperoleh cookie sesi HttpOnly`
      );
    }

    if (!adminCookie) {
      console.error('❌ Tidak dapat melanjutkan pengujian karena login admin gagal.');
      process.exit(1);
    }

    // -----------------------------------------------------------------
    // SETUP: Siapkan Data Uji Teknisi di Database MySQL
    // -----------------------------------------------------------------
    console.log('\n--- Menyiapkan Data Uji Teknisi Terisolasi di Database ---');
    
    // Teknisi Uji 1
    const testEmail1 = `tech.test.${Date.now()}@bantuin.id`;
    const testPhone1 = `+62812${Math.floor(10000000 + Math.random() * 90000000)}`;
    const [userRes1]: any = await conn.execute(
      `INSERT INTO users (uuid, email, phone_number, password_hash, role, status, is_verified, created_at)
       VALUES (UUID(), ?, ?, 'test_hash_not_used', 'technician', 'pending_verification', 0, NOW())`,
      [testEmail1, testPhone1]
    );
    const testUserId1 = userRes1.insertId;
    createdTestUserIds.push(testUserId1);

    const [profRes1]: any = await conn.execute(
      `INSERT INTO technician_profiles (
        user_id, full_name, bio, years_of_experience, rating_avg, rating_count, is_available, verified_status, created_at
      ) VALUES (?, 'Budi Teknisi Pengujian', 'Spesialis pendingin ruangan dan kulkas bersertifikat', 5, 4.85, 12, 1, 'pending', NOW())`,
      [testUserId1]
    );
    const testProfileId1 = profRes1.insertId;
    createdTestProfileIds.push(testProfileId1);

    // Dokumen untuk Teknisi 1
    const [docRes1]: any = await conn.execute(
      `INSERT INTO technician_documents (
        technician_profile_id, document_type, document_title, file_name, file_path, file_size_bytes, file_mime_type, issuing_organization, document_number, issue_date, expiry_date, verification_status, created_at
      ) VALUES (?, 'competency_certificate', 'Sertifikat BNSP Teknisi Pendingin AC', 'bnsp-ac-2025.pdf', '/storage/docs/bnsp-ac.pdf', 1048576, 'application/pdf', 'Badan Nasional Sertifikasi Profesi', 'BNSP-HVAC-998822', '2023-01-15', '2028-01-15', 'pending', NOW())`,
      [testProfileId1]
    );
    const testDocId1 = docRes1.insertId;

    const [docRes2]: any = await conn.execute(
      `INSERT INTO technician_documents (
        technician_profile_id, document_type, document_title, file_name, file_path, file_size_bytes, file_mime_type, issuing_organization, document_number, issue_date, expiry_date, verification_status, created_at
      ) VALUES (?, 'training_certificate', 'Sertifikat Pelatihan Inverter Daikin', 'daikin-inverter.pdf', '/storage/docs/daikin.pdf', 524288, 'application/pdf', 'Daikin Training Center', 'DKN-TRN-7766', '2024-03-10', NULL, 'pending', NOW())`,
      [testProfileId1]
    );
    const testDocId2 = docRes2.insertId;

    // Teknisi Uji 2 (Untuk pengujian pencarian & filter)
    const testEmail2 = `joko.test.${Date.now()}@bantuin.id`;
    const testPhone2 = `+62813${Math.floor(10000000 + Math.random() * 90000000)}`;
    const [userRes2]: any = await conn.execute(
      `INSERT INTO users (uuid, email, phone_number, password_hash, role, status, is_verified, created_at)
       VALUES (UUID(), ?, ?, 'test_hash_not_used', 'technician', 'active', 1, NOW())`,
      [testEmail2, testPhone2]
    );
    const testUserId2 = userRes2.insertId;
    createdTestUserIds.push(testUserId2);

    const [profRes2]: any = await conn.execute(
      `INSERT INTO technician_profiles (
        user_id, full_name, bio, years_of_experience, rating_avg, rating_count, is_available, verified_status, created_at
      ) VALUES (?, 'Joko Servis Elektronik TV', 'Teknisi audio video senior', 8, 4.90, 25, 1, 'verified', NOW())`,
      [testUserId2]
    );
    const testProfileId2 = profRes2.insertId;
    createdTestProfileIds.push(testProfileId2);

    console.log(`✔ Data teknisi uji berhasil dibuat: ID #${testProfileId1} & ID #${testProfileId2}\n`);

    // -----------------------------------------------------------------
    // UJI 4: GET Daftar Teknisi & Pagination
    // -----------------------------------------------------------------
    {
      const res = await fetch(`${BASE_URL}/api/admin/technicians`, {
        headers: { Cookie: adminCookie },
      });
      const data = await res.json();

      assert(
        res.status === 200 && data.success === true && Array.isArray(data.data),
        'GET Daftar Teknisi & Metadata Pagination',
        `Berhasil mengambil ${data.data?.length} teknisi (Total: ${data.pagination?.total}, TotalPages: ${data.pagination?.totalPages})`
      );

      const foundTestTech = data.data.find((t: any) => t.id === testProfileId1);
      assert(
        Boolean(foundTestTech) && foundTestTech.email === testEmail1,
        'Integritas Data Teknisi dalam Daftar',
        `Teknisi uji ID #${testProfileId1} ditemukan dengan nama "${foundTestTech?.full_name}" dan email "${foundTestTech?.email}"`
      );

      // Pastikan TIDAK ADA password_hash atau token internal yang bocor
      const hasPasswordHash = data.data.some((t: any) => 'password_hash' in t || 'password' in t || 'otp_hash' in t);
      assert(
        !hasPasswordHash,
        'Pencegahan Kebocoran Data Sensitif (Password Hash)',
        'Respon API dipastikan bersih tanpa password_hash, password, atau OTP hash'
      );
    }

    // -----------------------------------------------------------------
    // UJI 5: Pencarian Teknisi (Berdasarkan Nama, Email, dan Telepon)
    // -----------------------------------------------------------------
    {
      // Cari nama "Budi"
      const resName = await fetch(`${BASE_URL}/api/admin/technicians?search=Budi`, {
        headers: { Cookie: adminCookie },
      });
      const dataName = await resName.json();
      assert(
        dataName.success && dataName.data.some((t: any) => t.id === testProfileId1),
        'Pencarian berdasarkan Nama',
        `Pencarian "Budi" berhasil menemukan teknisi uji ID #${testProfileId1}`
      );

      // Cari email teknisi 2
      const resEmail = await fetch(`${BASE_URL}/api/admin/technicians?search=${testEmail2}`, {
        headers: { Cookie: adminCookie },
      });
      const dataEmail = await resEmail.json();
      assert(
        dataEmail.success && dataEmail.data.length === 1 && dataEmail.data[0].id === testProfileId2,
        'Pencarian berdasarkan Email Unik',
        `Pencarian "${testEmail2}" mengembalikan tepat 1 hasil teknisi ID #${testProfileId2}`
      );

      // Cari no telepon
      const resPhone = await fetch(`${BASE_URL}/api/admin/technicians?search=${testPhone1}`, {
        headers: { Cookie: adminCookie },
      });
      const dataPhone = await resPhone.json();
      assert(
        dataPhone.success && dataPhone.data.length === 1 && dataPhone.data[0].id === testProfileId1,
        'Pencarian berdasarkan Nomor Telepon',
        `Pencarian nomor telepon "${testPhone1}" berhasil menemukan teknisi`
      );
    }

    // -----------------------------------------------------------------
    // UJI 6: Filter Status Verifikasi & Status Akun
    // -----------------------------------------------------------------
    {
      const resFilter = await fetch(
        `${BASE_URL}/api/admin/technicians?verified_status=pending&status=pending_verification`,
        { headers: { Cookie: adminCookie } }
      );
      const dataFilter = await resFilter.json();
      assert(
        dataFilter.success && dataFilter.data.every((t: any) => t.verified_status === 'pending' && t.account_status === 'pending_verification'),
        'Filter Status Verifikasi & Status Akun',
        `Filter verified_status=pending & status=pending_verification berhasil memfilter data secara akurat`
      );
    }

    // -----------------------------------------------------------------
    // UJI 7: GET Detail Lengkap Teknisi (/api/admin/technicians/[id])
    // -----------------------------------------------------------------
    {
      const res = await fetch(`${BASE_URL}/api/admin/technicians/${testProfileId1}`, {
        headers: { Cookie: adminCookie },
      });
      const data = await res.json();

      assert(
        res.status === 200 && data.success === true && data.data?.id === testProfileId1,
        'GET Detail Lengkap Teknisi',
        `Berhasil mengambil detail teknisi #${testProfileId1} beserta relasi dokumen dan metrik`
      );

      const tech = data.data;
      assert(
        Array.isArray(tech.documents) && tech.documents.length === 2,
        'Relasi Dokumen Teknisi',
        `Teknisi #${testProfileId1} memiliki ${tech.documents.length} berkas dokumen pendukung`
      );

      assert(
        typeof tech.stats === 'object' && 'total_assignments' in tech.stats,
        'Metrik Penugasan Teknisi',
        `Objek statistik penugasan perbaikan tersedia (Total: ${tech.stats.total_assignments})`
      );
    }

    // -----------------------------------------------------------------
    // UJI 8: Penanganan ID Tidak Valid & Tidak Ditemukan
    // -----------------------------------------------------------------
    {
      // ID String non-angka
      const resInvalid = await fetch(`${BASE_URL}/api/admin/technicians/invalid-id`, {
        headers: { Cookie: adminCookie },
      });
      assert(
        resInvalid.status === 400,
        'Penolakan ID String Tidak Valid (400)',
        `Permintaan dengan ID non-numerik ditolak dengan HTTP ${resInvalid.status}`
      );

      // ID tidak ditemukan
      const resNotFound = await fetch(`${BASE_URL}/api/admin/technicians/99999999`, {
        headers: { Cookie: adminCookie },
      });
      assert(
        resNotFound.status === 404,
        'Penanganan Teknisi Tidak Ditemukan (404)',
        `Permintaan untuk ID 99999999 mengembalikan status 404`
      );
    }

    // -----------------------------------------------------------------
    // UJI 9: Validasi Input Pembaruan Status (Penolakan Tanpa Alasan)
    // -----------------------------------------------------------------
    {
      const res = await fetch(`${BASE_URL}/api/admin/technicians/${testProfileId1}`, {
        method: 'PATCH',
        headers: {
          Cookie: adminCookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          verified_status: 'rejected',
          // rejection_reason sengaja dikosongkan
        }),
      });
      const data = await res.json();

      assert(
        res.status === 400 && data.success === false,
        'Validasi Zod: Alasan Penolakan Wajib Diisi (400)',
        `Penolakan status tanpa menyertakan rejection_reason ditolak: "${data.message}"`
      );
    }

    // -----------------------------------------------------------------
    // UJI 10: Pembaruan Status Penolakan Teknisi dengan Alasan
    // -----------------------------------------------------------------
    {
      const reasonText = 'Sertifikat keahlian belum mencantumkan stempel validasi BNSP resmi';
      const res = await fetch(`${BASE_URL}/api/admin/technicians/${testProfileId1}`, {
        method: 'PATCH',
        headers: {
          Cookie: adminCookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          verified_status: 'rejected',
          rejection_reason: reasonText,
        }),
      });
      const data = await res.json();

      assert(
        res.status === 200 && data.success === true,
        'Pembaruan Status Verifikasi: Ditolak dengan Alasan',
        `Status teknisi berhasil diubah menjadi rejected dengan catatan alasan penolakan`
      );

      // Verifikasi di MySQL
      const [check]: any = await conn.execute(
        'SELECT verified_status, rejection_reason FROM technician_profiles WHERE id = ?',
        [testProfileId1]
      );
      assert(
        check[0].verified_status === 'rejected' && check[0].rejection_reason === reasonText,
        'Verifikasi Konsistensi MySQL untuk Status Ditolak',
        `Kolom verified_status='rejected' dan rejection_reason tersimpan di database`
      );
    }

    // -----------------------------------------------------------------
    // UJI 11: Verifikasi & Persetujuan Dokumen Teknisi
    // -----------------------------------------------------------------
    {
      // 1. Coba tolak tanpa catatan -> harus 400
      const resBad = await fetch(
        `${BASE_URL}/api/admin/technicians/${testProfileId1}/documents/${testDocId1}`,
        {
          method: 'PATCH',
          headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
          body: JSON.stringify({ verification_status: 'rejected' }),
        }
      );
      assert(
        resBad.status === 400,
        'Validasi Dokumen: Catatan Admin Wajib saat Menolak (400)',
        `Penolakan berkas tanpa admin_notes ditolak oleh Zod`
      );

      // 2. Setujui dokumen 1
      const resApprove = await fetch(
        `${BASE_URL}/api/admin/technicians/${testProfileId1}/documents/${testDocId1}`,
        {
          method: 'PATCH',
          headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
          body: JSON.stringify({ verification_status: 'approved' }),
        }
      );
      const dataApprove = await resApprove.json();
      assert(
        resApprove.status === 200 && dataApprove.success === true,
        'Persetujuan Dokumen Sertifikasi (Approved)',
        `Dokumen ID #${testDocId1} berhasil disetujui`
      );

      // 3. Minta revisi dokumen 2
      const resRev = await fetch(
        `${BASE_URL}/api/admin/technicians/${testProfileId1}/documents/${testDocId2}`,
        {
          method: 'PATCH',
          headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            verification_status: 'revision_required',
            admin_notes: 'Foto berkas sedikit buram, mohon unggah ulang dengan resolusi lebih tajam',
          }),
        }
      );
      const dataRev = await resRev.json();
      assert(
        resRev.status === 200 && dataRev.success === true,
        'Permintaan Revisi Dokumen (Revision Required)',
        `Dokumen ID #${testDocId2} berhasil diubah statusnya menjadi revision_required`
      );
    }

    // -----------------------------------------------------------------
    // UJI 12: Pengelolaan Spesialisasi Teknisi (POST & DELETE)
    // -----------------------------------------------------------------
    let createdSpecId = 0;
    {
      // 1. Tambah spesialisasi Kategori 1 (AC) dengan dokumen pendukung testDocId1
      const resAdd = await fetch(
        `${BASE_URL}/api/admin/technicians/${testProfileId1}/specializations`,
        {
          method: 'POST',
          headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category_id: 1,
            supporting_document_id: testDocId1,
          }),
        }
      );
      const dataAdd = await resAdd.json();
      assert(
        resAdd.status === 201 && dataAdd.success === true && Boolean(dataAdd.data?.id),
        'Penambahan Spesialisasi Kategori Baru (201)',
        `Kategori ID #1 berhasil ditautkan ke teknisi #${testProfileId1}`
      );
      createdSpecId = dataAdd.data.id;

      // 2. Coba tambah kategori yang sama (duplikat) -> harus 409 Conflict
      const resDup = await fetch(
        `${BASE_URL}/api/admin/technicians/${testProfileId1}/specializations`,
        {
          method: 'POST',
          headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
          body: JSON.stringify({ category_id: 1 }),
        }
      );
      assert(
        resDup.status === 409,
        'Pencegahan Duplikasi Spesialisasi (409 Conflict)',
        `Penambahan kategori yang sudah terdaftar ditolak dengan status 409`
      );

      // 3. Coba tautkan dokumen yang bukan milik teknisi ini -> harus 400
      const resForeignDoc = await fetch(
        `${BASE_URL}/api/admin/technicians/${testProfileId2}/specializations`,
        {
          method: 'POST',
          headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category_id: 2,
            supporting_document_id: testDocId1, // milik teknisi 1!
          }),
        }
      );
      assert(
        resForeignDoc.status === 400,
        'Validasi Kepemilikan Dokumen Pendukung Spesialisasi (400)',
        `Penautan dokumen milik teknisi lain ditolak dengan tepat`
      );

      // 4. Hapus spesialisasi
      const resDel = await fetch(
        `${BASE_URL}/api/admin/technicians/${testProfileId1}/specializations/${createdSpecId}`,
        {
          method: 'DELETE',
          headers: { Cookie: adminCookie },
        }
      );
      const dataDel = await resDel.json();
      assert(
        resDel.status === 200 && dataDel.success === true,
        'Penghapusan Spesialisasi Teknisi (DELETE)',
        `Spesialisasi ID #${createdSpecId} berhasil dihapus`
      );
    }

    // -----------------------------------------------------------------
    // UJI 13: Persetujuan Penuh Teknisi & Sinkronisasi Akun Aktif
    // -----------------------------------------------------------------
    {
      const resApproveTech = await fetch(
        `${BASE_URL}/api/admin/technicians/${testProfileId1}`,
        {
          method: 'PATCH',
          headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            verified_status: 'verified',
          }),
        }
      );
      const dataApproveTech = await resApproveTech.json();
      assert(
        resApproveTech.status === 200 && dataApproveTech.success === true,
        'Persetujuan Penuh Verifikasi Teknisi (Verified)',
        `Teknisi #${testProfileId1} berhasil disetujui`
      );

      // Verifikasi di DB: verified_status='verified', user status='active', is_verified=1
      const [checkSync]: any = await conn.execute(
        `SELECT tp.verified_status, tp.verified_by_admin_id, tp.rejection_reason, u.status as account_status, u.is_verified
         FROM technician_profiles tp
         JOIN users u ON u.id = tp.user_id
         WHERE tp.id = ?`,
        [testProfileId1]
      );
      const techRow = checkSync[0];
      assert(
        techRow.verified_status === 'verified' &&
          techRow.account_status === 'active' &&
          Boolean(techRow.is_verified) &&
          techRow.verified_by_admin_id !== null &&
          techRow.rejection_reason === null,
        'Sinkronisasi Transaksional: Akun Otomatis Aktif saat Verifikasi Disetujui',
        `Profil verified_status='verified' dan users.status='active' tersimpan konsisten via transaksi database`
      );
    }

    // -----------------------------------------------------------------
    // UJI 14: Verifikasi Pencatatan Audit Log (admin_audit_logs)
    // -----------------------------------------------------------------
    {
      const [logs]: any = await conn.execute(
        `SELECT action, entity_name, entity_id, old_values, new_values, created_at
         FROM admin_audit_logs
         WHERE (entity_name = 'technician_profiles' AND entity_id = ?)
            OR (entity_name = 'technician_documents' AND entity_id = ?)
         ORDER BY id DESC LIMIT 10`,
        [testProfileId1, testDocId1]
      );

      assert(
        logs.length > 0,
        'Pencatatan Audit Trail Administrator',
        `Ditemukan ${logs.length} rekaman audit log untuk aktivitas pengujian teknisi dan verifikasi dokumen`
      );

      const hasActions = logs.some((l: any) => l.action.includes('VERIFY') || l.action.includes('DOC'));
      assert(
        hasActions,
        'Validasi Aksi Audit Log Terdefinisi',
        `Aksi audit tercatat dengan nama aksi terstruktur (misal: "${logs[0]?.action}")`
      );
    }

    // -----------------------------------------------------------------
    // UJI 15: Rendering Halaman /admin/technicians
    // -----------------------------------------------------------------
    {
      // 1. Unauthenticated -> 307 Redirect ke /admin/login
      const resUnauthPage = await fetch(`${BASE_URL}/admin/technicians`, {
        redirect: 'manual',
      });
      assert(
        resUnauthPage.status === 307,
        'Proteksi Middleware Halaman /admin/technicians (307 Redirect)',
        `Akses unauthenticated dialihkan ke login dengan status ${resUnauthPage.status}`
      );

      // 2. Authenticated -> 200 OK dengan HTML
      const resAuthPage = await fetch(`${BASE_URL}/admin/technicians`, {
        headers: { Cookie: adminCookie },
      });
      const html = await resAuthPage.text();
      assert(
        resAuthPage.status === 200 &&
          html.includes('Manajemen &amp; Verifikasi Teknisi') || html.includes('Manajemen & Verifikasi Teknisi') || html.includes('Zero-NIK'),
        'Rendering Halaman /admin/technicians dengan Sesi Admin',
        `Halaman admin teknisi berhasil di-render dengan status 200 OK (${html.length} bytes)`
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
      if (createdTestProfileIds.length > 0) {
        // Hapus spesialisasi uji
        await conn.execute(
          `DELETE FROM technician_specializations WHERE technician_profile_id IN (${createdTestProfileIds.join(',')})`
        );
        // Hapus dokumen uji
        await conn.execute(
          `DELETE FROM technician_documents WHERE technician_profile_id IN (${createdTestProfileIds.join(',')})`
        );
        // Hapus profil teknisi uji
        await conn.execute(
          `DELETE FROM technician_profiles WHERE id IN (${createdTestProfileIds.join(',')})`
        );
      }
      if (createdTestUserIds.length > 0) {
        // Hapus user uji
        await conn.execute(
          `DELETE FROM users WHERE id IN (${createdTestUserIds.join(',')})`
        );
      }
      console.log('✔ Pembersihan data pengujian berhasil tuntas.');
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
    console.log('\n🎉 SELURUH PENGUJIAN MODUL MANAJEMEN TEKNISI LULUS DENGAN SEMPURNA!\n');
    process.exit(0);
  } else {
    console.log('\n❌ TERDAPAT PENGUJIAN YANG GAGAL. SILAKAN PERIKSA DETAIL DI ATAS.\n');
    process.exit(1);
  }
}

runTechnicianTestSuite();
