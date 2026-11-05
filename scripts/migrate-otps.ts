import dotenv from 'dotenv';
import path from 'path';
import mysql from 'mysql2/promise';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function runMigration() {
  const host = process.env.DB_HOST || '127.0.0.1';
  const port = Number(process.env.DB_PORT) || 3306;
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';
  const database = process.env.DB_NAME || 'bantuin_db';

  console.log('Menghubungkan ke MySQL untuk migrasi user_otps...');
  const conn = await mysql.createConnection({
    host,
    port,
    user,
    password,
    database,
  });

  try {
    console.log('Memeriksa kolom di tabel user_otps...');
    const [columns]: any = await conn.execute(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'user_otps'",
      [database]
    );

    const colNames = columns.map((c: any) => c.COLUMN_NAME);

    if (!colNames.includes('target_phone')) {
      console.log('Menambahkan kolom target_phone...');
      await conn.execute("ALTER TABLE user_otps ADD COLUMN target_phone VARCHAR(20) NULL AFTER user_id");
    }

    if (!colNames.includes('delivery_status')) {
      console.log('Menambahkan kolom delivery_status...');
      await conn.execute("ALTER TABLE user_otps ADD COLUMN delivery_status ENUM('pending', 'sent', 'failed') NOT NULL DEFAULT 'pending' AFTER attempts");
    }

    if (!colNames.includes('fonnte_message_id')) {
      console.log('Menambahkan kolom fonnte_message_id...');
      await conn.execute("ALTER TABLE user_otps ADD COLUMN fonnte_message_id VARCHAR(100) NULL AFTER delivery_status");
    }

    if (!colNames.includes('delivery_error')) {
      console.log('Menambahkan kolom delivery_error...');
      await conn.execute("ALTER TABLE user_otps ADD COLUMN delivery_error VARCHAR(255) NULL AFTER fonnte_message_id");
    }

    console.log('✔ Migrasi tabel user_otps sukses diterapkan!');
  } catch (err: any) {
    console.error('❌ Gagal menjalankan migrasi:', err.message);
  } finally {
    await conn.end();
  }
}

runMigration();

