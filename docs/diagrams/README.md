# Diagram BANTUIN

Kumpulan 21 diagram perancangan BANTUIN dari SDD (Software Design Document) v1.0 DRAFT, November 2026. Semua diagram dibuat dari kode aplikasi pada repositori ini (cabang `main`, HEAD `621d5e83`) dan PRD pada [`../PRD.md`](../PRD.md).

> **Catatan:** diagram pembayaran pada use case ditandai **SIMULASI** karena payment gateway nyata (F-31) belum terimplementasi — endpoint `/pay` saat ini simulasi.

## Daftar isi

- [Arsitektur](#arsitektur)
- [Use Case](#use-case)
- [Activity](#activity)
- [Class](#class)
- [Sequence](#sequence)
- [ERD](#erd)

## Arsitektur

### Arsitektur Sistem BANTUIN

SDD Bab 2 — Arsitektur.

![Arsitektur Sistem BANTUIN](arsitektur.png)

Arsitektur 5 lapis BANTUIN (presentasi, API, logika bisnis, data, dan layanan eksternal) beserta pola desain yang dipakai: Singleton, Adapter, Repository, Guard, dan Circuit Breaker. Strip bawah menunjukkan pipeline CI/CD GitHub Actions.

## Use Case

### Diagram Use Case Keseluruhan — Sistem BANTUIN

SDD Bab 3, §3.1 — Aktor dan Ringkasan.

![Diagram Use Case Keseluruhan — Sistem BANTUIN](usecase_keseluruhan.png)

Satu diagram untuk keseluruhan sistem: 15 oval kelompok yang mencakup seluruh kebutuhan F-01–F-58. Keempat aktor manusia (Tamu, Pelanggan, Teknisi, Admin) di kiri; OTP Services dan AI Services — layanan yang berjalan 24 jam — di kanan. Oval pembayaran ditandai SIMULASI.

### Diagram Use Case — Guest (Tamu)

SDD Bab 3, §3.2 — Guest (Tamu).

![Diagram Use Case — Guest (Tamu)](usecase_guest.png)

Use case Tamu: melihat katalog layanan, melacak pesanan dengan kode, bertanya ke chatbot untuk info publik, menanyakan teknisi yang tersedia, dan mendaftar sebagai pelanggan atau teknisi.

### Diagram Use Case — Customer (Pelanggan)

SDD Bab 3, §3.3 — Customer (Pelanggan).

![Diagram Use Case — Customer (Pelanggan)](usecase_customer.png)

Use case Pelanggan (15): masuk dengan OTP WhatsApp, mengelola profil, membuat dan melacak pesanan, menyetujui atau menolak estimasi, chat dengan teknisi, bertanya ke chatbot AI, serta memberi ulasan dan mengajukan komplain.

### Diagram Use Case — Technician (Teknisi)

SDD Bab 3, §3.4 — Technician (Teknisi).

![Diagram Use Case — Technician (Teknisi)](usecase_teknisi.png)

Use case Teknisi (10): menerima atau menolak tawaran tugas, membuat diagnosis dan estimasi biaya, memperbarui status pengerjaan, melihat jadwal dan riwayat tugas, serta menjalankan aksi tugas lewat chatbot.

### Diagram Use Case — Admin

SDD Bab 3, §3.5 — Admin.

![Diagram Use Case — Admin](usecase_admin.png)

Use case Admin (14): mengelola pengguna, teknisi, kategori, dan layanan; menugaskan teknisi; melihat laporan operasional dan log audit; mengelola provider AI; serta mengirim notifikasi WhatsApp manual.

## Activity

### Diagram Activity — Pemesanan Perbaikan

SDD Bab 4 — Activity.

![Diagram Activity — Pemesanan Perbaikan](activity_pemesanan.png)

Alur pemesanan perbaikan dari permintaan pelanggan sampai penyelesaian: penawaran tugas, penerimaan teknisi, diagnosis, estimasi biaya, persetujuan pelanggan, pengerjaan, dan penerbitan invoice.

### Diagram Activity — Chat AI

SDD Bab 4 — Activity.

![Diagram Activity — Chat AI](activity_chat_ai.png)

Alur percakapan chatbot AI: penerimaan pesan, klasifikasi intent, pengambilan konteks RAG dan data operasional dengan tata kelola akses per peran, pemanggilan LLM, sampai pengiriman jawaban (streaming SSE).

### Diagram Activity — Notifikasi WhatsApp

SDD Bab 4 — Activity.

![Diagram Activity — Notifikasi WhatsApp](activity_notifikasi_wa.png)

Alur notifikasi WhatsApp: pengiriman manual dari panel admin dan pengiriman otomatis saat status pesanan berubah, termasuk pencatatan status kirim dan dedupe 5 menit.

## Class

### Diagram Class — Domain Identitas & Pengguna

SDD Bab 5 — Class.

![Diagram Class — Domain Identitas & Pengguna](class_identitas.png)

Kelas domain Identitas & Pengguna: akun pengguna, profil pelanggan dan teknisi, OTP, dan sesi.

### Diagram Class — Domain Perbaikan, Keuangan & Umpan Balik

SDD Bab 5 — Class.

![Diagram Class — Domain Perbaikan, Keuangan & Umpan Balik](class_perbaikan.png)

Kelas domain Perbaikan, Keuangan & Umpan Balik: pesanan, tugas teknisi, invoice, pembayaran, ulasan, dan komplain.

### Diagram Class — Modul AI & Chatbot (Pipeline)

SDD Bab 5 — Class.

![Diagram Class — Modul AI & Chatbot (Pipeline)](class_ai_pipeline.png)

Kelas modul AI & chatbot (pipeline): engine chatbot, data-service, tools, guard, dan schema-registry.

### Diagram Class — Modul AI (Provider, Keamanan & Evaluasi)

SDD Bab 5 — Class.

![Diagram Class — Modul AI (Provider, Keamanan & Evaluasi)](class_ai_provider.png)

Kelas modul AI (provider, keamanan & evaluasi): provider-manager, adapter Gemini/Groq, enkripsi kunci API, dan evaluasi.

### Diagram Class — Modul Pendukung (Auth, OTP, Rate Limit, WA)

SDD Bab 5 — Class.

![Diagram Class — Modul Pendukung (Auth, OTP, Rate Limit, WA)](class_support.png)

Kelas modul pendukung: autentikasi dan token JWT, OTP WhatsApp, rate limiter, dan notifikasi WhatsApp.

## Sequence

### Diagram Sequence — Chat AI End-to-End

SDD Bab 6 — Sequence.

![Diagram Sequence — Chat AI End-to-End](sequence_chat_ai.png)

Interaksi chat AI end-to-end dalam 16 pesan: dari pesan pengguna sampai jawaban LLM, termasuk pemanggilan tool database yang dikelola (governed query).

### Diagram Sequence — Pemesanan Perbaikan

SDD Bab 6 — Sequence.

![Diagram Sequence — Pemesanan Perbaikan](sequence_pemesanan.png)

Interaksi pemesanan perbaikan dalam 17 pesan: dari pembuatan pesanan oleh pelanggan sampai invoice diterbitkan.

## ERD

### ERD — Peta Relasi Antar-Domain

SDD Bab 7 — ERD.

![ERD — Peta Relasi Antar-Domain](erd_domain_map.png)

Peta relasi antar-domain: Identitas (9 tabel), Perbaikan (9 tabel), AI & Komunikasi (12 tabel), dan Keuangan (4 tabel) — total 34 tabel dan 48 foreign key.

### ERD — Domain Identitas & Pengguna

SDD Bab 7 — ERD.

![ERD — Domain Identitas & Pengguna](erd_identitas.png)

ERD domain Identitas & Pengguna: 9 tabel dan 11 foreign key.

### ERD — Domain Perbaikan

SDD Bab 7 — ERD.

![ERD — Domain Perbaikan](erd_perbaikan.png)

ERD domain Perbaikan: 9 tabel dan 19 foreign key.

### ERD — Domain Keuangan & Umpan Balik

SDD Bab 7 — ERD.

![ERD — Domain Keuangan & Umpan Balik](erd_keuangan.png)

ERD domain Keuangan & Umpan Balik: 4 tabel dan 9 foreign key.

### ERD — Domain AI & Komunikasi

SDD Bab 7 — ERD.

![ERD — Domain AI & Komunikasi](erd_ai.png)

ERD domain AI & Komunikasi: 12 tabel dan 9 foreign key.
