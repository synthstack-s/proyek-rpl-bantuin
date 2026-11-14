# SUITE EVALUASI & BENCHMARK AI BANTUIN

## 1. Metrik Kualitas & Ambang Batas

Suite evaluasi otomatis (`src/lib/chatbot/evaluation/eval-runner.ts`) mengukur 4 metrik kuantitatif:

1. **Akurasi Pemahaman (Intent Accuracy):** Ambang batas minimum ≥ **85%**. (Hasil pengujian aktual: **100%**)
2. **Tingkat Kelulusan Keamanan (Security Pass Rate):** Ambang batas mutlak = **100%**. (Hasil aktual: **100%** - Zero IDOR, Zero Prompt Injection, Zero Secret Leaks)
3. **Tingkat Bebas Halusinasi (Hallucination-Free Rate):** Ambang batas mutlak = **100%**. (Hasil aktual: **100%** - Semua data kosong ditolak dari fabrikasi fakta)
4. **Rata-rata Latensi Inferensi:** Target < 2500 ms.

---

## 2. Kategori Uji Benchmark Dataset

Dataset pengujian mencakup 10 ranah kasus:
1. `IN_SCOPE_FEATURE`: Pertanyaan fitur dan garansi resmi.
2. `TYPO_AND_INFORMAL`: Pertanyaan dengan bahasa gaul, singkatan, dan salah ketik.
3. `MULTI_TURN_FOLLOWUP`: Pertanyaan lanjutan yang membutuhkan retensi entitas dari giliran percakapan sebelumnya.
4. `LIVE_DATABASE`: Pengambilan profil dan data operasional dari MySQL 8.0.
5. `EMPTY_DATA_HANDLING`: Pertanyaan nomor telepon/pesanan fiktif (menguji ketahanan anti-halusinasi saat data kosong).
6. `OUT_OF_SCOPE`: Pertanyaan tugas sekolah, kode pemrograman, resep, dan politik.
7. `ROLE_PERMISSION_SECURITY`: Pengujian akses data pengguna lain oleh Customer dan akses data sensitif oleh Guest.
8. `PROMPT_INJECTION`: Serangan *jailbreak*, manipulasi *system prompt*, dan perintah SQL injection.
9. `AMBIGUOUS_QUERY`: Pertanyaan satu kata yang memerlukan permintaan klarifikasi.
10. `SAFETY_HAZARD`: Pengaduan bau gas, percikan api, atau kabel berasap (menguji respons darurat keselamatan kerja).

---

## 3. Menjalankan Evaluasi

### Melalui Terminal CLI:
```bash
npx tsx scripts/test-ai-intelligence-upgrade.ts
```

### Melalui Admin Console:
1. Buka menu **Konfigurasi Sistem** di Admin Console.
2. Masuk ke tab **Evaluasi & Benchmark**.
3. Klik tombol **Jalankan Evaluasi Benchmark**.
4. Sistem akan mengeksekusi benchmark secara real-time dan menampilkan laporan metrik kuantitatif beserta rincian per kategori.

