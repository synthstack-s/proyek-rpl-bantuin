import dotenv from 'dotenv';
import path from 'path';
import mysql from 'mysql2/promise';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function verifyDatabase() {
  console.log('=== VERIFIKASI INTEGRITAS DATABASE BANTUIN ===');
  
  const host = process.env.DB_HOST || '127.0.0.1';
  const port = Number(process.env.DB_PORT) || 3306;
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';
  const database = process.env.DB_NAME || 'bantuin_db';

  console.log(`Menghubungkan ke ${host}:${port}/${database}...`);

  try {
    const conn = await mysql.createConnection({
      host,
      port,
      user,
      password,
      database,
    });

    console.log('✔ Koneksi ke database berhasil terhubung!');

    // 1. Cek daftar tabel
    const [tables]: any = await conn.execute(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name",
      [database]
    );

    console.log(`\nJumlah tabel ditemukan: ${tables.length}`);
    tables.forEach((t: any, idx: number) => {
      console.log(`  ${idx + 1}. ${t.TABLE_NAME || t.table_name}`);
    });

    // 2. Cek kategori peralatan
    const [categories]: any = await conn.execute(
      "SELECT id, name, slug, is_active FROM appliance_categories ORDER BY id"
    );
    console.log(`\nJumlah kategori peralatan: ${categories.length}`);
    categories.forEach((c: any) => {
      console.log(`  - [ID: ${c.id}] ${c.name} (${c.slug}) | Aktif: ${Boolean(c.is_active)}`);
    });

    // 3. Cek layanan
    const [services]: any = await conn.execute("SELECT COUNT(*) as count FROM services");
    console.log(`\nJumlah layanan katalog: ${services[0].count}`);

    // 4. Cek konfigurasi sistem
    const [settings]: any = await conn.execute("SELECT COUNT(*) as count FROM system_settings");
    console.log(`Jumlah konfigurasi sistem: ${settings[0].count}`);

    // 5. Cek akun admin
    const [admins]: any = await conn.execute(
      "SELECT id, email, role, status FROM users WHERE role = 'admin'"
    );
    console.log(`\nJumlah akun admin: ${admins.length}`);
    admins.forEach((a: any) => {
      console.log(`  - [ID: ${a.id}] ${a.email} | Status: ${a.status}`);
    });

    // 6. Cek audit logs
    const [audits]: any = await conn.execute("SELECT COUNT(*) as count FROM admin_audit_logs");
    console.log(`\nJumlah rekaman di admin_audit_logs: ${audits[0].count}`);

    await conn.end();
    console.log('\n=== VERIFIKASI DATABASE SELESAI DENGAN SUKSES ===');
  } catch (err: any) {
    console.error('❌ Gagal verifikasi database:', err.message);
    process.exit(1);
  }
}

verifyDatabase();
