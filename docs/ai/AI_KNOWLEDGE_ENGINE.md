# BANTUIN KNOWLEDGE ENGINE & RAG IMPLEMENTATION

## 1. Pendahuluan

BANTUIN Knowledge Engine adalah sistem basis pengetahuan aplikasi yang mengimplementasikan Retrieval-Augmented Generation (RAG) untuk memberikan informasi akurat, terkini, dan dapat diverifikasi kepada model AI tanpa memerlukan proses fine-tuning model yang mahal dan statis.

---

## 2. Struktur Dokumen Pengetahuan (10 Kategori Resmi)

Setiap dokumen pengetahuan memiliki metadata terstruktur (`slug`, `title`, `category`, `tags`, `summary`, `content`, `source`, `allowedRoles`, `isActive`):

1. **`application_overview`**: Gambaran umum platform BANTUIN, visi, misi, dan nilai layanan.
2. **`feature_documentation`**: Dokumentasi fitur-fitur utama (Booking, Chat, Billing, Tracking).
3. **`module_documentation`**: Dokumentasi 7 modul sistem (Customer Portal, Technician Hub, Admin Console, Dispatcher, Billing, Review, AI Assistant).
4. **`business_rules`**: Aturan bisnis, kebijakan tarif jasa, masa garansi resmi 30 hari kalender, dan ketentuan komisi.
5. **`user_guide`**: Panduan langkah demi langkah untuk setiap peran (Guest, Customer, Teknisi, Admin).
6. **`workflow_documentation`**: Alur siklus hidup pesanan (*Order Lifecycle* dari `submitted` hingga `completed`).
7. **`role_permission_documentation`**: Matriks otorisasi peran (RBAC) dan batasan data.
8. **`database_relationship_documentation`**: ERD, relasi antar tabel, dan panduan relasi entitas MySQL 8.0.
9. **`system_configuration_documentation`**: Dokumentasi konfigurasi sistem dan parameter operasional.
10. **`error_handling_documentation`**: Penanganan kendala operasional, eskalasi komplain, dan mitigasi bahaya darurat.

---

## 3. Algoritma Temu Balik (BM25 + Multi-Field Boosting)

Mesin temu balik (`src/lib/knowledge/rag-engine.ts`) menerapkan tokenisasi bahasa Indonesia dengan filter stopword (`yang`, `untuk`, `pada`, dll.) dan pemeringkatan bobot:

| Field | Bobot Skor | Alasan |
| :--- | :---: | :--- |
| **Tags Match** | `6.0` | Menunjukkan kesesuaian kata kunci domain spesifik |
| **Title Match** | `4.5` | Topik utama dokumen cocok dengan intent |
| **Category Match** | `3.0` | Sesuai dengan ranah fungsional pertanyaan |
| **Summary Match** | `2.5` | Sesuai dengan intisari dokumen |
| **Content Match** | `1.0` | Kecocokan dalam teks narasi panjang |
| **Partial Substring Match** | `1.5 - 2.0` | Menangani variasi imbuhan bahasa Indonesia |

---

## 4. Persistensi & Sinkronisasi Runtime

- **Tabel MySQL:** `ai_knowledge_base`
  - Menyimpan dokumen secara terstruktur dengan tipe JSON untuk tags.
  - Memiliki indeks pada `slug` (UNIQUE), `category`, dan `is_active`.
- **Caching In-Memory:**
  - Dilengkapi TTL 60 detik (`CACHE_TTL_MS`) untuk membaca ribuan kueri tanpa overhead I/O basis data.
  - Cache diinvalidasi otomatis saat Administrator menambah, mengedit, atau menonaktifkan dokumen melalui endpoint `/api/admin/ai/knowledge`.

