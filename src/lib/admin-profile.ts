import { query, pool } from '@/lib/db';

let tableEnsured = false;

/**
 * Memastikan tabel admin_profiles tersedia di database MySQL
 */
export async function ensureAdminProfilesTable(): Promise<void> {
  if (tableEnsured) return;
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS \`admin_profiles\` (
        \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`user_id\` BIGINT UNSIGNED NOT NULL,
        \`full_name\` VARCHAR(150) NOT NULL,
        \`avatar_url\` VARCHAR(255) NULL DEFAULT NULL,
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_admin_profiles_user\` (\`user_id\`),
        CONSTRAINT \`fk_admin_profile_user\` FOREIGN KEY (\`user_id\`)
          REFERENCES \`users\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Data profil khusus administrator';
    `);
    tableEnsured = true;
  } catch (err: any) {
    // Jika koneksi DB offline, kita biarkan in-memory atau query berikutnya menangani
    console.warn('[AdminProfile] Tidak dapat memastikan tabel admin_profiles:', err.message);
  }
}

// In-Memory store untuk mendukung fallback jika database sedang tidak dapat diakses
const inMemoryAdminProfiles: Record<number, { full_name: string; avatar_url: string | null }> = {
  1: { full_name: 'Administrator Utama BANTUIN', avatar_url: null },
};

/**
 * Mengambil nama dan profil admin
 */
export async function getAdminProfile(userId: number): Promise<{ full_name: string; avatar_url: string | null } | null> {
  await ensureAdminProfilesTable();
  try {
    const rows = await query<{ full_name: string; avatar_url: string | null }[]>(
      'SELECT full_name, avatar_url FROM admin_profiles WHERE user_id = ? LIMIT 1',
      [userId]
    );
    if (rows && rows.length > 0) {
      return rows[0];
    }
  } catch {
    // Fallback in-memory
  }

  if (inMemoryAdminProfiles[userId]) {
    return inMemoryAdminProfiles[userId];
  }

  return null;
}

/**
 * Menyimpan / memperbarui nama dan profil admin
 */
export async function saveAdminProfile(
  userId: number,
  data: { full_name: string; avatar_url?: string | null }
): Promise<void> {
  await ensureAdminProfilesTable();
  const trimmedName = data.full_name.trim();

  try {
    await query(
      `INSERT INTO admin_profiles (user_id, full_name, avatar_url, updated_at)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE full_name = VALUES(full_name), avatar_url = COALESCE(VALUES(avatar_url), avatar_url), updated_at = NOW()`,
      [userId, trimmedName, data.avatar_url || null]
    );
  } catch (err: any) {
    console.warn('[AdminProfile] Gagal menyimpan ke database, menggunakan in-memory:', err.message);
  }

  inMemoryAdminProfiles[userId] = {
    full_name: trimmedName,
    avatar_url: data.avatar_url || null,
  };
}

