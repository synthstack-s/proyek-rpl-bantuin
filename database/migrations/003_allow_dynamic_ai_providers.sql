-- ==============================================================================
-- BANTUIN MIGRATION 003: DYNAMIC AI PROVIDERS SUPPORT
-- Memperluas tipe kolom provider dari ENUM('gemini', 'groq') ke VARCHAR(50)
-- untuk memungkinkan penambahan provider AI kustom secara dinamis tanpa batas.
-- ==============================================================================

ALTER TABLE `ai_provider_configs` MODIFY COLUMN `provider` VARCHAR(50) NOT NULL;
ALTER TABLE `ai_global_settings` MODIFY COLUMN `active_provider` VARCHAR(50) NOT NULL DEFAULT 'gemini';
ALTER TABLE `ai_global_settings` MODIFY COLUMN `fallback_provider` VARCHAR(50) NOT NULL DEFAULT 'groq';
ALTER TABLE `ai_connection_test_logs` MODIFY COLUMN `provider` VARCHAR(50) NOT NULL;
ALTER TABLE `ai_usage_logs` MODIFY COLUMN `provider` VARCHAR(50) NOT NULL;
ALTER TABLE `ai_usage_logs` MODIFY COLUMN `fallback_from_provider` VARCHAR(50) NULL;
ALTER TABLE `ai_config_audit_logs` MODIFY COLUMN `provider` VARCHAR(50) NOT NULL;


