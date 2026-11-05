# Skema Basis Data AI Provider Management BANTUIN

Dokumen ini mendokumentasikan secara rinci arsitektur tabel database MySQL 8.0 yang digunakan untuk menyimpan konfigurasi, status, audit, dan telemetri modul AI Provider Management.

---

## 1. Daftar Tabel

1. `ai_provider_configs`: Menyimpan parameter dan kredensial terenkripsi per provider.
2. `ai_global_settings`: Menyimpan status provider aktif dan pengaturan fallback global (single-row table).
3. `ai_connection_test_logs`: Menyimpan riwayat hasil pengujian koneksi live API.
4. `ai_usage_logs`: Menyimpan metrik penggunaan token, latency, dan kejadian fallback.
5. `ai_config_audit_logs`: Menyimpan riwayat perubahan konfigurasi oleh administrator.

---

## 2. Struktur Detail Tabel

### A. Tabel `ai_provider_configs`
Menyimpan konfigurasi masing-masing AI provider (`gemini` dan `groq`).

| Nama Kolom | Tipe Data | Nullable | Default | Keterangan |
|---|---|---|---|---|
| `id` | `INT UNSIGNED` | NO | AUTO_INCREMENT | Primary Key |
| `provider` | `VARCHAR(32)` | NO | - | Nama unik provider (`gemini` / `groq`) |
| `name` | `VARCHAR(64)` | NO | - | Label nama tampilan provider |
| `api_endpoint` | `VARCHAR(255)` | NO | - | URL endpoint API (wajib HTTPS) |
| `api_key_encrypted` | `TEXT` | YES | NULL | Payload terenkripsi AES-256-GCM (`v1:kid:iv:tag:cipher`) |
| `key_identifier` | `VARCHAR(64)` | YES | NULL | Identifikasi ID kunci enkripsi untuk rotasi kunci |
| `masked_key_preview` | `VARCHAR(32)` | YES | NULL | Sensor tampilan aman (cth: `AIza...****...2345`) |
| `selected_model` | `VARCHAR(64)` | NO | - | Model AI yang saat ini aktif digunakan |
| `default_model` | `VARCHAR(64)` | NO | - | Model fallback bawaan |
| `temperature` | `DECIMAL(3,2)` | NO | 0.70 | Tingkat kreativitas output LLM (0.00 - 2.00) |
| `max_output_tokens` | `INT UNSIGNED` | NO | 2048 | Batas maksimal token per respons |
| `request_timeout_ms` | `INT UNSIGNED` | NO | 30000 | Batas waktu tunggu respons API (milidetik) |
| `retry_limit` | `TINYINT UNSIGNED` | NO | 2 | Jumlah maksimal percobaan ulang otomatis |
| `last_connection_status` | `ENUM(...)` | NO | 'not_configured' | Status koneksi terakhir (`not_configured`, `connected`, `disconnected`, `connection_error`, `disabled`) |
| `last_tested_at` | `DATETIME` | YES | NULL | Waktu terakhir pengujian koneksi |
| `last_error_message` | `TEXT` | YES | NULL | Pesan error tersanitasi dari pengujian terakhir |
| `updated_by_admin_id` | `INT UNSIGNED` | YES | NULL | ID Administrator yang memperbarui |
| `created_at` | `DATETIME` | NO | CURRENT_TIMESTAMP | Waktu pencatatan |
| `updated_at` | `DATETIME` | NO | CURRENT_TIMESTAMP | Waktu perubahan |

---

### B. Tabel `ai_global_settings`
Menyimpan state global provider aktif dan kebijakan failover.

| Nama Kolom | Tipe Data | Nullable | Default | Keterangan |
|---|---|---|---|---|
| `id` | `TINYINT UNSIGNED` | NO | 1 | Primary Key (selalu bernilai 1) |
| `active_provider` | `VARCHAR(32)` | NO | 'gemini' | Provider yang aktif melayani pengguna |
| `enable_fallback` | `BOOLEAN` | NO | TRUE | Status aktifasi automatic fallback |
| `fallback_provider` | `VARCHAR(32)` | NO | 'groq' | Provider tujuan jika provider utama bermasalah |
| `circuit_breaker_failure_threshold` | `TINYINT UNSIGNED` | NO | 3 | Ambang batas kegagalan untuk memicu OPEN circuit |
| `circuit_breaker_cooldown_seconds` | `INT UNSIGNED` | NO | 60 | Durasi cooldown sebelum status HALF_OPEN (detik) |
| `version` | `BIGINT UNSIGNED` | NO | 1 | Counter inkremental untuk invalidasi cache multi-instance |
| `updated_by_admin_id` | `INT UNSIGNED` | YES | NULL | ID Administrator yang memperbarui |
| `updated_at` | `DATETIME` | NO | CURRENT_TIMESTAMP | Waktu perubahan |

---

### C. Tabel `ai_connection_test_logs`
Menyimpan riwayat pengujian koneksi langsung dari Admin Panel.

| Nama Kolom | Tipe Data | Nullable | Default | Keterangan |
|---|---|---|---|---|
| `id` | `BIGINT UNSIGNED` | NO | AUTO_INCREMENT | Primary Key |
| `provider` | `VARCHAR(32)` | NO | - | Provider yang diuji |
| `endpoint` | `VARCHAR(255)` | NO | - | Endpoint yang diuji |
| `model_tested` | `VARCHAR(64)` | NO | - | Model yang diuji |
| `status` | `VARCHAR(32)` | NO | - | Status hasil uji (`success`, `timeout`, dll) |
| `http_status_code` | `INT` | YES | NULL | Kode status HTTP yang diterima dari vendor |
| `response_time_ms` | `INT UNSIGNED` | NO | - | Waktu respons pulang-pergi (latency) |
| `error_message` | `TEXT` | YES | NULL | Rincian pesan kesalahan jika gagal |
| `tested_by_admin_id` | `INT UNSIGNED` | YES | NULL | ID Administrator penguji |
| `created_at` | `DATETIME` | NO | CURRENT_TIMESTAMP | Waktu pengujian |

---

### D. Tabel `ai_usage_logs`
Menyimpan telemetri pemanggilan AI oleh pengguna platform.

| Nama Kolom | Tipe Data | Nullable | Default | Keterangan |
|---|---|---|---|---|
| `id` | `BIGINT UNSIGNED` | NO | AUTO_INCREMENT | Primary Key |
| `provider` | `VARCHAR(32)` | NO | - | Provider yang melayani permintaan |
| `model` | `VARCHAR(64)` | NO | - | Model LLM yang digunakan |
| `latency_ms` | `INT UNSIGNED` | NO | - | Latency respons (ms) |
| `status` | `VARCHAR(20)` | NO | - | `success`, `failed`, `fallback` |
| `error_category` | `VARCHAR(64)` | YES | NULL | Klasifikasi kategori kesalahan |
| `prompt_tokens` | `INT UNSIGNED` | NO | 0 | Jumlah token input (prompt) |
| `completion_tokens` | `INT UNSIGNED` | NO | 0 | Jumlah token output (balasan) |
| `total_tokens` | `INT UNSIGNED` | NO | 0 | Akumulasi total token |
| `is_fallback` | `BOOLEAN` | NO | FALSE | Menandai apakah respons dihasilkan via fallback |
| `fallback_from_provider` | `VARCHAR(32)` | YES | NULL | Asal provider yang mengalami kegagalan |
| `session_id` | `BIGINT UNSIGNED` | YES | NULL | ID Sesi obrolan Chatbot+ |
| `user_role` | `VARCHAR(20)` | YES | NULL | Peran pengguna (`customer`, `technician`, `admin`) |
| `created_at` | `DATETIME` | NO | CURRENT_TIMESTAMP | Waktu pemanggilan |

---

### E. Tabel `ai_config_audit_logs`
Menyimpan jejak audit (*security audit trail*) atas seluruh perubahan parameter AI.

| Nama Kolom | Tipe Data | Nullable | Default | Keterangan |
|---|---|---|---|---|
| `id` | `BIGINT UNSIGNED` | NO | AUTO_INCREMENT | Primary Key |
| `admin_user_id` | `INT UNSIGNED` | NO | - | ID Administrator pelaku perubahan |
| `provider` | `VARCHAR(32)` | NO | - | Provider target |
| `action` | `VARCHAR(64)` | NO | - | Jenis aksi (`UPDATE_CONFIG`, `SWITCH_PROVIDER`, dll) |
| `changes` | `JSON` | YES | NULL | Rincian perbedaan nilai (API key selalu disensor) |
| `ip_address` | `VARCHAR(45)` | YES | NULL | IP address administrator |
| `user_agent` | `VARCHAR(255)` | YES | NULL | User Agent browser admin |
| `created_at` | `DATETIME` | NO | CURRENT_TIMESTAMP | Waktu pencatatan log |

