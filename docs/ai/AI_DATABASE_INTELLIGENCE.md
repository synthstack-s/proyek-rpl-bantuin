# BANTUIN DATABASE INTELLIGENCE ENGINE

## 1. Ikhtisar

Database Intelligence Engine adalah komponen prioritas utama yang memungkinkan asisten AI BANTUIN membaca metadata basis data secara langsung, memahami skema serta relasi antar tabel, dan mengeksekusi kueri terparameterisasi (read-only) untuk menyajikan data aktual kepada pengguna dengan verifikasi bukti sebelum inferensi dikirimkan.

---

## 2. Introspeksi Skema Dinamis (`information_schema`)

Sistem tidak mengandalkan asumsi skema statis. Modul `src/lib/chatbot/db-intelligence/schema-discovery.ts` melakukan introspeksi otomatis langsung terhadap MySQL 8.0:
1. Membaca seluruh tabel (`information_schema.TABLES`).
2. Membaca metadata kolom (`information_schema.COLUMNS`): tipe data, `IS_NULLABLE`, `COLUMN_KEY`, dan `COLUMN_COMMENT`.
3. Membaca relasi foreign key (`information_schema.KEY_COLUMN_USAGE`).
4. Mendeteksi kolom sensitif secara otomatis dengan pola ekspresi reguler (`password`, `hash`, `token`, `secret`, `salt`, `otp`, `api_key`). Kolom tersebut ditandai dengan flag `isSensitive: true` dan diblokir dari proyeksi AI.
5. Caching dinamis dengan TTL 10 menit untuk mencegah overhead pada database produksi.

---

## 3. Katalog Backend Tools Berizin (Read-Only)

AI tidak diberikan izin menjalankan arbitrary SQL (`SELECT * ...`, `DROP ...`, dsb). Sebagai gantinya, AI menggunakan **Allowlist Tools** yang tervalidasi ketat:

| Nama Tool | Target Domain | Hak Akses Peran | Parameter Wajib |
| :--- | :--- | :--- | :--- |
| `searchDatabaseUsers` | Pencarian akun pengguna | Admin | `query` (phone/email/name/uuid) |
| `searchDatabaseOrders` | Pesanan perbaikan | Admin, Customer (milik sendiri), Teknisi (tugas sendiri) | `query` / `orderCode` |
| `searchDatabaseInvoices` | Tagihan invoice | Admin, Customer (milik sendiri) | `query` / `invoiceNumber` |
| `searchDatabaseTechnicians` | Profil mitra teknisi | Semua Peran | `query` / `categoryName` |
| `getCustomerProfile` | Profil pelanggan | Customer | (Disuntikkan otomatis dari sesi) |
| `getCustomerRepairs` | Riwayat pesanan pelanggan | Customer | `status`, `limit` |
| `getCustomerInvoices` | Tagihan pelanggan | Customer | `status` |
| `getTechnicianAssignedTasks` | Tugas perbaikan teknisi | Teknisi | `status`, `limit` |
| `getAdminOperationalOverview`| Statistik & Dashboard | Admin | - |
| `getAdminFinancialAnalytics` | Omzet & piutang invoice | Admin | - |

---

## 4. Evidence Validator & Anti-Hallucination Guard

Setiap kali AI memanggil database tool, hasil kueri dialirkan melalui `validateDatabaseEvidence`:
- Jika status kueri berhasil namun baris data kosong (`[]` atau `null`), status ditetapkan sebagai `DATA_UNAVAILABLE`.
- Sistem menyuntikkan fakta tegas ke konteks model bahwa **data tidak ditemukan** di basis data.
- Modul `anti-hallucination.ts` mengaudit respons final; jika model mencoba mengarang nama orang atau pesanan saat data kosong, respons otomatis disanitasi menjadi pemberitahuan faktual bahwa data tidak ditemukan.

