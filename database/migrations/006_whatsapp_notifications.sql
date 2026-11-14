-- ==============================================================================
-- BANTUIN MIGRATION 006: LOG PENGIRIMAN NOTIFIKASI WHATSAPP
-- Tabel `whatsapp_notifications` mencatat setiap percobaan pengiriman
-- WhatsApp lewat Fonnte — baik kiriman manual dari panel admin maupun
-- notifikasi otomatis saat status pesanan berubah (src/lib/wa-notifications.ts).
--
-- Mengapa tabel baru, bukan memakai `notifications`? Tabel `notifications`
-- adalah riwayat notifikasi IN-APP (tanpa nomor tujuan, tanpa status
-- pengiriman). WhatsApp butuh kolom pengiriman tersendiri (nomor tujuan,
-- status pending/sent/failed, ID pesan Fonnte, pesan error) mengikuti pola
-- yang sama seperti `user_otps` (delivery_status + fonnte_message_id).
--
-- Setiap percobaan pengiriman dicatat dulu sebagai 'pending', lalu
-- diperbarui menjadi 'sent' (beserta fonnte_message_id) atau 'failed'
-- (beserta error_message). Status TIDAK PERNAH dilaporkan sukses bila
-- Fonnte gagal — kejujuran status adalah syarat fitur ini.
--
-- PENTING: jalankan migrasi ini di database produksi sebelum memakai fitur
-- notifikasi WhatsApp. Tanpa tabel ini, pengiriman otomatis dilewati
-- (best-effort: dicatat di log server, perubahan status pesanan tetap
-- berjalan) dan pengiriman manual mengembalikan error 500 yang jujur.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS `whatsapp_notifications` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT 'Penerima pesan (relasi ke users)',
  `target_phone` VARCHAR(20) NOT NULL COMMENT 'Nomor tujuan ternormalisasi (format 628...) — kosong bila penerima tidak punya nomor valid',
  `source` ENUM('manual', 'auto') NOT NULL DEFAULT 'auto' COMMENT 'manual = dikirim admin dari panel; auto = dipicu perubahan status pesanan',
  `event` VARCHAR(50) NOT NULL COMMENT 'order_status | assignment_offered | assignment_cancelled | schedule_set | order_created | manual',
  `template_key` VARCHAR(50) NULL DEFAULT NULL COMMENT 'Kunci template pesan (mis. order_assigned); NULL untuk pesan manual bebas',
  `title` VARCHAR(150) NULL DEFAULT NULL COMMENT 'Judul pesan manual (opsional)',
  `message` TEXT NOT NULL COMMENT 'Isi pesan WhatsApp yang dikirim',
  `entity_type` VARCHAR(50) NULL DEFAULT NULL COMMENT 'Entitas terkait, mis. repair_requests',
  `entity_id` BIGINT UNSIGNED NULL DEFAULT NULL COMMENT 'ID entitas terkait (mis. ID pesanan)',
  `status` ENUM('pending', 'sent', 'failed') NOT NULL DEFAULT 'pending' COMMENT 'Status pengiriman Fonnte',
  `fonnte_message_id` VARCHAR(100) NULL DEFAULT NULL COMMENT 'ID pesan dari Fonnte bila terkirim',
  `error_message` VARCHAR(500) NULL DEFAULT NULL COMMENT 'Detail kegagalan bila status failed',
  `sent_by_admin_id` BIGINT UNSIGNED NULL DEFAULT NULL COMMENT 'Admin pengirim (hanya untuk source manual)',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_wa_user_time` (`user_id`, `created_at`),
  INDEX `idx_wa_entity` (`entity_type`, `entity_id`),
  INDEX `idx_wa_status` (`status`),
  INDEX `idx_wa_event_time` (`event`, `created_at`),
  CONSTRAINT `fk_wa_user` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_wa_admin` FOREIGN KEY (`sent_by_admin_id`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Log pengiriman notifikasi WhatsApp (Fonnte) manual & otomatis';
