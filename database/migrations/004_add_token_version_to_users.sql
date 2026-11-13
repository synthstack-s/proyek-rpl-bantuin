-- ==============================================================================
-- BANTUIN MIGRATION 004: TOKEN VERSION UNTUK PENCABUTAN JWT (T5)
-- Menambahkan kolom token_version ke tabel users. Setiap reset password
-- menaikkan versi ini sehingga seluruh JWT yang diterbitkan sebelumnya
-- ditolak oleh pemeriksaan pencabutan (src/lib/token-revocation.ts).
--
-- PENTING: jalankan migrasi ini di database produksi agar pencabutan JWT
-- aktif. Tanpa kolom ini, kode tetap berjalan (fail-open ke versi 1) tetapi
-- reset password TIDAK mencabut sesi lama.
-- ==============================================================================

ALTER TABLE `users` ADD COLUMN `token_version` INT NOT NULL DEFAULT 1 COMMENT 'Versi token JWT — dinaikkan saat reset password untuk mencabut sesi lama' AFTER `is_verified`;
