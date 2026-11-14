# MATRIKS ROLE & PERMISSION AI BANTUIN

## 1. Pemetaan 4 Peran Pengguna Utama

| Peran (Role) | Definisi & Konteks | Batasan Hak Akses Data |
| :--- | :--- | :--- |
| **`guest`** | Pengunjung umum belum login | Hanya dapat mengakses informasi publik (katalog layanan, tarif dasar, profil BANTUIN, ketentuan garansi 30 hari, panduan login/daftar). **Zero access** ke data pesanan atau pengguna. |
| **`customer`** | Pelanggan resmi terverifikasi | Hanya dapat membaca data miliknya sendiri (profil, riwayat perbaikan pribadi, tagihan invoice sendiri, chat teknisi pesanan sendiri). Ditolak keras mengakses data customer lain. |
| **`technician`** | Mitra teknisi terverifikasi | Hanya dapat membaca penugasan aktif miliknya, jadwal kunjungan, alamat dan telepon pelanggan HANYA untuk pesanan yang ditugaskan, performa kerja, dan SOP teknis. |
| **`admin`** | Pengelola operasional platform | Memiliki hak akses penuh melihat ringkasan pesanan lintas sistem, beban kerja teknisi, audit log, analitik keuangan, kesehatan sistem, dan pencarian data pengguna. |

---

## 2. Penegakan Row-Level Security (Anti-IDOR)

Server backend mengekstrak identitas pengguna dari session cookie terenkripsi (`getAdminSession()` dan `getUserSession()`). 
Model LLM tidak dapat memanipulasi parameter `userId` atau `role`:

```typescript
// Contoh implementasi pada getCustomerRepairs:
export async function getCustomerRepairs(authenticatedUserId: number) {
  // Query selalu diikat dengan parameter terverifikasi:
  return await query(
    `SELECT * FROM repair_orders WHERE customer_id = ? ORDER BY created_at DESC`,
    [authenticatedUserId]
  );
}
```

Jika seorang pelanggan mencoba menanyakan data pengguna lain (`Siapa pemilik nomor telepon 081234567890 pengguna lain?`), sistem mendeteksi perbedaan nomor dan langsung mengembalikan penolakan:
> *"Sesuai prinsip perlindungan privasi dan keamanan data BANTUIN, Anda hanya diizinkan mengakses informasi yang berkaitan dengan akun dan pesanan Anda sendiri. Anda tidak memiliki izin untuk mencari atau melihat data identitas pengguna lain."*

