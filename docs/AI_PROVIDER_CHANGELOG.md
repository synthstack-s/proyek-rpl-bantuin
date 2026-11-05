# Catatan Perubahan (Changelog) - AI Provider Management

Seluruh pembaruan, penambahan fitur, dan perbaikan modul **AI Provider Management** pada platform BANTUIN didokumentasikan di sini.

---

## [Versi 2.0.0] - 2026-11-04

### Ditambahkan (Added)
- **Modul Enkripsi Kredensial AES-256-GCM (`src/lib/ai/encryption.ts`)**:
  - Enkripsi simetris terotentikasi untuk seluruh API Key.
  - Struktur format envelope `v1:kid:iv:tag:cipher`.
  - Penurunan kunci via KDF Scrypt dengan Key Identifier terversikan.
  - Fungsi rotasi kunci (`rotateApiKeyPayload`) dan deteksi manipulasi data via Authentication Tag.
  - Tampilan sensor aman (*masked key preview*) untuk frontend.
- **Modul Pertahanan SSRF & Socket-Level DNS Pinning (`src/lib/ai/ssrf-validator.ts`)**:
  - Validasi protokol wajib HTTPS.
  - Pemblokiran menyeluruh seluruh rentang IP privat IPv4/IPv6, loopback, link-local, CGNAT, dan cloud metadata.
  - Custom pinned HTTPS Agent untuk mengeliminasi serangan DNS rebinding (TOCTOU) pada level socket TLS.
- **Lapisan Adapter Multi-Vendor (`src/lib/ai/adapters/`)**:
  - `gemini-adapter.ts`: Integrasi Google Gemini API dengan minimal token probe testing, tool calling normalization, dan token usage mapping.
  - `groq-adapter.ts`: Integrasi Groq AI (LPU Inference) kompatibel OpenAI dengan pinned HTTPS agent dan dynamic model fetching.
- **Orkestrator Pusat (`src/lib/ai/provider-manager.ts`)**:
  - Implementasi Singleton Orchestrator `AIProviderManager`.
  - In-Flight Request Snapshot Isolation untuk melindungi request aktif saat pergantian provider terjadi secara bersamaan.
  - Circuit Breaker State Machine (`CLOSED`, `OPEN`, `HALF_OPEN`) dengan cooldown dan failure threshold.
  - Automatic Fallback Engine dengan klasifikasi error (menolak fallback untuk 401 Unauthorized / 400 Bad Request).
- **Antarmuka Pengguna Admin Panel (`src/app/admin/settings/ai/page.tsx`)**:
  - Kartu **Provider Overview** (status koneksi, active model, endpoint, last tested timestamp).
  - Form konfigurasi terpisah untuk Google Gemini dan Groq AI dengan masked key input, eye toggle, dan dynamic model fetcher.
  - Sakelar Active Provider Switcher dengan modal konfirmasi keamanan.
  - Pengaturan Automatic Fallback dengan toggle live.
  - Panel hasil uji koneksi (*Connection Testing Result*) lengkap dengan kode HTTP dan response time (ms).
  - Dashboard monitoring metrik telemetri (total request, token usage, success rate, dan tabel riwayat pengujian).
  - Banner navigasi instan pada halaman `/admin/settings` menuju `/admin/settings/ai`.
- **Suite Pengujian Otomatis (`scripts/test-ai-full-e2e.ts`)**:
  - 44/44 assertion pengujian unit & E2E berhasil 100%.

### Diubah (Changed)
- **Chatbot+ Engine (`src/lib/chatbot/engine.ts`)**:
  - Mengalihkan pemanggilan API Gemini langsung menjadi pemanggilan modular melalui `AIProviderManager.getInstance().generateChatCompletion(...)`.
  - Mengintegrasikan fungsi pencarian database BANTUIN (`searchDatabaseUsers`, `searchDatabaseOrders`, `searchDatabaseInvoices`, `searchDatabaseTechnicians`) ke dalam skema `UniversalToolDeclaration` untuk eksekusi multi-turn tool calling pada Gemini maupun Groq AI.
  - Mempertahankan 100% pipeline Guard (`guard.ts`), Context Manager (`context-manager.ts`), Schema Registry (`schema-registry.ts`), dan Role-Based Access Control (RBAC).

### Keamanan (Security)
- Menghilangkan penyimpanan API Key dalam bentuk plaintext di database.
- Memastikan API Key tidak pernah disertakan dalam pesan error, respon API, atau log audit.
- Memastikan seluruh endpoint API `/api/admin/ai/*` dilindungi otorisasi server-side session admin.

