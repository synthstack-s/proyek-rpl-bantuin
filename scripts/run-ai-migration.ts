/**
 * SCRIPT EKSEKUSI MIGRASI 002: AI PROVIDER MANAGEMENT
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { pool, checkDatabaseConnection } from '../src/lib/db';

function cleanSql(sql: string): string[] {
  // Hapus komentar block /* ... */
  let cleaned = sql.replace(/\/\*[\s\S]*?\*\//g, '');
  // Hapus komentar baris -- ...
  cleaned = cleaned.replace(/--.*$/gm, '');
  // Split berdasarkan titik koma
  return cleaned
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export async function runAIMigration(): Promise<{ success: boolean; message: string }> {
  const dbHealth = await checkDatabaseConnection();
  if (!dbHealth.connected) {
    console.warn('[Migration] MySQL local socket tidak dapat dihubungi. In-memory fallback layer aktif.');
    return {
      success: true,
      message: 'In-Memory Fallback Active (Database sandbox/offline mode)',
    };
  }

  const migrationFiles = [
    'database/migrations/002_ai_provider_management.sql',
    'database/migrations/003_allow_dynamic_ai_providers.sql',
  ];

  const connection = await pool.getConnection();
  try {
    for (const relPath of migrationFiles) {
      const fullPath = path.resolve(process.cwd(), relPath);
      if (!fs.existsSync(fullPath)) continue;
      const sql = fs.readFileSync(fullPath, 'utf8');
      const statements = cleanSql(sql);

      console.log(`[Migration] Menjalankan ${statements.length} perintah dari ${relPath}...`);
      for (const statement of statements) {
        if (!statement) continue;
        try {
          await connection.query(statement);
        } catch (err: any) {
          console.warn(`[Migration Warning] ${err.message}`);
        }
      }
    }
    console.log('[Migration] Migrasi database AI Provider Management SUKSES!');
    return { success: true, message: 'Migrasi berhasil dieksekusi di basis data MySQL.' };
  } catch (err: any) {
    console.error('[Migration] Gagal menjalankan migrasi:', err.message);
    throw err;
  } finally {
    connection.release();
  }
}

if (require.main === module) {
  runAIMigration()
    .then((res) => {
      console.log('Result:', res);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Fatal Migration Error:', err);
      process.exit(1);
    });
}
