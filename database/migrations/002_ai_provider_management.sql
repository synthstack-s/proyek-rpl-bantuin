-- ==============================================================================
-- BANTUIN MIGRATION 002: AI PROVIDER MANAGEMENT
-- Modul: Konfigurasi Gemini & Groq, Enkripsi Kredensial, Pengaturan Global,
--        Connection Testing Logs, Usage Metrics & Audit Logs.
-- ==============================================================================

-- 1. Tabel Konfigurasi Provider AI (ai_provider_configs)
CREATE TABLE IF NOT EXISTS `ai_provider_configs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `provider` ENUM('gemini', 'groq') NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `api_endpoint` VARCHAR(255) NOT NULL,
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

-- 2. Tabel Pengaturan Global & Provider Aktif (ai_global_settings)
-- Menggunakan Single-Row Pattern (id = 1) untuk menjamin konsistensi atomik provider aktif
CREATE TABLE IF NOT EXISTS `ai_global_settings` (
  `id` INT UNSIGNED NOT NULL DEFAULT 1,
  `active_provider` ENUM('gemini', 'groq') NOT NULL DEFAULT 'gemini',
  `enable_fallback` BOOLEAN NOT NULL DEFAULT FALSE,
  `fallback_provider` ENUM('gemini', 'groq') NOT NULL DEFAULT 'groq',
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

-- 3. Tabel Log Pengujian Koneksi (ai_connection_test_logs)
CREATE TABLE IF NOT EXISTS `ai_connection_test_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `provider` ENUM('gemini', 'groq') NOT NULL,
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

-- 4. Tabel Pemantauan & Metrik Penggunaan AI (ai_usage_logs)
CREATE TABLE IF NOT EXISTS `ai_usage_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `provider` ENUM('gemini', 'groq') NOT NULL,
  `model` VARCHAR(100) NOT NULL,
  `latency_ms` INT UNSIGNED NOT NULL,
  `status` ENUM('success', 'failed', 'fallback') NOT NULL,
  `prompt_tokens` INT UNSIGNED NULL DEFAULT NULL COMMENT 'Input tokens ternormalisasi',
  `completion_tokens` INT UNSIGNED NULL DEFAULT NULL COMMENT 'Output tokens ternormalisasi',
  `total_tokens` INT UNSIGNED NULL DEFAULT NULL COMMENT 'Total token konsumsi',
  `error_category` VARCHAR(100) NULL DEFAULT NULL,
  `is_fallback` BOOLEAN NOT NULL DEFAULT FALSE,
  `fallback_from_provider` ENUM('gemini', 'groq') NULL DEFAULT NULL,
  `session_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `user_role` VARCHAR(30) NULL DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_ai_usage_provider_time` (`provider`, `created_at`),
  INDEX `idx_ai_usage_status_time` (`status`, `created_at`),
  INDEX `idx_ai_usage_session` (`session_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Log analitik konsumsi token dan performa inferensi AI';

-- 5. Tabel Audit Perubahan Konfigurasi AI (ai_config_audit_logs)
CREATE TABLE IF NOT EXISTS `ai_config_audit_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `admin_user_id` BIGINT UNSIGNED NOT NULL,
  `provider` VARCHAR(50) NOT NULL,
  `action` VARCHAR(100) NOT NULL COMMENT 'UPDATE_CONFIG, SWITCH_PROVIDER, ROTATE_KEY, TOGGLE_FALLBACK, TEST_CONNECTION',
  `changes` JSON NULL DEFAULT NULL COMMENT 'Payload perubahan sanitized (API key selalu disensor)',
  `ip_address` VARCHAR(45) NULL DEFAULT NULL,
  `user_agent` VARCHAR(255) NULL DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_ai_audit_admin_time` (`admin_user_id`, `created_at`),
  INDEX `idx_ai_audit_action` (`action`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Audit trail jejak rekam modifikasi konfigurasi AI administrator';

-- Inisialisasi Data Awal (Seed Safe)
INSERT INTO `ai_global_settings` (
  `id`, `active_provider`, `enable_fallback`, `fallback_provider`, `version`
) VALUES (
  1, 'gemini', FALSE, 'groq', 1
) ON DUPLICATE KEY UPDATE `id` = 1;

-- Inisialisasi Provider Gemini
INSERT INTO `ai_provider_configs` (
  `provider`, `name`, `api_endpoint`, `selected_model`, `default_model`,
  `temperature`, `max_output_tokens`, `request_timeout_ms`, `retry_limit`, `last_connection_status`
) VALUES (
  'gemini',
  'Google Gemini',
  'https://generativelanguage.googleapis.com',
  'gemini-3.5-flash',
  'gemini-3.5-flash',
  0.70,
  2048,
  30000,
  2,
  'not_configured'
) ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

-- Inisialisasi Provider Groq AI
INSERT INTO `ai_provider_configs` (
  `provider`, `name`, `api_endpoint`, `selected_model`, `default_model`,
  `temperature`, `max_output_tokens`, `request_timeout_ms`, `retry_limit`, `last_connection_status`
) VALUES (
  'groq',
  'Groq AI',
  'https://api.groq.com/openai/v1',
  'llama-3.3-70b-versatile',
  'llama-3.3-70b-versatile',
  0.70,
  2048,
  30000,
  2,
  'not_configured'
) ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);
