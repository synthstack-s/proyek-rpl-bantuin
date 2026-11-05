# Standar Keamanan & Perlindungan Kredensial AI BANTUIN

Dokumen ini memaparkan implementasi arsitektur keamanan (*cybersecurity standards*) yang diterapkan pada modul AI Provider Management untuk mencegah kebocoran kredensial, eksfiltrasi data, dan serangan SSRF (*Server-Side Request Forgery*).

---

## 1. Kriptografi Kredensial: AES-256-GCM

Seluruh API Key yang tersimpan di basis data BANTUIN dilindungi dengan enkripsi simetris terotentikasi berstandar industri: **AES-256-GCM (Galois/Counter Mode)**.

### A. Struktur Format Envelope Terenkripsi
Ciphertext disimpan dalam struktur envelope dengan 5 segmen:
```
v1:<key-identifier>:<iv-hex>:<auth-tag-hex>:<ciphertext-hex>
```
1. `v1`: Versi algoritma enkripsi (memfasilitasi migrasi algoritma di masa mendatang).
2. `<key-identifier>`: ID kunci enkripsi (cth: `primary-2026`).
3. `<iv-hex>`: Initialization Vector acak berukuran 12 byte (24 karakter heksadesimal) via `crypto.randomBytes(12)`. IV tidak pernah digunakan ulang.
4. `<auth-tag-hex>`: Authentication Tag 16 byte (32 karakter heksadesimal) untuk verifikasi integritas otentikasi data (tamper-detection).
5. `<ciphertext-hex>`: Data API key terenkripsi.

### B. Penurunan Kunci Berbasis KDF (Scrypt)
Kunci enkripsi 256-bit diturunkan dari secret utama (`AI_ENCRYPTION_SECRET` atau `SESSION_SECRET`) menggunakan algoritma Key Derivation Function **Scrypt** dengan parameter:
- N (*cost factor*): 16,384
- r (*block size*): 8
- p (*parallelization*): 1
- Key length: 32 byte (256 bit)

### C. Deteksi Manipulasi (Tamper-Resistance)
Setiap upaya memodifikasi ciphertext di database secara langsung akan menyebabkan verifikasi Authentication Tag gagal, melempar exception `InvalidAuthTagError` dan menolak kredensial tersebut secara instan.

### D. Rotasi Kunci (Key Rotation)
Modul menyediakan fungsi `rotateApiKeyPayload()` untuk mendekripsi kredensial dengan kunci lama dan mengenkripsinya kembali dengan kunci baru tanpa mengekspos plaintext ke disk.

---

## 2. Pertahanan SSRF & Socket-Level DNS Pinning

Untuk mencegah penyerang mengarahkan endpoint API ke jaringan privat lokal atau endpoint metadata cloud provider (AWS, GCP, DigitalOcean), diterapkan sistem validasi ketat:

### A. Skema Wajib HTTPS
Semua endpoint wajib menggunakan protokol `https:`. Protokol `http:` atau skema lainnya ditolak seketika.

### B. Pemblokiran IP Privat & Reserved Range
Sebelum koneksi dibuat, hostname di-resolve melalui DNS dan setiap IP hasil resolusi diverifikasi terhadap rentang terlarang:
- **Loopback**: `127.0.0.0/8`, `::1`
- **Private Networks (RFC 1918)**:
  - `10.0.0.0/8`
  - `172.16.0.0/12`
  - `192.168.0.0/16`
- **Cloud Metadata Services**: `169.254.169.254`, `169.254.0.0/16`
- **Carrier-Grade NAT (RFC 6598)**: `100.64.0.0/10`
- **IPv6 Local / Link-Local**: `fc00::/7`, `fd00::/8`, `fe80::/10`
- **IPv4-Mapped IPv6**: `::ffff:127.0.0.1`

### C. Socket-Level IP Pinning (Anti-DNS Rebinding)
Untuk mengeliminasi celah Time-of-Check to Time-of-Use (TOCTOU) di mana domain publik dialihkan ke IP lokal tepat saat socket dibuka (*DNS Rebinding Attack*), dibuat **Custom HTTPS Agent**:
```typescript
export function createPinnedHttpsAgent(hostname: string, pinnedIp: string): https.Agent {
  return new https.Agent({
    keepAlive: true,
    lookup: (host, options, callback) => {
      // Mengabaikan lookup DNS OS dan langsung menyuntikkan IP publik yang telah tervalidasi
      callback(null, pinnedIp, net.isIPv6(pinnedIp) ? 6 : 4);
    },
    servername: hostname, // Menjaga validitas TLS SNI
  });
}
```

---

## 3. Pencegahan Kebocoran Kredensial (Data Leakage Prevention)

1. **Masked Preview di Frontend**: Admin Panel hanya pernah menerima string tersensor seperti `AIza...****...2345` atau `gsk_...****...cdef`. Plaintext tidak pernah dikirim dalam respons HTTP GET.
2. **Sanitasi Pesan Error Vendor**: Error dari Google Cloud atau Groq seringkali menyertakan API Key dalam pesan kesalahan (`API key 'AIzaSy...' is invalid`). Adapter secara otomatis menyaring dan menghapus string kunci sebelum pesan dikembalikan ke client atau disimpan ke database log.
3. **Penyensoran Log Audit**: Tabel `ai_config_audit_logs` secara otomatis mengganti nilai field `apiKey` menjadi `[REDACTED]`.

---

## 4. Otorisasi Server-Side (Zero Trust RBAC)

Seluruh endpoint REST API di bawah `/api/admin/ai/*`:
- Menggunakan middleware validasi sesi admin internal (`getAdminSession()`).
- Menolak session non-admin atau session tidak valid dengan status `401 Unauthorized` atau `403 Forbidden`.
- Tidak pernah mempercayai parameter `userRole` atau `userId` yang dikirim dari client (selalu diverifikasi dari session database yang sah).

