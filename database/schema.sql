-- ==============================================================================
-- SISTEM DATABASE APLIKASI BANTUIN
-- Target DBMS     : MySQL 8.0+
-- Nama Database   : bantuin_db
-- Storage Engine  : InnoDB
-- Character Set   : utf8mb4 (Collation: utf8mb4_unicode_ci)
-- Deskripsi       : Skrip DDL Final untuk Fondasi Aplikasi Layanan Perbaikan Elektronik
-- ==============================================================================

-- 1. Inisialisasi Database
CREATE DATABASE IF NOT EXISTS `bantuin_db`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `bantuin_db`;

-- Set session parameters untuk memastikan eksekusi aman
SET foreign_key_checks = 1;
SET sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

-- ==============================================================================
-- GRUP 1: IDENTITAS, AUTENTIKASI & KEAMANAN AKUN
-- ==============================================================================

-- 1.1 Tabel Pengguna Utama (users)
CREATE TABLE IF NOT EXISTS `users` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `uuid` CHAR(36) NOT NULL COMMENT 'Public UUIDv4 untuk mencegah ID enumeration',
  `email` VARCHAR(191) NOT NULL COMMENT 'Email login unik',
  `phone_number` VARCHAR(20) NOT NULL COMMENT 'Nomor telepon format E.164 (+62...)',
  `password_hash` VARCHAR(255) NOT NULL COMMENT 'Hash bcrypt atau argon2id',
  `role` ENUM('admin', 'customer', 'technician') NOT NULL COMMENT 'Role utama sistem',
  `status` ENUM('active', 'inactive', 'suspended', 'pending_verification') NOT NULL DEFAULT 'pending_verification',
  `is_verified` BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'Verifikasi kontak email/phone',
  `token_version` INT NOT NULL DEFAULT 1 COMMENT 'T5 — Versi token JWT; dinaikkan saat reset password untuk mencabut sesi lama',
  `deleted_at` DATETIME NULL DEFAULT NULL COMMENT 'Soft delete timestamp',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_uuid` (`uuid`),
  UNIQUE KEY `uq_users_email` (`email`),
  UNIQUE KEY `uq_users_phone` (`phone_number`),
  INDEX `idx_users_role_status` (`role`, `status`),
  INDEX `idx_users_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Tabel master kredensial dan hak akses pengguna';

-- 1.2 Tabel Hash OTP (user_otps)
CREATE TABLE IF NOT EXISTS `user_otps` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `target_phone` VARCHAR(20) NULL COMMENT 'Nomor telepon tujuan saat OTP dikirim',
  `otp_hash` CHAR(64) NOT NULL COMMENT 'Hash SHA-256 dari 6-digit kode OTP',
  `purpose` ENUM('registration', 'password_reset', 'login', 'phone_verification') NOT NULL,
  `attempts` TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Counter gagal coba (maksimal 3-5x)',
  `delivery_status` ENUM('pending', 'sent', 'failed') NOT NULL DEFAULT 'pending' COMMENT 'Status gateway WhatsApp Fonnte',
  `fonnte_message_id` VARCHAR(100) NULL COMMENT 'ID pesan respon Fonnte',
  `delivery_error` VARCHAR(255) NULL COMMENT 'Pesan error jika pengiriman gagal',
  `expires_at` DATETIME NOT NULL COMMENT 'Masa berlaku OTP (biasanya 5 menit)',
  `consumed_at` DATETIME NULL DEFAULT NULL COMMENT 'Waktu OTP berhasil divalidasi',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_otps_user_purpose` (`user_id`, `purpose`),
  INDEX `idx_otps_expires_at` (`expires_at`),
  INDEX `idx_otps_target_phone` (`target_phone`),
  CONSTRAINT `fk_otps_user` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Penyimpanan token OTP dalam bentuk hash';

-- 1.3 Tabel Refresh Token Sesi (user_refresh_tokens)
CREATE TABLE IF NOT EXISTS `user_refresh_tokens` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `token_hash` CHAR(64) NOT NULL COMMENT 'Hash SHA-256 dari JWT refresh token',
  `device_info` VARCHAR(255) NULL DEFAULT NULL COMMENT 'User agent / browser / device info',
  `ip_address` VARCHAR(45) NULL DEFAULT NULL COMMENT 'Alamat IP pengguna IPv4 atau IPv6',
  `expires_at` DATETIME NOT NULL,
  `revoked_at` DATETIME NULL DEFAULT NULL COMMENT 'Waktu token dicabut saat logout manual',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_refresh_tokens_hash` (`token_hash`),
  INDEX `idx_refresh_tokens_user` (`user_id`),
  INDEX `idx_refresh_tokens_expires` (`expires_at`),
  CONSTRAINT `fk_refresh_tokens_user` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Manajemen sesi dan rotasi JWT refresh token';

-- ==============================================================================
-- GRUP 2: PROFIL, DOKUMEN & KATALOG LAYANAN
-- ==============================================================================

-- 2.1 Profil Pelanggan (customer_profiles)
CREATE TABLE IF NOT EXISTS `customer_profiles` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `full_name` VARCHAR(150) NOT NULL,
  `avatar_url` VARCHAR(255) NULL DEFAULT NULL,
  `default_address` TEXT NULL DEFAULT NULL,
  `city` VARCHAR(100) NULL DEFAULT NULL,
  `postal_code` VARCHAR(10) NULL DEFAULT NULL,
  `latitude` DECIMAL(10, 8) NULL DEFAULT NULL,
  `longitude` DECIMAL(11, 8) NULL DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_customer_profiles_user` (`user_id`),
  INDEX `idx_customer_city` (`city`),
  INDEX `idx_customer_coords` (`latitude`, `longitude`),
  CONSTRAINT `fk_customer_user` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Data profil khusus pelanggan';

-- 2.2 Profil Teknisi (technician_profiles)
CREATE TABLE IF NOT EXISTS `technician_profiles` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `full_name` VARCHAR(150) NOT NULL,
  `avatar_url` VARCHAR(255) NULL DEFAULT NULL,
  `bio` TEXT NULL DEFAULT NULL,
  `years_of_experience` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `rating_avg` DECIMAL(3, 2) NOT NULL DEFAULT 0.00,
  `rating_count` INT UNSIGNED NOT NULL DEFAULT 0,
  `is_available` BOOLEAN NOT NULL DEFAULT TRUE COMMENT 'Kesiapan teknisi menerima order baru',
  `verified_status` ENUM('pending', 'verified', 'rejected', 'suspended') NOT NULL DEFAULT 'pending',
  `rejection_reason` TEXT NULL DEFAULT NULL COMMENT 'Catatan penolakan jika verifikasi profil ditolak',
  `verified_by_admin_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `verified_at` DATETIME NULL DEFAULT NULL,
  `current_latitude` DECIMAL(10, 8) NULL DEFAULT NULL,
  `current_longitude` DECIMAL(11, 8) NULL DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_technician_profiles_user` (`user_id`),
  INDEX `idx_tech_status_available` (`verified_status`, `is_available`),
  INDEX `idx_tech_rating` (`rating_avg`),
  INDEX `idx_tech_coords` (`current_latitude`, `current_longitude`),
  INDEX `idx_tech_verifier` (`verified_by_admin_id`),
  CONSTRAINT `chk_tech_rating_range` CHECK (`rating_avg` >= 0.00 AND `rating_avg` <= 5.00),
  CONSTRAINT `fk_tech_user` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_tech_verified_by` FOREIGN KEY (`verified_by_admin_id`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Profil teknisi (verifikasi kelayakan berbasis dokumen pendukung)';

-- 2.2.1 Profil Administrator (admin_profiles)
CREATE TABLE IF NOT EXISTS `admin_profiles` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `full_name` VARCHAR(150) NOT NULL,
  `avatar_url` VARCHAR(255) NULL DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_admin_profiles_user` (`user_id`),
  CONSTRAINT `fk_admin_profile_user` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Data profil khusus administrator';

-- 2.3 Dokumen Pendukung Teknisi (technician_documents)
CREATE TABLE IF NOT EXISTS `technician_documents` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `technician_profile_id` BIGINT UNSIGNED NOT NULL,
  `document_type` ENUM('competency_certificate', 'training_certificate', 'portfolio', 'business_license', 'other') NOT NULL,
  `document_title` VARCHAR(150) NOT NULL COMMENT 'Judul sertifikat / dokumen',
  `file_name` VARCHAR(255) NOT NULL COMMENT 'Nama file asli saat diunggah',
  `file_path` VARCHAR(255) NOT NULL COMMENT 'Storage object path aman',
  `file_size_bytes` INT UNSIGNED NULL DEFAULT NULL,
  `file_mime_type` VARCHAR(50) NULL DEFAULT NULL,
  `issuing_organization` VARCHAR(150) NULL DEFAULT NULL COMMENT 'Lembaga penerbit (BNSP, BLK, Asosiasi, dsb)',
  `document_number` VARCHAR(100) NULL DEFAULT NULL COMMENT 'Nomor seri / sertifikat jika tersedia',
  `issue_date` DATE NULL DEFAULT NULL,
  `expiry_date` DATE NULL DEFAULT NULL COMMENT 'Masa berlaku (NULL jika seumur hidup)',
  `verification_status` ENUM('pending', 'approved', 'rejected', 'revision_required') NOT NULL DEFAULT 'pending',
  `admin_notes` TEXT NULL DEFAULT NULL COMMENT 'Catatan pemeriksaan / alasan revisi dari admin',
  `verified_by_admin_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `verified_at` DATETIME NULL DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  -- Composite key untuk validasi integritas kepemilikan dokumen spesialisasi
  UNIQUE KEY `uq_tech_docs_id_profile` (`id`, `technician_profile_id`),
  INDEX `idx_tech_docs_profile_status` (`technician_profile_id`, `verification_status`),
  INDEX `idx_tech_docs_type` (`document_type`),
  INDEX `idx_tech_docs_verifier` (`verified_by_admin_id`),
  CONSTRAINT `fk_tech_docs_profile` FOREIGN KEY (`technician_profile_id`)
    REFERENCES `technician_profiles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_tech_docs_admin` FOREIGN KEY (`verified_by_admin_id`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Metadata dokumen legalitas, sertifikasi kompetensi, dan portofolio teknisi';

-- 2.4 Kategori Peralatan (appliance_categories)
CREATE TABLE IF NOT EXISTS `appliance_categories` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL COMMENT 'Nama kategori (AC, Kulkas, dsb)',
  `slug` VARCHAR(120) NOT NULL,
  `icon_url` VARCHAR(255) NULL DEFAULT NULL,
  `description` TEXT NULL DEFAULT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `deleted_at` DATETIME NULL DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_appliance_categories_slug` (`slug`),
  INDEX `idx_categories_active` (`is_active`, `deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Kategori master peralatan rumah tangga';

-- 2.5 Spesialisasi Teknisi (technician_specializations)
CREATE TABLE IF NOT EXISTS `technician_specializations` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `technician_profile_id` BIGINT UNSIGNED NOT NULL,
  `category_id` BIGINT UNSIGNED NOT NULL,
  `supporting_document_id` BIGINT UNSIGNED DEFAULT NULL COMMENT 'Dokumen verifikasi pendukung keahlian',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),

  UNIQUE KEY `uq_tech_specialization` (`technician_profile_id`, `category_id`),
  INDEX `idx_specializations_category` (`category_id`),
  INDEX `idx_specializations_document` (`supporting_document_id`),

  CONSTRAINT `fk_tech_spec_profile`
    FOREIGN KEY (`technician_profile_id`)
    REFERENCES `technician_profiles` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,

  CONSTRAINT `fk_tech_spec_category`
    FOREIGN KEY (`category_id`)
    REFERENCES `appliance_categories` (`id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,

  -- Dokumen pendukung harus milik teknisi yang sama.
  -- Dokumen tidak dapat dihapus selama masih digunakan.
  CONSTRAINT `fk_tech_spec_document_owner`
    FOREIGN KEY (`supporting_document_id`, `technician_profile_id`)
    REFERENCES `technician_documents` (`id`, `technician_profile_id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE

) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Pemetaan relasi keahlian teknisi terhadap kategori peralatan';

-- 2.6 Layanan Perbaikan Spesifik (services)
CREATE TABLE IF NOT EXISTS `services` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `category_id` BIGINT UNSIGNED NOT NULL,
  `name` VARCHAR(150) NOT NULL,
  `slug` VARCHAR(180) NOT NULL,
  `description` TEXT NULL DEFAULT NULL,
  `base_price` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  `estimated_duration_min` SMALLINT UNSIGNED NOT NULL DEFAULT 60,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `deleted_at` DATETIME NULL DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_services_slug` (`slug`),
  -- Composite unique key untuk validasi konsistensi relasi dengan repair_requests
  UNIQUE KEY `uq_services_id_category` (`id`, `category_id`),
  INDEX `idx_services_category_active` (`category_id`, `is_active`, `deleted_at`),
  CONSTRAINT `chk_service_base_price` CHECK (`base_price` >= 0.00),
  CONSTRAINT `fk_services_category` FOREIGN KEY (`category_id`)
    REFERENCES `appliance_categories` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Katalog layanan perbaikan dan tarif dasar';

-- ==============================================================================
-- GRUP 3: KONSULTASI AI (STANDALONE DIAGNOSIS SESI)
-- ==============================================================================

-- 3.1 Sesi Konsultasi AI (ai_consultation_sessions)
CREATE TABLE IF NOT EXISTS `ai_consultation_sessions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `session_uuid` CHAR(36) NOT NULL COMMENT 'Public session UUID',
  `user_id` BIGINT UNSIGNED NULL DEFAULT NULL COMMENT 'NULL jika diakses tamu/guest sebelum login',
  `category_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `initial_symptoms` TEXT NULL DEFAULT NULL,
  `preliminary_diagnosis` TEXT NULL DEFAULT NULL,
  `recommended_action` TEXT NULL DEFAULT NULL,
  `is_converted_to_order` BOOLEAN NOT NULL DEFAULT FALSE,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ai_sessions_uuid` (`session_uuid`),
  INDEX `idx_ai_sessions_user` (`user_id`),
  INDEX `idx_ai_sessions_category` (`category_id`),
  CONSTRAINT `fk_ai_sessions_user` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_ai_sessions_category` FOREIGN KEY (`category_id`)
    REFERENCES `appliance_categories` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Sesi mandiri interaksi diagnosis kerusakan via AI Chatbot';

-- 3.2 Pesan Obrolan AI (ai_chat_messages)
CREATE TABLE IF NOT EXISTS `ai_chat_messages` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `session_id` BIGINT UNSIGNED NOT NULL,
  `role` ENUM('user', 'assistant', 'system') NOT NULL,
  `message` MEDIUMTEXT NOT NULL,
  `tokens_used` INT UNSIGNED NULL DEFAULT NULL,
  `response_time_ms` INT UNSIGNED NULL DEFAULT NULL,
  `raw_metadata` JSON NULL DEFAULT NULL COMMENT 'Model name, safety ratings, latency logs',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_ai_messages_session_time` (`session_id`, `created_at`),
  CONSTRAINT `fk_ai_messages_session` FOREIGN KEY (`session_id`)
    REFERENCES `ai_consultation_sessions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Riwayat pesan prompt dan inferensi respons AI';

-- ==============================================================================
-- GRUP 4: TRANSAKSI PERBAIKAN, PENJADWALAN & DIAGNOSIS
-- ==============================================================================

-- 4.1 Permintaan Perbaikan (repair_requests)
CREATE TABLE IF NOT EXISTS `repair_requests` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_code` VARCHAR(32) NOT NULL COMMENT 'Format kode: BAN-YYYYMMDD-XXXXX',
  `customer_id` BIGINT UNSIGNED NOT NULL,
  `category_id` BIGINT UNSIGNED NOT NULL,
  `service_id` BIGINT UNSIGNED NULL DEFAULT NULL COMMENT 'NULL jika butuh diagnosis awal tanpa paket layanan',
  `ai_session_id` BIGINT UNSIGNED NULL DEFAULT NULL COMMENT 'Relasi jika berawal dari sesi AI',
  `device_brand` VARCHAR(100) NULL DEFAULT NULL,
  `device_model` VARCHAR(100) NULL DEFAULT NULL,
  `problem_description` TEXT NOT NULL,
  `problem_photos` JSON NULL DEFAULT NULL COMMENT 'Array JSON URL foto kerusakan',
  `address_text` TEXT NOT NULL,
  `latitude` DECIMAL(10, 8) NOT NULL,
  `longitude` DECIMAL(11, 8) NOT NULL,
  `current_status` ENUM(
    'draft',
    'submitted',
    'assigned',
    'scheduled',
    'in_diagnosis',
    'estimated',
    'customer_approved',
    'in_repair',
    'completed',
    'cancelled',
    'complained'
  ) NOT NULL DEFAULT 'submitted',
  `deleted_at` DATETIME NULL DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_repair_requests_code` (`order_code`),
  INDEX `idx_repair_customer_status` (`customer_id`, `current_status`),
  INDEX `idx_repair_category_status` (`category_id`, `current_status`),
  INDEX `idx_repair_status_time` (`current_status`, `created_at`),
  INDEX `idx_repair_ai_session` (`ai_session_id`),
  INDEX `idx_repair_coords` (`latitude`, `longitude`),
  CONSTRAINT `fk_repair_customer` FOREIGN KEY (`customer_id`)
    REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_repair_category` FOREIGN KEY (`category_id`)
    REFERENCES `appliance_categories` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  -- Database-level Guarantee: Layanan WAJIB sesuai dengan kategori peralatan yang dipilih!
  CONSTRAINT `fk_repair_service_category` FOREIGN KEY (`service_id`, `category_id`)
    REFERENCES `services` (`id`, `category_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_repair_ai_session` FOREIGN KEY (`ai_session_id`)
    REFERENCES `ai_consultation_sessions` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Tabel master transaksi pesanan perbaikan peralatan';

-- 4.2 Riwayat Status Perbaikan (repair_status_history)
CREATE TABLE IF NOT EXISTS `repair_status_history` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `repair_request_id` BIGINT UNSIGNED NOT NULL,
  `previous_status` VARCHAR(50) NULL DEFAULT NULL,
  `new_status` VARCHAR(50) NOT NULL,
  `changed_by_user_id` BIGINT UNSIGNED NOT NULL,
  `actor_role` ENUM('customer', 'technician', 'admin', 'system') NOT NULL,
  `notes` TEXT NULL DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_status_history_request` (`repair_request_id`, `created_at`),
  INDEX `idx_status_history_user` (`changed_by_user_id`),
  CONSTRAINT `fk_status_history_request` FOREIGN KEY (`repair_request_id`)
    REFERENCES `repair_requests` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_status_history_user` FOREIGN KEY (`changed_by_user_id`)
    REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Audit trail linimasa mutasi status pesanan perbaikan';

-- 4.3 Penugasan Teknisi (technician_assignments)
CREATE TABLE IF NOT EXISTS `technician_assignments` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `repair_request_id` BIGINT UNSIGNED NOT NULL,
  `technician_id` BIGINT UNSIGNED NOT NULL COMMENT 'FK ke users(id) ber-role technician',
  `assigned_by_user_id` BIGINT UNSIGNED NULL DEFAULT NULL COMMENT 'NULL jika ditugaskan oleh sistem otomatis',
  `assignment_type` ENUM('manual_admin', 'auto_system') NOT NULL DEFAULT 'manual_admin',
  `status` ENUM('offered', 'accepted', 'rejected', 'reassigned', 'completed', 'cancelled') NOT NULL DEFAULT 'offered',
  `rejection_reason` TEXT NULL DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `responded_at` DATETIME NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_assignments_request` (`repair_request_id`),
  INDEX `idx_assignments_tech_status` (`technician_id`, `status`),
  INDEX `idx_assignments_assigner` (`assigned_by_user_id`),
  CONSTRAINT `fk_assignments_request` FOREIGN KEY (`repair_request_id`)
    REFERENCES `repair_requests` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_assignments_technician` FOREIGN KEY (`technician_id`)
    REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_assignments_admin` FOREIGN KEY (`assigned_by_user_id`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Log penugasan teknisi terhadap pesanan perbaikan';

-- 4.4 Jadwal Kunjungan Teknisi (technician_schedules)
CREATE TABLE IF NOT EXISTS `technician_schedules` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `repair_request_id` BIGINT UNSIGNED NOT NULL,
  `technician_id` BIGINT UNSIGNED NOT NULL,
  `scheduled_date` DATE NOT NULL,
  `time_slot_start` TIME NOT NULL,
  `time_slot_end` TIME NOT NULL,
  `status` ENUM('scheduled', 'rescheduled', 'on_the_way', 'arrived', 'completed', 'cancelled') NOT NULL DEFAULT 'scheduled',
  `reschedule_reason` TEXT NULL DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_schedules_request` (`repair_request_id`),
  INDEX `idx_schedules_tech_date` (`technician_id`, `scheduled_date`, `status`),
  CONSTRAINT `chk_schedules_time_order` CHECK (`time_slot_end` > `time_slot_start`),
  CONSTRAINT `fk_schedules_request` FOREIGN KEY (`repair_request_id`)
    REFERENCES `repair_requests` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_schedules_technician` FOREIGN KEY (`technician_id`)
    REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Manajemen jadwal kunjungan fisik teknisi ke lokasi pelanggan';

-- 4.5 Hasil Diagnosis Lapangan & Estimasi Biaya (repair_diagnoses)
CREATE TABLE IF NOT EXISTS `repair_diagnoses` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `repair_request_id` BIGINT UNSIGNED NOT NULL,
  `technician_id` BIGINT UNSIGNED NOT NULL,
  `damage_details` TEXT NOT NULL,
  `required_parts_json` JSON NULL DEFAULT NULL COMMENT 'Array JSON rincian part: [{part_name, qty, unit_price}]',
  `labor_cost` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  `parts_cost` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  `total_estimate` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  `evidence_photos` JSON NULL DEFAULT NULL COMMENT 'Array JSON URL foto bukti kerusakan hasil bongkar',
  `customer_approval` ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  `rejection_reason` TEXT NULL DEFAULT NULL,
  `approved_at` DATETIME NULL DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_diagnoses_request` (`repair_request_id`),
  INDEX `idx_diagnoses_technician` (`technician_id`),
  INDEX `idx_diagnoses_approval` (`customer_approval`),
  CONSTRAINT `chk_diagnoses_costs` CHECK (
    `labor_cost` >= 0.00 AND
    `parts_cost` >= 0.00 AND
    `total_estimate` >= 0.00
  ),
  CONSTRAINT `fk_diagnoses_request` FOREIGN KEY (`repair_request_id`)
    REFERENCES `repair_requests` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_diagnoses_technician` FOREIGN KEY (`technician_id`)
    REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Laporan inspeksi fisik unit, estimasi biaya, dan persetujuan pelanggan';

-- ==============================================================================
-- GRUP 5: KOMUNIKASI CHAT DALAM PESANAN
-- ==============================================================================

-- 5.1 Kamar Chat Order (repair_chat_rooms)
CREATE TABLE IF NOT EXISTS `repair_chat_rooms` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `repair_request_id` BIGINT UNSIGNED NOT NULL,
  `customer_id` BIGINT UNSIGNED NOT NULL,
  `technician_id` BIGINT UNSIGNED NOT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE COMMENT 'Otomatis FALSE jika pesanan telah berstatus completed/cancelled',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  -- 1 Pesanan memiliki tepat 1 ruang obrolan privat
  UNIQUE KEY `uq_chat_rooms_request` (`repair_request_id`),
  INDEX `idx_chat_rooms_customer` (`customer_id`),
  INDEX `idx_chat_rooms_technician` (`technician_id`),
  CONSTRAINT `fk_chat_rooms_request` FOREIGN KEY (`repair_request_id`)
    REFERENCES `repair_requests` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_chat_rooms_customer` FOREIGN KEY (`customer_id`)
    REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_chat_rooms_technician` FOREIGN KEY (`technician_id`)
    REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Ruang percakapan terisolasi khusus koordinasi pesanan aktif';

-- 5.2 Pesan Chat Order (repair_chat_messages)
CREATE TABLE IF NOT EXISTS `repair_chat_messages` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `chat_room_id` BIGINT UNSIGNED NOT NULL,
  `sender_id` BIGINT UNSIGNED NOT NULL,
  `message_type` ENUM('text', 'image', 'location', 'system') NOT NULL DEFAULT 'text',
  `content` TEXT NOT NULL,
  `attachment_url` VARCHAR(255) NULL DEFAULT NULL,
  `is_read` BOOLEAN NOT NULL DEFAULT FALSE,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_chat_messages_room_time` (`chat_room_id`, `created_at`),
  INDEX `idx_chat_messages_sender` (`sender_id`),
  CONSTRAINT `fk_chat_messages_room` FOREIGN KEY (`chat_room_id`)
    REFERENCES `repair_chat_rooms` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_chat_messages_sender` FOREIGN KEY (`sender_id`)
    REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Pesan percakapan antara pelanggan dan teknisi dalam kamar pesanan';

-- ==============================================================================
-- GRUP 6: KEUANGAN, TAGIHAN & PEMBAYARAN
-- ==============================================================================

-- 6.1 Tagihan Resmi (invoices)
CREATE TABLE IF NOT EXISTS `invoices` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `invoice_number` VARCHAR(50) NOT NULL,
  `repair_request_id` BIGINT UNSIGNED NOT NULL,
  `customer_id` BIGINT UNSIGNED NOT NULL,
  `subtotal_labor` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  `subtotal_parts` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  `service_fee` DECIMAL(12, 2) NOT NULL DEFAULT 0.00 COMMENT 'Biaya platform BANTUIN',
  `discount_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  `total_amount` DECIMAL(12, 2) NOT NULL,
  `status` ENUM('unpaid', 'paid', 'cancelled', 'refunded') NOT NULL DEFAULT 'unpaid',
  `due_date` DATETIME NOT NULL,
  `paid_at` DATETIME NULL DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_invoices_number` (`invoice_number`),
  -- Integritas Bisnis: 1 Pesanan hanya memiliki 1 tagihan invoice aktif
  UNIQUE KEY `uq_invoices_repair_request` (`repair_request_id`),
  INDEX `idx_invoices_customer_status` (`customer_id`, `status`),
  INDEX `idx_invoices_status_due` (`status`, `due_date`),
  CONSTRAINT `chk_invoices_amounts` CHECK (
    `subtotal_labor` >= 0.00 AND
    `subtotal_parts` >= 0.00 AND
    `service_fee` >= 0.00 AND
    `discount_amount` >= 0.00 AND
    `total_amount` >= 0.00
  ),
  CONSTRAINT `fk_invoices_request` FOREIGN KEY (`repair_request_id`)
    REFERENCES `repair_requests` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_invoices_customer` FOREIGN KEY (`customer_id`)
    REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Data penagihan resmi untuk pesanan perbaikan';

-- 6.2 Log Transaksi Pembayaran (payments) - ZERO SENSITIVE CARD DATA
CREATE TABLE IF NOT EXISTS `payments` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `payment_reference` VARCHAR(100) NOT NULL COMMENT 'ID referensi pembayaran internal BANTUIN',
  `invoice_id` BIGINT UNSIGNED NOT NULL,
  `payment_method` ENUM(
    'qris',
    'va_bca',
    'va_mandiri',
    'va_bni',
    'va_bri',
    'ewallet_gopay',
    'ewallet_ovo',
    'ewallet_dana',
    'cash_on_delivery'
  ) NOT NULL,
  `gateway_provider` VARCHAR(50) NULL DEFAULT NULL COMMENT 'Vendor gateway (midtrans, xendit, dsb)',
  `gateway_transaction_id` VARCHAR(100) NULL DEFAULT NULL COMMENT 'ID transaksi dari vendor gateway',
  `amount` DECIMAL(12, 2) NOT NULL,
  `payment_status` ENUM('pending', 'settlement', 'expire', 'deny', 'cancel', 'refunded') NOT NULL DEFAULT 'pending',
  `gateway_response_json` JSON NULL DEFAULT NULL COMMENT 'Webhook log payload resmi untuk rekonsiliasi',
  `settled_at` DATETIME NULL DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_payments_reference` (`payment_reference`),
  -- Mencegah duplikasi pembayaran dari webhook ganda untuk transaksi yang sama
  UNIQUE KEY `uq_payments_gateway_txn` (`gateway_transaction_id`),
  INDEX `idx_payments_invoice` (`invoice_id`),
  INDEX `idx_payments_status_time` (`payment_status`, `created_at`),
  CONSTRAINT `chk_payment_amount` CHECK (`amount` > 0.00),
  CONSTRAINT `fk_payments_invoice` FOREIGN KEY (`invoice_id`)
    REFERENCES `invoices` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Pencatatan status transaksi pembayaran aman tanpa nomor kartu mentah';

-- ==============================================================================
-- GRUP 7: EVALUASI, ULASAN & PENANGANAN PENGADUAN
-- ==============================================================================

-- 7.1 Ulasan & Rating Pesanan (repair_reviews)
CREATE TABLE IF NOT EXISTS `repair_reviews` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `repair_request_id` BIGINT UNSIGNED NOT NULL,
  `customer_id` BIGINT UNSIGNED NOT NULL,
  `technician_id` BIGINT UNSIGNED NOT NULL,
  `rating` TINYINT UNSIGNED NOT NULL COMMENT 'Skala rating bintang 1 sampai 5',
  `review_text` TEXT NULL DEFAULT NULL,
  `photos` JSON NULL DEFAULT NULL COMMENT 'Array JSON URL foto bukti kepuasan pelanggan',
  `is_published` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  -- 1 Pesanan hanya dapat diulas 1 kali oleh pelanggan bersangkutan
  UNIQUE KEY `uq_reviews_request` (`repair_request_id`),
  INDEX `idx_reviews_technician` (`technician_id`, `rating`),
  INDEX `idx_reviews_customer` (`customer_id`),
  CONSTRAINT `chk_reviews_rating_range` CHECK (`rating` >= 1 AND `rating` <= 5),
  CONSTRAINT `fk_reviews_request` FOREIGN KEY (`repair_request_id`)
    REFERENCES `repair_requests` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_reviews_customer` FOREIGN KEY (`customer_id`)
    REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_reviews_technician` FOREIGN KEY (`technician_id`)
    REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Ulasan dan testimoni pelanggan pasca perbaikan unit';

-- 7.2 Layanan Pengaduan & Eskalasi (repair_complaints)
CREATE TABLE IF NOT EXISTS `repair_complaints` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `complaint_code` VARCHAR(32) NOT NULL COMMENT 'Format kode: CMP-YYYYMMDD-XXXXX',
  `repair_request_id` BIGINT UNSIGNED NOT NULL,
  `complainant_user_id` BIGINT UNSIGNED NOT NULL,
  `category` ENUM(
    'poor_workmanship',
    'tardiness',
    'overcharging',
    'technician_misbehavior',
    'recurring_damage',
    'other'
  ) NOT NULL,
  `description` TEXT NOT NULL,
  `evidence_photos` JSON NULL DEFAULT NULL COMMENT 'Array JSON URL foto/video bukti aduan',
  `status` ENUM('submitted', 'in_investigation', 'waiting_customer', 'resolved', 'rejected') NOT NULL DEFAULT 'submitted',
  `resolution_summary` TEXT NULL DEFAULT NULL,
  `handled_by_admin_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `resolved_at` DATETIME NULL DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_complaints_code` (`complaint_code`),
  INDEX `idx_complaints_request` (`repair_request_id`),
  INDEX `idx_complaints_complainant` (`complainant_user_id`),
  INDEX `idx_complaints_status` (`status`),
  INDEX `idx_complaints_handler` (`handled_by_admin_id`),
  CONSTRAINT `fk_complaints_request` FOREIGN KEY (`repair_request_id`)
    REFERENCES `repair_requests` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_complaints_complainant` FOREIGN KEY (`complainant_user_id`)
    REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_complaints_admin` FOREIGN KEY (`handled_by_admin_id`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Manajemen penanganan sengketa dan pengaduan layanan';

-- ==============================================================================
-- GRUP 8: NOTIFIKASI, SISTEM & AUDIT ADMINISTRATOR
-- ==============================================================================

-- 8.1 Notifikasi In-App Pengguna (notifications)
CREATE TABLE IF NOT EXISTS `notifications` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `title` VARCHAR(150) NOT NULL,
  `message` TEXT NOT NULL,
  `type` ENUM(
    'order_status',
    'payment',
    'technician_assignment',
    'chat',
    'complaint',
    'document_verification',
    'system'
  ) NOT NULL,
  `target_url` VARCHAR(255) NULL DEFAULT NULL,
  `entity_type` VARCHAR(50) NULL DEFAULT NULL,
  `entity_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `is_read` BOOLEAN NOT NULL DEFAULT FALSE,
  `read_at` DATETIME NULL DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_notifications_user_unread` (`user_id`, `is_read`, `created_at`),
  INDEX `idx_notifications_entity` (`entity_type`, `entity_id`),
  CONSTRAINT `fk_notifications_user` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Penyimpanan riwayat notifikasi in-app semua pengguna';

-- 8.2 Log Pengiriman Notifikasi WhatsApp (whatsapp_notifications)
-- Mencatat setiap percobaan pengiriman WhatsApp lewat Fonnte — manual dari
-- panel admin maupun otomatis saat status pesanan berubah. Dipisah dari
-- `notifications` (in-app) karena butuh kolom pengiriman tersendiri
-- (nomor tujuan, status pending/sent/failed, ID pesan Fonnte, error).
-- Lihat juga: database/migrations/006_whatsapp_notifications.sql.
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

-- 8.2 Pengaturan Konfigurasi Sistem (system_settings)
CREATE TABLE IF NOT EXISTS `system_settings` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `setting_key` VARCHAR(100) NOT NULL,
  `setting_value` TEXT NOT NULL,
  `value_type` ENUM('string', 'number', 'boolean', 'json') NOT NULL DEFAULT 'string',
  `group_name` VARCHAR(50) NOT NULL DEFAULT 'general',
  `description` VARCHAR(255) NULL DEFAULT NULL,
  `updated_by_admin_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_system_settings_key` (`setting_key`),
  INDEX `idx_settings_group` (`group_name`),
  CONSTRAINT `fk_settings_admin` FOREIGN KEY (`updated_by_admin_id`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Konfigurasi global aplikasi BANTUIN yang dapat diatur dinamis';

-- 8.3 Log Audit Aktivitas Admin (admin_audit_logs) - IMMUTABLE APPEND-ONLY
CREATE TABLE IF NOT EXISTS `admin_audit_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `admin_user_id` BIGINT UNSIGNED NOT NULL,
  `action` VARCHAR(100) NOT NULL COMMENT 'Kode aksi: VERIFY_DOC, UPDATE_SETTING, OVERRIDE_STATUS, dsb',
  `entity_name` VARCHAR(60) NOT NULL COMMENT 'Nama tabel target yang dimanipulasi',
  `entity_id` BIGINT UNSIGNED NOT NULL COMMENT 'ID baris rekaman target',
  `old_values` JSON NULL DEFAULT NULL COMMENT 'Snapshot data sebelum perubahan',
  `new_values` JSON NULL DEFAULT NULL COMMENT 'Snapshot data sesudah perubahan',
  `ip_address` VARCHAR(45) NULL DEFAULT NULL,
  `user_agent` VARCHAR(255) NULL DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_audit_admin_time` (`admin_user_id`, `created_at`),
  INDEX `idx_audit_entity` (`entity_name`, `entity_id`),
  INDEX `idx_audit_action` (`action`),
  -- Kebijakan Audit: Riwayat audit tidak boleh terhapus jika akun admin dihapus
  CONSTRAINT `fk_audit_admin` FOREIGN KEY (`admin_user_id`)
    REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Catatan audit jejak rekam tindakan penting administrator';

-- ==============================================================================
-- GRUP 9: AI PROVIDER MANAGEMENT & MONITORING
-- ==============================================================================

-- 9.1 Tabel Konfigurasi Runtime Provider AI (ai_provider_configs)
CREATE TABLE IF NOT EXISTS `ai_provider_configs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `provider` VARCHAR(50) NOT NULL COMMENT 'Slug ID unik provider (gemini, groq, deepseek, dsb)',
  `name` VARCHAR(100) NOT NULL COMMENT 'Nama display provider AI',
  `api_endpoint` VARCHAR(255) NOT NULL COMMENT 'Endpoint URL resmi HTTPS',
  `encrypted_api_key` TEXT NULL DEFAULT NULL COMMENT 'AES-256-GCM format: v1:kid:iv:tag:ciphertext',
  `key_identifier` VARCHAR(64) NOT NULL DEFAULT 'primary-2026' COMMENT 'Key Identifier untuk rotasi kunci',
  `masked_key_preview` VARCHAR(60) NULL DEFAULT NULL COMMENT 'Pratinjau sensor untuk UI tanpa mengekspos plaintext',
  `selected_model` VARCHAR(100) NOT NULL,
  `default_model` VARCHAR(100) NOT NULL,
  `temperature` DECIMAL(3, 2) NOT NULL DEFAULT 0.70,
  `max_output_tokens` INT UNSIGNED NOT NULL DEFAULT 2048,
  `request_timeout_ms` INT UNSIGNED NOT NULL DEFAULT 30000,
  `retry_limit` TINYINT UNSIGNED NOT NULL DEFAULT 2,
  `last_connection_status` ENUM('not_configured', 'connected', 'disconnected', 'connection_error', 'disabled') NOT NULL DEFAULT 'not_configured',
  `last_tested_at` DATETIME NULL DEFAULT NULL,
  `last_error_message` TEXT NULL DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ai_provider` (`provider`),
  INDEX `idx_ai_provider_status` (`provider`, `last_connection_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Konfigurasi runtime masing-masing provider AI BANTUIN';

-- 9.2 Tabel Pengaturan Global & Provider Aktif (ai_global_settings)
-- Menggunakan Single-Row Pattern (id = 1) untuk menjamin konsistensi atomik provider aktif
CREATE TABLE IF NOT EXISTS `ai_global_settings` (
  `id` INT UNSIGNED NOT NULL DEFAULT 1,
  `active_provider` VARCHAR(50) NOT NULL DEFAULT 'gemini',
  `enable_fallback` BOOLEAN NOT NULL DEFAULT FALSE,
  `fallback_provider` VARCHAR(50) NOT NULL DEFAULT 'groq',
  `version` BIGINT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'State counter untuk distributed cache invalidation',
  `circuit_breaker_failure_threshold` TINYINT UNSIGNED NOT NULL DEFAULT 3,
  `circuit_breaker_cooldown_sec` INT UNSIGNED NOT NULL DEFAULT 30,
  `updated_by_admin_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `chk_single_global_row` CHECK (`id` = 1),
  CONSTRAINT `fk_ai_global_admin` FOREIGN KEY (`updated_by_admin_id`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Pengaturan provider aktif tunggal dan kebijakan fallback';

-- 9.3 Tabel Log Pengujian Koneksi (ai_connection_test_logs)
CREATE TABLE IF NOT EXISTS `ai_connection_test_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `provider` VARCHAR(50) NOT NULL,
  `endpoint` VARCHAR(255) NOT NULL,
  `model_tested` VARCHAR(100) NOT NULL,
  `status` ENUM(
    'success',
    'invalid_api_key',
    'invalid_endpoint',
    'model_not_available',
    'rate_limit_exceeded',
    'timeout',
    'provider_error',
    'unknown_error'
  ) NOT NULL,
  `http_status_code` INT NULL DEFAULT NULL,
  `response_time_ms` INT UNSIGNED NOT NULL,
  `error_message` TEXT NULL DEFAULT NULL,
  `admin_user_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_ai_test_provider_time` (`provider`, `created_at`),
  INDEX `idx_ai_test_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Riwayat pengujian koneksi live provider AI';

-- 9.4 Tabel Pemantauan & Metrik Penggunaan AI (ai_usage_logs)
CREATE TABLE IF NOT EXISTS `ai_usage_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `provider` VARCHAR(50) NOT NULL,
  `model` VARCHAR(100) NOT NULL,
  `latency_ms` INT UNSIGNED NOT NULL,
  `status` ENUM('success', 'failed', 'fallback') NOT NULL,
  `prompt_tokens` INT UNSIGNED NULL DEFAULT NULL COMMENT 'Input tokens ternormalisasi',
  `completion_tokens` INT UNSIGNED NULL DEFAULT NULL COMMENT 'Output tokens ternormalisasi',
  `total_tokens` INT UNSIGNED NULL DEFAULT NULL COMMENT 'Total token konsumsi',
  `error_category` VARCHAR(100) NULL DEFAULT NULL,
  `is_fallback` BOOLEAN NOT NULL DEFAULT FALSE,
  `fallback_from_provider` VARCHAR(50) NULL DEFAULT NULL,
  `session_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `user_role` VARCHAR(30) NULL DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_ai_usage_provider_time` (`provider`, `created_at`),
  INDEX `idx_ai_usage_status_time` (`status`, `created_at`),
  INDEX `idx_ai_usage_session` (`session_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Log analitik konsumsi token dan performa inferensi AI';

-- 9.5 Tabel Audit Perubahan Konfigurasi AI (ai_config_audit_logs)
CREATE TABLE IF NOT EXISTS `ai_config_audit_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `admin_user_id` BIGINT UNSIGNED NOT NULL,
  `provider` VARCHAR(50) NOT NULL,
  `action` VARCHAR(100) NOT NULL COMMENT 'UPDATE_CONFIG, SWITCH_PROVIDER, ROTATE_KEY, TOGGLE_FALLBACK, TEST_CONNECTION, DELETE_PROVIDER',
  `changes` JSON NULL DEFAULT NULL COMMENT 'Payload perubahan sanitized (API key selalu disensor)',
  `ip_address` VARCHAR(45) NULL DEFAULT NULL,
  `user_agent` VARCHAR(255) NULL DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_ai_audit_admin_time` (`admin_user_id`, `created_at`),
  INDEX `idx_ai_audit_action` (`action`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Audit trail jejak rekam modifikasi konfigurasi AI administrator';

-- 9.6 Tabel Pustaka Pengetahuan Asisten AI (ai_knowledge_base)
CREATE TABLE IF NOT EXISTS `ai_knowledge_base` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `slug` VARCHAR(100) NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `category` ENUM(
    'application_overview',
    'feature_documentation',
    'module_documentation',
    'business_rules',
    'user_guide',
    'workflow_documentation',
    'role_permission_documentation',
    'database_relationship_documentation',
    'system_configuration_documentation',
    'error_handling_documentation'
  ) NOT NULL,
  `tags` JSON NULL DEFAULT NULL,
  `summary` TEXT NOT NULL,
  `content` MEDIUMTEXT NOT NULL,
  `source` VARCHAR(150) NOT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_by_admin_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_knowledge_slug` (`slug`),
  INDEX `idx_knowledge_category_active` (`category`, `is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Knowledge Base resmi asisten AI BANTUIN';


