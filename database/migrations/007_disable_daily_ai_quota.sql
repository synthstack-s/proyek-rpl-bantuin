-- ==============================================================================
-- BANTUIN MIGRATION 007: NONAKTIFKAN KUOTA HARIAN AI (0 = TANPA BATAS)
-- Keputusan pemilik 2026-11-17: penggunaan chatbot dibebaskan untuk
-- sekarang ("jangan dibatasi"). Nilai setting `ai_daily_free_quota` diubah
-- dari '10' (seed lama) menjadi '0', yang di kode berarti TANPA BATAS
-- (lihat `getDailyAIQuotaLimit` / `checkDailyAIQuota` di
-- src/lib/ai/repository.ts).
--
-- Mekanisme kuota di kode DIPERTAHANKAN — migrasi ini hanya mengubah NILAI
-- setting yang sudah ada di database. Menghidupkan kuota lagi cukup set
-- setting ke angka positif lewat panel Pengaturan (atau UPDATE langsung);
-- tidak perlu migrasi baru dan tidak perlu deploy ulang kode.
--
-- Migrasi ini aman dijalankan ulang (idempotent): UPDATE yang sama
-- menghasilkan nilai yang sama. Bila baris setting belum ada (seed belum
-- dijalankan), UPDATE tidak mengubah apa pun dan kode memakai default 0
-- (tanpa batas). Tidak ada perubahan struktur tabel.
-- ==============================================================================

UPDATE `system_settings`
SET
  `setting_value` = '0',
  `description` = 'Batas kuota harian percakapan AI per pengguna. 0 = tanpa batas (kuota dinonaktifkan).'
WHERE `setting_key` = 'ai_daily_free_quota';
