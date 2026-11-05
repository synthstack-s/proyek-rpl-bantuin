# ROLE & PERMISSION MAPPING - BANTUIN AI DATABASE ASSISTANT

Dokumen ini memetakan batasan hak akses (*permission boundaries*), isolasi kepemilikan data baris (*Row-Level Security / Authorization*), serta pemetaan fungsionalitas (*Allowlist Tools*) yang dapat dieksekusi oleh AI Database Assistant untuk masing-masing peran pengguna pada sistem aplikasi **BANTUIN**.

---

## 1. Prinsip Utama Otorisasi

1. **Zero Trust Prompting**: Peran pengguna (*role*) dan identitas (`userId`) **TIDAK PERNAH** dipercayai dari input prompt atau payload permintaan yang dapat dimanipulasi klien. Sumber kebenaran selalu berasal dari sesi server terenkripsi (`HttpOnly` cookie via JWT `verifyUserToken` atau `verifyAdminToken`).
2. **Row-Level Authorization (RLA)**: Pengguna hanya dapat mengakses baris data yang secara sah terhubung dengan identitas akun miliknya sendiri (`user_id = auth.userId` atau `technician_id = auth.userId`).
3. **No Direct SQL Execution**: Gemini API tidak memiliki koneksi SQL langsung dan tidak diizinkan mengeksekusi sintaks `SELECT`, `UPDATE`, `INSERT`, atau `DELETE` bebas. Seluruh akses database dieksekusi melalui **Allowlist Data Service Functions** yang menggunakan *Parameterized Queries*.
4. **Data Masking & Sanitization**: Kolom kredensial (`password_hash`, `otp_hash`, `token_hash`, API secrets) tidak pernah disertakan dalam query database yang disediakan untuk AI Assistant.

---

## 2. Matriks Hak Akses Berbasis Peran

| Tabel / Entitas Basis Data | Guest (Tamu) | Customer (Pelanggan) | Technician (Teknisi) | Admin (Administrator) |
| :--- | :---: | :---: | :---: | :---: |
| `appliance_categories` | ✅ Read (Publik) | ✅ Read (Publik) | ✅ Read (Publik) | ✅ Read & Manage |
| `services` (Katalog) | ✅ Read (Publik) | ✅ Read (Publik) | ✅ Read (Publik) | ✅ Read & Manage |
| `customer_profiles` | ❌ Ditolak | ✅ Milik Sendiri | ⚠️ Terbatas Tugas Aktif | ✅ Seluruh Pelanggan |
| `technician_profiles` | ✅ Info Publik (Rating) | ✅ Info Publik | ✅ Milik Sendiri | ✅ Seluruh Teknisi |
| `technician_documents` | ❌ Ditolak | ❌ Ditolak | ✅ Milik Sendiri | ✅ Audit & Verifikasi |
| `repair_requests` | ❌ Ditolak | ✅ Milik Sendiri | ⚠️ Ditugaskan Kepadanya | ✅ Seluruh Pesanan |
| `repair_status_history` | ❌ Ditolak | ✅ Pesanan Sendiri | ⚠️ Tugas Sendiri | ✅ Seluruh Pesanan |
| `technician_assignments`| ❌ Ditolak | ⚠️ Teknisi Ditugaskan | ✅ Penugasan Sendiri | ✅ Seluruh Penugasan |
| `technician_schedules` | ❌ Ditolak | ✅ Jadwal Pesanan Sendiri | ✅ Jadwal Tugas Sendiri | ✅ Seluruh Jadwal |
| `repair_diagnoses` | ❌ Ditolak | ✅ Diagnosa Pesanan Sendiri| ✅ Diagnosa Tugas Sendiri | ✅ Seluruh Diagnosa |
| `repair_chat_rooms` & `messages` | ❌ Ditolak | ✅ Kamar Pesanan Sendiri | ✅ Kamar Tugas Sendiri | ⚠️ Audit Investigasi |
| `invoices` | ❌ Ditolak | ✅ Invoice Pesanan Sendiri | ⚠️ Invoice Tugas Sendiri | ✅ Seluruh Invoice |
| `payments` | ❌ Ditolak | ✅ Status Pembayaran Sendiri| ❌ Ditolak | ✅ Rekonsiliasi Finansial |
| `repair_reviews` | ✅ Ulasan Publik | ✅ Ulasan Diberikan | ✅ Ulasan Diterima | ✅ Seluruh Ulasan |
| `repair_complaints` | ❌ Ditolak | ✅ Komplain Milik Sendiri | ⚠️ Terkait Tugasnya | ✅ Kelola & Resolusi |
| `system_settings` | ❌ Ditolak | ❌ Ditolak | ❌ Ditolak | ✅ Pengaturan Sistem |
| `admin_audit_logs` | ❌ Ditolak | ❌ Ditolak | ❌ Ditolak | ✅ Jejak Rekam Sistem |
| `users` (Kredensial) | ❌ Ditolak | ❌ Ditolak (Kecuali info profil publik) | ❌ Ditolak (Kecuali info profil publik) | ⚠️ Terbatas tanpa hash |

---

## 3. Rincian Kebijakan Tiap Peran

### A. CUSTOMER (Pelanggan)

#### Lingkup Izin:
- Membaca data profil pengguna sendiri (`users`, `customer_profiles`).
- Membaca riwayat seluruh pesanan miliknya (`repair_requests`, `repair_status_history`).
- Membaca perkembangan perbaikan, identitas teknisi resmi yang menangani pesanannya, dan nomor kontak teknisi untuk pesanan aktif.
- Membaca diagnosa kerusakan resmi dan rincian estimasi biaya pengerjaan/komponen (`repair_diagnoses`).
- Membaca catatan atau pesan koordinasi pada pesanan (`repair_chat_messages`).
- Membaca tagihan invoice resmi (`invoices`) dan riwayat pembayaran (`payments`).
- Membaca ulasan yang pernah ia berikan (`repair_reviews`) dan pengaduan garansi miliknya (`repair_complaints`).
- Membaca informasi katalog publik dan panduan aplikasi.

#### Batasan Keras (*Strict Boundaries*):
- ❌ Tidak boleh melihat atau mencari pesanan milik pelanggan lain (Pencegahan IDOR).
- ❌ Tidak boleh melihat rekapitulasi keuangan internal atau transaksi pengguna lain.
- ❌ Tidak boleh mengakses konfigurasi sistem atau statistik admin.
- ❌ Tidak boleh melihat dokumen legalitas internal teknisi selain rating publik.

#### Allowlist Tools untuk Customer:
1. `getCustomerProfile(userId)`
2. `getCustomerRepairs(userId, filters)`
3. `getCustomerRepairDetail(userId, orderCodeOrId)`
4. `getCustomerRepairDiagnosis(userId, repairId)`
5. `getCustomerRepairTimeline(userId, repairId)`
6. `getCustomerInvoices(userId, filters)`
7. `getCustomerComplaints(userId)`
8. `getPublicCatalog()`
9. `getAppGuide(topic)`

---

### B. TECHNICIAN (Teknisi)

#### Lingkup Izin:
- Membaca data profil teknisi sendiri, masa pengalaman, dan rating performa (`technician_profiles`).
- Membaca daftar penugasan aktif, penugasan mendekati batas waktu, dan penugasan yang telah selesai (`technician_assignments`).
- Membaca detail alamat dan nomor telepon pelanggan **HANYA** untuk pesanan yang sah ditugaskan kepadanya (`repair_requests`, `customer_profiles`).
- Membaca riwayat keluhan pelanggan, catatan diagnosis, dan estimasi biaya pada pesanan miliknya (`repair_diagnoses`).
- Membaca jadwal kunjungan harian miliknya (`technician_schedules`).
- Membaca ulasan bintang dan testimoni dari pelanggan atas hasil kerjanya (`repair_reviews`).
- Mengakses SOP teknis BANTUIN (SOP penerimaan unit, keselamatan MCB/listrik, penanganan freon, garansi 30 hari).
- **Action Intelligence**: Memperbarui status penugasan (`accept`, `on_the_way`, `start_diagnosis`, `start_repair`) dan mencatat laporan pekerjaan dengan validasi kepemilikan.

#### Batasan Keras (*Strict Boundaries*):
- ❌ Tidak boleh mengakses penugasan atau data teknisi lain tanpa izin penugasan resmi.
- ❌ Tidak boleh membaca seluruh basis data pelanggan di luar tugas aktifnya.
- ❌ Tidak boleh melihat laporan keuangan platform atau pembagian komisi global admin.
- ❌ Tidak boleh mengubah status tugas yang bukan merupakan tanggung jawabnya.

#### Allowlist Tools untuk Teknisi:
1. `getTechnicianProfile(userId)`
2. `getTechnicianAssignedTasks(userId, filters)`
3. `getTechnicianTaskDetail(userId, taskIdOrOrderCode)`
4. `getTechnicianSchedules(userId, date)`
5. `getTechnicianPerformanceMetrics(userId)`
6. `getTechnicianTaskDiagnosis(userId, repairId)`
7. `executeTechnicianTaskAction(userId, taskId, actionPayload)` (Action Intelligence)
8. `getAppGuide(topic)`

---

### C. ADMIN (Administrator)

#### Lingkup Izin:
- Membaca ringkasan operasional harian dan bulanan seluruh sistem BANTUIN.
- Membaca statistik dan pertumbuhan pengguna berdasarkan peran (`admin`, `customer`, `technician`).
- Membaca pemantauan pesanan perbaikan, pesanan yang belum mendapatkan teknisi (*unassigned*), serta pesanan yang mengalami keterlambatan (*delayed repairs*).
- Membaca analisis performa teknisi (rata-rata waktu penyelesaian, rating rata-rata, beban kerja aktif).
- Membaca laporan transaksi keuangan, total invoice lunas, invoice tertunggak, dan sebaran metode pembayaran.
- Membaca status kesehatan sistem: status database, status kuota/konektivitas Gemini API, dan riwayat pengiriman OTP WhatsApp Fonnte.
- Membaca konfigurasi dinamis aplikasi BANTUIN (`system_settings`).
- Membaca jejak rekam audit admin (`admin_audit_logs`).
- **Action Intelligence**: Menghasilkan ringkasan laporan operasional formal (*executive summary snapshot*).

#### Batasan Keras (*Strict Boundaries*):
- ❌ **TIDAK PERNAH** menampilkan password hash, token, atau secret keys.
- ❌ Tidak boleh menjalankan perintah DDL/DML sembarangan yang dapat merusak integritas basis data.
- ❌ Tindakan operasional sensitif wajib melalui konfirmasi dua langkah dan tercatat di `admin_audit_logs`.

#### Allowlist Tools untuk Admin:
1. `getAdminOverview()`
2. `getAdminUserStats()`
3. `getAdminSystemSettings()`
4. `getAdminOrderAnalytics(filters)`
5. `getAdminDelayedRepairs()`
6. `getAdminTechnicianWorkload()`
7. `getAdminFinancialAnalytics(filters)`
8. `getAdminRecentAuditLogs(limit)`
9. `getAdminSystemHealth()`
10. `getAdminComplaintsList(status)`

---

### D. GUEST (Tamu Publik)

#### Lingkup Izin:
- Membaca profil resmi platform BANTUIN, visi, dan jam operasional.
- Membaca daftar 6 kategori peralatan rumah tangga yang dilayani (AC, Kulkas, Mesin Cuci, Pompa Air/Water Heater, TV/Audio, Elektronik Dapur).
- Membaca katalog layanan dan perkiraan tarif dasar transparan.
- Membaca alur pemesanan teknisi, prosedur pendaftaran via nomor WhatsApp dan verifikasi OTP.
- Membaca informasi kebijakan perlindungan garansi resmi 30 hari BANTUIN.
- Melakukan konsultasi mandiri gejala kerusakan awal peralatan (*Preliminary Diagnosis*).

#### Batasan Keras (*Strict Boundaries*):
- ❌ Ditolak mutlak membaca seluruh data profil pengguna, transaksi, pesanan, tagihan, atau konfigurasi internal.
- ❌ Tidak memiliki akses ke data operasional teknisi maupun admin.

#### Allowlist Tools untuk Guest:
1. `getPublicCatalog()`
2. `getPublicApplianceCategories()`
3. `getAppGuide(topic)`
4. `getPublicTechnicianReviews(technicianId)`

