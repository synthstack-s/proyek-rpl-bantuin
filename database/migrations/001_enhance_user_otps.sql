-- ==============================================================================
-- MIGRASI 001: Penambahan Kolom Status Pengiriman WhatsApp Fonnte pada user_otps
-- Target DBMS : MySQL 8.0+
-- Tanggal     : 2026-10-30
-- Diperbaiki  : 2026-11-16 — sintaks "ADD COLUMN IF NOT EXISTS" / "ADD INDEX
--               IF NOT EXISTS" hanya ada di MariaDB, bukan MySQL (menyebabkan
--               ERROR 1064 di CI). Diganti prosedur pengecekan
--               INFORMATION_SCHEMA agar migrasi idempotent di MySQL: kolom
--               atau indeks yang sudah ada (mis. dari schema.sql terbaru)
--               dilewati tanpa error.
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

DROP PROCEDURE IF EXISTS `bantuin_add_index_if_missing`$$
CREATE PROCEDURE `bantuin_add_index_if_missing`(
  IN p_table VARCHAR(64),
  IN p_index VARCHAR(64),
  IN p_columns VARCHAR(255)
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = p_table
      AND INDEX_NAME = p_index
  ) THEN
    SET @bantuin_ddl = CONCAT('ALTER TABLE `', p_table, '` ADD INDEX `', p_index, '` (', p_columns, ')');
    PREPARE bantuin_stmt FROM @bantuin_ddl;
    EXECUTE bantuin_stmt;
    DEALLOCATE PREPARE bantuin_stmt;
  END IF;
END$$

DELIMITER ;

CALL `bantuin_add_column_if_missing`('user_otps', 'target_phone', 'VARCHAR(20) NULL COMMENT ''Nomor telepon tujuan saat OTP dikirim'' AFTER `user_id`');
CALL `bantuin_add_column_if_missing`('user_otps', 'delivery_status', 'ENUM(''pending'', ''sent'', ''failed'') NOT NULL DEFAULT ''pending'' COMMENT ''Status gateway WhatsApp Fonnte'' AFTER `attempts`');
CALL `bantuin_add_column_if_missing`('user_otps', 'fonnte_message_id', 'VARCHAR(100) NULL COMMENT ''ID pesan respon Fonnte'' AFTER `delivery_status`');
CALL `bantuin_add_column_if_missing`('user_otps', 'delivery_error', 'VARCHAR(255) NULL COMMENT ''Pesan error jika pengiriman gagal'' AFTER `fonnte_message_id`');
CALL `bantuin_add_index_if_missing`('user_otps', 'idx_otps_target_phone', '`target_phone`');

DROP PROCEDURE IF EXISTS `bantuin_add_column_if_missing`;
DROP PROCEDURE IF EXISTS `bantuin_add_index_if_missing`;
