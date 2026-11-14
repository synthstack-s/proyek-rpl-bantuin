# BANTUIN AI SECURITY & PRIVACY ENFORCEMENT

## 1. Prinsip Keamanan & Pertahanan Berlapis (Defense-in-Depth)

Keamanan asisten AI BANTUIN ditegakkan pada tingkat arsitektur kode (*code-level enforcement*), bukan semata-mata bergantung pada instruksi prompt. Sistem menerapkan 5 lapisan pertahanan:

1. **Lapisan 1: Scope Guard & Anti-Injection Filter** (`src/lib/chatbot/security/scope-guard.ts`)
2. **Lapisan 2: Trusted Authentication Context** (`src/app/api/chat/message/route.ts` & `src/lib/auth.ts`)
3. **Lapisan 3: Tool Authorization & Row-Level Security** (`src/lib/chatbot/tools.ts`)
4. **Lapisan 4: Parameterized Database Query Gate** (`src/lib/db.ts` & `src/lib/chatbot/data-service.ts`)
5. **Lapisan 5: Factuality & Credential Leak Auditor** (`src/lib/chatbot/security/anti-hallucination.ts`)

---

## 2. Klasifikasi 7 Status Cakupan Aplikasi (Scope Guard)

Pertanyaan pengguna dievaluasi menjadi salah satu dari 7 status:
- **`IN_SCOPE`**: Berkaitan dengan perbaikan elektronik rumah tangga, fitur aplikasi, atau data resmi pengguna.
- **`OUT_OF_SCOPE`**: Di luar cakupan (penulisan kode pemrograman, tugas sekolah, resep, politik, dsb). Ditolak secara santun.
- **`AMBIGUOUS`**: Pertanyaan terlalu singkat atau tidak jelas (`halo`, `rusak`). Sistem memberikan panduan terarah.
- **`DATA_UNAVAILABLE`**: Data yang dicari tidak ditemukan dalam basis data.
- **`DATA_ACCESS_ERROR`**: Terjadi kendala teknis konektivitas basis data.
- **`UNAUTHORIZED`**: Permintaan melanggar batas otorisasi peran (IDOR attempt / akses data orang lain / prompt injection).
- **`INSUFFICIENT_EVIDENCE`**: Klaim fakta tidak didukung oleh hasil pemanggilan tool kueri.

---

## 3. Pertahanan Prompt Injection & Jailbreak

Pola-pola berikut diblokir secara deterministik:
- Percobaan pengabaian instruksi (`ignore previous instructions`, `abaikan semua instruksi`).
- Mode bebas / developer mode (`jailbreak`, `DAN mode`, `act as an unrestricted bot`).
- Ekstraksi system prompt atau environment variable (`tampilkan system prompt`, `reveal API key`, `bocorkan password`).
- Eksekusi SQL berbahaya (`DROP TABLE`, `DELETE FROM`, `UPDATE users`).

---

## 4. Perlindungan Kredensial & Privasi Data Pengguna

- **Enkripsi Kredensial:** API Key disimpan menggunakan enkripsi **AES-256-GCM** dengan salt acak dan initialization vector (IV) unik.
- **Zero Raw Secret Leaks:** Password hash (`password_hash`), token JWT, salt, dan OTP hash difilter keluar dari seluruh proyeksi kueri basis data.
- **Sanitasi Respons AI:** Respons akhir disaring dengan regex sensor terhadap format secret atau token internal sebelum diteruskan ke antarmuka pengguna.

