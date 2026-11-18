# BANTUIN — Platform Jasa Perbaikan Rumah Berbasis AI

[![CI](https://github.com/synthstack-s/proyek-rpl-bantuin/actions/workflows/ci.yml/badge.svg)](https://github.com/synthstack-s/proyek-rpl-bantuin/actions/workflows/ci.yml)

> Proyek Akhir Mandiri — Mata Kuliah Rekayasa Perangkat Lunak (TIKB2503021), Semester 3
> Program Studi S1 Teknik Informatika, STMIK IKMI Cirebon

| | |
|---|---|
| Nama | Soleh |
| NIM | 41257171 |
| Kelas | TI-1C |
| Kelompok | Hambalang |
| Tema Topik Kelompok | Jasa Perbaikan Peralatan Rumah |
| Dosen Pengampu | Yudhistira Arie Wijaya, M.Kom., CDS. |

## Tentang BANTUIN

BANTUIN adalah platform layanan jasa perbaikan rumah dan elektronik berbasis web yang mempertemukan pelanggan dengan teknisi, dengan asisten chatbot AI sebagai penghubungnya. Pelanggan membuat permintaan perbaikan, teknisi mengerjakan dan memperbarui statusnya, dan admin mengelola seluruh operasional — pengguna, teknisi, kategori, layanan, pesanan, hingga konfigurasi AI — dari satu panel.

Chatbot AI membaca database operasional secara langsung dan menjawab pertanyaan tentang pesanan, teknisi, pelanggan, dan keuangan dengan batasan akses per peran: admin membaca semua data (kecuali kredensial), sedangkan teknisi dan pelanggan hanya membaca data miliknya sendiri.

## Fitur Utama

### Peran Customer

- Membuat permintaan perbaikan dan melacak statusnya.
- Bertanya kepada chatbot AI tentang pesanan dan layanan.
- Memberi ulasan dan rating untuk teknisi.
- Melihat tagihan (invoice) dan riwayat pembayaran.
- Menerima notifikasi WhatsApp otomatis saat status pesanan berubah.

### Peran Teknisi

- Menerima atau menolak tawaran tugas perbaikan.
- Memperbarui status pengerjaan (diagnosis, estimasi, perbaikan, selesai).
- Melihat jadwal dan riwayat tugas.
- Menerima notifikasi WhatsApp untuk tawaran tugas baru.

### Peran Admin

- Mengelola pengguna, teknisi, kategori peralatan, layanan, dan pesanan.
- Mengelola konfigurasi provider AI (Gemini, Groq, DeepSeek, atau provider kustom).
- Mengirim notifikasi WhatsApp manual ke pengguna dan melihat riwayatnya.
- Melihat laporan operasional, keuangan, dan beban kerja teknisi.
- Audit log aktivitas administrator.

### Fitur AI

- Chatbot multi-provider: Google Gemini, Groq, DeepSeek, dan provider kustom (OpenAI-compatible).
- RAG / knowledge base: chatbot mengambil konteks dari dokumen pengetahuan internal.
- Query database yang diatur (governed query engine): SELECT saja, kolom sensitif tidak pernah dikembalikan, dan pembatasan baris per peran.
- Diagnosis percakapan dan rekomendasi layanan.
- Kuota AI harian: 10 request per pengguna per hari (dapat diubah admin di `system_settings`).
- Streaming jawaban chatbot (SSE) dan riwayat percakapan per sesi.

## Teknologi

| Lapisan | Teknologi |
|---|---|
| Framework web | Next.js 16 (App Router), React 19 |
| Bahasa | TypeScript |
| Database | MySQL 8 (driver `mysql2`), 31 tabel |
| Autentikasi | JWT (`jose`), OTP, bcrypt |
| Styling | Tailwind CSS 4 |
| AI | Google Gemini, Groq, DeepSeek (REST API) |
| Notifikasi | WhatsApp via Fonnte API |
| CI/CD | GitHub Actions |

## Struktur Repositori

```text
.
├── .github/workflows/   # Pipeline CI/CD (GitHub Actions)
├── database/            # schema.sql, seed.sql, migrations/, README.md
├── docs/                # Dokumentasi arsitektur AI & keamanan
├── scripts/             # Skrip pengujian integrasi & utilitas (tsx)
└── src/
    ├── app/             # Halaman & API routes (Next.js App Router)
    ├── components/      # Komponen UI
    ├── lib/             # Logika inti: ai/, chatbot/, knowledge/, fonnte, otp
    └── middleware.ts    # Middleware autentikasi
```

## Instalasi

### Prasyarat

- Node.js 20 (disarankan LTS) dan npm.
- MySQL Server 8.0 yang sedang berjalan.

### Langkah-langkah

1. Clone repositori:

   ```bash
   git clone https://github.com/synthstack-s/proyek-rpl-bantuin.git
   cd proyek-rpl-bantuin
   ```

2. Install dependensi:

   ```bash
   npm install
   ```

3. Salin template environment dan isi nilainya:

   ```bash
   cp .env.example .env.local
   ```

   Isi setidaknya: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (minimal 32 karakter), `AI_MASTER_KEY`, dan `ADMIN_INITIAL_*`. Jangan pernah me-commit file `.env.local`.

4. Buat database dan isi data awal (skema, lalu migrasi 001–006 berurutan, lalu seed):

   ```bash
   mysql -u root -p < database/schema.sql
   mysql -u root -p bantuin_db < database/migrations/001_enhance_user_otps.sql
   mysql -u root -p bantuin_db < database/migrations/002_ai_provider_management.sql
   mysql -u root -p bantuin_db < database/migrations/003_allow_dynamic_ai_providers.sql
   mysql -u root -p bantuin_db < database/migrations/004_add_token_version_to_users.sql
   mysql -u root -p bantuin_db < database/migrations/005_add_revoked_tokens.sql
   mysql -u root -p bantuin_db < database/migrations/006_whatsapp_notifications.sql
   mysql -u root -p bantuin_db < database/seed.sql
   ```

   Di Windows, ganti `mysql` dengan path lengkap `mysql.exe` (misal `C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe`) dan gunakan `-e "source <file>"` karena PowerShell tidak mendukung redirect `<`. Panduan lengkap ada di [database/README.md](database/README.md).

5. Buat akun admin awal:

   ```bash
   npm run seed:admin
   ```

6. Jalankan server pengembangan:

   ```bash
   npm run dev
   ```

   Aplikasi berjalan di `http://127.0.0.1:3000`.

## Pengujian

Skrip pengujian berada di `scripts/` dan dijalankan dengan `tsx` melalui npm. Sebagian besar skrip adalah integration test HTTP ke server yang sedang berjalan di `http://127.0.0.1:3000` ditambah pemeriksaan langsung ke database, jadi jalankan `npm run dev` (atau `npm start` setelah build) terlebih dahulu.

| Perintah | Yang diuji |
|---|---|
| `npm run verify:db` | Koneksi dan integritas database (tanpa server) |
| `npm run test:auth` | Autentikasi, OTP, sesi, logout |
| `npm run test:categories` | Manajemen kategori peralatan |
| `npm run test:services` | Manajemen layanan & tarif |
| `npm run test:users` | Manajemen pengguna |
| `npm run test:technicians` | Manajemen teknisi |
| `npm run test:chatbot` | Chatbot (butuh provider AI yang aktif) |
| `npm run test:chatbot:security` | Keamanan chatbot |
| `npm run test:admin:ops` | Operasi admin |
| `npm run test:portals` | Portal per peran |
| `npm run test:settings-notif` | Pengaturan & notifikasi admin |
| `npm run test:advanced` | Fitur lanjutan |
| `npm run test:logout` | Alur logout pengunjung |

Catatan:

- Skrip `test-ai-*` (misal `test-ai-full-e2e`, `test-gemini-multiturn`) membutuhkan API key provider AI asli dan tidak dijalankan di CI.
- `npm run lint` menjalankan `tsc --noEmit` (pemeriksaan tipe TypeScript penuh).

## CI/CD

Setiap push dan pull request menjalankan workflow GitHub Actions (`.github/workflows/ci.yml`) pada runner Ubuntu dengan service MySQL 8.0:

1. `npm ci` (install dependensi).
2. Menyiapkan database: `schema.sql`, migrasi 001–006, dan `seed.sql`.
3. `npm run verify:db` (verifikasi database).
4. `npx tsc --noEmit` (typecheck).
5. `npm run build`.
6. `npm run seed:admin`, menjalankan server hasil build, lalu integration test (`test:auth`, `test:categories`, `test:services`, `test:users`, `test:technicians`).

Tes chatbot/AI sengaja tidak dijalankan di CI karena membutuhkan API key provider AI asli.

## Video Presentasi

- Video Progres 1 — PRD & Konsep Aplikasi (3–5 menit)
- Video Progres 2 — Pemodelan UML & UI/UX (5–7 menit)
- Video Final — Live Demo Aplikasi Web & Sistem Utuh (8–12 menit)
Tautan Video Pressentaasi dan Demonstrasi : https://youtu.be/wmnN5APbazY?si=ZMz2zHKjqHfhU3Sb

## Dokumentasi Tambahan

- [database/README.md](database/README.md) — panduan pengelolaan database.
- [CHATBOT_ARCHITECTURE.md](CHATBOT_ARCHITECTURE.md) — arsitektur chatbot.
- [CHATBOT_SECURITY_REPORT.md](CHATBOT_SECURITY_REPORT.md) — laporan keamanan chatbot.
- [docs/](docs/) — dokumentasi konfigurasi dan arsitektur provider AI.
