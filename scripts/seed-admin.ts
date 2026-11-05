import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';

// Muat variabel lingkungan dari .env.local terlebih dahulu, lalu .env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function seedAdmin() {
  console.log('=====================================================');
  console.log('   BANTUIN - CLI BOOTSTRAP AKUN ADMINISTRATOR UTAMA');
  console.log('=====================================================\n');

  const email = process.env.ADMIN_INITIAL_EMAIL?.trim();
  const rawPassword = process.env.ADMIN_INITIAL_PASSWORD?.trim();
  const phone = (process.env.ADMIN_INITIAL_PHONE?.trim() || '+628110000001');

  // 1. Validasi Keberadaan Environment Variables
  if (!email || !rawPassword) {
    console.error('❌ GAGAL: Variabel lingkungan belum lengkap.');
    console.error('Pastikan Anda telah mengisi variabel berikut di file .env.local:');
    console.error('  - ADMIN_INITIAL_EMAIL    (contoh: admin@bantuin.id)');
    console.error('  - ADMIN_INITIAL_PASSWORD (minimal 8 karakter)');
    console.error('  - ADMIN_INITIAL_PHONE    (opsional, default: +628110000001)\n');
    process.exit(1);
  }

  // 2. Validasi Format Email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    console.error(`❌ GAGAL: Format email "${email}" tidak valid.`);
    process.exit(1);
  }

  // 3. Validasi Kekuatan Password
  if (rawPassword.length < 8) {
    console.error('❌ GAGAL: Kata sandi admin minimal harus 8 karakter.');
    process.exit(1);
  }

  // 4. Inisialisasi Koneksi Database
  const host = process.env.DB_HOST || '127.0.0.1';
  const port = Number(process.env.DB_PORT) || 3306;
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';
  const database = process.env.DB_NAME || 'bantuin_db';

  console.log(`Menghubungkan ke database MySQL: ${user}@${host}:${port}/${database}...`);

  let connection: mysql.Connection | null = null;
  try {
    connection = await mysql.createConnection({
      host,
      port,
      user,
      password,
      database,
      timezone: '+07:00',
    });
    console.log('✔ Koneksi database berhasil terjalin.\n');
  } catch (err: any) {
    console.error('❌ GAGAL terhubung ke database MySQL:');
    console.error(`  Pesan: ${err.message}`);
    console.error('Pastikan service MySQL berjalan dan kredensial di .env.local sudah tepat.');
    process.exit(1);
  }

  try {
    // 5. Periksa Apakah Email Sudah Terdaftar
    const [existingUsers]: any = await connection.execute(
      'SELECT id, uuid, email, role, status FROM users WHERE email = ? LIMIT 1',
      [email]
    );

    if (existingUsers && existingUsers.length > 0) {
      const existing = existingUsers[0];
      console.warn('⚠️  PERINGATAN: Akun dengan email tersebut sudah ada di database:');
      console.warn(`   Email  : ${existing.email}`);
      console.warn(`   Role   : ${existing.role}`);
      console.warn(`   Status : ${existing.status}`);
      console.warn('\nDemi keamanan, skrip ini menolak menimpa akun yang sudah ada secara otomatis.');
      console.warn('Jika Anda ingin mereset password, lakukan secara eksplisit melalui database atau alur verifikasi admin.');
      process.exit(0);
    }

    // 6. Periksa Apakah Phone Number Sudah Digunakan
    const [existingPhone]: any = await connection.execute(
      'SELECT id, phone_number FROM users WHERE phone_number = ? LIMIT 1',
      [phone]
    );

    if (existingPhone && existingPhone.length > 0) {
      console.error(`❌ GAGAL: Nomor telepon "${phone}" sudah digunakan oleh akun lain.`);
      console.error('Ubah ADMIN_INITIAL_PHONE di .env.local dengan nomor lain yang unik.');
      process.exit(1);
    }

    // 7. Hash Password dengan bcrypt (Salt Rounds = 12)
    console.log('Mengenkripsi kata sandi admin dengan bcrypt (12 rounds)...');
    const saltRounds = Number(process.env.PASSWORD_SALT_ROUNDS) || 12;
    const passwordHash = await bcrypt.hash(rawPassword, saltRounds);

    // 8. Buat UUIDv4
    const userUuid = crypto.randomUUID();

    // 9. Simpan Akun Admin ke Tabel users
    console.log('Menyimpan akun administrator ke tabel `users`...');
    const [result]: any = await connection.execute(
      `INSERT INTO users (
        uuid,
        email,
        phone_number,
        password_hash,
        role,
        status,
        is_verified
      ) VALUES (?, ?, ?, ?, 'admin', 'active', 1)`,
      [userUuid, email, phone, passwordHash]
    );

    console.log('\n=====================================================');
    console.log('🎉 AKUN ADMINISTRATOR BERHASIL DIBUAT!');
    console.log('=====================================================');
    console.log(`  ID User   : ${result.insertId}`);
    console.log(`  UUID      : ${userUuid}`);
    console.log(`  Email     : ${email}`);
    console.log(`  Telepon   : ${phone}`);
    console.log(`  Role      : admin`);
    console.log(`  Status    : active`);
    console.log(`  Verified  : Ya`);
    console.log('=====================================================');
    console.log('Catatan Keamanan:');
    console.log('- Kredensial telah disimpan dengan aman.');
    console.log('- Password tidak pernah dicetak dalam log ini.');
    console.log('- Silakan masuk ke /admin/login menggunakan kredensial tersebut.\n');
  } catch (err: any) {
    console.error('❌ Terjadi kesalahan saat mengeksekusi query database:');
    console.error(`  ${err.message}`);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

seedAdmin().catch((err) => {
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
