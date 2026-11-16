-- ==============================================================================
-- BANTUIN MIGRATION 004: TOKEN VERSION UNTUK PENCABUTAN JWT (T5)
-- Menambahkan kolom token_version ke tabel users. Setiap reset password
-- menaikkan versi ini sehingga seluruh JWT yang diterbitkan sebelumnya
-- ditolak oleh pemeriksaan pencabutan (src/lib/token-revocation.ts).
--
-- PENTING: jalankan migrasi ini di database produksi agar pencabutan JWT
-- aktif. Tanpa kolom ini, kode tetap berjalan (fail-open ke versi 1) tetapi
-- reset password TIDAK mencabut sesi lama.
--
-- Diperbaiki  : 2026-11-16 — dibuat idempotent (tambah hanya bila belum ada)
--               karena schema.sql terbaru sudah memuat kolom ini; ADD COLUMN
--               biasa gagal "Duplicate column name" pada instalasi baru/CI.
-- ==============================================================================

USE `bantuin_db`;

DELIMITER $$

DROP PROCEDURE IF EXISTS `bantuin_add_column_if_missing`$$
CREATE PROCEDURE `bantuin_add_column_if_missing`(
  IN p_table VARCHAR(64),
  IN p_column VARCHAR(64),
  IN p_definition TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = p_table
      AND COLUMN_NAME = p_column
  ) THEN
    SET @bantuin_ddl = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_column, '` ', p_definition);
    PREPARE bantuin_stmt FROM @bantuin_ddl;
    EXECUTE bantuin_stmt;
    DEALLOCATE PREPARE bantuin_stmt;
  END IF;
END$$

DELIMITER ;

CALL `bantuin_add_column_if_missing`('users', 'token_version', 'INT NOT NULL DEFAULT 1 COMMENT ''Versi token JWT — dinaikkan saat reset password untuk mencabut sesi lama'' AFTER `is_verified`');

DROP PROCEDURE IF EXISTS `bantuin_add_column_if_missing`;
