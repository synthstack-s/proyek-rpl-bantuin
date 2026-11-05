-- ==============================================================================
-- MIGRASI 001: Penambahan Kolom Status Pengiriman WhatsApp Fonnte pada user_otps
-- Target DBMS : MySQL 8.0+
-- Tanggal     : 2026-10-30
-- ==============================================================================

USE `bantuin_db`;

ALTER TABLE `user_otps`
  ADD COLUMN IF NOT EXISTS `target_phone` VARCHAR(20) NULL COMMENT 'Nomor telepon tujuan saat OTP dikirim' AFTER `user_id`,
  ADD COLUMN IF NOT EXISTS `delivery_status` ENUM('pending', 'sent', 'failed') NOT NULL DEFAULT 'pending' COMMENT 'Status gateway WhatsApp Fonnte' AFTER `attempts`,
  ADD COLUMN IF NOT EXISTS `fonnte_message_id` VARCHAR(100) NULL COMMENT 'ID pesan respon Fonnte' AFTER `delivery_status`,
  ADD COLUMN IF NOT EXISTS `delivery_error` VARCHAR(255) NULL COMMENT 'Pesan error jika pengiriman gagal' AFTER `fonnte_message_id`,
  ADD INDEX IF NOT EXISTS `idx_otps_target_phone` (`target_phone`);
