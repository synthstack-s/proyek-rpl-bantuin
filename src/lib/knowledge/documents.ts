/**
 * BANTUIN KNOWLEDGE ENGINE - OFFICIAL KNOWLEDGE DOCUMENTS
 * 
 * Kumpulan pustaka pengetahuan resmi mencakup 10 kategori wajib:
 * 1. Application Overview
 * 2. Feature Documentation
 * 3. Module Documentation
 * 4. Business Rules
 * 5. User Guide
 * 6. Workflow Documentation
 * 7. Role and Permission Documentation
 * 8. Database Relationship Documentation
 * 9. System Configuration Documentation
 * 10. Error Handling Documentation
 */

import { KnowledgeItem } from './types';

export const OFFICIAL_KNOWLEDGE_DOCUMENTS: KnowledgeItem[] = [
  // --------------------------------------------------------------------------
  // 1. APPLICATION OVERVIEW
  // --------------------------------------------------------------------------
  {
    slug: 'overview-bantuin-platform',
    title: 'Gambaran Umum Platform BANTUIN',
    category: 'application_overview',
    tags: ['bantuin', 'overview', 'aplikasi', 'layanan', 'elektronik'],
    summary: 'Platform servis elektronik rumah tangga terpadu berbasis web dengan mitra teknisi tersertifikasi.',
    content: `BANTUIN adalah platform layanan perbaikan dan perawatan peralatan elektronik rumah tangga terintegrasi di Indonesia.
Aplikasi ini menjembatani pelanggan rumah tangga yang mengalami kerusakan peralatan elektronik dengan mitra teknisi profesional tersertifikasi.

Kategori Peralatan yang Dilayani:
1. Pendingin Ruangan (AC): Servis cuci AC, perbaikan kebocoran freon, perbaikan kompresor, instalasi/bongkar pasang unit.
2. Lemari Es & Freezer: Kulkas 1 & 2 pintu, chiller, freezer box, perbaikan sistem defrost, motor kompresor, dan penggantian karet pintu.
3. Mesin Cuci & Pengering: Top loading, front loading, 2 tabung, perbaikan motor penggerak, drain pump, modul PCB, dan pembersihan tabung.
4. Pompa Air & Water Heater: Jet pump, pompa pendorong (booster), instalasi toren otomatis, water heater listrik, dan pemanas gas.
5. Televisi & Home Audio: Smart TV, LED/LCD TV, audio amplifier, speaker aktif, dan penggantian panel/backlight.
6. Peralatan Dapur Elektronik: Microwave, dispenser galon, blender, rice cooker/magic com, air fryer, oven listrik, dan kompor induksi.

Platform BANTUIN dibangun menggunakan teknologi modern:
- Frontend & Backend: Next.js 14+ (App Router), React, TypeScript, Tailwind CSS.
- Database: MySQL 8.0+ dengan engine InnoDB, full relational integrity (30 tabel).
- Authentication: Passwordless WhatsApp OTP via Fonnte Gateway & bcrypt/JWT sessions.
- AI Assistant: Multi-provider AI (Google Gemini, Groq, DeepSeek, OpenAI, OpenRouter) dengan enkripsi AES-256-GCM.`,
    source: 'BANTUIN Architecture Spec v2.0 - Core Overview',
    isActive: true,
  },

  // --------------------------------------------------------------------------
  // 2. FEATURE DOCUMENTATION
  // --------------------------------------------------------------------------
  {
    slug: 'features-core-platform',
    title: 'Dokumentasi Fitur Utama BANTUIN',
    category: 'feature_documentation',
    tags: ['fitur', 'chatbot', 'pemesanan', 'tracking', 'pembayaran', 'garansi'],
    summary: 'Daftar dan fungsi seluruh fitur inti yang dapat digunakan oleh pengguna BANTUIN.',
    content: `Fitur Utama Aplikasi BANTUIN:
1. Chatbot+ Database Assistant:
   - Konsultasi mandiri dan diagnosis awal kerusakan alat secara interaktif.
   - Analisis gejala kerusakan menghasilkan Kartu Diagnosis (Diagnosis Card) berisi ringkasan, estimasi biaya jasa, langkah aman, dan peringatan bahaya.
   - Konversi konsultasi menjadi pesanan perbaikan dalam 1 klik.
   - Akses data aktual database secara aman sesuai role pengguna.

2. Pemesanan Layanan (Repair Request):
   - Pemilihan kategori alat dan jenis paket servis atau diagnosis lapangan.
   - Input detail keluhan kerusakan, merk, tipe perangkat, dan upload foto kerusakan.
   - Penentuan alamat presisi dengan koordinat GPS (latitude/longitude) untuk matching teknisi terdekat.

3. Penugasan & Pelacakan Teknisi (Dispatch & Live Tracking):
   - Penugasan teknisi otomatis berdasarkan spesialisasi kategori dan jarak terdekat, atau penugasan manual oleh Admin.
   - Status pesanan terupdate secara real-time dari penugasan, jadwal kunjungan, teknisi menuju lokasi, inspeksi fisik, hingga perbaikan selesai.

4. Kamar Chat Privat Pesanan (In-App Order Chat):
   - Ruang obrolan langsung terisolasi antara Pelanggan dan Teknisi yang ditugaskan untuk koordinasi jadwal dan konfirmasi pengerjaan.

5. Tagihan Resmi & Pembayaran Digital (Digital Invoicing & Payments):
   - Rincian biaya transparan: biaya jasa teknisi, biaya suku cadang resmi, dan platform service fee.
   - Dukungan multi-metode: QRIS otomatis, Virtual Account Bank (BCA, Mandiri, BNI, BRI), dan Cash on Delivery (COD).

6. Garansi 30 Hari & Pengaduan (Warranty & Complaints):
   - Jaminan garansi perbaikan gratis selama 30 hari kalender setelah pengerjaan selesai.
   - Layanan pengaduan resmi (complaints) dengan kode tiket (CMP-...) jika hasil kerja tidak memuaskan.`,
    source: 'BANTUIN Product Feature Specification',
    isActive: true,
  },

  // --------------------------------------------------------------------------
  // 3. MODULE DOCUMENTATION
  // --------------------------------------------------------------------------
  {
    slug: 'modules-architecture-breakdown',
    title: 'Dokumentasi Modul Sistem BANTUIN',
    category: 'module_documentation',
    tags: ['modul', 'arsitektur', 'backend', 'auth', 'repair', 'finance', 'ai'],
    summary: 'Pembagian arsitektur modular BANTUIN dari autentikasi hingga AI provider management.',
    content: `Arsitektur BANTUIN terbagi menjadi 7 modul utama:
1. Modul Identitas & Autentikasi (src/lib/auth.ts):
   - Mengelola tabel users, user_otps, dan user_refresh_tokens.
   - Mendukung registrasi dan login OTP WhatsApp Fonnte (6 digit hash SHA-256).
   - Pengelolaan sesi JWT dengan cookies aman httpOnly (bantuin_admin_token dan bantuin_user_token).

2. Modul Profil & Katalog Layanan (src/lib/services/):
   - Mengelola tabel customer_profiles, technician_profiles, technician_documents, appliance_categories, services, technician_specializations.
   - Pengawasan verifikasi berkas legalitas dan sertifikasi kompetensi BNSP teknisi.

3. Modul Konsultasi AI (src/lib/chatbot/):
   - Mengelola tabel ai_consultation_sessions dan ai_chat_messages.
   - Menyediakan mesin diagnosis cerdas, validasi topik darurat, dan context management.

4. Modul Manajemen Pesanan (src/lib/repairs/):
   - Mengelola tabel repair_requests, repair_status_history, technician_assignments, technician_schedules, repair_diagnoses.
   - Mengontrol siklus hidup pengerjaan perbaikan unit secara menyeluruh.

5. Modul Komunikasi (src/lib/chat/):
   - Mengelola tabel repair_chat_rooms dan repair_chat_messages.
   - Kamar percakapan terisolasi khusus per ID pesanan.

6. Modul Keuangan & Pembayaran (src/lib/finance/):
   - Mengelola tabel invoices dan payments.
   - Pengawasan status settlement invoice dan pencatatan audit pembayaran tanpa menyimpan data kartu mentah.

7. Modul AI Provider Management (src/lib/ai/):
   - Mengelola tabel ai_provider_configs, ai_global_settings, ai_connection_test_logs, ai_usage_logs, ai_config_audit_logs.
   - Enkripsi AES-256-GCM, verifikasi SSRF, DNS pinning, active switcher, dan circuit breaker automatic fallback.`,
    source: 'BANTUIN System Architecture Document',
    isActive: true,
  },

  // --------------------------------------------------------------------------
  // 4. BUSINESS RULES
  // --------------------------------------------------------------------------
  {
    slug: 'business-rules-core',
    title: 'Aturan Bisnis & Kebijakan Operasional BANTUIN',
    category: 'business_rules',
    tags: ['aturan', 'bisnis', 'garansi', 'komisi', 'pembatalan', 'biaya'],
    summary: 'Aturan bisnis mutlak mengenai garansi 30 hari, pembagian komisi, biaya platform, dan pembatalan.',
    content: `Aturan Bisnis Resmi Platform BANTUIN:
1. Kebijakan Garansi 30 Hari:
   - Masa garansi berlaku selama 30 hari kalender terhitung sejak status pesanan berubah menjadi 'completed'.
   - Garansi mencakup servis ulang gratis jika kerusakan atau gejala yang sama muncul kembali pada unit yang sama.
   - Garansi tidak berlaku jika unit dibongkar oleh pihak ketiga di luar teknisi resmi BANTUIN atau terjadi bencana alam/kelalaian penggunaan (arus pendek eksternal, tersiram air).

2. Skema Biaya & Pembagian Komisi:
   - Total Biaya Pesanan = Biaya Jasa Teknisi (Labor) + Biaya Suku Cadang (Parts) + Biaya Layanan Platform (Service Fee) - Diskon.
   - Biaya Layanan Platform (Platform Fee): Standar Rp 10.000 - Rp 15.000 per transaksi berhasil untuk operasional sistem dan proteksi garansi.
   - Bagi Hasil Teknisi: Mitra teknisi menerima 80% - 85% dari total biaya jasa perbaikan, 15% - 20% menjadi pendapatan platform. Biaya suku cadang dibayarkan 100% untuk penggantian komponen.

3. Ketentuan Persetujuan Biaya (Cost Approval):
   - Teknisi WAJIB mengisi laporan diagnosis fisik (repair_diagnoses) dan menginput estimasi biaya sebelum memulai perbaikan besar.
   - Status pesanan tidak dapat beralih ke 'in_repair' sebelum Pelanggan menyetujui (customer_approval = 'approved') rincian estimasi tersebut di aplikasi.

4. Kebijakan Pembatalan Pesanan:
   - Pelanggan dapat membatalkan pesanan secara gratis jika status masih 'submitted' atau 'assigned' sebelum teknisi bergerak (on_the_way).
   - Jika pembatalan dilakukan setelah teknisi tiba di lokasi atau setelah diagnosis lapangan selesai, dikenakan biaya kompensasi transportasi diagnosis standar (Rp 35.000 - Rp 50.000).

5. Keamanan & Integritas Akun:
   - Akun teknisi berstatus 'pending' belum dapat menerima penugasan sampai diverifikasi oleh Administrator.
   - Rating teknisi dihitung otomatis dari rata-rata ulasan bintang 1-5 pelanggan setelah pesanan berstatus 'completed'.`,
    source: 'BANTUIN Operational Business Rules Handbook',
    isActive: true,
  },

  // --------------------------------------------------------------------------
  // 5. USER GUIDE
  // --------------------------------------------------------------------------
  {
    slug: 'user-guide-customer-technician-admin',
    title: 'Panduan Pengguna (Customer, Teknisi & Admin)',
    category: 'user_guide',
    tags: ['panduan', 'tutorial', 'customer', 'teknisi', 'admin', 'cara-pakai'],
    summary: 'Langkah-langkah penggunaan aplikasi BANTUIN untuk semua peran pengguna.',
    content: `Panduan Penggunaan Aplikasi BANTUIN:

A. Panduan Pelanggan (Customer):
1. Registrasi & Login:
   - Masukkan nomor WhatsApp aktif pada halaman Masuk/Daftar.
   - Masukkan 6-digit kode OTP yang diterima via WhatsApp Fonnte.
   - Lengkapi nama dan alamat domisili di profil akun.
2. Melakukan Konsultasi & Diagnosis:
   - Buka widget 'Tanya AI' atau halaman Konsultasi AI.
   - Ceritakan keluhan perangkat elektronik Anda (misal: "AC indoor saya bocor air").
   - AI akan memberikan analisis gejala, langkah aman, dan perkiraan biaya.
   - Klik 'Pesan Teknisi Sekarang' untuk otomatis mengisi form pesanan dari hasil konsultasi.
3. Memesan Layanan Langsung:
   - Klik 'Pesan Layanan' dari halaman utama atau katalog.
   - Pilih kategori alat, masukkan keluhan, foto kerusakan, dan alamat lengkap.
   - Sistem akan mencocokkan teknisi terdekat yang kompeten.
4. Pembayaran & Ulasan:
   - Setelah pekerjaan selesai dan disetujui, buka invoice resmi.
   - Bayar via QRIS otomatis atau Transfer Virtual Account.
   - Berikan ulasan bintang 1-5 dan ulasan untuk mitra teknisi.

B. Panduan Mitra Teknisi:
1. Pendaftaran & Verifikasi:
   - Daftar sebagai peran Teknisi, unggah sertifikat kompetensi/keahlian dan dokumen identitas.
   - Tunggu verifikasi berkas oleh Administrator.
2. Menerima Tugas:
   - Pantau dashboard teknisi untuk tawaran tugas baru (status: offered).
   - Klik 'Terima Tugas' untuk mengonfirmasi kesiapan.
3. Kunjungan & Diagnosis:
   - Klik 'Menuju Lokasi' saat berangkat ke rumah pelanggan.
   - Lakukan inspeksi fisik, input kerusakan dan estimasi biaya sparepart di aplikasi.
   - Minta persetujuan pelanggan di aplikasi sebelum mulai memperbaiki.
4. Penyelesaian:
   - Setelah unit diuji coba berfungsi baik, ubah status menjadi 'completed'.

C. Panduan Administrator:
1. Monitoring Operasional:
   - Buka Admin Console (/admin) untuk memantau ringkasan pesanan, keterlambatan, dan beban kerja teknisi.
2. Verifikasi Mitra:
   - Buka menu 'Verifikasi Teknisi' untuk meninjau sertifikat dan menyetujui akun teknisi.
3. Pengaturan AI & Sistem:
   - Buka menu 'Konfigurasi Sistem' -> 'AI Provider Management' untuk mengelola API keys (Gemini, Groq, DeepSeek), active switcher, fallback engine, dan playground testing.`,
    source: 'BANTUIN Official User Manual 2026',
    isActive: true,
  },

  // --------------------------------------------------------------------------
  // 6. WORKFLOW DOCUMENTATION
  // --------------------------------------------------------------------------
  {
    slug: 'workflow-order-lifecycle',
    title: 'Dokumentasi Alur Kerja (Workflow) Siklus Pesanan',
    category: 'workflow_documentation',
    tags: ['workflow', 'alur', 'status', 'siklus', 'tahapan'],
    summary: 'Diagram alur dan transisi status perbaikan dari pengajuan awal hingga garansi.',
    content: `Alur Hidup Pesanan Perbaikan BANTUIN (Order Lifecycle):

Tahapan Siklus Pesanan:
1. [draft] -> Pesanan sedang dirancang oleh pelanggan namun belum disubmit.
2. [submitted] -> Pesanan berhasil diajukan dan masuk ke antrean pencarian teknisi (Unassigned).
3. [assigned] -> Teknisi telah ditugaskan (manual admin atau auto matching sistem) dan menerima penugasan.
4. [scheduled] -> Jadwal tanggal dan slot waktu kunjungan telah disepakati bersama pelanggan.
5. [in_diagnosis] -> Teknisi telah tiba di lokasi pelanggan dan sedang melakukan inspeksi fisik unit.
6. [estimated] -> Teknisi telah menginput laporan kerusakan, estimasi biaya sparepart & ongkos jasa di aplikasi.
7. [customer_approved] -> Pelanggan telah meninjau dan menyetujui rincian estimasi biaya pengerjaan.
8. [in_repair] -> Teknisi sedang melakukan tindakan perbaikan dan penggantian suku cadang.
9. [completed] -> Unit selesai diperbaiki, dites normal di depan pelanggan, invoice resmi diterbitkan, dan masa garansi 30 hari aktif.

Alur Sengketa & Penghentian:
- [cancelled] -> Dibatalkan oleh pelanggan atau admin (hanya sebelum in_repair).
- [complained] -> Pelanggan mengajukan klaim garansi atau aduan pelayanan dalam masa 30 hari pasca completed.

Audit Status: Setiap transisi status dicatat otomatis di tabel repair_status_history dengan merekam user ID aktor, peran, stempel waktu, dan catatan perubahan.`,
    source: 'BANTUIN Standard Operating Procedure - Order Workflow',
    isActive: true,
  },

  // --------------------------------------------------------------------------
  // 7. ROLE AND PERMISSION DOCUMENTATION
  // --------------------------------------------------------------------------
  {
    slug: 'roles-and-permissions-matrix',
    title: 'Dokumentasi Peran & Matriks Hak Akses (RBAC)',
    category: 'role_permission_documentation',
    tags: ['role', 'permission', 'rbac', 'hak-akses', 'keamanan', 'privasi'],
    summary: 'Spesifikasi hak akses pengguna untuk Guest, Customer, Teknisi, dan Administrator.',
    content: `Matriks Hak Akses Berbasis Peran (Role-Based Access Control):

1. Guest (Pengguna Publik / Tamu):
   - Akses: Hanya data publik katalog kategori alat (appliance_categories), daftar paket servis (services), panduan umum aplikasi, dan konsultasi diagnosis kerusakan awal.
   - Larangan: Dilarang mengakses data profil, riwayat pesanan, invoice, atau identitas pengguna lain.

2. Customer (Pelanggan Terdaftar):
   - Akses: Profil pribadi sendiri, riwayat pesanan perbaikan milik sendiri (customer_id = session.userId), kamar chat pesanan aktif milik sendiri, tagihan invoice milik sendiri, form ulasan pesanan sendiri, dan klaim garansi/komplain sendiri.
   - Larangan: Dilarang melihat data pesanan, nomor telepon, alamat, atau invoice pelanggan lain (Perlindungan Anti-IDOR ketat).

3. Technician (Mitra Teknisi Terverifikasi):
   - Akses: Profil teknisi sendiri, metrik kinerja pribadi (tugas selesai, rating), daftar penugasan aktif yang ditugaskan kepadanya (technician_id = session.userId), jadwal kunjungan, alamat dan kontak pelanggan dari pesanan yang sedang ditangani, form input diagnosis & estimasi biaya, chat dengan pelanggan tugas terkait.
   - Larangan: Dilarang melihat tugas atau pendapatan teknisi lain, dilarang mengakses modul administrasi sistem global.

4. Administrator (Pengelola Platform BANTUIN):
   - Akses: Seluruh data sistem (pengguna, teknisi, pesanan, invoice, pembayaran, komplain, log audit, konfigurasi sistem, konfigurasi AI provider).
   - Pengamanan: Seluruh tindakan sensitif admin (verifikasi berkas, override status, perubahan setting) dicatat permanen dalam admin_audit_logs (immutable append-only).`,
    source: 'BANTUIN Security & Access Control Policy',
    isActive: true,
  },

  // --------------------------------------------------------------------------
  // 8. DATABASE RELATIONSHIP DOCUMENTATION
  // --------------------------------------------------------------------------
  {
    slug: 'database-relationships-erd',
    title: 'Dokumentasi Relasi Basis Data (Database Relationships & ERD)',
    category: 'database_relationship_documentation',
    tags: ['database', 'erd', 'relasi', 'foreign-key', 'schema', 'tabel'],
    summary: 'Struktur relasi dan integritas referensial 30 tabel basis data MySQL 8.0 BANTUIN.',
    content: `Pemetaan Relasi Entitas Basis Data BANTUIN (MySQL 8.0):

Kelompok Entitas Utama:
1. users (1) -> customer_profiles (1) [FK: user_id]
2. users (1) -> technician_profiles (1) [FK: user_id]
3. technician_profiles (1) -> technician_documents (N) [FK: technician_profile_id]
4. appliance_categories (1) -> services (N) [FK: category_id]
5. technician_profiles (N) <-> appliance_categories (N) melalui technician_specializations
6. users (customer) (1) -> repair_requests (N) [FK: customer_id]
7. appliance_categories (1) -> repair_requests (N) [FK: category_id]
8. services (1) -> repair_requests (N) [FK: service_id, category_id] (Composite FK Guarantee)
9. repair_requests (1) -> repair_status_history (N) [FK: repair_request_id]
10. repair_requests (1) -> technician_assignments (N) [FK: repair_request_id]
11. users (technician) (1) -> technician_assignments (N) [FK: technician_id]
12. repair_requests (1) -> technician_schedules (N) [FK: repair_request_id]
13. repair_requests (1) -> repair_diagnoses (1) [FK: repair_request_id]
14. repair_requests (1) -> repair_chat_rooms (1) -> repair_chat_messages (N)
15. repair_requests (1) -> invoices (1) -> payments (N) [FK: invoice_id]
16. repair_requests (1) -> repair_reviews (1) [FK: repair_request_id]
17. repair_requests (1) -> repair_complaints (N) [FK: repair_request_id]
18. ai_consultation_sessions (1) -> ai_chat_messages (N) [FK: session_id]
19. ai_consultation_sessions (1) -> repair_requests (N) [FK: ai_session_id]

Integritas Keamanan Database:
- Strict Foreign Keys (ON UPDATE CASCADE / ON DELETE RESTRICT untuk data finansial dan pesanan).
- Sensitive Column Isolation: Kolom password_hash, otp_hash, token_hash ditandai 'isSensitive: true' dan diblokir dari transmisi AI.`,
    source: 'BANTUIN Database Schema & Data Dictionary v2.0',
    isActive: true,
  },

  // --------------------------------------------------------------------------
  // 9. SYSTEM CONFIGURATION DOCUMENTATION
  // --------------------------------------------------------------------------
  {
    slug: 'system-settings-configuration',
    title: 'Dokumentasi Konfigurasi Sistem (System Settings)',
    category: 'system_configuration_documentation',
    tags: ['konfigurasi', 'settings', 'parameter', 'fee', 'radius', 'komisi'],
    summary: 'Daftar parameter konfigurasi dinamis dalam tabel system_settings dan dampaknya.',
    content: `Parameter Konfigurasi Sistem BANTUIN (Tabel system_settings):

1. fee.platform_fixed_fee (Default: 10000)
   - Deskripsi: Biaya tetap administrasi platform BANTUIN per transaksi invoice resmi (dalam Rupiah).
2. fee.technician_commission_percent (Default: 15)
   - Deskripsi: Persentase bagi hasil pendapatan jasa yang dialokasikan untuk operasional platform BANTUIN (%).
3. dispatch.max_search_radius_km (Default: 15)
   - Deskripsi: Radius maksimal pencarian teknisi terdekat dari koordinat alamat pelanggan (kilometer).
4. dispatch.assignment_timeout_minutes (Default: 30)
   - Deskripsi: Batas waktu respons teknisi untuk menerima atau menolak tawaran pesanan sebelum dialihkan.
5. service.warranty_period_days (Default: 30)
   - Deskripsi: Durasi masa berlaku garansi servis resmi BANTUIN setelah pesanan berstatus completed (hari).
6. service.cancellation_penalty_fee (Default: 35000)
   - Deskripsi: Biaya penggantian transportasi diagnosa jika pembatalan dilakukan setelah teknisi tiba di lokasi.
7. auth.otp_expiry_seconds (Default: 300)
   - Deskripsi: Masa berlaku kode OTP WhatsApp Fonnte (5 menit).
8. ai.max_guest_consultation_messages (Default: 15)
   - Deskripsi: Batas maksimal pertukaran pesan AI untuk pengguna tamu sebelum diarahkan untuk login/register.`,
    source: 'BANTUIN System Configuration Reference',
    isActive: true,
  },

  // --------------------------------------------------------------------------
  // 10. ERROR HANDLING DOCUMENTATION
  // --------------------------------------------------------------------------
  {
    slug: 'error-handling-and-safety-protocols',
    title: 'Dokumentasi Penanganan Error & Protokol Keselamatan',
    category: 'error_handling_documentation',
    tags: ['error', 'keselamatan', 'darurat', 'circuit-breaker', 'fallback'],
    summary: 'Protokol penanganan kesalahan sistem, circuit breaker AI, dan prosedur darurat bahaya listrik/api/gas.',
    content: `Protokol Penanganan Error & Keselamatan Kerja BANTUIN:

1. Protokol Bahaya Keselamatan Tinggi (Safety Hazard Protocol):
   - Jika pengguna melaporkan bau hangus, percikan api, ledakan, asap keluar, kabel meleleh, bau gas berdesis, atau sengatan listrik/kesetrum:
   - AI Assistant WAJIB menyisipkan PERINGATAN KESELAMATAN DARURAT di bagian paling atas respons:
     1. Segera matikan sumber listrik utama rumah (MCB kWh meter).
     2. JANGAN menyentuh atau membongkar perangkat yang panas/berasap/kena air.
     3. Evakuasi area dari bahan mudah terbakar dan jauhkan anak-anak.
     4. Wajibkan penanganan langsung oleh teknisi profesional tersertifikasi.

2. Protokol Circuit Breaker & Automatic Fallback AI:
   - Ambang Batas Kegagalan: 3x kegagalan berturut-turut pada provider utama (Gemini/Groq/dll).
   - Durasi Cooldown: 30-60 detik.
   - Fallback Otomatis: Sistem secara transparan beralih ke provider cadangan (Groq/OpenAI/dsb) atau ke BANTUIN Deterministic Expert System jika semua cloud provider offline.
   - Tidak ada penghentian layanan chatbot bagi pengguna akhir.

3. Protokol Penanganan Data Kosong (Empty Data Handling):
   - Jika query database mengembalikan 0 hasil (misal pengguna belum memiliki pesanan, atau nomor invoice tidak ditemukan):
   - AI DILARANG mengarang nama pengguna atau status palsu.
   - AI harus menjelaskan secara sopan dan faktual bahwa data yang dicari belum tercatat di database, serta memberikan arahan cara membuat atau memeriksa data tersebut.

4. Protokol Akses Ditolak (Unauthorized Access):
   - Jika pengguna meminta data yang bukan hak miliknya (misal Pelanggan meminta data pengguna lain atau nomor telepon customer lain):
   - AI DILARANG mengeksekusi query pencarian orang lain.
   - AI harus menjelaskan pembatasan akses data sesuai prinsip privasi UU PDP dan menganjurkan login jika pengguna berstatus guest.`,
    source: 'BANTUIN Operational Safety & Incident Response Protocol',
    isActive: true,
  },
];
