> **Catatan:** Dokumen ini adalah versi Markdown dari PRD/SRS BANTUIN v1.0 DRAFT (November 2026). Versi berformat resmi adalah file DOCX/PDF.

# PRODUCT REQUIREMENTS DOCUMENT / SOFTWARE REQUIREMENTS SPECIFICATION (PRD / SRS) — BANTUIN

## BANTUIN — Platform Jasa Perbaikan Rumah Berbasis AI

**PROGRAM STUDI S1 TEKNIK INFORMATIKA — STMIK IKMI CIREBON**

*Standar IEEE 830 / ISO/IEC/IEEE 29148:2018*

- **Mata Kuliah:** Rekayasa Perangkat Lunak (TIKB2503021) — 4 SKS, Semester 3
- **Nama:** Soleh
- **NIM:** 41257171
- **Kelas:** TI-1C
- **Kelompok:** [Diisi Bos — Kelompok]
- **Tema Topik Kelompok:** [Diisi Bos — Tema Topik Kelompok]
- **Dosen Pengampu:** Yudhistira Arie Wijaya, M.Kom., CDS.
- **Repositori:** github.com/synthstack-s/proyek-rpl-bantuin (publik)
- **Versi Dokumen:** 1.0
- **Tanggal:** November 2026

Dokumen ini disusun sebagai luaran Tahap 1 (Inisiasi & Penyusunan PRD/SRS) Proyek Akhir Mandiri mata kuliah Rekayasa Perangkat Lunak, dan menjadi acuan tunggal kebutuhan sistem BANTUIN pada Tahap 2 (SDD), Tahap 3 (Konstruksi & CI/CD), dan Tahap 4 (Pelaporan Final & Live Demo).

## Daftar Isi

- [Riwayat Revisi](#riwayat-revisi)
- [1. Pendahuluan](#1-pendahuluan)
  - [1.1 Tujuan](#11-tujuan)
  - [1.2 Ruang Lingkup](#12-ruang-lingkup)
  - [1.3 Definisi, Akronim, dan Singkatan](#13-definisi-akronim-dan-singkatan)
  - [1.4 Referensi](#14-referensi)
  - [1.5 Gambaran Dokumen](#15-gambaran-dokumen)
- [2. Gambaran Umum](#2-gambaran-umum)
  - [2.1 Latar Belakang Masalah](#21-latar-belakang-masalah)
  - [2.2 Deskripsi Produk](#22-deskripsi-produk)
  - [2.3 Pengguna dan Peran](#23-pengguna-dan-peran)
  - [2.4 Lingkungan Operasi](#24-lingkungan-operasi)
  - [2.5 Batasan Desain dan Implementasi](#25-batasan-desain-dan-implementasi)
  - [2.6 Asumsi dan Ketergantungan](#26-asumsi-dan-ketergantungan)
- [3. Kebutuhan Fungsional](#3-kebutuhan-fungsional)
  - [3.1 Autentikasi dan Manajemen Akun](#31-autentikasi-dan-manajemen-akun)
  - [3.2 Pelanggan — Permintaan Perbaikan](#32-pelanggan-permintaan-perbaikan)
  - [3.3 Teknisi — Tugas dan Jadwal](#33-teknisi-tugas-dan-jadwal)
  - [3.4 Admin — Operasional](#34-admin-operasional)
  - [3.5 Pembayaran dan Invoice](#35-pembayaran-dan-invoice)
  - [3.6 Chatbot AI dan Fitur AI Utama](#36-chatbot-ai-dan-fitur-ai-utama)
  - [3.7 Notifikasi WhatsApp](#37-notifikasi-whatsapp)
  - [3.8 Manajemen Provider AI](#38-manajemen-provider-ai)
  - [3.9 Ulasan, Komplain, dan Layanan Publik](#39-ulasan-komplain-dan-layanan-publik)
- [4. Kebutuhan Non-Fungsional](#4-kebutuhan-non-fungsional)
  - [4.1 Kinerja](#41-kinerja)
  - [4.2 Keamanan](#42-keamanan)
  - [4.3 Keandalan dan Ketersediaan](#43-keandalan-dan-ketersediaan)
  - [4.4 Kegunaan](#44-kegunaan)
  - [4.5 Keterpeliharaan dan Keterujian](#45-keterpeliharaan-dan-keterujian)
  - [4.6 Portabilitas dan Kompatibilitas](#46-portabilitas-dan-kompatibilitas)
- [5. Model Data](#5-model-data)
  - [5.1 Ringkasan Skema Basis Data](#51-ringkasan-skema-basis-data)
  - [5.2 Tabel per Domain](#52-tabel-per-domain)
  - [5.3 Relasi Utama](#53-relasi-utama)
- [6. Antarmuka](#6-antarmuka)
  - [6.1 Antarmuka Pengguna](#61-antarmuka-pengguna)
  - [6.2 Antarmuka Perangkat Keras](#62-antarmuka-perangkat-keras)
  - [6.3 Antarmuka Perangkat Lunak](#63-antarmuka-perangkat-lunak)
  - [6.4 Antarmuka Komunikasi](#64-antarmuka-komunikasi)
- [7. Batasan dan Asumsi](#7-batasan-dan-asumsi)
  - [7.1 Keterbatasan yang Diketahui](#71-keterbatasan-yang-diketahui)
  - [7.2 Pekerjaan Mendatang](#72-pekerjaan-mendatang)
- [Lampiran A — Daftar Tabel Basis Data](#lampiran-a-daftar-tabel-basis-data)
- [Lampiran B — Glosarium](#lampiran-b-glosarium)
- [Lampiran C — Ketertelusuran Kebutuhan](#lampiran-c-ketertelusuran-kebutuhan)

## Riwayat Revisi

| **Versi** | **Tanggal** | **Penulis** | **Perubahan** |
|---|---|---|---|
| 1.0 | 16 November 2026 | Soleh (41257171) | Dokumen awal Tahap 1. Seluruh kebutuhan diformulasikan dari kode aplikasi pada repositori synthstack-s/proyek-rpl-bantuin (main, HEAD 621d5e83), README proyek, dan dua audit kode (13 November 2026). |

Konvensi penomoran kebutuhan: F-xx untuk kebutuhan fungsional dan NF-xx untuk kebutuhan non-fungsional. Setiap kebutuhan fungsional ditulis sebagai user story disertai kriteria penerimaan (acceptance criteria) sesuai ketentuan Tahap 1 pada Panduan Proyek Akhir.

*Status implementasi tiap kebutuhan dicantumkan apa adanya. Kebutuhan yang belum terimplementasi atau baru terimplementasi sebagian ditandai secara eksplisit dan dirujuk ke Bab 7 (Batasan dan Asumsi). Dokumen ini tidak menyatakan fitur simulasi sebagai fitur produksi.*

## 1. Pendahuluan

### 1.1 Tujuan

Dokumen ini menetapkan kebutuhan perangkat lunak untuk BANTUIN, platform jasa perbaikan rumah dan elektronik berbasis web yang dilengkapi asisten chatbot AI. Dokumen ini disusun sebagai luaran Tahap 1 Proyek Akhir Mandiri mata kuliah Rekayasa Perangkat Lunak (TIKB2503021) dan menjadi acuan tunggal bagi perancangan (Tahap 2), konstruksi dan pengujian (Tahap 3), serta pelaporan final (Tahap 4).

Pembaca dokumen ini adalah dosen pengampu sebagai penilai, pengembang aplikasi (penulis dokumen) sebagai pelaksana, dan penguji yang memverifikasi kesesuaian implementasi terhadap kebutuhan yang ditetapkan di sini.

Seluruh kebutuhan dalam dokumen ini dirumuskan dari tiga sumber yang dapat diverifikasi: (1) kode aplikasi pada repositori publik synthstack-s/proyek-rpl-bantuin cabang main (HEAD 621d5e83, per 16 November 2026); (2) dua laporan audit kode tanggal 13 November 2026 yang membaca kode secara statis; dan (3) README proyek. Kebutuhan yang belum terimplementasi ditandai secara eksplisit sebagai pekerjaan mendatang dan tidak diklaim sebagai fitur yang sudah berjalan.

### 1.2 Ruang Lingkup

BANTUIN adalah aplikasi web yang mempertemukan tiga pihak: pelanggan yang membutuhkan jasa perbaikan, teknisi yang mengerjakan perbaikan, dan admin yang mengelola operasional. Nama produk, "BANTUIN", merujuk pada bantuan perbaikan yang dapat dipesan pelanggan secara daring.

Ruang lingkup sistem meliputi:

- Pemesanan jasa perbaikan oleh pelanggan, termasuk pembuatan permintaan, pelacakan status, persetujuan estimasi biaya, dan pembatalan.

- Manajemen tugas teknisi, termasuk penerimaan tawaran, diagnosis dan estimasi, penjadwalan kunjungan, pembaruan status pengerjaan, dan penerbitan invoice.

- Pengelolaan operasional oleh admin: pengguna, teknisi, kategori peralatan, layanan, pesanan, penugasan, laporan, audit log, dan pengaturan sistem.

- Asisten chatbot AI multi-provider yang menjawab pertanyaan pengguna, membaca database operasional dengan tata kelola akses per peran, mengambil konteks dari basis pengetahuan internal (RAG), dan membantu diagnosis awal kerusakan.

- Notifikasi WhatsApp (melalui gateway Fonnte) untuk verifikasi OTP, perubahan status pesanan, tawaran tugas, dan pesan manual dari admin.

- Konfigurasi provider AI oleh admin, termasuk penambahan provider kustom, pengujian koneksi, pengelolaan model, dan pemantauan penggunaan.

Di luar ruang lingkup dokumen ini: aplikasi seluler native (sistem hanya tersedia sebagai aplikasi web), integrasi payment gateway nyata (direncanakan sebagai pekerjaan mendatang — lihat 7.1), dan modul akuntansi lanjutan di luar pencatatan invoice dan pembayaran.

### 1.3 Definisi, Akronim, dan Singkatan

| **Istilah** | **Definisi** |
|---|---|
| AI | Artificial Intelligence (Kecerdasan Artifisial). Dalam dokumen ini merujuk pada model bahasa besar (LLM) yang diakses melalui API provider eksternal (Gemini, Groq, DeepSeek, atau provider kustom). |
| BM25 | Fungsi pemeringkatan temu-balik informasi berbasis frekuensi kata (best matching 25). Dipakai mesin RAG BANTUIN untuk memberi skor relevansi dokumen pengetahuan terhadap pertanyaan pengguna. |
| CI/CD | Continuous Integration / Continuous Delivery: otomatisasi build, pengujian, dan pemeriksaan kualitas kode pada setiap perubahan, diimplementasikan dengan GitHub Actions. |
| ENUM | Tipe kolom MySQL yang nilainya dibatasi pada daftar tertentu. |
| Fonnte | Layanan gateway WhatsApp pihak ketiga yang dipakai BANTUIN untuk mengirim OTP dan notifikasi WhatsApp melalui API HTTP. |
| JWT | JSON Web Token: token sesi bertanda tangan (HS256) yang dipakai untuk autentikasi pengguna dan admin. |
| LLM | Large Language Model — model bahasa besar yang menghasilkan jawaban chatbot. |
| OTP | One-Time Password: kode sekali pakai 6 digit yang dikirim lewat WhatsApp untuk verifikasi nomor telepon dan reset password. |
| PRD | Product Requirements Document — dokumen kebutuhan produk. |
| RAG | Retrieval-Augmented Generation: teknik memberi konteks dokumen yang relevan kepada LLM sebelum menjawab, sehingga jawaban berdasar pada pengetahuan internal. Di BANTUIN, temu-balik memakai pemeringkatan kata kunci gaya BM25 (bukan vector embedding). |
| SRS | Software Requirements Specification — spesifikasi kebutuhan perangkat lunak (IEEE 830 / ISO 29148). |
| SSE | Server-Sent Events: mekanisme streaming jawaban chatbot dari server ke browser secara real-time. |
| SDD | Software Design Document — dokumen perancangan (Tahap 2 proyek). |
| UML | Unified Modeling Language — bahasa pemodelan untuk diagram Use Case, Activity, Class, dan Sequence pada Tahap 2. |

### 1.4 Referensi

- Panduan Tugas Proyek Akhir Mandiri & Rubrik Penilaian OBE, Mata Kuliah Rekayasa Perangkat Lunak (TIKB2503021), Program Studi S1 Teknik Informatika, STMIK IKMI Cirebon (Yudhistira Arie Wijaya, M.Kom., CDS; versi 4).

- IEEE Std 830-1998, Recommended Practice for Software Requirements Specifications.

- ISO/IEC/IEEE 29148:2018, Systems and software engineering — Life cycle processes — Requirements engineering.

- Repositori proyek: github.com/synthstack-s/proyek-rpl-bantuin (publik), cabang main HEAD 621d5e83, termasuk README.md, database/schema.sql, database/migrations/001–006, dan .github/workflows/ci.yml.

- AUDIT_BANTUIN.md — Audit Bug BANTUIN, 13 November 2026 (54 temuan).

- AUDIT_AI_CHATBOT_2026-11-13.md — Audit Ulang Konfigurasi AI & Chatbot, 13 November 2026 (104 temuan).

- Dokumentasi resmi: Next.js 16, React 19, MySQL 8.0, Google Gemini API, Groq API, dan Fonnte API.

### 1.5 Gambaran Dokumen

Bab 2 menjelaskan latar belakang, deskripsi produk, peran pengguna, dan batasan sistem. Bab 3 merinci kebutuhan fungsional sebagai user story beserta kriteria penerimaan, dikelompokkan per area fitur. Bab 4 merinci kebutuhan non-fungsional. Bab 5 merangkum model data. Bab 6 menjelaskan antarmuka sistem. Bab 7 mencatat batasan, asumsi, dan pekerjaan mendatang. Lampiran memuat daftar tabel basis data, glosarium, dan matriks ketertelusuran kebutuhan.

## 2. Gambaran Umum

### 2.1 Latar Belakang Masalah

Perbaikan peralatan rumah tangga dan elektronik masih sering diurus secara informal: pelanggan mencari teknisi dari mulut ke mulut atau media sosial, tanpa kepastian harga, tanpa rekam jejak teknisi, dan tanpa cara melacak progres perbaikan. Akibatnya pelanggan sulit membandingkan layanan, teknisi sulit memperoleh pesanan secara teratur, dan tidak ada pihak yang memegang catatan resmi atas pesanan, biaya, maupun garansi.

BANTUIN menjawab masalah tersebut dengan satu platform web: pelanggan membuat permintaan perbaikan dan melacak statusnya dari pengajuan hingga selesai; teknisi menerima tawaran tugas, melakukan diagnosis, dan memperbarui status pengerjaan; admin mengelola seluruh operasional dari satu panel. Chatbot AI menjadi pembeda utama: pengguna dapat bertanya tentang pesanan, teknisi, layanan, dan keuangan dalam bahasa sehari-hari, dan chatbot menjawab berdasarkan data operasional nyata dengan batasan akses per peran. Notifikasi WhatsApp memastikan pelanggan dan teknisi selalu mengetahui perubahan status tanpa harus membuka aplikasi.

### 2.2 Deskripsi Produk

BANTUIN adalah aplikasi web full-stack berbasis Next.js 16 (App Router) dan React 19, ditulis dalam TypeScript, dengan basis data MySQL 8. Aplikasi berjalan sebagai satu server Node.js yang melayani halaman web dan API (route handler Next.js) sekaligus.

Alur bisnis inti adalah sebagai berikut:

- Pelanggan mendaftar dan memverifikasi nomor WhatsApp-nya dengan kode OTP, lalu membuat permintaan perbaikan dengan memilih kategori peralatan dan layanan, menjelaskan kerusakan, dan mengunggah foto.

- Admin meninjau permintaan dan menugaskan teknisi. Teknisi menerima atau menolak tawaran, menjadwalkan kunjungan, melakukan diagnosis, dan menyampaikan estimasi biaya.

- Pelanggan menyetujui atau menolak estimasi. Setelah disetujui, teknisi mengerjakan perbaikan dan menandai pekerjaan selesai; sistem menerbitkan invoice.

- Pelanggan melihat invoice dan riwayat pembayaran, lalu dapat memberi ulasan dan rating untuk teknisi. Komplain dapat diajukan atas pesanan yang telah selesai.

- Sepanjang alur tersebut, chatbot AI melayani pertanyaan pengguna dan notifikasi WhatsApp mengabarkan setiap perubahan status penting.

Status pesanan mengikuti sebelas nilai yang ditetapkan skema basis data: draft, submitted, assigned, scheduled, in_diagnosis, estimated, customer_approved, in_repair, completed, cancelled, dan complained.

*Catatan kejujuran: alur pembayaran pada versi ini belum terhubung ke payment gateway nyata. Endpoint pembayaran pelanggan saat ini adalah simulasi dan webhook pembayaran belum memverifikasi signature maupun jumlah (temuan K1 dan K2 dari audit). Kedua hal ini dicatat sebagai keterbatasan pada Bab 7 dan bukan diklaim sebagai fitur pembayaran produksi.*

### 2.3 Pengguna dan Peran

Sistem mengenal tiga peran terautentikasi dan satu peran tamu. Peran disimpan pada kolom role tabel users dengan nilai admin, customer, atau technician; tamu (guest) adalah pengunjung tanpa akun.

| **Peran** | **Deskripsi dan Hak Akses** |
|---|---|
| Admin | Pengelola sistem. Mengelola pengguna, teknisi, kategori, layanan, pesanan, penugasan, laporan, audit log, pengaturan sistem, konfigurasi provider AI, dan notifikasi WhatsApp manual. Melalui chatbot, admin dapat membaca seluruh data operasional kecuali kredensial (password hash, OTP hash, token, dan API key tidak pernah dikembalikan lewat chat). |
| Customer (Pelanggan) | Pengguna yang memesan jasa perbaikan. Membuat dan melacak permintaan perbaikan, menyetujui/menolak estimasi, membatalkan pesanan, mengobrol dengan teknisi, memberi ulasan dan komplain, serta melihat invoice miliknya. Melalui chatbot, pelanggan hanya dapat membaca data miliknya sendiri. |
| Technician (Teknisi) | Penyedia jasa perbaikan. Menerima/menolak tawaran tugas, menjadwalkan kunjungan, membuat diagnosis dan estimasi, memperbarui status pengerjaan, dan melihat riwayat tugas serta jadwalnya. Melalui chatbot, teknisi hanya dapat membaca data tugas dan pesanan yang terkait dengannya. |
| Guest (Tamu) | Pengunjung tanpa akun. Dapat melihat katalog layanan publik, melacak pesanan dengan kode pelacakan, dan bertanya kepada chatbot sebatas informasi publik (kategori dan layanan). Tamu tidak dapat melihat data pengguna lain dan tidak dapat memakai fitur yang membutuhkan akun. |

Setiap pengguna memiliki status akun: active, inactive, suspended, atau pending_verification. Akun yang di-suspend atau tidak aktif tidak dapat masuk; verifikasi OTP menolak menerbitkan sesi untuk akun yang tidak aktif.

### 2.4 Lingkungan Operasi

| **Komponen** | **Spesifikasi** |
|---|---|
| Server aplikasi | Node.js 20, framework Next.js 16 (App Router), React 19, TypeScript. |
| Basis data | MySQL Server 8.0, database bantuin_db, driver mysql2. |
| Peramban klien | Peramban modern dengan dukungan JavaScript dan EventSource (untuk streaming SSE). |
| Layanan eksternal | API provider AI (Google Gemini, Groq, DeepSeek, atau provider kustom OpenAI-compatible) dan gateway WhatsApp Fonnte, keduanya melalui HTTPS. |
| CI/CD | GitHub Actions (ubuntu-latest, Node.js 20, layanan MySQL 8.0) pada setiap push dan pull request. |

Pengembangan dan pengujian dilakukan pada mesin lokal (Windows, MySQL Server lokal) dengan database bantuin_db; pipeline CI menjalankan skema, migrasi 001–006, seed, typecheck, build, dan integration test pada setiap perubahan kode.

### 2.5 Batasan Desain dan Implementasi

- Tumpukan teknologi ditetapkan: Next.js 16 + React 19 + TypeScript di sisi aplikasi dan MySQL 8 sebagai satu-satunya basis data. Tidak ada lapisan cache eksternal (mis. Redis); rate limiting dan sebagian memori sesi chatbot bersifat in-memory per instance server, sehingga tidak berlaku pada deployment multi-instance.

- Chatbot hanya boleh membaca database melalui mesin query yang diatur (governed query engine): query SELECT saja, tabel dan kolom harus terdaftar pada registry skema, kolom sensitif tidak pernah dikembalikan, dan baris dibatasi per peran (row scoping).

- API key provider AI disimpan terenkripsi (AES-256-GCM) di database dan tidak pernah dikirim dalam bentuk plaintext ke browser. Kunci API tidak pernah dikirim melalui query string URL.

- File unggahan (foto kerusakan, dokumen teknisi) disimpan di direktori public/uploads pada server aplikasi. Penyimpanan objek eksternal dengan signed URL belum diimplementasikan.

- Aplikasi hanya tersedia sebagai aplikasi web; tidak ada aplikasi seluler native.

- Bahasa antarmuka dan jawaban chatbot adalah Bahasa Indonesia.

### 2.6 Asumsi dan Ketergantungan

- Server memiliki koneksi internet untuk mengakses API provider AI dan gateway Fonnte. Bila provider AI tidak dapat dijangkau, chatbot beralih ke mode offline berlabel (expert system) dan tetap melayani pertanyaan deterministik dari database.

- Admin mengonfigurasi API key provider AI yang valid dan saldo yang mencukupi pada provider yang dipakai; tanpa API key, fitur AI tidak dapat memanggil model eksternal.

- Akun Fonnte memiliki saldo yang cukup untuk mengirim OTP dan notifikasi WhatsApp.

- Variabel lingkungan yang diperlukan telah diisi, termasuk kredensial database, JWT_ACCESS_SECRET, dan AI_MASTER_KEY. Tanpa master key, sistem saat ini memakai nilai fallback hardcoded (temuan K3) — perilaku ini harus dihapus sebelum deployment produksi (lihat Bab 7).

- Deployment berjalan di belakang satu reverse proxy tepercaya yang menulis header x-forwarded-for; identifikasi IP klien memakai entri pertama header tersebut setelah validasi format.

## 3. Kebutuhan Fungsional

Kebutuhan fungsional ditulis sebagai user story beserta kriteria penerimaan, sesuai ketentuan Tahap 1 pada Panduan Proyek Akhir. Kolom Status menyatakan kondisi implementasi per 16 November 2026 berdasarkan kode pada cabang main: "Terimplementasi" berarti fitur ada di kode dan tercakup pengujian atau audit; "Sebagian" berarti fitur ada tetapi dengan keterbatasan yang dicatat; "Belum" berarti kebutuhan dirumuskan untuk pekerjaan mendatang.

### 3.1 Autentikasi dan Manajemen Akun

| **ID** | **User Story** | **Kriteria Penerimaan** | **Status** |
|---|---|---|---|
| F-01 | Sebagai pelanggan, saya ingin mendaftar dengan nama, email, nomor WhatsApp, dan password, agar saya dapat memesan jasa perbaikan. | Registrasi membuat akun ber-role customer berstatus pending_verification; password disimpan sebagai hash bcrypt (12 rounds); email/nomor duplikat ditolak; pendaftar diarahkan ke verifikasi OTP. | Terimplementasi |
| F-02 | Sebagai teknisi, saya ingin mendaftar sebagai teknisi dan melengkapi profil serta dokumen pendukung, agar admin dapat memverifikasi saya. | Registrasi membuat akun ber-role technician; profil teknisi (spesialisasi, bio, wilayah) dan dokumen pendukung dapat disimpan; teknisi belum terverifikasi tidak menerima tawaran tugas. | Terimplementasi |
| F-03 | Sebagai pengguna terdaftar, saya ingin masuk dengan email dan password, agar saya dapat mengakses layanan sesuai peran saya. | Login berhasil menerbitkan JWT sesi (masa berlaku 8 jam, atau 7 hari dengan remember-me) dalam cookie HttpOnly; kredensial salah ditolak tanpa membocorkan akun mana yang salah; akun suspended/inactive ditolak; 5 percobaan gagal mengunci akun 15 menit. | Terimplementasi |
| F-04 | Sebagai admin, saya ingin masuk melalui login admin yang terpisah, agar panel admin terlindungi dari akun pengguna biasa. | Login admin memakai route dan cookie terpisah dengan rate limit per pasangan IP-email; akun non-admin ditolak; percobaan login dicatat pada audit log. | Terimplementasi |
| F-05 | Sebagai pengguna baru, saya ingin memverifikasi nomor WhatsApp saya dengan kode OTP, agar akun saya aktif. | OTP 6 digit acak (crypto-random) dikirim via WhatsApp; kode kedaluwarsa 5 menit, maksimal 5 percobaan verifikasi, cooldown 60 detik antar pengiriman, dan kuota 5 pengiriman per 15 menit; kode disimpan sebagai hash SHA-256 dan verifikasi memakai row locking; akun aktif setelah verifikasi berhasil. | Terimplementasi |
| F-06 | Sebagai pengguna yang lupa password, saya ingin mereset password melalui OTP, agar saya dapat masuk kembali dengan aman. | Reset memakai OTP terverifikasi; password baru disimpan sebagai hash bcrypt; reset menaikkan token_version pengguna sehingga seluruh JWT lama ditolak (pencabutan sesi). | Terimplementasi |
| F-07 | Sebagai pengguna, saya ingin keluar dari akun saya, agar sesi saya tidak dapat dipakai orang lain. | Logout menghapus cookie sesi dan mencatat jti token ke tabel revoked_tokens (blocklist); token yang sudah logout ditolak bila dipakai kembali. | Terimplementasi |
| F-08 | Sebagai pelanggan atau teknisi, saya ingin memperbarui profil saya (nama, alamat, nomor telepon, dan data peran), agar data saya tetap akurat. | Perubahan profil tersimpan pada tabel profil terkait; pengguna hanya dapat mengubah profilnya sendiri; input divalidasi panjang dan formatnya. | Sebagian — validasi panjang input pada sebagian route PATCH profil belum memakai skema Zod (temuan audit). |

### 3.2 Pelanggan — Permintaan Perbaikan

| **ID** | **User Story** | **Kriteria Penerimaan** | **Status** |
|---|---|---|---|
| F-09 | Sebagai pelanggan, saya ingin membuat permintaan perbaikan dengan memilih kategori peralatan dan layanan, menjelaskan kerusakan, mengunggah foto, dan mengisi alamat, agar teknisi dapat memahami pekerjaan saya. | Permintaan tersimpan berstatus draft/submitted dengan kode pesanan unik format BAN-YYYYMMDD-XXXXX; kategori dan layanan diambil dari katalog; foto tersimpan sebagai lampiran; alamat dan koordinat lokasi tersimpan bila diisi. | Terimplementasi |
| F-10 | Sebagai pelanggan, saya ingin melacak status pesanan saya dari pengajuan hingga selesai, agar saya tahu progres perbaikan. | Detail pesanan menampilkan status saat ini (salah satu dari 11 status) beserta linimasa perubahan status dari repair_status_history; pelanggan hanya melihat pesanannya sendiri. | Terimplementasi |
| F-11 | Sebagai pelanggan, saya ingin melihat detail pesanan dan tagihan saya, agar saya tahu apa yang dikerjakan dan berapa biayanya. | Detail menampilkan deskripsi, foto, diagnosis, estimasi, jadwal, teknisi yang ditugaskan, dan invoice terkait (bila sudah diterbitkan). | Terimplementasi |
| F-12 | Sebagai pelanggan, saya ingin menyetujui atau menolak estimasi biaya dari teknisi, agar perbaikan hanya berjalan atas persetujuan saya. | Persetujuan dicatat pada diagnosis dan mengubah status pesanan menjadi customer_approved; penolakan dicatat beserta alasannya; tanpa persetujuan, teknisi tidak dapat menandai pekerjaan selesai melalui jalur chatbot. | Sebagian — pengecekan status pada route diagnosis belum menolak aksi di luar status estimated (temuan S18). |
| F-13 | Sebagai pelanggan, saya ingin membatalkan pesanan yang belum dikerjakan, agar saya tidak terikat pada pesanan yang tidak lagi saya perlukan. | Pembatalan hanya diizinkan untuk status yang dapat dibatalkan; perubahan status dan pencatatan riwayat berjalan dalam satu transaksi database atomik. | Terimplementasi |
| F-14 | Sebagai pelanggan, saya ingin mengobrol dengan teknisi yang ditugaskan pada pesanan saya, agar kami dapat berkoordinasi. | Ruang chat dibuat per pesanan; hanya pemilik pesanan, teknisi yang ditugaskan, dan admin yang dapat membaca/mengirim pesan; pesan tersimpan pada repair_chat_messages. | Terimplementasi |
| F-15 | Sebagai pelanggan, saya ingin melihat jadwal kunjungan teknisi untuk pesanan saya, agar saya dapat bersiap di rumah. | Jadwal kunjungan menampilkan tanggal, jam, dan teknisi yang datang; hanya pemilik pesanan, teknisi terkait, dan admin yang dapat melihatnya. | Sebagian — pengecekan kepemilikan pada GET jadwal belum diterapkan (temuan T12). |
| F-16 | Sebagai pelanggan, saya ingin mengubah sesi konsultasi chatbot menjadi pesanan perbaikan, agar saya tidak mengulang penjelasan kerusakan. | Konversi membuat pesanan baru yang tertaut ke sesi konsultasi (ai_session_id) dengan gejala awal dari sesi; memerlukan login. | Terimplementasi |

### 3.3 Teknisi — Tugas dan Jadwal

| **ID** | **User Story** | **Kriteria Penerimaan** | **Status** |
|---|---|---|---|
| F-17 | Sebagai teknisi, saya ingin menerima atau menolak tawaran tugas, agar saya hanya mengerjakan pekerjaan yang saya sanggupi. | Tawaran berstatus offered dapat diterima (menjadi accepted) atau ditolak (rejected); penolakan mengembalikan pesanan ke antrean penugasan; teknisi hanya melihat tawaran untuk dirinya. | Terimplementasi |
| F-18 | Sebagai teknisi, saya ingin memperbarui status pengerjaan (menuju lokasi, diagnosis, perbaikan, selesai), agar pelanggan dan admin mengetahui progres saya. | Setiap transisi status tercatat pada repair_status_history; transisi melalui chatbot memeriksa status saat ini dan memakai transaksi database; penyelesaian memerlukan persetujuan pelanggan atas estimasi. | Sebagian — state machine dan transaksi diterapkan pada jalur chatbot; route HTTP PATCH technician/tasks belum menerapkan validasi status (temuan T10, sisi HTTP). |
| F-19 | Sebagai teknisi, saya ingin membuat diagnosis dan estimasi biaya, agar pelanggan dapat menyetujui biaya sebelum perbaikan dimulai. | Diagnosis tersimpan pada repair_diagnoses beserta rincian biaya; estimasi memicu status estimated dan notifikasi ke pelanggan. | Terimplementasi |
| F-20 | Sebagai teknisi, saya ingin melihat jadwal kunjungan dan riwayat tugas saya, agar saya dapat mengatur pekerjaan. | Daftar tugas menampilkan tawaran, tugas aktif, dan riwayat; jadwal menampilkan kunjungan yang dijadwalkan; estimasi pendapatan dihitung dari invoice terkait. | Terimplementasi |
| F-21 | Sebagai teknisi, saya ingin mengelola profil dan spesialisasi saya, agar admin dapat menugaskan pekerjaan yang sesuai. | Profil teknisi (bio, spesialisasi, wilayah layanan, dokumen) dapat diperbarui; status verifikasi dikelola admin. | Terimplementasi |

### 3.4 Admin — Operasional

| **ID** | **User Story** | **Kriteria Penerimaan** | **Status** |
|---|---|---|---|
| F-22 | Sebagai admin, saya ingin mengelola pengguna (melihat, mencari, mengubah status), agar saya dapat menjaga ketertiban platform. | Daftar pengguna mendukung pencarian dan pagination; admin dapat mengubah status akun (active/suspended); perubahan status berlaku pada sesi berikutnya melalui revalidasi klaim JWT ke database. | Terimplementasi |
| F-23 | Sebagai admin, saya ingin memverifikasi teknisi beserta dokumennya, agar hanya teknisi tepercaya yang menerima tugas. | Admin dapat melihat profil dan dokumen teknisi serta mengubah verified_status; teknisi belum terverifikasi tidak muncul pada pencarian publik chatbot. | Terimplementasi |
| F-24 | Sebagai admin, saya ingin mengelola kategori peralatan dan layanan (tambah, ubah, hapus), agar katalog selalu mutakhir. | CRUD kategori dan layanan tersedia dari panel admin; layanan terikat pada kategori; perubahan langsung tercermin pada katalog pelanggan dan chatbot. | Terimplementasi |
| F-25 | Sebagai admin, saya ingin menugaskan dan menugaskan ulang teknisi pada pesanan, agar setiap pesanan ditangani teknisi yang tepat. | Penugasan membuat assignment berstatus offered dan memberi tahu teknisi via WhatsApp; penugasan ulang menonaktifkan assignment lama berstatus offered. | Sebagian — assignment lama yang sudah accepted belum ikut dibatalkan saat reassign (temuan T13). |
| F-26 | Sebagai admin, saya ingin melihat laporan operasional, keuangan, dan beban kerja teknisi, agar saya dapat mengambil keputusan berbasis data. | Laporan menghitung dari data nyata database: jumlah pesanan per status, pendapatan dari pembayaran settlement dikurangi refund, serta beban tugas per teknisi; angka kosong dilaporkan sebagai nol, bukan data contoh. | Terimplementasi |
| F-27 | Sebagai admin, saya ingin melihat log audit aktivitas administrator, agar tindakan admin dapat dipertanggungjawabkan. | Setiap aksi admin penting tercatat pada admin_audit_logs beserta pelaku, waktu, dan ringkasan perubahan. | Terimplementasi |
| F-28 | Sebagai admin, saya ingin mengubah pengaturan sistem (biaya platform, kuota AI harian, masa garansi), agar kebijakan operasional dapat disesuaikan. | Pengaturan tersimpan pada system_settings dan dibaca pada saat dipakai; perubahan kuota AI berlaku untuk perhitungan kuota berikutnya. | Sebagian — biaya platform pada penerbitan invoice masih memakai nilai hardcoded Rp 10.000 dan mengabaikan pengaturan (temuan S25). |

### 3.5 Pembayaran dan Invoice

| **ID** | **User Story** | **Kriteria Penerimaan** | **Status** |
|---|---|---|---|
| F-29 | Sebagai sistem, saya ingin menerbitkan invoice otomatis saat teknisi menyelesaikan pekerjaan, agar pelanggan mendapat tagihan yang benar. | Invoice dibuat satu per pesanan (unique key repair_request_id) dengan subtotal dari estimasi, biaya platform, dan total; nomor invoice unik; invoice yang sudah lunas tidak dapat diubah jumlahnya melalui jalur chatbot. | Sebagian — route HTTP complete masih dapat memperbarui jumlah invoice yang sudah lunas (temuan T10, sisi HTTP). |
| F-30 | Sebagai pelanggan, saya ingin melihat invoice dan riwayat pembayaran saya, agar saya tahu tagihan dan status bayarnya. | Daftar invoice menampilkan nomor, jumlah, status, dan tanggal; riwayat pembayaran menampilkan metode dan status settlement dari tabel payments; hitungan pendapatan direkonsiliasi antara invoice dan baris pembayaran. | Terimplementasi |
| F-31 | Sebagai pelanggan, saya ingin membayar tagihan melalui payment gateway (QRIS / virtual account / e-wallet), agar pembayaran saya tercatat secara sah. | Sistem membuat transaksi pada gateway dan mengembalikan token pembayaran/URL pengalihan; invoice hanya berubah menjadi lunas setelah webhook terverifikasi atau pengecekan status server-to-server ke gateway; pembayaran sebagian atau Rp 0 tidak melunasi invoice. | Belum — pekerjaan mendatang. Endpoint /pay saat ini adalah SIMULASI yang menandai invoice lunas tanpa pembayaran nyata (temuan K2) dan webhook belum memverifikasi signature maupun jumlah (temuan K1). Lihat Bab 7. |
| F-32 | Sebagai pelanggan, saya ingin mendapat garansi 30 hari atas perbaikan yang sudah lunas, agar saya terlindungi bila kerusakan berulang. | Pernyataan garansi 30 hari disampaikan pada notifikasi dan invoice; komplain hanya dapat diajukan untuk pesanan completed dalam masa garansi. | Sebagian — pernyataan garansi ada pada notifikasi; pengecekan masa garansi pada pengajuan komplain belum diterapkan (temuan S19). |

### 3.6 Chatbot AI dan Fitur AI Utama

Chatbot adalah fitur AI utama BANTUIN sebagaimana dipersyaratkan Tahap 1 Panduan Proyek Akhir. Chatbot berjalan real-time melalui API provider AI eksternal, membaca database operasional dengan tata kelola akses per peran, dan mengambil konteks dari basis pengetahuan internal (RAG). Jawaban chatbot mengikuti aturan lugas: pertanyaan daftar dijawab dengan daftar, pertanyaan satu angka dijawab dengan satu baris, dan data yang tidak ada dilaporkan sebagai tidak ada — bukan digantikan data contoh.

| **ID** | **User Story** | **Kriteria Penerimaan** | **Status** |
|---|---|---|---|
| F-33 | Sebagai pengguna, saya ingin mengobrol dengan asisten AI tentang pesanan, layanan, dan teknisi, agar saya mendapat jawaban tanpa menunggu admin. | Pesan diproses oleh provider AI aktif (Gemini, Groq, DeepSeek, atau kustom); jawaban relevan dengan konteks percakapan dan peran pengguna; pesan dibatasi 2.000 karakter. | Terimplementasi |
| F-34 | Sebagai pengguna, saya ingin melihat jawaban chatbot mengalir secara real-time (streaming), agar saya tidak menunggu jawaban lengkap. | Respons dikirim sebagai aliran SSE (event token, metadata, done); klien dapat memilih mode streaming atau respons JSON sekaligus. | Terimplementasi |
| F-35 | Sebagai pengguna, saya ingin percakapan saya tersimpan per sesi dan dapat saya lanjutkan, agar konteks tidak hilang. | Sesi konsultasi tersimpan pada ai_consultation_sessions dan pesan pada ai_chat_messages; sesi hanya dapat diakses pemiliknya (atau tamu pemegang UUID sesi yang belum diklaim); riwayat terbatas 20 pesan terakhir untuk konteks LLM dengan paginasi cursor pada pengambilan riwayat. | Terimplementasi |
| F-36 | Sebagai pelanggan, saya ingin menjelaskan gejala kerusakan dan mendapat diagnosis awal serta rekomendasi layanan, agar saya tahu langkah berikutnya. | Chatbot mengekstrak kartu diagnosis (kemungkinan penyebab dan rekomendasi layanan) dari jawaban AI dan menampilkannya terstruktur; kartu divalidasi bentuknya sebelum dipakai; sesi dapat dikonversi menjadi pesanan (F-16). | Terimplementasi |
| F-37 | Sebagai pengguna, saya ingin chatbot menjawab pertanyaan tentang data operasional (pesanan, tagihan, pengguna) berdasarkan data nyata database, agar jawabannya akurat. | Pertanyaan data dijawab melalui mesin query yang diatur: query SELECT saja; tabel/kolom harus terdaftar pada registry skema (31 tabel); kolom sensitif (password_hash, otp_hash, token, API key) tidak pernah dikembalikan; row scoping memaksa pelanggan/teknisi hanya membaca baris miliknya; admin membaca semua tabel kecuali kredensial; LIMIT default 20 dan maksimal 100; JOIN maksimal 2 hop. | Terimplementasi |
| F-38 | Sebagai pengguna, saya ingin jawaban chatbot didukung dokumen pengetahuan internal (RAG), agar jawaban sesuai kebijakan dan layanan BANTUIN. | Mesin RAG mengambil dokumen dari ai_knowledge_base dengan pemeringkatan kata kunci gaya BM25 dan boosting multi-field (tag, judul, ringkasan, isi) beserta stopwords Bahasa Indonesia; dokumen difilter per peran pengguna; konteks dibatasi anggaran token; jawaban menyertakan atribusi sumber. Catatan: temu-balik ini berbasis kata kunci, BUKAN vector embedding. | Terimplementasi |
| F-39 | Sebagai admin, saya ingin membatasi pemakaian AI harian per pengguna, agar biaya API terkendali. | Kuota harian default 10 request per pengguna per hari (diatur pada system_settings.ai_daily_free_quota dan dapat diubah admin); pemakaian dihitung dari ai_usage_logs; bila kuota habis, chatbot menolak dengan pesan jelas (429). Satu pesan dapat mengonsumsi 2 unit bila AI memanggil tool. | Terimplementasi |
| F-40 | Sebagai pengguna, saya ingin tetap mendapat jawaban saat layanan AI tidak tersedia, dengan keterangan yang jujur, agar saya tidak terkecoh. | Bila panggilan AI gagal (atau tidak ada API key), chatbot menjawab dengan expert system dan menampilkan label "Mode offline" beserta alasannya; kegagalan tidak pernah disajikan sebagai jawaban AI yang normal. | Terimplementasi |
| F-41 | Sebagai teknisi, saya ingin mengubah status tugas melalui chat (mis. "terima tugas BAN-...") dengan konfirmasi, agar saya dapat bekerja tanpa membuka panel. | Intent aksi dikenali dari pesan; sistem meminta konfirmasi eksplisit sebelum mengeksekusi; eksekusi memeriksa status penugasan saat ini, berjalan dalam transaksi database, dan mencatat IP klien yang sebenarnya pada log audit. | Terimplementasi |
| F-42 | Sebagai admin, saya ingin chatbot terlindungi dari prompt-injection dan penyalahgunaan, agar data dan biaya API aman. | Guard memblokir pola injeksi umum (abaikan instruksi, minta API key, dan variannya); rate limit chat berlapis (per IP dan per identitas pengguna/sesi); PII diminimalkan pada prompt yang dikirim ke provider eksternal. | Terimplementasi |
| F-43 | Sebagai pengguna, saya ingin melihat saran pertanyaan saat membuka chatbot, agar saya tahu apa yang dapat ditanyakan. | Widget chatbot menampilkan daftar saran pertanyaan yang relevan dengan peran pengguna. | Terimplementasi |

### 3.7 Notifikasi WhatsApp

| **ID** | **User Story** | **Kriteria Penerimaan** | **Status** |
|---|---|---|---|
| F-44 | Sebagai pelanggan, saya ingin menerima notifikasi WhatsApp saat status pesanan saya berubah, agar saya selalu tahu progresnya. | Setiap perubahan status pesanan (kecuali draft dan transisi no-op) mengirim pesan template WhatsApp ke nomor pelanggan dari database; pengiriman otomatis yang sama untuk pesanan yang sama di-dedupe dalam jendela 5 menit; kegagalan pengiriman dicatat sebagai failed dan tidak membatalkan perubahan status. | Terimplementasi |
| F-45 | Sebagai teknisi, saya ingin menerima notifikasi WhatsApp saat ada tawaran tugas baru atau perubahan penugasan, agar saya dapat merespons cepat. | Penawaran tugas dan pembatalan penugasan memicu notifikasi ke nomor teknisi dari database; pesan memakai template terpusat. | Terimplementasi |
| F-46 | Sebagai admin, saya ingin mengirim pesan WhatsApp manual ke pengguna tertentu, agar saya dapat memberi kabar di luar alur otomatis. | Admin memilih pengguna dan menulis pesan (maksimal 1.000 karakter, judul maksimal 150 karakter); nomor penerima selalu diambil dari database, bukan dari input; rate limit 10 pesan per menit per admin; kegagalan Fonnte dilaporkan jujur (502) dan dicatat sebagai failed. | Terimplementasi |
| F-47 | Sebagai admin, saya ingin melihat riwayat notifikasi WhatsApp, agar saya dapat memeriksa pengiriman. | Riwayat menampilkan penerima (nomor tersensor), pesan, status (pending/sent/failed), dan ID pesan Fonnte bila ada; data diambil dari whatsapp_notifications. | Terimplementasi |
| F-48 | Sebagai pengguna, saya ingin menerima kode OTP melalui WhatsApp, agar saya dapat memverifikasi nomor saya. | OTP dikirim melalui API Fonnte ke nomor pengguna; status pengiriman (pending/sent/failed) dan ID pesan Fonnte dicatat pada user_otps; pengiriman yang gagal tidak dianggap terkirim. | Terimplementasi |

### 3.8 Manajemen Provider AI

| **ID** | **User Story** | **Kriteria Penerimaan** | **Status** |
|---|---|---|---|
| F-49 | Sebagai admin, saya ingin menambah, mengubah, dan menghapus konfigurasi provider AI (termasuk provider kustom), agar saya dapat memilih model yang dipakai chatbot. | Provider bawaan Gemini dan Groq serta provider kustom (OpenAI-compatible, mis. DeepSeek) dapat dikelola; slug provider dinormalisasi; provider bawaan tidak dapat dihapus; perubahan API key langsung berlaku setelah penyimpanan (invalidasi cache via version bump). | Terimplementasi |
| F-50 | Sebagai admin, saya ingin menguji koneksi provider sebelum menyimpan, agar saya tahu konfigurasi saya benar. | Tes koneksi memakai key dari form atau key tersimpan; hasil tes dengan key form TIDAK menimpa status koneksi tersimpan; status tes menampilkan kode error yang terklasifikasi (mis. 402 "Saldo Habis", 401 "API key tidak valid"). | Terimplementasi |
| F-51 | Sebagai admin, saya ingin melihat daftar model yang tersedia dari provider, agar saya dapat memilih model. | Daftar model diambil langsung dari API provider; bila pengambilan gagal, kegagalan dilaporkan — bukan digantikan daftar hardcoded yang diklaim sebagai data live. | Terimplementasi |
| F-52 | Sebagai admin, saya ingin mengatur provider aktif dan fallback otomatis, agar chatbot tetap berjalan bila provider utama gagal. | Provider aktif dapat diganti; fallback otomatis beralih ke provider cadangan bila error memenuhi syarat fallback; provider fallback harus memiliki API key yang valid; circuit breaker membuka setelah 3 kegagalan berurutan dengan cooldown 30 detik. | Terimplementasi |
| F-53 | Sebagai admin, saya ingin memantau penggunaan dan metrik AI, agar saya dapat mengendalikan biaya dan kualitas. | Panel menampilkan metrik dari ai_usage_logs (jumlah request, token, latensi) dan riwayat tes koneksi; latensi dilaporkan null bila tidak ada data, bukan angka hardcoded. | Terimplementasi |
| F-54 | Sebagai admin, saya ingin API key provider tersimpan terenkripsi, agar kunci tidak dapat dibaca bila database bocor. | API key dienkripsi AES-256-GCM dengan IV acak per enkripsi dan envelope berversi; key tidak pernah dikirim plaintext ke browser (hanya preview tersensor); key tidak pernah ditulis ke file .env.local oleh runtime. | Sebagian — enkripsi dan penyensoran diterapkan; namun bila AI_MASTER_KEY tidak diset, sistem memakai nilai fallback hardcoded (temuan K3). Lihat Bab 7. |

### 3.9 Ulasan, Komplain, dan Layanan Publik

| **ID** | **User Story** | **Kriteria Penerimaan** | **Status** |
|---|---|---|---|
| F-55 | Sebagai pelanggan, saya ingin memberi ulasan dan rating untuk teknisi setelah pekerjaan selesai, agar kualitas teknisi tercatat. | Ulasan hanya dapat diberikan untuk pesanan completed dengan invoice lunas; satu ulasan per pesanan; rating 1–5; ulasan publik menampilkan nama pelanggan yang disamarkan. | Terimplementasi |
| F-56 | Sebagai pelanggan, saya ingin mengajukan komplain atas pesanan yang bermasalah, agar admin menindaklanjutinya. | Komplain tersimpan dengan kode CMP-YYYYMMDD-XXXXX dan mengubah status pesanan menjadi complained; admin dapat melihat dan menangani komplain. | Sebagian — komplain belum dibatasi pada pesanan completed dalam masa garansi dan belum dibatasi duplikatnya (temuan S19). |
| F-57 | Sebagai tamu, saya ingin melihat katalog layanan dan melacak pesanan dengan kode, tanpa perlu akun. | Katalog publik menampilkan kategori dan layanan beserta harga; pelacakan memakai kode pesanan BAN-... dan menampilkan status serta linimasa tanpa data pribadi lengkap. | Terimplementasi |
| F-58 | Sebagai tamu, saya ingin bertanya kepada chatbot tentang teknisi yang tersedia, agar saya dapat memilih layanan. | Chatbot menampilkan nama, rating, dan spesialisasi teknisi terverifikasi; nomor telepon dan email teknisi TIDAK pernah ditampilkan kepada tamu. | Terimplementasi |

## 4. Kebutuhan Non-Fungsional

Kebutuhan non-fungsional dirumuskan dengan target yang dapat diukur dan diuji. Angka-angka di bawah berasal dari konfigurasi dan kode yang ada; bila suatu target belum diukur secara formal, hal itu dinyatakan secara eksplisit.

### 4.1 Kinerja

| **ID** | **Kebutuhan** | **Target / Kriteria Uji** |
|---|---|---|
| NF-01 | Waktu respons halaman web | Halaman utama dirender server (SSR Next.js); target waktu sampai konten pertama (FCP) di bawah 2 detik pada koneksi broadband standar. Target ini belum diukur formal dan perlu pengujian beban. |
| NF-02 | Waktu respons API non-AI | Endpoint CRUD dan baca database merespons dalam waktu < 500 ms pada beban normal (1 pengguna, database lokal). Query memakai indeks pada kolom kunci (order_code, invoice_number, session_uuid, gateway_transaction_id). |
| NF-03 | Streaming jawaban chatbot | Token pertama jawaban streaming dikirim < 5 detik setelah pesan diterima, bergantung pada latensi provider AI; kegagalan provider dikenali melalui circuit breaker dan retry untuk error transient. |
| NF-04 | Riwayat percakapan | Konteks LLM dibatasi 20 pesan terakhir per sesi agar biaya token dan latensi terkendali; pengambilan riwayat memakai paginasi cursor. |
| NF-05 | Cache pengetahuan | Dokumen knowledge di-cache in-memory dengan TTL 1 menit dan invalidasi otomatis saat admin memperbarui dokumen. |

### 4.2 Keamanan

| **ID** | **Kebutuhan** | **Target / Kriteria Uji** |
|---|---|---|
| NF-06 | Penyimpanan password | Password di-hash dengan bcrypt (12 rounds); tidak ada password plaintext di database maupun log. |
| NF-07 | Sesi dan token | JWT HS256 dengan masa berlaku 8 jam (7 hari bila remember-me); klaim role/status/is_verified direvalidasi ke database pada rute sensitif; reset password mencabut sesi lama (token_version); logout memasukkan jti ke blocklist (revoked_tokens). |
| NF-08 | Perlindungan injeksi SQL | Seluruh query memakai parameter binding (placeholder ?); fragmen SQL dinamis pada mesin query chatbot hanya berasal dari allowlist registry, bukan input pengguna. Audit kode tidak menemukan SQL injection. |
| NF-09 | Perlindungan kredensial AI | API key provider dienkripsi AES-256-GCM di database; tidak pernah dikirim plaintext ke browser dan tidak pernah melalui query string; log audit menyensor nilai key. |
| NF-10 | Perlindungan SSRF pada endpoint AI | Endpoint provider kustom divalidasi sebelum dipakai: hanya HTTPS, host privat/loopback ditolak, seluruh record DNS diperiksa, dan kegagalan DNS bersifat fail-closed. |
| NF-11 | Otorisasi per peran dan kepemilikan | Route API memeriksa peran dan kepemilikan sumber daya (IDOR); chatbot menegakkan row scoping per peran; tamu hanya mengakses data publik. |
| NF-12 | Rate limiting | Login dibatasi 5 percobaan gagal per akun (lockout 15 menit); OTP dibatasi kuota dan cooldown; chat dibatasi per IP (120/menit) dan per identitas (30/menit); pengiriman WhatsApp manual dibatasi 10/menit per admin. |
| NF-13 | Perlindungan data pribadi | PII diminimalkan pada prompt ke provider AI eksternal; nomor telepon pada log dan riwayat notifikasi disensor; kolom sensitif tidak pernah dikembalikan melalui chatbot. |

### 4.3 Keandalan dan Ketersediaan

| **ID** | **Kebutuhan** | **Target / Kriteria Uji** |
|---|---|---|
| NF-14 | Ketahanan terhadap kegagalan provider AI | Circuit breaker membuka setelah 3 kegagalan berurutan (cooldown 30 detik); fallback otomatis ke provider cadangan untuk error yang memenuhi syarat; retry hingga batas retryLimit (default 2 percobaan total, backoff eksponensial 500 ms–4 s) untuk error transient (429/503/timeout). |
| NF-15 | Degradasi yang jujur | Bila database tidak dapat diakses, chatbot mengembalikan pesan error yang jujur ("database tidak dapat diakses") atau state kosong ("tidak ada data") — tidak pernah data contoh yang disajikan sebagai data nyata. |
| NF-16 | Transaksi database | Alur multi-query yang mengubah state (pembatalan pesanan, aksi status teknisi via chatbot, penerbitan invoice) berjalan dalam transaksi dengan rollback bila gagal. |
| NF-17 | Pencatatan notifikasi | Setiap percobaan pengiriman WhatsApp dicatat pada whatsapp_notifications dengan status pending/sent/failed; status tidak pernah dilaporkan sukses bila gateway gagal. |

### 4.4 Kegunaan

| **ID** | **Kebutuhan** | **Target / Kriteria Uji** |
|---|---|---|
| NF-18 | Bahasa antarmuka | Seluruh antarmuka pengguna dan jawaban chatbot memakai Bahasa Indonesia. |
| NF-19 | Gaya jawaban chatbot (lugas) | Pertanyaan daftar dijawab dengan daftar; pertanyaan satu angka dijawab dengan satu baris; detail lengkap hanya untuk pencarian satu entitas spesifik. |
| NF-20 | Aksesibilitas dasar | Aplikasi dapat dipakai melalui peramban modern tanpa plugin tambahan; formulir menampilkan pesan validasi yang jelas. |

### 4.5 Keterpeliharaan dan Keterujian

| **ID** | **Kebutuhan** | **Target / Kriteria Uji** |
|---|---|---|
| NF-21 | Struktur kode | Kode TypeScript terstruktur per modul (src/lib/ai, src/lib/chatbot, src/lib/knowledge, route handler per domain); pemeriksaan tipe penuh dengan tsc --noEmit. |
| NF-22 | Pengujian otomatis | 13 perintah pengujian terdaftar pada package.json (skrip tsx): auth, categories, services, users, technicians, chatbot, chatbot-security, admin-operations, portals, advanced-features, settings-notifications, logout-flow, dan verify:db. Tes chatbot/AI tidak dijalankan di CI karena membutuhkan API key provider asli. |
| NF-23 | Pipeline CI/CD | GitHub Actions menjalankan pada setiap push dan pull request: instalasi dependensi, penyiapan database (skema + migrasi 001–006 + seed), verify:db, typecheck, build, seed admin, dan 5 integration test HTTP (auth, categories, services, users, technicians). Status pipeline pada cabang main per 16 November 2026: hijau (run #12, commit 621d5e8). |
| NF-24 | Migrasi database | Perubahan skema disampaikan sebagai file migrasi bernomor berurutan (001–006) yang idempotent dan dapat dijalankan ulang dengan aman. |

### 4.6 Portabilitas dan Kompatibilitas

| **ID** | **Kebutuhan** | **Target / Kriteria Uji** |
|---|---|---|
| NF-25 | Portabilitas deployment | Aplikasi berjalan pada Node.js 20 di Linux maupun Windows; konfigurasi melalui variabel lingkungan (.env.local), bukan nilai hardcoded. |
| NF-26 | Kompatibilitas provider AI | Selain Gemini dan Groq, sistem mendukung provider kustom yang kompatibel dengan API OpenAI (mis. DeepSeek) melalui endpoint yang dapat dikonfigurasi. |
| NF-27 | Kompatibilitas basis data | Skema dan migrasi ditulis untuk MySQL 8.0; sintaks khusus MariaDB tidak dipakai. |

## 5. Model Data

### 5.1 Ringkasan Skema Basis Data

Basis data BANTUIN memakai MySQL 8.0 dengan nama database bantuin_db. Skema dasar (database/schema.sql) mendefinisikan 33 tabel, dan migrasi 005 menambahkan 1 tabel (revoked_tokens), sehingga instalasi penuh memiliki 34 tabel dengan 48 foreign key pada schema.sql. Sebagian besar tabel memakai primary key auto-increment (kecuali ai_global_settings yang hanya berisi satu baris pengaturan global) dan kolom audit created_at; kolom updated_at ada pada sebagian besar tabel operasional, sementara tabel log (mis. ai_usage_logs, admin_audit_logs, repair_status_history) dan tabel pengaturan hanya memakai created_at. Soft delete (deleted_at) dipakai pada empat tabel: users, appliance_categories, services, dan repair_requests.

*Catatan ketelitian: README proyek saat ini menyatakan "31 tabel". Angka itu merujuk pada registry skema chatbot yang mencakup 31 tabel; dua tabel terbaru (admin_profiles dan ai_knowledge_base) belum terdaftar pada registry, dan revoked_tokens hanya dibuat melalui migrasi 005 (tidak ada pada schema.sql). Lampiran A mencantumkan seluruh 34 tabel. README perlu diperbarui dan registry perlu dilengkapi — dicatat pada Bab 7.*

Diagram ERD lengkap beserta kardinalitas setiap relasi dimodelkan pada Dokumen SDD (Tahap 2). Bab ini hanya merangkum pengelompokan tabel dan relasi utama.

### 5.2 Tabel per Domain

| **Domain** | **Tabel** | **Keterangan** |
|---|---|---|
| Identitas & Akun | users, user_otps, user_refresh_tokens, revoked_tokens | Akun pengguna (admin/customer/technician), OTP WhatsApp, token refresh, dan blocklist token logout. |
| Profil & Katalog | customer_profiles, technician_profiles, technician_documents, technician_specializations, appliance_categories, services, admin_profiles | Profil per peran, dokumen dan spesialisasi teknisi, kategori peralatan, layanan, dan profil admin. |
| Perbaikan (inti bisnis) | repair_requests, repair_status_history, technician_assignments, technician_schedules, repair_diagnoses, repair_chat_rooms, repair_chat_messages | Pesanan perbaikan beserta status 11 nilai, riwayat status, penugasan, jadwal kunjungan, diagnosis/estimasi, dan chat per pesanan. |
| Keuangan | invoices, payments | Tagihan (satu per pesanan) dan catatan pembayaran (settlement, refund) dari gateway. |
| Ulasan & Komplain | repair_reviews, repair_complaints | Ulasan/rating teknisi (satu per pesanan) dan komplain pelanggan. |
| AI & Chatbot | ai_provider_configs, ai_global_settings, ai_connection_test_logs, ai_usage_logs, ai_config_audit_logs, ai_consultation_sessions, ai_chat_messages, ai_knowledge_base | Konfigurasi provider AI dan pengaturannya, log tes koneksi dan pemakaian, sesi konsultasi chatbot, pesan chat, dan dokumen basis pengetahuan RAG. |
| Komunikasi & Sistem | notifications, whatsapp_notifications, system_settings, admin_audit_logs | Notifikasi in-app, log pengiriman WhatsApp, pengaturan sistem, dan log audit admin. |

### 5.3 Relasi Utama

- repair_requests adalah tabel inti: setiap pesanan dimiliki satu customer (customer_id ke users), merujuk satu layanan (service_id), dan dapat memiliki banyak baris riwayat status (repair_status_history), satu invoice (invoices, unique key repair_request_id), satu ulasan (repair_reviews), dan satu ruang chat (repair_chat_rooms).

- technician_assignments menghubungkan pesanan dengan teknisi (technician_id ke users) dan mencatat status penawaran (offered/accepted/rejected/reassigned/completed/cancelled).

- payments merujuk invoices; satu invoice dapat memiliki banyak baris pembayaran (cicilan/percobaan ulang), sehingga rekonsiliasi pendapatan memakai COUNT DISTINCT atas invoice_id dan membedakan settlement dari refund.

- ai_consultation_sessions dimiliki pengguna (user_id, dapat null untuk tamu) dan menampung banyak ai_chat_messages; sesi dapat ditandai terkonversi menjadi pesanan.

- ai_provider_configs menyimpan konfigurasi per provider (kunci API terenkripsi); ai_global_settings menyimpan satu baris pengaturan global (provider aktif, fallback, version untuk invalidasi cache).

- Seluruh relasi memakai foreign key dengan perilaku hapus yang ditetapkan pada skema; penghapusan data pengguna bersifat soft delete (deleted_at) agar riwayat pesanan dan keuangan tetap utuh.

## 6. Antarmuka

### 6.1 Antarmuka Pengguna

Antarmuka berupa aplikasi web responsif berbahasa Indonesia dengan tiga area utama: halaman publik (beranda, katalog layanan, pelacakan pesanan, ulasan teknisi), portal pelanggan dan teknisi (dashboard, pesanan, tugas, jadwal, profil, chat), dan panel admin (pengguna, teknisi, kategori, layanan, pesanan, laporan, audit log, pengaturan, konfigurasi AI, dan notifikasi WhatsApp). Widget chatbot tersedia pada halaman-halaman utama dan membuka sesi konsultasi.

Antarmuka dibangun dengan React 19 dan Tailwind CSS 4. Tidak ada persyaratan aksesibilitas formal (mis. WCAG) yang ditetapkan pada versi ini.

### 6.2 Antarmuka Perangkat Keras

Tidak ada antarmuka perangkat keras khusus. Server membutuhkan mesin yang dapat menjalankan Node.js 20 dan MySQL 8.0; klien membutuhkan perangkat dengan peramban modern dan koneksi internet. Pengiriman WhatsApp tidak memakai perangkat telepon lokal — seluruh pesan dikirim melalui API gateway Fonnte.

### 6.3 Antarmuka Perangkat Lunak

| **Antarmuka** | **Deskripsi** |
|---|---|
| Basis data | MySQL 8.0 melalui driver mysql2 dengan connection pool; seluruh query memakai parameter binding. |
| API provider AI | Google Gemini melalui REST API v1beta; Groq dan provider kustom (mis. DeepSeek) melalui API yang kompatibel dengan OpenAI (endpoint /chat/completions dan /models). Kunci API dikirim melalui header Authorization. |
| Gateway WhatsApp | Fonnte API (https://api.fonnte.com/send) melalui HTTPS POST dengan token pada header; dipakai untuk OTP dan notifikasi. |
| CI/CD | GitHub Actions: workflow .github/workflows/ci.yml pada repositori synthstack-s/proyek-rpl-bantuin. |

### 6.4 Antarmuka Komunikasi

Seluruh komunikasi klien–server memakai HTTPS (pada deployment produksi) dengan API berbasis JSON pada route handler Next.js (/api/...). Autentikasi memakai JWT pada cookie HttpOnly (SameSite, Secure pada produksi). Streaming jawaban chatbot dan notifikasi real-time memakai Server-Sent Events (SSE).

Webhook pembayaran dari gateway (direncanakan, lihat F-31) akan memakai endpoint /api/webhooks/payment dengan verifikasi signature HMAC memakai server key dari variabel lingkungan. Pada versi ini verifikasi tersebut belum diimplementasikan (temuan K1) sehingga endpoint webhook tidak boleh dianggap aman untuk pembayaran nyata.

## 7. Batasan dan Asumsi

### 7.1 Keterbatasan yang Diketahui

Keterbatasan berikut dicatat secara terbuka berdasarkan dua audit kode tanggal 13 November 2026 dan verifikasi kode pada cabang main. Keterbatasan ini tidak menghalangi penilaian Tahap 1, tetapi wajib diperhatikan sebelum aplikasi menerima pengguna dan pembayaran nyata.

| **ID** | **Keterbatasan** | **Dampak dan Status** |
|---|---|---|
| K1 | Webhook pembayaran tidak memverifikasi signature gateway dan tidak memverifikasi jumlah pembayaran. | Siapa pun dapat menandai invoice sebagai lunas tanpa membayar. Perlu verifikasi HMAC + verifikasi jumlah sebelum menerima pembayaran nyata. |
| K2 | Endpoint /pay adalah SIMULASI: menandai invoice lunas tanpa interaksi payment gateway. | Pelanggan dapat melunasi tagihannya sendiri secara gratis. Endpoint harus diganti alur gateway nyata (F-31) atau dikunci di balik flag non-produksi. |
| K3 | Secret master enkripsi memiliki nilai default hardcoded bila AI_MASTER_KEY / JWT_ACCESS_SECRET tidak diset. | API key provider yang tersimpan dapat didekripsi siapa pun yang memegang dump database. Perlu fail-hard saat startup, penghapusan nilai default, dan rotasi key. |
| T10 (sebagian) | Route HTTP PATCH technician/tasks belum menerapkan state machine dan transaksi. | Teknisi dapat menyelesaikan pesanan tanpa persetujuan pelanggan dan mengubah jumlah invoice yang sudah lunas melalui route HTTP. Jalur chatbot sudah menerapkan state machine dan transaksi. |
| T12 | GET jadwal kunjungan belum memeriksa kepemilikan. | Pengguna login mana pun dapat membaca jadwal pesanan orang lain beserta nomor teknisi. |
| T13 | Reassign admin tidak membatalkan assignment yang sudah accepted. | Dua teknisi dapat aktif pada satu pesanan secara bersamaan. |
| S18/S19 | Persetujuan diagnosis dan komplain belum memeriksa status pesanan dan masa garansi. | Pesanan selesai dapat di-rewind; komplain dapat diajukan pada pesanan apa pun tanpa batas duplikat. |
| S25 | Biaya platform hardcoded Rp 10.000 dan mengabaikan pengaturan system_settings (Rp 5.000). | Pengaturan biaya platform di panel admin tidak berpengaruh. |
| Lainnya | Rate limiting dan sebagian memori sesi bersifat in-memory per instance; file unggahan disimpan pada public/uploads; belum ada preferensi/opt-out notifikasi; registry skema chatbot mencakup 31 dari 34 tabel; README menyatakan 31 tabel; estimasi pendapatan teknisi dapat menghitung ganda satu invoice bila satu pesanan punya banyak assignment dan daftar tugas teknisi belum memakai pagination (temuan S14). | Batasan berlaku pada deployment multi-instance dan menunjukkan dokumentasi/registry yang perlu dilengkapi. |

### 7.2 Pekerjaan Mendatang

Urutan pekerjaan mendatang yang direkomendasikan, mengikuti prioritas audit:

- Integrasi payment gateway nyata (Midtrans atau Xendit): pembuatan transaksi, verifikasi signature webhook, verifikasi jumlah, dan penonaktifan simulasi /pay (K1, K2). Memerlukan keputusan pemilihan gateway dan ketersediaan server key.

- Penghapusan secret fallback hardcoded dan penerapan fail-hard bila master key tidak dikonfigurasi, disertai rotasi API key yang pernah dienkripsi dengan secret default (K3).

- Penyelesaian state machine dan transaksi pada route HTTP teknisi (T10 sisi HTTP), pengecekan kepemilikan jadwal (T12), perbaikan reassign (T13), serta validasi status pada diagnosis dan komplain (S18, S19).

- Pelengkapan registry skema chatbot (admin_profiles, ai_knowledge_base, revoked_tokens) dan pembaruan README (jumlah tabel).

- Pemindahan rate limiting ke store terdistribusi, penyimpanan objek untuk file unggahan, penambahan preferensi notifikasi/opt-out, dan pengujian beban formal untuk target kinerja NF-01.

- Pengujian live menyeluruh pada perangkat pengembang: migrasi 006, pengiriman WhatsApp manual dan otomatis, akurasi jawaban chatbot, pergantian API key, dan penolakan token setelah logout.

## Lampiran A — Daftar Tabel Basis Data

Seluruh 34 tabel pada instalasi penuh (33 pada schema.sql + revoked_tokens dari migrasi 005). Kolom "Registry" menyatakan apakah tabel terdaftar pada registry skema chatbot (src/lib/chatbot/schema-registry.ts).

| **No** | **Tabel** | **Domain** | **Registry** | **Keterangan** |
|---|---|---|---|---|
| 1 | users | Identitas | Ya | Akun pengguna (admin/customer/technician) beserta status. |
| 2 | user_otps | Identitas | Ya | Kode OTP WhatsApp beserta status pengiriman. |
| 3 | user_refresh_tokens | Identitas | Ya | Token refresh (skema tersedia; alur refresh belum dipakai). |
| 4 | revoked_tokens | Identitas | Tidak | Blocklist jti token yang sudah logout (migrasi 005). |
| 5 | customer_profiles | Profil | Ya | Profil pelanggan. |
| 6 | technician_profiles | Profil | Ya | Profil teknisi beserta status verifikasi. |
| 7 | technician_documents | Profil | Ya | Dokumen pendukung teknisi. |
| 8 | technician_specializations | Profil | Ya | Spesialisasi teknisi. |
| 9 | admin_profiles | Profil | Tidak | Profil admin (fitur lokal, belum di registry). |
| 10 | appliance_categories | Katalog | Ya | Kategori peralatan. |
| 11 | services | Katalog | Ya | Layanan perbaikan beserta harga dasar. |
| 12 | repair_requests | Perbaikan | Ya | Pesanan perbaikan (inti bisnis). |
| 13 | repair_status_history | Perbaikan | Ya | Riwayat perubahan status pesanan. |
| 14 | technician_assignments | Perbaikan | Ya | Penugasan teknisi pada pesanan. |
| 15 | technician_schedules | Perbaikan | Ya | Jadwal kunjungan teknisi. |
| 16 | repair_diagnoses | Perbaikan | Ya | Diagnosis dan estimasi biaya. |
| 17 | repair_chat_rooms | Perbaikan | Ya | Ruang chat per pesanan. |
| 18 | repair_chat_messages | Perbaikan | Ya | Pesan chat per pesanan. |
| 19 | invoices | Keuangan | Ya | Tagihan (satu per pesanan). |
| 20 | payments | Keuangan | Ya | Catatan pembayaran (settlement/refund). |
| 21 | repair_reviews | Ulasan | Ya | Ulasan dan rating teknisi. |
| 22 | repair_complaints | Ulasan | Ya | Komplain pelanggan. |
| 23 | ai_provider_configs | AI | Ya | Konfigurasi provider AI (kunci terenkripsi). |
| 24 | ai_global_settings | AI | Ya | Pengaturan global AI (provider aktif, fallback, version). |
| 25 | ai_connection_test_logs | AI | Ya | Log pengujian koneksi provider. |
| 26 | ai_usage_logs | AI | Ya | Log pemakaian AI (kuota dan metrik). |
| 27 | ai_config_audit_logs | AI | Ya | Log audit perubahan konfigurasi AI. |
| 28 | ai_consultation_sessions | AI | Ya | Sesi konsultasi chatbot. |
| 29 | ai_chat_messages | AI | Ya | Pesan percakapan chatbot. |
| 30 | ai_knowledge_base | AI | Tidak | Dokumen basis pengetahuan RAG (fitur lokal, belum di registry). |
| 31 | notifications | Komunikasi | Ya | Notifikasi in-app. |
| 32 | whatsapp_notifications | Komunikasi | Ya | Log pengiriman notifikasi WhatsApp. |
| 33 | system_settings | Sistem | Ya | Pengaturan sistem (biaya, kuota, garansi). |
| 34 | admin_audit_logs | Sistem | Ya | Log audit aktivitas administrator. |

## Lampiran B — Glosarium

| **Istilah** | **Arti dalam Konteks BANTUIN** |
|---|---|
| Assignment (penugasan) | Penawaran tugas perbaikan kepada teknisi tertentu; berstatus offered hingga diterima/ditolak. |
| Diagnosis | Hasil pemeriksaan teknisi atas kerusakan, disertai estimasi biaya yang perlu disetujui pelanggan. |
| Expert system | Mesin jawaban berbasis aturan (tanpa LLM) yang dipakai chatbot pada mode offline. |
| Governed query | Mesin query chatbot yang hanya membangun SELECT dengan allowlist tabel/kolom, row scoping per peran, dan batasan LIMIT. |
| Invoice | Tagihan atas satu pesanan perbaikan; diterbitkan saat teknisi menyelesaikan pekerjaan. |
| Kuota AI | Batas jumlah request AI per pengguna per hari (default 10). |
| Provider AI | Layanan model bahasa eksternal (Gemini, Groq, DeepSeek, atau kustom) yang dipakai chatbot. |
| Row scoping | Pembatasan baris hasil query berdasarkan pemilik data (mis. pelanggan hanya membaca baris miliknya). |
| Settlement | Status pembayaran yang menyatakan dana telah diterima gateway (lunas). |
| Slot / jadwal | Waktu kunjungan teknisi yang disepakati untuk satu pesanan. |

## Lampiran C — Ketertelusuran Kebutuhan

Matriks ini menelusur setiap kelompok kebutuhan ke sumber verifikasinya (kode pada cabang main, README, atau laporan audit), sehingga penilai dapat memeriksa sendiri kesesuaian dokumen dengan implementasi.

| **Kebutuhan** | **Sumber Verifikasi** |
|---|---|
| F-01 – F-08 (Autentikasi & akun) | src/app/api/auth/\*, src/lib/auth.ts, src/lib/otp.ts, migrasi 004 (token_version), migrasi 005 (revoked_tokens); audit T4–T6. |
| F-09 – F-16 (Pesanan pelanggan) | src/app/api/customer/repairs/\*, src/app/api/repairs/[id]/chat, src/app/api/repairs/[id]/schedule, src/app/api/chat/convert-to-order; database/schema.sql (repair_requests, 11 status). |
| F-17 – F-21 (Tugas teknisi) | src/app/api/technician/tasks/\*, src/app/api/technician/schedules, src/app/api/technician/profile; src/lib/chatbot/action-service.ts; audit T10, S6. |
| F-22 – F-28 (Operasional admin) | src/app/api/admin/\*, src/components/admin/\*; audit T13, S25. |
| F-29 – F-32 (Pembayaran & invoice) | src/app/api/technician/tasks/[id] (complete), src/app/api/customer/repairs/[id]/pay, src/app/api/webhooks/payment; audit K1, K2, S19, S25. |
| F-33 – F-43 (Chatbot & AI) | src/app/api/chat/\*, src/lib/chatbot/\* (engine, data-service, tools, guard, schema-registry), src/lib/knowledge/\* (rag-engine, knowledge-service), src/lib/ai/\*; README bagian Fitur AI; audit AI/chatbot. |
| F-44 – F-48 (Notifikasi WhatsApp) | src/lib/wa-notifications.ts, src/lib/fonnte.ts, src/app/api/admin/whatsapp/\*, migrasi 006 (whatsapp_notifications). |
| F-49 – F-54 (Manajemen provider AI) | src/app/api/admin/ai/\*, src/lib/ai/\* (repository, provider-manager, adapters, encryption, ssrf-validator), src/components/admin/AIProviderSettingsSection.tsx; audit T1–T3, K3. |
| F-55 – F-58 (Ulasan, komplain, publik) | src/app/api/customer/repairs/[id]/review, src/app/api/customer/repairs/[id]/complaint, src/app/api/public/\*; audit T8, T11, S19. |
| NF-01 – NF-05 (Kinerja) | Konfigurasi kode (LIMIT riwayat 20 pesan, TTL cache knowledge 1 menit); target respons halaman belum diukur formal. |
| NF-06 – NF-13 (Keamanan) | src/lib/auth.ts, src/lib/ai/encryption.ts, src/lib/ai/ssrf-validator.ts, src/lib/rate-limiter.ts, src/lib/chatbot/data-service.ts (governed query); audit keamanan. |
| NF-14 – NF-17 (Keandalan) | src/lib/ai/provider-manager.ts (circuit breaker, fallback, retry), src/lib/chatbot/engine.ts (mode offline), src/lib/wa-notifications.ts. |
| NF-21 – NF-24 (Keterpeliharaan & pengujian) | package.json (13 perintah pengujian), .github/workflows/ci.yml (13 langkah), database/migrations/001–006; status CI hijau run #12 (16 November 2026). |
| Bab 5 & Lampiran A (Model data) | database/schema.sql (887 baris, 33 tabel, 48 foreign key), migrasi 005 (revoked_tokens), src/lib/chatbot/schema-registry.ts (31 tabel). |

*— Akhir Dokumen —*
