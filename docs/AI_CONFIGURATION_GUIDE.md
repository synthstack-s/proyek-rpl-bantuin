# Panduan Konfigurasi AI Provider BANTUIN

Dokumen ini memandu Administrator platform BANTUIN dalam mengonfigurasi, menguji, dan mengelola penyedia layanan kecerdasan buatan (Google Gemini API dan Groq AI) melalui Admin Panel.

---

## 1. Lokasi Antarmuka Pengaturan

Fitur AI Configuration dapat diakses melalui:
- **Navigasi Langsung**: Buka URL `/admin/settings/ai`.
- **Melalui Pengaturan Global**: Buka **Admin Panel → Pengaturan Sistem**, pilih tab **Kecerdasan Buatan (AI)**, lalu klik tombol **"Buka AI Configuration Console →"**.

---

## 2. Langkah Konfigurasi Google Gemini

1. Buka halaman `/admin/settings/ai`.
2. Pada bagian **Konfigurasi Google Gemini**:
   - **API Key**: Masukkan kunci API yang didapatkan dari Google AI Studio (`https://aistudio.google.com/`). Klik ikon mata untuk melihat/menyembunyikan teks.
   - **API Endpoint**: Biarkan default (`https://generativelanguage.googleapis.com`) kecuali menggunakan proxy resmi yang diizinkan.
   - **Ambil Model API**: Klik tombol **"Ambil Model API"** untuk memperbarui daftar model terbaru dari server Google Cloud.
   - **Selected Model**: Pilih model yang diinginkan (rekomendasi: `gemini-3.5-flash` untuk kecepatan respons optimal).
   - **Hyperparameters**:
     - *Temperature*: `0.7` (kreativitas berimbang).
     - *Max Output Tokens*: `2048`.
     - *Timeout*: `30000` ms (30 detik).
     - *Retry Limit*: `2` kali.
3. Klik tombol **"Tes Koneksi"** untuk memverifikasi keabsahan API Key dan ketersediaan model.
4. Jika tes berhasil (status `SUCCESS`), klik tombol **"Simpan Gemini"**.

---

## 3. Langkah Konfigurasi Groq AI

1. Buka halaman `/admin/settings/ai`.
2. Pada bagian **Konfigurasi Groq AI**:
   - **API Key**: Masukkan kunci API yang didapatkan dari Groq Console (`https://console.groq.com/keys`). Format kunci biasanya berawalan `gsk_...`.
   - **API Endpoint**: Biarkan default (`https://api.groq.com/openai/v1`).
   - **Ambil Model API**: Klik tombol **"Ambil Model API"** untuk menarik katalog model LPU aktif dari Groq.
   - **Selected Model**: Pilih model (rekomendasi: `llama-3.3-70b-versatile` atau `mixtral-8x7b-32768`).
   - **Hyperparameters**: Sesuaikan batas token dan timeout.
3. Klik tombol **"Tes Koneksi"**.
4. Setelah hasil uji status `SUCCESS`, klik tombol **"Simpan Groq"**.

---

## 4. Cara Mengganti Provider AI Aktif

1. Pada kartu **Provider Overview** atau di bagian **Pengaturan Active Provider & Automatic Fallback**:
2. Klik tombol **"Set Jadi Provider Aktif"** pada provider yang ingin diaktifkan, atau klik kartu radio provider pilihan Anda.
3. Modal konfirmasi akan muncul menjelaskan dampak pengalihan.
4. Klik **"Aktifkan Sekarang"**.
5. Sistem akan:
   - Memvalidasi bahwa provider target memiliki API Key terenkripsi yang valid.
   - Mengubah kolom `active_provider` di database secara atomik.
   - Menaikkan nomor `version` konfigurasi global.
   - Mengalihkan seluruh sesi obrolan baru ke provider yang baru dipilih secara instan.

---

## 5. Mengaktifkan Automatic Fallback

Fitur Automatic Fallback menjamin ketersediaan Chatbot+ 24/7 tanpa henti:
1. Pada bagian **Pengaturan Active Provider & Automatic Fallback**, periksa sakelar **"Automatic Fallback Engine"**.
2. Klik toggle untuk mengaktifkan (warna hijau).
3. Jika Google Gemini adalah provider aktif, maka Groq AI otomatis menjadi provider cadangan, dan sebaliknya.
4. Bila provider aktif mengalami kendala jaringan, kuota habis (HTTP 429), atau downtime server (5xx):
   - Sistem secara otomatis mengalihkan request pengguna ke provider cadangan.
   - Di balasan obrolan dan metadata tercatat `(fallback)`.
   - Kejadian dicatat ke tabel metrik telemetri.

---

## 6. Pemecahan Masalah (Troubleshooting)

| Gejala Masalah | Kemungkinan Penyebab | Tindakan Penyelesaian |
|---|---|---|
| Status `invalid_api_key` (401) | API Key salah, expired, atau dinonaktifkan oleh vendor. | Periksa kredensial di console penyedia dan masukkan ulang key yang masih aktif. |
| Status `invalid_endpoint` | URL endpoint tidak diawali HTTPS atau mengarah ke IP privat. | Gunakan endpoint resmi (`https://generativelanguage.googleapis.com` atau `https://api.groq.com/openai/v1`). |
| Status `model_not_available` (404) | Model yang dipilih dihentikan (*deprecated*) oleh vendor. | Klik tombol "Ambil Model API" dan pilih model versi stabil terbaru. |
| Status `rate_limit_exceeded` (429) | Kuota RPM/TPM harian pada akun penyedia terlampaui. | Pastikan Automatic Fallback diaktifkan agar trafik dialihkan ke penyedia alternatif, atau tingkatkan tier paket API. |
| Status `timeout` | Jaringan terhambat atau beban server vendor tinggi. | Naikkan parameter Request Timeout menjadi 45000 ms (45 detik). |

