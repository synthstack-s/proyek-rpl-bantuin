-- ==============================================================================
-- DATA AWAL DASAR (SEED DATA) SISTEM BANTUIN
-- Target DBMS     : MySQL 8.0+
-- Nama Database   : bantuin_db
-- Deskripsi       : Data master awal katalog kategori, layanan, dan konfigurasi sistem.
-- Keamanan        : Tanpa kredensial admin hardcoded / password palsu.
-- ==============================================================================

USE `bantuin_db`;

-- 1. Kategori Peralatan Rumah Tangga (Master Categories)
INSERT INTO `appliance_categories` (`id`, `name`, `slug`, `icon_url`, `description`, `is_active`)
VALUES
  (1, 'Pendingin Ruangan (AC)', 'ac-pendingin-ruangan', '/icons/categories/ac.svg', 'Layanan cuci, perbaikan mesin, pengisian refrigeran/freon, dan instalasi AC Split, Inverter, dan Cassette.', TRUE),
  (2, 'Lemari Es & Freezer', 'kulkas-freezer', '/icons/categories/refrigerator.svg', 'Perbaikan kulkas 1 pintu, 2 pintu, side-by-side, chiller, dan freezer box (tidak dingin, bocor, ganti kompresor).', TRUE),
  (3, 'Mesin Cuci & Pengering', 'mesin-cuci-pengering', '/icons/categories/washing-machine.svg', 'Perbaikan mesin cuci top loading, front loading, 2 tabung, dan mesin pengering pakaian (error modul, bocor, dinamo).', TRUE),
  (4, 'Pompa Air & Water Heater', 'pompa-air-water-heater', '/icons/categories/water-pump.svg', 'Servis pompa air tanah, pendorong (booster), serta water heater listrik dan gas.', TRUE),
  (5, 'Televisi & Home Audio', 'tv-audio-elektronik', '/icons/categories/television.svg', 'Perbaikan Smart TV LED/OLED/QLED, panel gambar gelap, backlight mati, suara tidak keluar, dan perangkat sound system.', TRUE),
  (6, 'Peralatan Dapur Elektronik', 'elektronik-dapur', '/icons/categories/kitchen.svg', 'Layanan perbaikan microwave oven, kompor induksi, dispenser air galon, dan rice cooker digital.', TRUE)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `description` = VALUES(`description`),
  `is_active` = VALUES(`is_active`);

-- 2. Katalog Layanan Spesifik (Services)
INSERT INTO `services` (`id`, `category_id`, `name`, `slug`, `description`, `base_price`, `estimated_duration_min`, `is_active`)
VALUES
  -- Kategori 1: AC
  (1, 1, 'Cuci AC Standar (0.5 - 1 PK)', 'cuci-ac-standar-05-1pk', 'Pembersihan evaporator indoor, filter udara, dan kondensor outdoor untuk AC 0.5 sampai 1 PK.', 75000.00, 45, TRUE),
  (2, 1, 'Cuci AC Besar (1.5 - 2 PK)', 'cuci-ac-besar-15-2pk', 'Pembersihan menyeluruh unit indoor dan outdoor untuk kapasitas 1.5 sampai 2 PK.', 95000.00, 60, TRUE),
  (3, 1, 'Tambah Freon R32 / R410A', 'tambah-freon-r32-r410a', 'Pengisian refrigeran ramah lingkungan R32 atau R410A untuk mengembalikan tingkat kedinginan optimal.', 175000.00, 45, TRUE),
  (4, 1, 'Bongkar Pasang Unit AC', 'bongkar-pasang-ac', 'Jasa pembongkaran unit lama dan instalasi ke lokasi dinding baru termasuk vakum pipa.', 350000.00, 120, TRUE),

  -- Kategori 2: Kulkas
  (5, 2, 'Inspeksi & Diagnosis Kulkas', 'inspeksi-diagnosis-kulkas', 'Pengecekan kelistrikan, overload, relay PTC, thermostat, dan sistem sirkulasi freon kulkas.', 60000.00, 45, TRUE),
  (6, 2, 'Ganti Thermostat & Defrost Timer', 'ganti-thermostat-defrost', 'Penggantian komponen pengatur suhu atau timer defrost kulkas yang membeku tidak merata.', 180000.00, 60, TRUE),
  (7, 2, 'Isi Ulang Freon Kulkas + Flushing Pipa', 'isi-freon-kulkas-flushing', 'Pengelasan pentil, flushing pipa kapiler tersumbat, dan pengisian freon kulkas.', 250000.00, 90, TRUE),

  -- Kategori 3: Mesin Cuci
  (8, 3, 'Perbaikan Saluran Air & Selang Pembuangan', 'servis-saluran-air-mesin-cuci', 'Pembersihan filter inlet tersumbat atau penggantian solenoid water valve mesin cuci otomatis.', 120000.00, 45, TRUE),
  (9, 3, 'Ganti Fan Belt & Kapasitor Mesin Cuci', 'ganti-fan-belt-kapasitor', 'Penggantian tali kipas kendur atau kapasitor dinamo motor pemeras/pencuci.', 150000.00, 60, TRUE),
  (10, 3, 'Perbaikan Modul Elektronik PCB Mesin Cuci', 'servis-modul-pcb-mesin-cuci', 'Perbaikan jalur kelistrikan modul program mesin cuci digital yang mati total atau error kode.', 300000.00, 90, TRUE),

  -- Kategori 4: Pompa Air
  (11, 4, 'Servis Otomatis (Pressure Switch) & Tangki', 'servis-pressure-switch-pompa', 'Penggantian sakelar otomatis pompa air pendorong yang berbunyi cetak-cetek terus menerus.', 110000.00, 45, TRUE),
  (12, 4, 'Penggantian Seal Mekanikal & Impeller Pompa', 'ganti-seal-impeller-pompa', 'Mengatasi kebocoran air pada as motor atau putaran impeller yang aus/macet.', 190000.00, 75, TRUE),

  -- Kategori 5: TV & Elektronik
  (13, 5, 'Perbaikan TV LED Layar Gelap (Ganti Backlight)', 'ganti-backlight-tv-led', 'Penggantian strip lampu LED backlight TV yang suaranya ada namun layar gelap.', 275000.00, 90, TRUE),
  (14, 5, 'Perbaikan Power Supply TV Mati Total', 'servis-power-supply-tv', 'Pengecekan dan penggantian komponen IC/dioda/transistor switching power board TV.', 225000.00, 75, TRUE),

  -- Kategori 6: Dapur
  (15, 6, 'Perbaikan Dispenser Tidak Panas / Tidak Dingin', 'servis-dispenser-panas-dingin', 'Penggantian thermostat pemanas atau perbaikan relay sistem kompresor dispenser galon.', 135000.00, 60, TRUE)
ON DUPLICATE KEY UPDATE
  `category_id` = VALUES(`category_id`),
  `name` = VALUES(`name`),
  `base_price` = VALUES(`base_price`),
  `estimated_duration_min` = VALUES(`estimated_duration_min`),
  `is_active` = VALUES(`is_active`);

-- 3. Pengaturan Konfigurasi Sistem Dinamis (system_settings)
INSERT INTO `system_settings` (`setting_key`, `setting_value`, `value_type`, `group_name`, `description`)
VALUES
  ('platform_fee_fixed', '5000', 'number', 'fee', 'Biaya administrasi tetap per pesanan perbaikan (Rupiah).'),
  ('platform_fee_percent', '5', 'number', 'fee', 'Persentase komisi bagi hasil platform dari biaya jasa teknisi (%).'),
  ('max_search_radius_km', '25', 'number', 'dispatch', 'Radius maksimal pencocokan penugasan teknisi terdekat dari lokasi pelanggan (Km).'),
  ('technician_assignment_timeout_min', '15', 'number', 'dispatch', 'Batas waktu bagi teknisi untuk menerima atau menolak tawaran order otomatis sebelum dialihkan (Menit).'),
  ('warranty_period_days', '30', 'number', 'service', 'Masa garansi resmi standar pengerjaan servis BANTUIN setelah order selesai (Hari).'),
  ('ai_daily_free_quota', '0', 'number', 'ai', 'Batas kuota harian percakapan AI per pengguna. 0 = tanpa batas (kuota dinonaktifkan).'),
  ('ai_model_name', 'gemini-1.5-flash', 'string', 'ai', 'Model AI LLM default yang digunakan untuk inferensi diagnosis awal.'),
  ('complaint_auto_escalate_hours', '24', 'number', 'complaint', 'Batas waktu keluhan pelanggan wajib direspons oleh administrator (Jam).')
ON DUPLICATE KEY UPDATE
  `setting_value` = VALUES(`setting_value`),
  `value_type` = VALUES(`value_type`),
  `group_name` = VALUES(`group_name`),
  `description` = VALUES(`description`);

-- ==============================================================================
-- CATATAN PENTING KEAMANAN (ADMIN BOOTSTRAPPING):
-- Akun administrator tidak disertakan secara hardcoded pada seed SQL ini untuk
-- mencegah penyebaran kredensial baku / hash statis ke dalam repositori kode.
-- Pembuatan akun Admin perdana dilakukan melalui skrip CLI backend:
--   npm run seed:admin
-- dengan membaca environment variable ADMIN_EMAIL dan ADMIN_INITIAL_PASSWORD.
-- ==============================================================================
