# PANDUAN KONFIGURASI SISTEM AI BANTUIN

## 1. Variabel Lingkungan (`.env.local`)

| Variabel | Tipe | Contoh / Default | Deskripsi |
| :--- | :--- | :--- | :--- |
| `ACTIVE_AI_PROVIDER` | string | `gemini` / `groq` | Menentukan provider AI aktif default pada startup |
| `GEMINI_API_KEY` | string | `AQ...` | API Key resmi Google Gemini (Google AI Studio) |
| `GEMINI_MODEL` | string | `gemini-3.5-flash` | Model Google Gemini yang digunakan |
| `GROQ_API_KEY` | string | `gsk_...` | API Key resmi Groq LPU |
| `GROQ_MODEL` | string | `openai/gpt-oss-120b` | Model Groq yang digunakan |
| `GROQ_API_ENDPOINT` | string | `https://api.groq.com/openai/v1` | Endpoint kompatibel OpenAI dari Groq |
| `AI_CREDENTIALS_ENCRYPTION_KEY` | string | `64 hex chars` | Kunci enkripsi AES-256-GCM untuk kredensial |
| `ENABLE_AI_FALLBACK` | boolean | `true` | Mengaktifkan peralihan otomatis saat provider utama kendala |
| `FALLBACK_AI_PROVIDER` | string | `gemini` | Provider tujuan pengalihan cadangan |
| `FORCE_OFFLINE_AI` | boolean | `false` | Memaksa sistem menggunakan Expert System lokal |

---

## 2. Manajemen Multi-Provider Melalui Admin Console

Administrator dapat menambah, mengedit, dan menguji provider AI secara langsung tanpa menyentuh kode program:
1. Masuk ke **Admin Console → Konfigurasi Sistem → AI Provider Management**.
2. Klik **Tambah Provider AI** untuk mendaftarkan provider kompatibel OpenAI (DeepSeek, OpenRouter, Mistral, dll).
3. Klik tombol **Tes Koneksi** untuk memverifikasi handshake API Key dan latensi secara langsung.
4. Klik **Pilih Jadi Aktif** untuk mengubah provider aktif secara instan. Konfigurasi otomatis disinkronkan ke database dan file `.env.local`.

---

## 3. Circuit Breaker & Automatic Fallback Rules

- **Threshold Kegagalan:** Jika provider utama mengalami 3 kali kegagalan beruntun (HTTP 429 Too Many Requests, HTTP 500, atau timeout), *Circuit Breaker* membuka sirkuit.
- **Peralihan Instan:** Permintaan berikutnya langsung dialihkan ke provider cadangan (Google Gemini) tanpa membuat pengguna menunggu lama atau mengalami error.
- **Cooldown Recovery:** Setelah 60 detik (*cooldown period*), sirkuit memasuki status *half-open* untuk menguji kembali kesehatan provider utama.

