# PANDUAN PENGELOLAAN DATABASE BANTUIN (`bantuin_db`)

Dokumen ini adalah panduan teknis operasional untuk menyiapkan, menjalankan, memverifikasi, dan merawat database **MySQL 8.0** untuk aplikasi **BANTUIN** pada lingkungan pengembangan Windows.

---

## 1. Persyaratan Sistem

- **DBMS**: MySQL Server 8.0.x (disarankan MySQL 8.0 Community Server resmi).
- **Service Windows**: Pastikan service `MySQL80` berstatus **Running**.
- **Port Default**: `3306`.
- **Character Set**: `utf8mb4` dengan Collation `utf8mb4_unicode_ci`.
- **Storage Engine**: `InnoDB`.

---

## 2. Struktur File Database

```text
c:\proyek\BANTUIN\
├── database\
│   ├── schema.sql      # DDL Lengkap: Database, 25 Tabel, Constraint, dan Indeks
│   ├── seed.sql        # DML Awal: Kategori, Layanan Standar, dan System Settings
│   └── README.md       # Panduan Instalasi dan Operasional Database
└── .env.example        # Template Variabel Lingkungan
```

---

## 3. Langkah Instalasi Database di Windows

### Langkah 3.1: Buka Terminal (PowerShell atau Command Prompt)

Jika binary MySQL belum terdaftar pada *system PATH*, Anda dapat menggunakan path absolut default instalasi MySQL 8.0:
```powershell
# Path default instalasi MySQL 8.0 di Windows
$MYSQL = "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe"
```

### Langkah 3.2: Eksekusi Skrip Skema (`schema.sql`)

Jalankan perintah berikut untuk membuat database `bantuin_db` beserta seluruh tabel dan relasinya:
```powershell
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p < "c:\proyek\BANTUIN\database\schema.sql"
```
*Sistem akan meminta input password root MySQL lokal Anda.*

### Langkah 3.3: Eksekusi Data Awal (`seed.sql`)

Setelah skema berhasil terpasang, masukkan data katalog master awal:
```powershell
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p < "c:\proyek\BANTUIN\database\seed.sql"
```

---

## 4. Verifikasi dan Pemeriksaan Hasil Instalasi

Untuk memastikan seluruh 25 tabel dan data awal berhasil terbentuk tanpa ada yang tertinggal:

### 4.1. Masuk ke MySQL Shell
```powershell
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p bantuin_db
```

### 4.2. Periksa Daftar Tabel
Jalankan query SQL berikut di dalam prompt MySQL:
```sql
SHOW TABLES;
```
*Pastikan menampilkan tepat 25 tabel.*

### 4.3. Verifikasi Jumlah Data Awal
```sql
SELECT 'appliance_categories' AS tabel, COUNT(*) AS total FROM appliance_categories
UNION ALL
SELECT 'services', COUNT(*) FROM services
UNION ALL
SELECT 'system_settings', COUNT(*) FROM system_settings;
```
Hasil yang diharapkan:
- `appliance_categories`: 6 kategori.
- `services`: 15 layanan dasar.
- `system_settings`: 8 parameter konfigurasi.

---

## 5. Integrasi Backend (Node.js & TypeScript)

Saat backend diinisialisasi, koneksi ke database dikelola menggunakan connection pool (`mysql2/promise`):

```typescript
// src/config/database.ts
import mysql from 'mysql2/promise';

export const dbPool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'bantuin_db',
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT) || 20,
  queueLimit: 0,
  timezone: '+07:00',
  decimalNumbers: true
});
```

---

## 6. Penanganan Kendala Umum (Troubleshooting)

### Kendala 1: `ERROR 1045 (28000): Access denied for user 'root'@'localhost'`
- **Penyebab**: Password root yang Anda masukkan salah atau belum ditentukan saat instalasi MySQL.
- **Solusi**: Periksa kembali password saat instalasi MySQL Server, atau atur ulang password root via MySQL Installer / safe mode.

### Kendala 2: Port 3306 Bentrok (Conflict)
- **Penyebab**: Terdapat instance database lain (misal MySQL bawaan XAMPP atau Laragon) yang sudah menduduki port 3306 sebelum Windows Service `MySQL80` berjalan.
- **Solusi**: Matikan MySQL di control panel XAMPP/Laragon, lalu pastikan service Windows `MySQL80` berjalan normal melalui:
  ```powershell
  Start-Service -Name MySQL80
  ```

### Kendala 3: `ERROR 3819 (HY000): Check constraint 'chk_reviews_rating_range' is violated`
- **Penyebab**: Mencoba memasukkan nilai rating di luar rentang 1–5.
- **Solusi**: Ini adalah perlindungan database aktif yang normal. Pastikan payload rating dari klien bernilai bilangan bulat antara 1 hingga 5.

### Kendala 4: `ERROR 1452 (23000): Cannot add or update a child row: a foreign key constraint fails`
- **Penyebab**: Memasukkan `service_id` yang tidak sesuai dengan `category_id` pada `repair_requests`, atau mencoba mereferensikan `supporting_document_id` milik teknisi lain.
- **Solusi**: Database BANTUIN menerapkan *Composite Foreign Key Constraints* ketat untuk menjamin integritas. Pastikan relasi data valid sebelum disimpan.

---

## 7. Prosedur Backup & Restore (Windows)

### 7.1. Backup Database Lengkap (Export)
```powershell
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe" -u root -p `
  --default-character-set=utf8mb4 `
  --routines --triggers --single-transaction `
  bantuin_db > "c:\proyek\BANTUIN\database\backup_bantuin_$(Get-Date -Format 'yyyyMMdd_HHmmss').sql"
```

### 7.2. Restore Database dari File Backup
```powershell
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p bantuin_db < "c:\proyek\BANTUIN\database\nama_file_backup.sql"
```
