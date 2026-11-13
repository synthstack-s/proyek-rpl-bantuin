-- ==============================================================================
-- BANTUIN MIGRATION 005: BLOCKLIST TOKEN JWT UNTUK LOGOUT (T6)
-- Tabel `revoked_tokens` mencatat ID token (klaim `jti`) yang sudah dicabut
-- lewat logout, beserta kedaluwarsa aslinya. Pemeriksaan sesi
-- (src/lib/token-revocation.ts) menolak token yang jti-nya ada di tabel ini
-- dan belum kedaluwarsa — sehingga token yang sudah logout tidak dapat
-- dipakai lagi meskipun tanda tangannya masih valid dan belum habis masa
-- berlakunya.
--
-- Entri yang sudah kedaluwarsa dihapus secara oportunistik setiap logout
-- (pruneRevokedTokens) dan diabaikan oleh pemeriksaan (`expires_at > NOW()`),
-- jadi tabel ini tidak tumbuh tanpa batas.
--
-- PENTING: jalankan migrasi ini di database produksi agar blocklist logout
-- aktif. Tanpa tabel ini, kode tetap berjalan (fail-open: pemeriksaan
-- blocklist dilewati dengan warning, revalidasi role/status + token_version
-- tetap aktif) tetapi logout TIDAK mencabut token — token tetap valid
-- sampai kedaluwarsa seperti sebelumnya.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS `revoked_tokens` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `jti` VARCHAR(64) NOT NULL COMMENT 'JWT ID (klaim jti) token yang dicabut lewat logout',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT 'Pemilik token',
  `expires_at` DATETIME NOT NULL COMMENT 'Kedaluwarsa token asli — entri boleh dihapus setelah ini',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_revoked_tokens_jti` (`jti`),
  INDEX `idx_revoked_tokens_expires_at` (`expires_at`),
  INDEX `idx_revoked_tokens_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Blocklist token JWT yang dicabut lewat logout (T6)';
