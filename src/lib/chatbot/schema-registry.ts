/**
 * SCHEMA REGISTRY - BANTUIN DATABASE INTELLIGENCE
 * 
 * Menyediakan metadata mesin untuk seluruh 32 tabel basis data MySQL 8.0 BANTUIN.
 * Menjamin model AI memahami struktur, relasi, primary/foreign key, dan batasan sensitivitas data
 * tanpa memberikan kredensial atau akses SQL langsung.
 *
 * B1/B2 (akurasi baca DB): registry ini WAJIB memuat SEMUA tabel dan kolom
 * database/schema.sql apa adanya — kolom/tabel yang hilang membuat
 * queryDatabase menolak pertanyaan yang sah. Tes otomatis
 * test-db-accuracy-query-engine.js membandingkan registry dengan DDL.
 */

export interface TableColumnMetadata {
  name: string;
  type: string;
  isNullable: boolean;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  references?: string; // Format: 'table.column'
  description: string;
  isSensitive?: boolean; // True jika data rahasia (hash, token, secret) yang TIDAK PERNAH dikirim ke AI
}

export interface TableMetadata {
  tableName: string;
  domainGroup: 'identity' | 'profile_catalog' | 'ai_consultation' | 'repairs' | 'communication' | 'finance' | 'reviews_disputes' | 'system' | 'ai_management';
  description: string;
  primaryKey: string;
  ownerForeignKey?: string; // Misal: 'customer_id', 'user_id', 'technician_id' untuk row-level authorization
  // B9 — Peran yang pemilik barisnya bermakna. Bila diisi, HANYA peran itu
  // (dan admin) yang boleh mengkueri tabel ini: ownerForeignKey 'user_id'
  // milik technician_profiles selalu menunjuk akun TEKNISI, sehingga
  // scoping ke id pelanggan akan SELALU kosong dan menyesatkan ("0 teknisi").
  // Tanpa field ini, owner 'user_id' berlaku untuk semua peran terautentikasi.
  ownerRole?: 'customer' | 'technician' | 'admin';
  // B14 — Scope relasional untuk tabel TANPA ownerForeignKey: baris boleh
  // dibaca bila terhubung (lewat viaForeignKey) ke baris viaTable yang
  // ownerColumn-nya sama dengan userId pemanggil. Contoh: payments boleh
  // dibaca customer atas invoice miliknya sendiri (via invoices.customer_id).
  relationalScope?: {
    roles: Array<'customer' | 'technician'>;
    viaTable: string;
    viaForeignKey: string;
    ownerColumn: string;
  };
  columns: TableColumnMetadata[];
  relations: Array<{
    targetTable: string;
    relationshipType: 'one-to-one' | 'one-to-many' | 'many-to-one';
    foreignKey: string;
    // B4 — Kolom di tabel LAWAN yang dirujuk foreignKey; defaultnya primary
    // key tabel lawan. Wajib diisi bila FK merujuk kolom BUKAN primary key,
    // mis. technician_assignments.technician_id -> technician_profiles.user_id.
    targetColumn?: string;
    description: string;
  }>;
}

export const BANTUIN_SCHEMA_REGISTRY: Record<string, TableMetadata> = {
  // --------------------------------------------------------------------------
  // GRUP 1: IDENTITAS & KEAMANAN AKUN
  // --------------------------------------------------------------------------
  users: {
    tableName: 'users',
    domainGroup: 'identity',
    description: 'Tabel master kredensial dan status verifikasi seluruh pengguna sistem (admin, customer, technician).',
    primaryKey: 'id',
    columns: [
      { name: 'id', type: 'BIGINT UNSIGNED', isNullable: false, isPrimaryKey: true, description: 'Primary key pengguna' },
      { name: 'uuid', type: 'CHAR(36)', isNullable: false, description: 'Public UUID unik v4' },
      { name: 'email', type: 'VARCHAR(191)', isNullable: false, description: 'Email akun unik' },
      { name: 'phone_number', type: 'VARCHAR(20)', isNullable: false, description: 'Nomor WhatsApp format E.164 (+62...)' },
      { name: 'password_hash', type: 'VARCHAR(255)', isNullable: false, isSensitive: true, description: 'Hash kata sandi bcrypt - SANGAT RAHASIA' },
      { name: 'role', type: "ENUM('admin', 'customer', 'technician')", isNullable: false, description: 'Peran hak akses sistem' },
      { name: 'status', type: "ENUM('active', 'inactive', 'suspended', 'pending_verification')", isNullable: false, description: 'Status keaktifan akun' },
      { name: 'is_verified', type: 'BOOLEAN', isNullable: false, description: 'Status verifikasi nomor telepon/email' },
      { name: 'token_version', type: 'INT', isNullable: false, description: 'Versi token JWT (T5); dinaikkan saat reset password untuk mencabut sesi lama' },
      { name: 'deleted_at', type: 'DATETIME', isNullable: true, description: 'Stempel waktu soft-delete' },
      { name: 'created_at', type: 'DATETIME', isNullable: false, description: 'Waktu pendaftaran akun' },
      { name: 'updated_at', type: 'DATETIME', isNullable: false, description: 'Waktu pembaruan akun terakhir' },
    ],
    relations: [
      { targetTable: 'customer_profiles', relationshipType: 'one-to-one', foreignKey: 'customer_profiles.user_id', description: 'Profil data diri pelanggan' },
      { targetTable: 'technician_profiles', relationshipType: 'one-to-one', foreignKey: 'technician_profiles.user_id', description: 'Profil data teknisi mitra' },
      { targetTable: 'admin_profiles', relationshipType: 'one-to-one', foreignKey: 'admin_profiles.user_id', description: 'Profil data diri admin' },
      { targetTable: 'repair_requests', relationshipType: 'one-to-many', foreignKey: 'repair_requests.customer_id', description: 'Daftar pesanan perbaikan pelanggan' },
      // B5 — relasi balik lengkap: setiap FK ke users dideklarasikan di sini
      // agar JOIN tidak bergantung pada satu sisi deklarasi saja. Bila dua
      // tabel punya lebih dari satu relasi (mis. technician_profiles lewat
      // user_id DAN verified_by_admin_id), AI memilihnya dengan `via`.
      { targetTable: 'user_otps', relationshipType: 'one-to-many', foreignKey: 'user_otps.user_id', description: 'Kode OTP yang dikirim ke pengguna' },
      { targetTable: 'user_refresh_tokens', relationshipType: 'one-to-many', foreignKey: 'user_refresh_tokens.user_id', description: 'Sesi refresh token pengguna' },
      { targetTable: 'technician_profiles', relationshipType: 'one-to-many', foreignKey: 'technician_profiles.verified_by_admin_id', description: 'Profil teknisi yang diverifikasi admin ini' },
      { targetTable: 'technician_documents', relationshipType: 'one-to-many', foreignKey: 'technician_documents.verified_by_admin_id', description: 'Dokumen yang diverifikasi admin ini' },
      { targetTable: 'ai_consultation_sessions', relationshipType: 'one-to-many', foreignKey: 'ai_consultation_sessions.user_id', description: 'Sesi konsultasi AI pengguna' },
      { targetTable: 'repair_status_history', relationshipType: 'one-to-many', foreignKey: 'repair_status_history.changed_by_user_id', description: 'Perubahan status yang dilakukan pengguna' },
      { targetTable: 'technician_assignments', relationshipType: 'one-to-many', foreignKey: 'technician_assignments.technician_id', description: 'Penugasan yang diterima teknisi ini' },
      { targetTable: 'technician_assignments', relationshipType: 'one-to-many', foreignKey: 'technician_assignments.assigned_by_user_id', description: 'Penugasan yang dibuat admin ini' },
      { targetTable: 'technician_schedules', relationshipType: 'one-to-many', foreignKey: 'technician_schedules.technician_id', description: 'Jadwal kunjungan teknisi ini' },
      { targetTable: 'repair_diagnoses', relationshipType: 'one-to-many', foreignKey: 'repair_diagnoses.technician_id', description: 'Diagnosa yang dibuat teknisi ini' },
      { targetTable: 'repair_chat_rooms', relationshipType: 'one-to-many', foreignKey: 'repair_chat_rooms.customer_id', description: 'Ruang chat pelanggan ini' },
      { targetTable: 'repair_chat_rooms', relationshipType: 'one-to-many', foreignKey: 'repair_chat_rooms.technician_id', description: 'Ruang chat teknisi ini' },
      { targetTable: 'repair_chat_messages', relationshipType: 'one-to-many', foreignKey: 'repair_chat_messages.sender_id', description: 'Pesan chat yang dikirim pengguna' },
      { targetTable: 'invoices', relationshipType: 'one-to-many', foreignKey: 'invoices.customer_id', description: 'Invoice yang ditagihkan ke pelanggan ini' },
      { targetTable: 'repair_reviews', relationshipType: 'one-to-many', foreignKey: 'repair_reviews.customer_id', description: 'Ulasan yang diberikan pelanggan ini' },
      { targetTable: 'repair_reviews', relationshipType: 'one-to-many', foreignKey: 'repair_reviews.technician_id', description: 'Ulasan yang diterima teknisi ini' },
      { targetTable: 'repair_complaints', relationshipType: 'one-to-many', foreignKey: 'repair_complaints.complainant_user_id', description: 'Komplain yang diajukan pengguna' },
      { targetTable: 'repair_complaints', relationshipType: 'one-to-many', foreignKey: 'repair_complaints.handled_by_admin_id', description: 'Komplain yang ditangani admin ini' },
      { targetTable: 'notifications', relationshipType: 'one-to-many', foreignKey: 'notifications.user_id', description: 'Notifikasi untuk pengguna' },
      { targetTable: 'whatsapp_notifications', relationshipType: 'one-to-many', foreignKey: 'whatsapp_notifications.user_id', description: 'Log WhatsApp yang diterima pengguna' },
      { targetTable: 'whatsapp_notifications', relationshipType: 'one-to-many', foreignKey: 'whatsapp_notifications.sent_by_admin_id', description: 'Pesan WhatsApp manual yang dikirim admin ini' },
      { targetTable: 'system_settings', relationshipType: 'one-to-many', foreignKey: 'system_settings.updated_by_admin_id', description: 'Pengaturan yang diubah admin ini' },
      { targetTable: 'admin_audit_logs', relationshipType: 'one-to-many', foreignKey: 'admin_audit_logs.admin_user_id', description: 'Log audit tindakan admin ini' },
      { targetTable: 'ai_global_settings', relationshipType: 'one-to-many', foreignKey: 'ai_global_settings.updated_by_admin_id', description: 'Pengaturan AI global yang diubah admin ini' },
    ],
  },

  user_otps: {
    tableName: 'user_otps',
    domainGroup: 'identity',
    description: 'Penyimpanan token OTP WhatsApp Fonnte untuk verifikasi registrasi dan login.',
    primaryKey: 'id',
    ownerForeignKey: 'user_id',
    columns: [
      { name: 'id', type: 'BIGINT UNSIGNED', isNullable: false, isPrimaryKey: true, description: 'Primary key OTP' },
      { name: 'user_id', type: 'BIGINT UNSIGNED', isNullable: false, isForeignKey: true, references: 'users.id', description: 'ID pengguna pemilik OTP' },
      { name: 'target_phone', type: 'VARCHAR(20)', isNullable: true, description: 'Nomor telepon tujuan OTP' },
      { name: 'otp_hash', type: 'CHAR(64)', isNullable: false, isSensitive: true, description: 'Hash SHA-256 kode OTP - SANGAT RAHASIA' },
      { name: 'purpose', type: "ENUM('registration', 'password_reset', 'login', 'phone_verification')", isNullable: false, description: 'Tujuan pengiriman OTP' },
      { name: 'attempts', type: 'TINYINT UNSIGNED', isNullable: false, description: 'Percobaan gagal memasukkan OTP' },
      { name: 'delivery_status', type: "ENUM('pending', 'sent', 'failed')", isNullable: false, description: 'Status pengiriman gateway WhatsApp Fonnte' },
      { name: 'fonnte_message_id', type: 'VARCHAR(100)', isNullable: true, description: 'ID pesan gateway Fonnte' },
      { name: 'delivery_error', type: 'VARCHAR(255)', isNullable: true, description: 'Pesan error jika kirim gagal' },
      { name: 'expires_at', type: 'DATETIME', isNullable: false, description: 'Batas masa berlaku kode OTP' },
      { name: 'consumed_at', type: 'DATETIME', isNullable: true, description: 'Waktu OTP berhasil divalidasi' },
      { name: 'created_at', type: 'DATETIME', isNullable: false, description: 'Waktu pembuatan OTP' },
    ],
    relations: [
      { targetTable: 'users', relationshipType: 'many-to-one', foreignKey: 'user_id', description: 'Pengguna penerima OTP' },
    ],
  },

  user_refresh_tokens: {
    tableName: 'user_refresh_tokens',
    domainGroup: 'identity',
    description: 'Manajemen sesi JWT refresh token aktif.',
    primaryKey: 'id',
    ownerForeignKey: 'user_id',
    columns: [
      { name: 'id', type: 'BIGINT UNSIGNED', isNullable: false, isPrimaryKey: true, description: 'Primary key sesi token' },
      { name: 'user_id', type: 'BIGINT UNSIGNED', isNullable: false, isForeignKey: true, references: 'users.id', description: 'ID pengguna pemilik sesi' },
      { name: 'token_hash', type: 'CHAR(64)', isNullable: false, isSensitive: true, description: 'Hash SHA-256 JWT refresh token' },
      { name: 'device_info', type: 'VARCHAR(255)', isNullable: true, description: 'Info peramban / perangkat' },
      { name: 'ip_address', type: 'VARCHAR(45)', isNullable: true, description: 'Alamat IP pengguna' },
      { name: 'expires_at', type: 'DATETIME', isNullable: false, description: 'Waktu kedaluwarsa token' },
      { name: 'revoked_at', type: 'DATETIME', isNullable: true, description: 'Waktu pencabutan token saat logout' },
      { name: 'created_at', type: 'DATETIME', isNullable: false, description: 'Waktu pembuatan sesi' },
    ],
    relations: [
      { targetTable: 'users', relationshipType: 'many-to-one', foreignKey: 'user_id', description: 'Pengguna pemilik token' },
    ],
  },

  // --------------------------------------------------------------------------
  // GRUP 2: PROFIL, DOKUMEN & KATALOG
  // --------------------------------------------------------------------------
  customer_profiles: {
    tableName: 'customer_profiles',
    domainGroup: 'profile_catalog',
    description: 'Data profil khusus pelanggan BANTUIN, mencakup nama lengkap dan alamat default.',
    primaryKey: 'id',
    ownerForeignKey: 'user_id',
    // B9: user_id di sini selalu akun pelanggan — scoping ke id teknisi
    // akan selalu kosong, jadi teknisi ditolak dengan error akses.
    ownerRole: 'customer',
    columns: [
      { name: 'id', type: 'BIGINT UNSIGNED', isNullable: false, isPrimaryKey: true, description: 'Primary key profil pelanggan' },
      { name: 'user_id', type: 'BIGINT UNSIGNED', isNullable: false, isForeignKey: true, references: 'users.id', description: 'ID pengguna terhubung' },
      { name: 'full_name', type: 'VARCHAR(150)', isNullable: false, description: 'Nama lengkap pelanggan' },
      { name: 'avatar_url', type: 'VARCHAR(255)', isNullable: true, description: 'URL foto profil' },
      { name: 'default_address', type: 'TEXT', isNullable: true, description: 'Alamat default lokasi perbaikan' },
      { name: 'city', type: 'VARCHAR(100)', isNullable: true, description: 'Kota domisili' },
      { name: 'postal_code', type: 'VARCHAR(10)', isNullable: true, description: 'Kode pos' },
      { name: 'latitude', type: 'DECIMAL(10, 8)', isNullable: true, description: 'Koordinat lintang' },
      { name: 'longitude', type: 'DECIMAL(11, 8)', isNullable: true, description: 'Koordinat bujur' },
      { name: 'created_at', type: 'DATETIME', isNullable: false, description: 'Waktu pembuatan' },
      { name: 'updated_at', type: 'DATETIME', isNullable: false, description: 'Waktu pembaruan' },
    ],
    relations: [
      { targetTable: 'users', relationshipType: 'one-to-one', foreignKey: 'user_id', description: 'Akun login pengguna' },
    ],
  },

  technician_profiles: {
    tableName: 'technician_profiles',
    domainGroup: 'profile_catalog',
    description: 'Profil teknisi mitra terverifikasi, riwayat pengalaman, dan rating penilaian.',
    primaryKey: 'id',
    ownerForeignKey: 'user_id',
    // B9: user_id di sini selalu akun teknisi — scoping ke id pelanggan
    // akan selalu kosong ("0 teknisi"), jadi pelanggan ditolak dengan
    // error akses yang eksplisit, bukan hasil kosong.
    ownerRole: 'technician',
    columns: [
      { name: 'id', type: 'BIGINT UNSIGNED', isNullable: false, isPrimaryKey: true, description: 'Primary key profil teknisi' },
      { name: 'user_id', type: 'BIGINT UNSIGNED', isNullable: false, isForeignKey: true, references: 'users.id', description: 'ID akun teknisi' },
      { name: 'full_name', type: 'VARCHAR(150)', isNullable: false, description: 'Nama lengkap teknisi' },
      { name: 'avatar_url', type: 'VARCHAR(255)', isNullable: true, description: 'Foto profil resmi' },
      { name: 'bio', type: 'TEXT', isNullable: true, description: 'Biografi dan ringkasan keahlian' },
      { name: 'years_of_experience', type: 'TINYINT UNSIGNED', isNullable: false, description: 'Pengalaman kerja dalam tahun' },
      { name: 'rating_avg', type: 'DECIMAL(3, 2)', isNullable: false, description: 'Rating rata-rata bintang 1-5' },
      { name: 'rating_count', type: 'INT UNSIGNED', isNullable: false, description: 'Jumlah ulasan yang diterima' },
      { name: 'is_available', type: 'BOOLEAN', isNullable: false, description: 'Status ketersediaan menerima tugas baru' },
      { name: 'verified_status', type: "ENUM('pending', 'verified', 'rejected', 'suspended')", isNullable: false, description: 'Status verifikasi kelayakan oleh admin' },
      { name: 'rejection_reason', type: 'TEXT', isNullable: true, description: 'Alasan penolakan jika verifikasi ditolak' },
      { name: 'verified_by_admin_id', type: 'BIGINT UNSIGNED', isNullable: true, isForeignKey: true, references: 'users.id', description: 'Admin yang memverifikasi' },
      { name: 'verified_at', type: 'DATETIME', isNullable: true, description: 'Waktu verifikasi' },
      { name: 'current_latitude', type: 'DECIMAL(10, 8)', isNullable: true, description: 'Lokasi lintang GPS saat ini' },
      { name: 'current_longitude', type: 'DECIMAL(11, 8)', isNullable: true, description: 'Lokasi bujur GPS saat ini' },
      { name: 'created_at', type: 'DATETIME', isNullable: false, description: 'Waktu bergabung' },
      { name: 'updated_at', type: 'DATETIME', isNullable: false, description: 'Waktu update' },
    ],
    relations: [
      { targetTable: 'users', relationshipType: 'one-to-one', foreignKey: 'user_id', description: 'Akun login teknisi' },
      // B3: relasi kedua ke users — admin pemverifikasi. Tanpa deklarasi ini
      // JOIN ke admin tidak terjangkau sama sekali; dengan `via` AI memilih
      // 'verified_by_admin_id' bila yang ditanya adalah admin pemverifikasi.
      { targetTable: 'users', relationshipType: 'many-to-one', foreignKey: 'verified_by_admin_id', description: 'Admin yang memverifikasi profil teknisi' },
      { targetTable: 'technician_documents', relationshipType: 'one-to-many', foreignKey: 'technician_documents.technician_profile_id', description: 'Dokumen sertifikasi keahlian' },
      { targetTable: 'technician_specializations', relationshipType: 'one-to-many', foreignKey: 'technician_specializations.technician_profile_id', description: 'Kategori spesialisasi keahlian' },
      // B4 (balik): penugasan yang diterima teknisi ini. targetColumn karena
      // technician_assignments.technician_id merujuk user_id (bukan id).
      { targetTable: 'technician_assignments', relationshipType: 'one-to-many', foreignKey: 'technician_assignments.technician_id', targetColumn: 'user_id', description: 'Penugasan yang diterima teknisi ini' },
    ],
  },

  admin_profiles: {
    tableName: 'admin_profiles',
    domainGroup: 'profile_catalog',
    description: 'Data profil khusus admin BANTUIN, mencakup nama lengkap admin (sumber jawaban "siapa saya" untuk admin).',
    primaryKey: 'id',
    ownerForeignKey: 'user_id',
    // B9: user_id di sini selalu akun admin — scoping ke id customer/teknisi
    // akan selalu kosong, jadi peran lain ditolak dengan error akses.
    ownerRole: 'admin',
    columns: [
      { name: 'id', type: 'BIGINT UNSIGNED', isNullable: false, isPrimaryKey: true, description: 'Primary key profil admin' },
      { name: 'user_id', type: 'BIGINT UNSIGNED', isNullable: false, isForeignKey: true, references: 'users.id', description: 'ID akun admin (unik)' },
      { name: 'full_name', type: 'VARCHAR(150)', isNullable: false, description: 'Nama lengkap admin' },
      { name: 'avatar_url', type: 'VARCHAR(255)', isNullable: true, description: 'URL foto profil' },
      { name: 'created_at', type: 'DATETIME', isNullable: false, description: 'Waktu pembuatan' },
      { name: 'updated_at', type: 'DATETIME', isNullable: false, description: 'Waktu pembaruan' },
    ],
    relations: [
      { targetTable: 'users', relationshipType: 'one-to-one', foreignKey: 'user_id', description: 'Akun login admin' },
    ],
  },

  technician_documents: {
    tableName: 'technician_documents',
    domainGroup: 'profile_catalog',
    description: 'Sertifikat kompetensi keahlian BNSP/BLK dan dokumen legalitas teknisi mitra.',
    primaryKey: 'id',
    columns: [
      { name: 'id', type: 'BIGINT UNSIGNED', isNullable: false, isPrimaryKey: true, description: 'Primary key dokumen' },
      { name: 'technician_profile_id', type: 'BIGINT UNSIGNED', isNullable: false, isForeignKey: true, references: 'technician_profiles.id', description: 'ID profil teknisi pemilik' },
      { name: 'document_type', type: "ENUM('competency_certificate', 'training_certificate', 'portfolio', 'business_license', 'other')", isNullable: false, description: 'Jenis dokumen' },
      { name: 'document_title', type: 'VARCHAR(150)', isNullable: false, description: 'Judul sertifikat / portofolio' },
      { name: 'file_name', type: 'VARCHAR(255)', isNullable: false, description: 'Nama file asli' },
      { name: 'file_path', type: 'VARCHAR(255)', isNullable: false, description: 'Path berkas tersimpan aman' },
      { name: 'file_size_bytes', type: 'INT UNSIGNED', isNullable: true, description: 'Ukuran berkas dalam byte' },
      { name: 'file_mime_type', type: 'VARCHAR(50)', isNullable: true, description: 'Tipe MIME berkas' },
      { name: 'issuing_organization', type: 'VARCHAR(150)', isNullable: true, description: 'Lembaga penerbit sertifikat' },
      { name: 'document_number', type: 'VARCHAR(100)', isNullable: true, description: 'Nomor seri sertifikat' },
      { name: 'issue_date', type: 'DATE', isNullable: true, description: 'Tanggal terbit' },
      { name: 'expiry_date', type: 'DATE', isNullable: true, description: 'Tanggal kedaluwarsa' },
      { name: 'verification_status', type: "ENUM('pending', 'approved', 'rejected', 'revision_required')", isNullable: false, description: 'Status persetujuan admin' },
      { name: 'admin_notes', type: 'TEXT', isNullable: true, description: 'Catatan admin pemeriksa' },
      { name: 'verified_by_admin_id', type: 'BIGINT UNSIGNED', isNullable: true, isForeignKey: true, references: 'users.id', description: 'Admin yang memverifikasi dokumen' },
      { name: 'verified_at', type: 'DATETIME', isNullable: true, description: 'Waktu verifikasi dokumen' },
      { name: 'created_at', type: 'DATETIME', isNullable: false, description: 'Waktu unggah' },
      { name: 'updated_at', type: 'DATETIME', isNullable: false, description: 'Waktu pembaruan terakhir' },
    ],
    relations: [
      { targetTable: 'technician_profiles', relationshipType: 'many-to-one', foreignKey: 'technician_profile_id', description: 'Profil teknisi' },
      // B3: admin pemverifikasi dokumen. Sebelum relasi ini ada, JOIN
      // technician_documents -> users jatuh ke jalur 2-hop lewat
      // technician_profiles.user_id dan mengembalikan TEKNISI PEMILIK
      // dokumen, bukan admin pemverifikasi.
      { targetTable: 'users', relationshipType: 'many-to-one', foreignKey: 'verified_by_admin_id', description: 'Admin yang memverifikasi dokumen' },
      // B3 (simetris): spesialisasi yang memakai dokumen ini sebagai bukti.
      { targetTable: 'technician_specializations', relationshipType: 'one-to-many', foreignKey: 'technician_specializations.supporting_document_id', description: 'Spesialisasi yang dibuktikan dokumen ini' },
    ],
  },

  appliance_categories: {
    tableName: 'appliance_categories',
    domainGroup: 'profile_catalog',
    description: 'Master 6 kategori peralatan elektronik rumah tangga resmi BANTUIN (AC, Kulkas, Mesin Cuci, Pompa Air, TV, Dapur).',
    primaryKey: 'id',
    columns: [
      { name: 'id', type: 'BIGINT UNSIGNED', isNullable: false, isPrimaryKey: true, description: 'Primary key kategori' },
      { name: 'name', type: 'VARCHAR(100)', isNullable: false, description: 'Nama kategori peralatan' },
      { name: 'slug', type: 'VARCHAR(120)', isNullable: false, description: 'Slug URL unik' },
      { name: 'icon_url', type: 'VARCHAR(255)', isNullable: true, description: 'URL ikon visual' },
      { name: 'description', type: 'TEXT', isNullable: true, description: 'Deskripsi cakupan peralatan' },
      { name: 'is_active', type: 'BOOLEAN', isNullable: false, description: 'Status aktif di aplikasi' },
      { name: 'deleted_at', type: 'DATETIME', isNullable: true, description: 'Soft delete stempel waktu' },
      { name: 'created_at', type: 'DATETIME', isNullable: false, description: 'Waktu pembuatan' },
      { name: 'updated_at', type: 'DATETIME', isNullable: false, description: 'Waktu pembaruan terakhir' },
    ],
    relations: [
      { targetTable: 'services', relationshipType: 'one-to-many', foreignKey: 'services.category_id', description: 'Paket layanan perbaikan spesifik' },
      { targetTable: 'repair_requests', relationshipType: 'one-to-many', foreignKey: 'repair_requests.category_id', description: 'Pesanan perbaikan pada kategori ini' },
      // B3 (simetris): sesi konsultasi AI yang mendeteksi kategori ini.
      { targetTable: 'ai_consultation_sessions', relationshipType: 'one-to-many', foreignKey: 'ai_consultation_sessions.category_id', description: 'Sesi konsultasi AI pada kategori ini' },
    ],
  },

  technician_specializations: {
    tableName: 'technician_specializations',
    domainGroup: 'profile_catalog',
    description: 'Pemetaan kategori keahlian yang dikuasai mitra teknisi.',
    primaryKey: 'id',
    columns: [
      { name: 'id', type: 'BIGINT UNSIGNED', isNullable: false, isPrimaryKey: true, description: 'Primary key' },
      { name: 'technician_profile_id', type: 'BIGINT UNSIGNED', isNullable: false, isForeignKey: true, references: 'technician_profiles.id', description: 'ID profil teknisi' },
      { name: 'category_id', type: 'BIGINT UNSIGNED', isNullable: false, isForeignKey: true, references: 'appliance_categories.id', description: 'ID kategori keahlian' },
      { name: 'supporting_document_id', type: 'BIGINT UNSIGNED', isNullable: true, isForeignKey: true, references: 'technician_documents.id', description: 'Sertifikat pembuktian kompetensi' },
      { name: 'created_at', type: 'DATETIME', isNullable: false, description: 'Waktu terdaftar' },
    ],
    relations: [
      { targetTable: 'technician_profiles', relationshipType: 'many-to-one', foreignKey: 'technician_profile_id', description: 'Profil teknisi' },
      { targetTable: 'appliance_categories', relationshipType: 'many-to-one', foreignKey: 'category_id', description: 'Kategori keahlian' },
      // B3: dokumen pendukung SPESIFIK spesialisasi ini. Sebelum relasi ini
      // ada, JOIN technician_specializations -> technician_documents jatuh
      // ke jalur 2-hop lewat technician_profiles dan mengembalikan SEMUA
      // dokumen teknisi itu, bukan dokumen pendukung yang dimaksud.
      { targetTable: 'technician_documents', relationshipType: 'many-to-one', foreignKey: 'supporting_document_id', description: 'Dokumen sertifikat pembuktian kompetensi' },
    ],
  },

  services: {
    tableName: 'services',
    domainGroup: 'profile_catalog',
    description: 'Katalog paket layanan spesifik dan tarif dasar pengerjaan resmi.',
    primaryKey: 'id',
    columns: [
      { name: 'id', type: 'BIGINT UNSIGNED', isNullable: false, isPrimaryKey: true, description: 'Primary key layanan' },
      { name: 'category_id', type: 'BIGINT UNSIGNED', isNullable: false, isForeignKey: true, references: 'appliance_categories.id', description: 'ID kategori peralatan' },
      { name: 'name', type: 'VARCHAR(150)', isNullable: false, description: 'Nama paket layanan' },
      { name: 'slug', type: 'VARCHAR(180)', isNullable: false, description: 'Slug identitas' },
      { name: 'description', type: 'TEXT', isNullable: true, description: 'Penjelasan rincian pengerjaan' },
      { name: 'base_price', type: 'DECIMAL(12, 2)', isNullable: false, description: 'Tarif dasar jasa (Rupiah)' },
      { name: 'estimated_duration_min', type: 'SMALLINT UNSIGNED', isNullable: false, description: 'Estimasi durasi pengerjaan (menit)' },
      { name: 'is_active', type: 'BOOLEAN', isNullable: false, description: 'Status ketersediaan layanan' },
      { name: 'deleted_at', type: 'DATETIME', isNullable: true, description: 'Soft delete timestamp' },
      { name: 'created_at', type: 'DATETIME', isNullable: false, description: 'Waktu pembuatan' },
      { name: 'updated_at', type: 'DATETIME', isNullable: false, description: 'Waktu pembaruan terakhir' },
    ],
    relations: [
      { targetTable: 'appliance_categories', relationshipType: 'many-to-one', foreignKey: 'category_id', description: 'Kategori induk' },
      { targetTable: 'repair_requests', relationshipType: 'one-to-many', foreignKey: 'repair_requests.service_id', description: 'Pesanan yang memilih paket ini' },
    ],
  },

  // --------------------------------------------------------------------------
  // GRUP 3: KONSULTASI AI
  // --------------------------------------------------------------------------
  ai_consultation_sessions: {
    tableName: 'ai_consultation_sessions',
    domainGroup: 'ai_consultation',
    description: 'Sesi mandiri interaksi diagnosis kerusakan pra-order dengan Chatbot+.',
    primaryKey: 'id',
    ownerForeignKey: 'user_id',
    columns: [
      { name: 'id', type: 'BIGINT UNSIGNED', isNullable: false, isPrimaryKey: true, description: 'Primary key sesi AI' },
      { name: 'session_uuid', type: 'CHAR(36)', isNullable: false, description: 'UUID sesi percakapan' },
      { name: 'user_id', type: 'BIGINT UNSIGNED', isNullable: true, isForeignKey: true, references: 'users.id', description: 'ID pengguna (NULL jika guest)' },
      { name: 'category_id', type: 'BIGINT UNSIGNED', isNullable: true, isForeignKey: true, references: 'appliance_categories.id', description: 'Kategori alat terdeteksi' },
      { name: 'initial_symptoms', type: 'TEXT', isNullable: true, description: 'Gejala kerusakan awal yang diceritakan' },
      { name: 'preliminary_diagnosis', type: 'TEXT', isNullable: true, description: 'Dugaan penyebab hasil analisis AI' },
      { name: 'recommended_action', type: 'TEXT', isNullable: true, description: 'Rekomendasi solusi pengerjaan' },
      { name: 'is_converted_to_order', type: 'BOOLEAN', isNullable: false, description: 'TRUE jika dilanjutkan jadi order perbaikan' },
      { name: 'created_at', type: 'DATETIME', isNullable: false, description: 'Waktu sesi dimulai' },
      { name: 'updated_at', type: 'DATETIME', isNullable: false, description: 'Waktu interaksi terakhir' },
    ],
    relations: [
      // B3: pemilik sesi dan kategori yang terdeteksi. Sebelum relasi ini
      // ada, JOIN ke users/kategori jatuh ke jalur 2-hop lewat
      // repair_requests — sesi yang BELUM menjadi order (dan semua sesi
      // guest) hilang dari hasil.
      { targetTable: 'users', relationshipType: 'many-to-one', foreignKey: 'user_id', description: 'Pengguna pemilik sesi (NULL jika guest)' },
      { targetTable: 'appliance_categories', relationshipType: 'many-to-one', foreignKey: 'category_id', description: 'Kategori alat yang terdeteksi' },
      { targetTable: 'ai_chat_messages', relationshipType: 'one-to-many', foreignKey: 'ai_chat_messages.session_id', description: 'Riwayat pesan percakapan' },
      { targetTable: 'repair_requests', relationshipType: 'one-to-many', foreignKey: 'repair_requests.ai_session_id', description: 'Order yang lahir dari sesi AI ini' },
    ],
  },

  ai_chat_messages: {
    tableName: 'ai_chat_messages',
    domainGroup: 'ai_consultation',
    description: 'Riwayat pesan prompt dan inferensi respons AI Assistant.',
    primaryKey: 'id',
    columns: [
      { name: 'id', type: 'BIGINT UNSIGNED', isNullable: false, isPrimaryKey: true, description: 'Primary key pesan' },
      { name: 'session_id', type: 'BIGINT UNSIGNED', isNullable: false, isForeignKey: true, references: 'ai_consultation_sessions.id', description: 'ID sesi AI terhubung' },
      { name: 'role', type: "ENUM('user', 'assistant', 'system')", isNullable: false, description: 'Peran pengirim pesan' },
      { name: 'message', type: 'MEDIUMTEXT', isNullable: false, description: 'Isi teks percakapan' },
      { name: 'tokens_used', type: 'INT UNSIGNED', isNullable: true, description: 'Jumlah token Gemini API yang dipakai' },
      { name: 'response_time_ms', type: 'INT UNSIGNED', isNullable: true, description: 'Waktu respons inferensi (milidetik)' },
      { name: 'raw_metadata', type: 'JSON', isNullable: true, description: 'Metadata model, rating keamanan, diagnosisCard' },
      { name: 'created_at', type: 'DATETIME', isNullable: false, description: 'Stempel waktu pesan' },
    ],
    relations: [
      { targetTable: 'ai_consultation_sessions', relationshipType: 'many-to-one', foreignKey: 'session_id', description: 'Sesi induk' },
    ],
  },

  // --------------------------------------------------------------------------
  // GRUP 4: PESANAN PERBAIKAN & PENJADWALAN
  // --------------------------------------------------------------------------
  repair_requests: {
    tableName: 'repair_requests',
    domainGroup: 'repairs',
    description: 'Tabel master pesanan perbaikan peralatan elektronik rumah tangga oleh pelanggan.',
    primaryKey: 'id',
    ownerForeignKey: 'customer_id',
    columns: [
      { name: 'id', type: 'BIGINT UNSIGNED', isNullable: false, isPrimaryKey: true, description: 'Primary key pesanan perbaikan' },
      { name: 'order_code', type: 'VARCHAR(32)', isNullable: false, description: 'Kode unik pesanan resmi (BAN-YYYYMMDD-XXXXX)' },
      { name: 'customer_id', type: 'BIGINT UNSIGNED', isNullable: false, isForeignKey: true, references: 'users.id', description: 'ID pelanggan pemesan' },
      { name: 'category_id', type: 'BIGINT UNSIGNED', isNullable: false, isForeignKey: true, references: 'appliance_categories.id', description: 'Kategori alat' },
      { name: 'service_id', type: 'BIGINT UNSIGNED', isNullable: true, isForeignKey: true, references: 'services.id', description: 'Paket layanan dipilih' },
      { name: 'ai_session_id', type: 'BIGINT UNSIGNED', isNullable: true, isForeignKey: true, references: 'ai_consultation_sessions.id', description: 'Relasi ke sesi AI awal' },
      { name: 'device_brand', type: 'VARCHAR(100)', isNullable: true, description: 'Merek peralatan (contoh: Daikin, Panasonic, Sharp)' },
      { name: 'device_model', type: 'VARCHAR(100)', isNullable: true, description: 'Model/Tipe unit (contoh: Split 1 PK Inverter)' },
      { name: 'problem_description', type: 'TEXT', isNullable: false, description: 'Keluhan kerusakan yang dialami' },
      { name: 'problem_photos', type: 'JSON', isNullable: true, description: 'Array URL foto bukti kondisi unit' },
      { name: 'address_text', type: 'TEXT', isNullable: false, description: 'Alamat lengkap lokasi perbaikan' },
      { name: 'latitude', type: 'DECIMAL(10, 8)', isNullable: false, description: 'Koordinat lintang' },
      { name: 'longitude', type: 'DECIMAL(11, 8)', isNullable: false, description: 'Koordinat bujur' },
      {
        name: 'current_status',
        type: "ENUM('draft', 'submitted', 'assigned', 'scheduled', 'in_diagnosis', 'estimated', 'customer_approved', 'in_repair', 'completed', 'cancelled', 'complained')",
        isNullable: false,
        description: 'Status pengerjaan terkini dalam alur bisnis perbaikan'
      },
      { name: 'deleted_at', type: 'DATETIME', isNullable: true, description: 'Soft delete timestamp' },
      { name: 'created_at', type: 'DATETIME', isNullable: false, description: 'Waktu pengajuan pesanan' },
      { name: 'updated_at', type: 'DATETIME', isNullable: false, description: 'Waktu perubahan terakhir' },
    ],
    relations: [
      // B4 — URUTAN PENTING: technician_assignments HARUS mendahului users.
      // findJoinPath mengambil jalur 2-hop pertama yang ditemukan; bila
      // users lebih dulu, JOIN repair_requests -> technician_profiles
      // melewati users.customer_id dan mengembalikan profil teknisi milik
      // PELANGGAN pemesan (hampir selalu NULL/salah). Lewat
      // technician_assignments, JOIN memakai teknisi yang ditugaskan.
      { targetTable: 'technician_assignments', relationshipType: 'one-to-many', foreignKey: 'technician_assignments.repair_request_id', description: 'Penugasan teknisi' },
      { targetTable: 'users', relationshipType: 'many-to-one', foreignKey: 'customer_id', description: 'Pelanggan pemesan' },
      { targetTable: 'appliance_categories', relationshipType: 'many-to-one', foreignKey: 'category_id', description: 'Kategori alat' },
      // B5 — deklarasi simetris: sebelumnya JOIN ke tabel-tabel ini hanya
      // bekerja karena sisi lawan mendeklarasikannya (rapuh).
      { targetTable: 'services', relationshipType: 'many-to-one', foreignKey: 'service_id', description: 'Paket layanan yang dipilih' },
      { targetTable: 'ai_consultation_sessions', relationshipType: 'many-to-one', foreignKey: 'ai_session_id', description: 'Sesi konsultasi AI awal pesanan' },
      { targetTable: 'repair_status_history', relationshipType: 'one-to-many', foreignKey: 'repair_status_history.repair_request_id', description: 'Audit linimasa mutasi status' },
      { targetTable: 'repair_diagnoses', relationshipType: 'one-to-many', foreignKey: 'repair_diagnoses.repair_request_id', description: 'Hasil inspeksi teknis lapangan' },
      { targetTable: 'technician_schedules', relationshipType: 'one-to-many', foreignKey: 'technician_schedules.repair_request_id', description: 'Jadwal kunjungan teknisi' },
      { targetTable: 'repair_chat_rooms', relationshipType: 'one-to-one', foreignKey: 'repair_chat_rooms.repair_request_id', description: 'Ruang chat pelanggan-teknisi' },
      { targetTable: 'repair_reviews', relationshipType: 'one-to-one', foreignKey: 'repair_reviews.repair_request_id', description: 'Ulasan pasca perbaikan' },
      { targetTable: 'repair_complaints', relationshipType: 'one-to-many', foreignKey: 'repair_complaints.repair_request_id', description: 'Komplain atas pesanan ini' },
      { targetTable: 'invoices', relationshipType: 'one-to-one', foreignKey: 'invoices.repair_request_id', description: 'Tagihan invoice resmi' },
    ],
  },

  repair_status_history: {
    tableName: 'repair_status_history',
    domainGroup: 'repairs',
    description: 'Audit linimasa perubahan status pesanan perbaikan.',
    primaryKey: 'id',
    columns: [
      { name: 'id', type: 'BIGINT UNSIGNED', isNullable: false, isPrimaryKey: true, description: 'Primary key riwayat status' },
      { name: 'repair_request_id', type: 'BIGINT UNSIGNED', isNullable: false, isForeignKey: true, references: 'repair_requests.id', description: 'ID pesanan' },
      { name: 'previous_status', type: 'VARCHAR(50)', isNullable: true, description: 'Status sebelum perubahan' },
      { name: 'new_status', type: 'VARCHAR(50)', isNullable: false, description: 'Status baru sesudah perubahan' },
      { name: 'changed_by_user_id', type: 'BIGINT UNSIGNED', isNullable: false, isForeignKey: true, references: 'users.id', description: 'Pengguna yang memicu aksi' },
      { name: 'actor_role', type: "ENUM('customer', 'technician', 'admin', 'system')", isNullable: false, description: 'Peran pelaku perubahan' },
      { name: 'notes', type: 'TEXT', isNullable: true, description: 'Catatan penjelasan perubahan status' },
      { name: 'created_at', type: 'DATETIME', isNullable: false, description: 'Waktu kejadian' },
    ],
    relations: [
      { targetTable: 'repair_requests', relationshipType: 'many-to-one', foreignKey: 'repair_request_id', description: 'Pesanan terkait' },
      { targetTable: 'users', relationshipType: 'many-to-one', foreignKey: 'changed_by_user_id', description: 'Pengguna pelaku aksi' },
    ],
  },

  technician_assignments: {
    tableName: 'technician_assignments',
    domainGroup: 'repairs',
    description: 'Penugasan mitra teknisi terhadap pesanan perbaikan tertentu.',
    primaryKey: 'id',
    ownerForeignKey: 'technician_id',
    columns: [
      { name: 'id', type: 'BIGINT UNSIGNED', isNullable: false, isPrimaryKey: true, description: 'Primary key penugasan' },
      { name: 'repair_request_id', type: 'BIGINT UNSIGNED', isNullable: false, isForeignKey: true, references: 'repair_requests.id', description: 'ID pesanan perbaikan' },
      { name: 'technician_id', type: 'BIGINT UNSIGNED', isNullable: false, isForeignKey: true, references: 'users.id', description: 'ID teknisi ditugaskan' },
      { name: 'assigned_by_user_id', type: 'BIGINT UNSIGNED', isNullable: true, isForeignKey: true, references: 'users.id', description: 'Admin penugasi (NULL jika auto)' },
      { name: 'assignment_type', type: "ENUM('manual_admin', 'auto_system')", isNullable: false, description: 'Metode penugasan' },
      { name: 'status', type: "ENUM('offered', 'accepted', 'rejected', 'reassigned', 'completed', 'cancelled')", isNullable: false, description: 'Status respons teknisi' },
      { name: 'rejection_reason', type: 'TEXT', isNullable: true, description: 'Alasan teknisi jika menolak tugas' },
      { name: 'created_at', type: 'DATETIME', isNullable: false, description: 'Waktu penawaran tugas diajukan' },
      { name: 'responded_at', type: 'DATETIME', isNullable: true, description: 'Waktu teknisi menerima/menolak' },
    ],
    relations: [
      { targetTable: 'repair_requests', relationshipType: 'many-to-one', foreignKey: 'repair_request_id', description: 'Pesanan perbaikan' },
      { targetTable: 'users', relationshipType: 'many-to-one', foreignKey: 'technician_id', description: 'Teknisi yang ditugaskan' },
      // B3: admin yang menugaskan (NULL bila auto_system). Sebelum relasi
      // ini ada, JOIN ke users untuk penugasan jatuh ke jalur 2-hop lewat
      // repair_requests dan mengembalikan PELANGGAN pemesan, bukan admin.
      { targetTable: 'users', relationshipType: 'many-to-one', foreignKey: 'assigned_by_user_id', description: 'Admin yang menugaskan (NULL jika otomatis)' },
      // B4: profil teknisi yang ditugaskan. targetColumn karena
      // technician_id merujuk users.id, dan profil teknisi dihubungkan
      // lewat technician_profiles.user_id (bukan id). Relasi ini membuat
      // jalur 2-hop repair_requests -> technician_assignments ->
      // technician_profiles menjadi mungkin dan BENAR (teknisi yang
      // ditugaskan, bukan profil teknisi milik pelanggan).
      { targetTable: 'technician_profiles', relationshipType: 'many-to-one', foreignKey: 'technician_id', targetColumn: 'user_id', description: 'Profil teknisi yang ditugaskan' },
    ],
  },

  technician_schedules: {
    tableName: 'technician_schedules',
    domainGroup: 'repairs',
    description: 'Jadwal slot waktu kunjungan fisik teknisi ke alamat pelanggan.',
    primaryKey: 'id',
    ownerForeignKey: 'technician_id',
    columns: [
      { name: 'id', type: 'BIGINT UNSIGNED', isNullable: false, isPrimaryKey: true, description: 'Primary key jadwal' },
      { name: 'repair_request_id', type: 'BIGINT UNSIGNED', isNullable: false, isForeignKey: true, references: 'repair_requests.id', description: 'ID pesanan perbaikan' },
      { name: 'technician_id', type: 'BIGINT UNSIGNED', isNullable: false, isForeignKey: true, references: 'users.id', description: 'ID teknisi bertugas' },
      { name: 'scheduled_date', type: 'DATE', isNullable: false, description: 'Tanggal rencana kunjungan' },
      { name: 'time_slot_start', type: 'TIME', isNullable: false, description: 'Jam awal kunjungan' },
      { name: 'time_slot_end', type: 'TIME', isNullable: false, description: 'Jam akhir kunjungan' },
      { name: 'status', type: "ENUM('scheduled', 'rescheduled', 'on_the_way', 'arrived', 'completed', 'cancelled')", isNullable: false, description: 'Status pelaksanaan jadwal' },
      { name: 'reschedule_reason', type: 'TEXT', isNullable: true, description: 'Alasan penundaan jadwal jika ada' },
      { name: 'created_at', type: 'DATETIME', isNullable: false, description: 'Waktu penjadwalan' },
      { name: 'updated_at', type: 'DATETIME', isNullable: false, description: 'Waktu pembaruan terakhir' },
    ],
    relations: [
      { targetTable: 'repair_requests', relationshipType: 'many-to-one', foreignKey: 'repair_request_id', description: 'Pesanan terkait' },
      { targetTable: 'users', relationshipType: 'many-to-one', foreignKey: 'technician_id', description: 'Teknisi terkait' },
    ],
  },

  repair_diagnoses: {
    tableName: 'repair_diagnoses',
    domainGroup: 'repairs',
    description: 'Laporan hasil inspeksi fisik lapangan oleh teknisi, rincian biaya komponen/jasa, dan persetujuan pelanggan.',
    primaryKey: 'id',
    columns: [
      { name: 'id', type: 'BIGINT UNSIGNED', isNullable: false, isPrimaryKey: true, description: 'Primary key diagnosa' },
      { name: 'repair_request_id', type: 'BIGINT UNSIGNED', isNullable: false, isForeignKey: true, references: 'repair_requests.id', description: 'ID pesanan perbaikan' },
      { name: 'technician_id', type: 'BIGINT UNSIGNED', isNullable: false, isForeignKey: true, references: 'users.id', description: 'Teknisi pemeriksa' },
      { name: 'damage_details', type: 'TEXT', isNullable: false, description: 'Rincian temuan kerusakan fisik unit' },
      { name: 'required_parts_json', type: 'JSON', isNullable: true, description: 'Daftar suku cadang yang wajib diganti [{part_name, qty, unit_price}]' },
      { name: 'labor_cost', type: 'DECIMAL(12, 2)', isNullable: false, description: 'Estimasi ongkos jasa teknisi' },
      { name: 'parts_cost', type: 'DECIMAL(12, 2)', isNullable: false, description: 'Estimasi total harga sparepart' },
      { name: 'total_estimate', type: 'DECIMAL(12, 2)', isNullable: false, description: 'Total perkiraan biaya perbaikan' },
      { name: 'evidence_photos', type: 'JSON', isNullable: true, description: 'Foto bukti fisik kerusakan setelah dibongkar' },
      { name: 'customer_approval', type: "ENUM('pending', 'approved', 'rejected')", isNullable: false, description: 'Status persetujuan pelanggan' },
      { name: 'rejection_reason', type: 'TEXT', isNullable: true, description: 'Alasan pelanggan jika estimasi ditolak' },
      { name: 'approved_at', type: 'DATETIME', isNullable: true, description: 'Waktu pelanggan menyetujui' },
      { name: 'created_at', type: 'DATETIME', isNullable: false, description: 'Waktu pembuatan diagnosa' },
      { name: 'updated_at', type: 'DATETIME', isNullable: false, description: 'Waktu pembaruan terakhir' },
    ],
    relations: [
      { targetTable: 'repair_requests', relationshipType: 'many-to-one', foreignKey: 'repair_request_id', description: 'Pesanan terkait' },
      { targetTable: 'users', relationshipType: 'many-to-one', foreignKey: 'technician_id', description: 'Teknisi pemeriksa' },
    ],
  },

  // --------------------------------------------------------------------------
  // GRUP 5: KOMUNIKASI CHAT
  // --------------------------------------------------------------------------
  repair_chat_rooms: {
    tableName: 'repair_chat_rooms',
    domainGroup: 'communication',
    description: 'Ruang obrolan privat 1-on-1 pelanggan dan teknisi dalam lingkup pesanan aktif.',
    primaryKey: 'id',
    columns: [
      { name: 'id', type: 'BIGINT UNSIGNED', isNullable: false, isPrimaryKey: true, description: 'Primary key kamar chat' },
      { name: 'repair_request_id', type: 'BIGINT UNSIGNED', isNullable: false, isForeignKey: true, references: 'repair_requests.id', description: 'ID pesanan (1 kamar per pesanan)' },
      { name: 'customer_id', type: 'BIGINT UNSIGNED', isNullable: false, isForeignKey: true, references: 'users.id', description: 'ID pelanggan' },
      { name: 'technician_id', type: 'BIGINT UNSIGNED', isNullable: false, isForeignKey: true, references: 'users.id', description: 'ID teknisi' },
      { name: 'is_active', type: 'BOOLEAN', isNullable: false, description: 'Status aktif ruang chat' },
      { name: 'created_at', type: 'DATETIME', isNullable: false, description: 'Waktu pembuatan' },
      { name: 'updated_at', type: 'DATETIME', isNullable: false, description: 'Waktu pembaruan terakhir' },
    ],
    relations: [
      { targetTable: 'repair_requests', relationshipType: 'one-to-one', foreignKey: 'repair_request_id', description: 'Pesanan terkait' },
      // B3: kedua pihak ruang chat. Sebelum relasi ini ada, repair_chat_rooms
      // tidak punya relasi ke users sama sekali — JOIN ke users hanya lewat
      // repair_requests.customer_id (pelanggan saja; teknisi tidak terjangkau).
      // Dua relasi ke users: pilih dengan `via` (customer_id / technician_id).
      { targetTable: 'users', relationshipType: 'many-to-one', foreignKey: 'customer_id', description: 'Pelanggan di ruang chat' },
      { targetTable: 'users', relationshipType: 'many-to-one', foreignKey: 'technician_id', description: 'Teknisi di ruang chat' },
      { targetTable: 'repair_chat_messages', relationshipType: 'one-to-many', foreignKey: 'repair_chat_messages.chat_room_id', description: 'Daftar pesan percakapan' },
    ],
  },

  repair_chat_messages: {
    tableName: 'repair_chat_messages',
    domainGroup: 'communication',
    description: 'Pesan percakapan dalam ruang chat pesanan.',
    primaryKey: 'id',
    columns: [
      { name: 'id', type: 'BIGINT UNSIGNED', isNullable: false, isPrimaryKey: true, description: 'Primary key pesan' },
      { name: 'chat_room_id', type: 'BIGINT UNSIGNED', isNullable: false, isForeignKey: true, references: 'repair_chat_rooms.id', description: 'ID kamar chat' },
      { name: 'sender_id', type: 'BIGINT UNSIGNED', isNullable: false, isForeignKey: true, references: 'users.id', description: 'ID pengirim pesan' },
      { name: 'message_type', type: "ENUM('text', 'image', 'location', 'system')", isNullable: false, description: 'Jenis konten pesan' },
      { name: 'content', type: 'TEXT', isNullable: false, description: 'Isi teks pesan' },
      { name: 'attachment_url', type: 'VARCHAR(255)', isNullable: true, description: 'URL lampiran foto/file' },
      { name: 'is_read', type: 'BOOLEAN', isNullable: false, description: 'Status sudah dibaca lawan bicara' },
      { name: 'created_at', type: 'DATETIME', isNullable: false, description: 'Stempel waktu' },
    ],
    relations: [
      { targetTable: 'repair_chat_rooms', relationshipType: 'many-to-one', foreignKey: 'chat_room_id', description: 'Ruang obrolan' },
      { targetTable: 'users', relationshipType: 'many-to-one', foreignKey: 'sender_id', description: 'Pengirim' },
    ],
  },

  // --------------------------------------------------------------------------
  // GRUP 6: KEUANGAN, TAGIHAN & PEMBAYARAN
  // --------------------------------------------------------------------------
  invoices: {
    tableName: 'invoices',
    domainGroup: 'finance',
    description: 'Tagihan invoice penagihan resmi perbaikan unit pelanggan.',
    primaryKey: 'id',
    ownerForeignKey: 'customer_id',
    columns: [
      { name: 'id', type: 'BIGINT UNSIGNED', isNullable: false, isPrimaryKey: true, description: 'Primary key invoice' },
      { name: 'invoice_number', type: 'VARCHAR(50)', isNullable: false, description: 'Nomor seri invoice resmi unik' },
      { name: 'repair_request_id', type: 'BIGINT UNSIGNED', isNullable: false, isForeignKey: true, references: 'repair_requests.id', description: 'ID pesanan terkait (1 pesanan = 1 invoice)' },
      { name: 'customer_id', type: 'BIGINT UNSIGNED', isNullable: false, isForeignKey: true, references: 'users.id', description: 'ID pelanggan pembayar' },
      { name: 'subtotal_labor', type: 'DECIMAL(12, 2)', isNullable: false, description: 'Biaya jasa teknisi' },
      { name: 'subtotal_parts', type: 'DECIMAL(12, 2)', isNullable: false, description: 'Biaya suku cadang/sparepart' },
      { name: 'service_fee', type: 'DECIMAL(12, 2)', isNullable: false, description: 'Biaya platform BANTUIN' },
      { name: 'discount_amount', type: 'DECIMAL(12, 2)', isNullable: false, description: 'Potongan promo/diskon' },
      { name: 'total_amount', type: 'DECIMAL(12, 2)', isNullable: false, description: 'Total tagihan akhir yang wajib dilunasi' },
      { name: 'status', type: "ENUM('unpaid', 'paid', 'cancelled', 'refunded')", isNullable: false, description: 'Status pelunasan tagihan' },
      { name: 'due_date', type: 'DATETIME', isNullable: false, description: 'Batas akhir waktu pembayaran' },
      { name: 'paid_at', type: 'DATETIME', isNullable: true, description: 'Waktu pembayaran lunas terkonfirmasi' },
      { name: 'created_at', type: 'DATETIME', isNullable: false, description: 'Waktu invoice terbit' },
      { name: 'updated_at', type: 'DATETIME', isNullable: false, description: 'Waktu pembaruan terakhir' },
    ],
    relations: [
      { targetTable: 'repair_requests', relationshipType: 'one-to-one', foreignKey: 'repair_request_id', description: 'Pesanan perbaikan' },
      { targetTable: 'users', relationshipType: 'many-to-one', foreignKey: 'customer_id', description: 'Pelanggan penanggung tagihan' },
      { targetTable: 'payments', relationshipType: 'one-to-many', foreignKey: 'payments.invoice_id', description: 'Transaksi pembayaran' },
    ],
  },

  payments: {
    tableName: 'payments',
    domainGroup: 'finance',
    description: 'Catatan transaksi pembayaran aman tanpa menyimpan informasi kartu debit/kredit mentah.',
    primaryKey: 'id',
    // B14 — scope relasional untuk customer: pembayaran atas invoice miliknya
    // sendiri (lewat invoices.customer_id = userId). Tanpa ini customer tidak
    // bisa mengkueri payments sama sekali dan AI terpaksa menjawab pertanyaan
    // "sudah dibayar?" dari invoices.status — definisi yang sudah dibuktikan
    // salah (N31: pembayaran benar diukur dari payments settlement). Teknisi
    // tetap ditolak (pekerjaan lanjutan: scope lewat assignment pesanan).
    relationalScope: {
      roles: ['customer'],
      viaTable: 'invoices',
      viaForeignKey: 'invoice_id',
      ownerColumn: 'customer_id',
    },
    columns: [
      { name: 'id', type: 'BIGINT UNSIGNED', isNullable: false, isPrimaryKey: true, description: 'Primary key pembayaran' },
      { name: 'payment_reference', type: 'VARCHAR(100)', isNullable: false, description: 'Kode referensi internal BANTUIN' },
      { name: 'invoice_id', type: 'BIGINT UNSIGNED', isNullable: false, isForeignKey: true, references: 'invoices.id', description: 'ID invoice yang dibayar' },
      {
        name: 'payment_method',
        type: "ENUM('qris', 'va_bca', 'va_mandiri', 'va_bni', 'va_bri', 'ewallet_gopay', 'ewallet_ovo', 'ewallet_dana', 'cash_on_delivery')",
        isNullable: false,
        description: 'Metode pembayaran yang dipilih'
      },
      { name: 'gateway_provider', type: 'VARCHAR(50)', isNullable: true, description: 'Vendor payment gateway' },
      { name: 'gateway_transaction_id', type: 'VARCHAR(100)', isNullable: true, description: 'ID transaksi vendor gateway' },
      { name: 'amount', type: 'DECIMAL(12, 2)', isNullable: false, description: 'Nominal pembayaran' },
      { name: 'payment_status', type: "ENUM('pending', 'settlement', 'expire', 'deny', 'cancel', 'refunded')", isNullable: false, description: 'Status mutasi pembayaran' },
      { name: 'gateway_response_json', type: 'JSON', isNullable: true, isSensitive: true, description: 'Payload webhook mentah - TIDAK DIBAGIKAN KE AI' },
      { name: 'settled_at', type: 'DATETIME', isNullable: true, description: 'Waktu transaksi settlement' },
      { name: 'created_at', type: 'DATETIME', isNullable: false, description: 'Waktu inisiasi' },
      { name: 'updated_at', type: 'DATETIME', isNullable: false, description: 'Waktu pembaruan terakhir' },
    ],
    relations: [
      { targetTable: 'invoices', relationshipType: 'many-to-one', foreignKey: 'invoice_id', description: 'Invoice tagihan yang dibayar' },
    ],
  },

  // --------------------------------------------------------------------------
  // GRUP 7: ULASAN & PENGADUAN
  // --------------------------------------------------------------------------
  repair_reviews: {
    tableName: 'repair_reviews',
    domainGroup: 'reviews_disputes',
    description: 'Ulasan bintang 1-5 dan testimoni pelanggan pasca perbaikan unit.',
    primaryKey: 'id',
    ownerForeignKey: 'customer_id',
    columns: [
      { name: 'id', type: 'BIGINT UNSIGNED', isNullable: false, isPrimaryKey: true, description: 'Primary key ulasan' },
      { name: 'repair_request_id', type: 'BIGINT UNSIGNED', isNullable: false, isForeignKey: true, references: 'repair_requests.id', description: 'ID pesanan (1 ulasan per pesanan)' },
      { name: 'customer_id', type: 'BIGINT UNSIGNED', isNullable: false, isForeignKey: true, references: 'users.id', description: 'ID pelanggan pemberi ulasan' },
      { name: 'technician_id', type: 'BIGINT UNSIGNED', isNullable: false, isForeignKey: true, references: 'users.id', description: 'ID teknisi penerima ulasan' },
      { name: 'rating', type: 'TINYINT UNSIGNED', isNullable: false, description: 'Skala bintang kepuasan 1-5' },
      { name: 'review_text', type: 'TEXT', isNullable: true, description: 'Komentar dan testimoni' },
      { name: 'photos', type: 'JSON', isNullable: true, description: 'Foto bukti kepuasan unit normal' },
      { name: 'is_published', type: 'BOOLEAN', isNullable: false, description: 'Apakah ditampilkan publik' },
      { name: 'created_at', type: 'DATETIME', isNullable: false, description: 'Waktu ulasan diberikan' },
      { name: 'updated_at', type: 'DATETIME', isNullable: false, description: 'Waktu pembaruan terakhir' },
    ],
    relations: [
      { targetTable: 'repair_requests', relationshipType: 'one-to-one', foreignKey: 'repair_request_id', description: 'Pesanan' },
      { targetTable: 'users', relationshipType: 'many-to-one', foreignKey: 'customer_id', description: 'Pelanggan pemberi ulasan' },
      { targetTable: 'users', relationshipType: 'many-to-one', foreignKey: 'technician_id', description: 'Teknisi yang diulas' },
    ],
  },

  repair_complaints: {
    tableName: 'repair_complaints',
    domainGroup: 'reviews_disputes',
    description: 'Layanan sengketa, eskalasi komplain mutu kerja, dan klaim garansi 30 hari pelanggan.',
    primaryKey: 'id',
    ownerForeignKey: 'complainant_user_id',
    columns: [
      { name: 'id', type: 'BIGINT UNSIGNED', isNullable: false, isPrimaryKey: true, description: 'Primary key komplain' },
      { name: 'complaint_code', type: 'VARCHAR(32)', isNullable: false, description: 'Kode komplain resmi (CMP-YYYYMMDD-XXXXX)' },
      { name: 'repair_request_id', type: 'BIGINT UNSIGNED', isNullable: false, isForeignKey: true, references: 'repair_requests.id', description: 'ID pesanan yang dikomplain' },
      { name: 'complainant_user_id', type: 'BIGINT UNSIGNED', isNullable: false, isForeignKey: true, references: 'users.id', description: 'Pelanggan pelapor' },
      {
        name: 'category',
        type: "ENUM('poor_workmanship', 'tardiness', 'overcharging', 'technician_misbehavior', 'recurring_damage', 'other')",
        isNullable: false,
        description: 'Kategori alasan komplain'
      },
      { name: 'description', type: 'TEXT', isNullable: false, description: 'Rincian keluhan ketidakpuasan / klaim garansi' },
      { name: 'evidence_photos', type: 'JSON', isNullable: true, description: 'Foto/video bukti kendala' },
      { name: 'status', type: "ENUM('submitted', 'in_investigation', 'waiting_customer', 'resolved', 'rejected')", isNullable: false, description: 'Status penanganan sengketa' },
      { name: 'resolution_summary', type: 'TEXT', isNullable: true, description: 'Ringkasan solusi keputusan admin' },
      { name: 'handled_by_admin_id', type: 'BIGINT UNSIGNED', isNullable: true, isForeignKey: true, references: 'users.id', description: 'Admin penanggung jawab' },
      { name: 'resolved_at', type: 'DATETIME', isNullable: true, description: 'Waktu kasus diselesaikan' },
      { name: 'created_at', type: 'DATETIME', isNullable: false, description: 'Waktu komplain diajukan' },
      { name: 'updated_at', type: 'DATETIME', isNullable: false, description: 'Waktu pembaruan terakhir' },
    ],
    relations: [
      { targetTable: 'repair_requests', relationshipType: 'many-to-one', foreignKey: 'repair_request_id', description: 'Pesanan' },
      { targetTable: 'users', relationshipType: 'many-to-one', foreignKey: 'complainant_user_id', description: 'Pelapor' },
      { targetTable: 'users', relationshipType: 'many-to-one', foreignKey: 'handled_by_admin_id', description: 'Admin penangan' },
    ],
  },

  // --------------------------------------------------------------------------
  // GRUP 8: NOTIFIKASI & SISTEM ADMINISTRATOR
  // --------------------------------------------------------------------------
  notifications: {
    tableName: 'notifications',
    domainGroup: 'system',
    description: 'Penyimpanan riwayat notifikasi in-app untuk seluruh peran pengguna.',
    primaryKey: 'id',
    ownerForeignKey: 'user_id',
    columns: [
      { name: 'id', type: 'BIGINT UNSIGNED', isNullable: false, isPrimaryKey: true, description: 'Primary key notifikasi' },
      { name: 'user_id', type: 'BIGINT UNSIGNED', isNullable: false, isForeignKey: true, references: 'users.id', description: 'ID pengguna penerima' },
      { name: 'title', type: 'VARCHAR(150)', isNullable: false, description: 'Judul notifikasi' },
      { name: 'message', type: 'TEXT', isNullable: false, description: 'Isi teks pesan notifikasi' },
      { name: 'type', type: "ENUM('order_status', 'payment', 'technician_assignment', 'chat', 'complaint', 'document_verification', 'system')", isNullable: false, description: 'Kategori tipe notifikasi' },
      { name: 'target_url', type: 'VARCHAR(255)', isNullable: true, description: 'Tautan halaman target saat diklik' },
      { name: 'entity_type', type: 'VARCHAR(50)', isNullable: true, description: 'Tipe entitas terkait' },
      { name: 'entity_id', type: 'BIGINT UNSIGNED', isNullable: true, description: 'ID entitas terkait' },
      { name: 'is_read', type: 'BOOLEAN', isNullable: false, description: 'Status telah dibaca' },
      { name: 'read_at', type: 'DATETIME', isNullable: true, description: 'Waktu notifikasi dibaca' },
      { name: 'created_at', type: 'DATETIME', isNullable: false, description: 'Waktu kirim' },
    ],
    relations: [
      { targetTable: 'users', relationshipType: 'many-to-one', foreignKey: 'user_id', description: 'Penerima notifikasi' },
    ],
  },

  // B1 (rebase ke main 9579915 — PR #12 notifikasi WA menambah tabel ini):
  // log pengiriman WhatsApp (Fonnte), manual dari panel admin maupun otomatis
  // saat status pesanan berubah. Dipisah dari `notifications` (in-app).
  whatsapp_notifications: {
    tableName: 'whatsapp_notifications',
    domainGroup: 'system',
    description: 'Log pengiriman notifikasi WhatsApp (Fonnte) — manual dari panel admin maupun otomatis saat status pesanan berubah.',
    primaryKey: 'id',
    ownerForeignKey: 'user_id',
    columns: [
      { name: 'id', type: 'BIGINT UNSIGNED', isNullable: false, isPrimaryKey: true, description: 'Primary key log WhatsApp' },
      { name: 'user_id', type: 'BIGINT UNSIGNED', isNullable: false, isForeignKey: true, references: 'users.id', description: 'ID pengguna penerima pesan' },
      { name: 'target_phone', type: 'VARCHAR(20)', isNullable: false, description: 'Nomor tujuan ternormalisasi (format 628...)' },
      { name: 'source', type: "ENUM('manual', 'auto')", isNullable: false, description: 'manual = dikirim admin dari panel; auto = dipicu perubahan status pesanan' },
      { name: 'event', type: 'VARCHAR(50)', isNullable: false, description: 'Pemicu pengiriman (order_status, assignment_offered, assignment_cancelled, schedule_set, order_created, manual)' },
      { name: 'template_key', type: 'VARCHAR(50)', isNullable: true, description: 'Kunci template pesan; NULL untuk pesan manual bebas' },
      { name: 'title', type: 'VARCHAR(150)', isNullable: true, description: 'Judul pesan manual (opsional)' },
      { name: 'message', type: 'TEXT', isNullable: false, description: 'Isi pesan WhatsApp yang dikirim' },
      { name: 'entity_type', type: 'VARCHAR(50)', isNullable: true, description: 'Tipe entitas terkait (mis. repair_requests)' },
      { name: 'entity_id', type: 'BIGINT UNSIGNED', isNullable: true, description: 'ID entitas terkait (mis. ID pesanan)' },
      { name: 'status', type: "ENUM('pending', 'sent', 'failed')", isNullable: false, description: 'Status pengiriman Fonnte' },
      { name: 'fonnte_message_id', type: 'VARCHAR(100)', isNullable: true, description: 'ID pesan dari Fonnte bila terkirim' },
      { name: 'error_message', type: 'VARCHAR(500)', isNullable: true, description: 'Detail kegagalan bila status failed' },
      { name: 'sent_by_admin_id', type: 'BIGINT UNSIGNED', isNullable: true, isForeignKey: true, references: 'users.id', description: 'Admin pengirim (hanya untuk source manual)' },
      { name: 'created_at', type: 'DATETIME', isNullable: false, description: 'Waktu log dibuat' },
      { name: 'updated_at', type: 'DATETIME', isNullable: false, description: 'Waktu log terakhir diperbarui' },
    ],
    relations: [
      { targetTable: 'users', relationshipType: 'many-to-one', foreignKey: 'user_id', description: 'Penerima pesan WhatsApp' },
      { targetTable: 'users', relationshipType: 'many-to-one', foreignKey: 'sent_by_admin_id', description: 'Admin pengirim (pesan manual)' },
    ],
  },

  system_settings: {
    tableName: 'system_settings',
    domainGroup: 'system',
    description: 'Pengaturan konfigurasi dinamis aplikasi BANTUIN (biaya admin, garansi hari, radius dispatch).',
    primaryKey: 'id',
    columns: [
      { name: 'id', type: 'BIGINT UNSIGNED', isNullable: false, isPrimaryKey: true, description: 'Primary key setting' },
      { name: 'setting_key', type: 'VARCHAR(100)', isNullable: false, description: 'Kunci unik nama konfigurasi' },
      { name: 'setting_value', type: 'TEXT', isNullable: false, description: 'Nilai konfigurasi' },
      { name: 'value_type', type: "ENUM('string', 'number', 'boolean', 'json')", isNullable: false, description: 'Tipe format nilai' },
      { name: 'group_name', type: 'VARCHAR(50)', isNullable: false, description: 'Kelompok grup setting' },
      { name: 'description', type: 'VARCHAR(255)', isNullable: true, description: 'Penjelasan fungsi setting' },
      { name: 'updated_by_admin_id', type: 'BIGINT UNSIGNED', isNullable: true, isForeignKey: true, references: 'users.id', description: 'Admin pengubah terakhir' },
      { name: 'updated_at', type: 'DATETIME', isNullable: false, description: 'Waktu perubahan' },
    ],
    relations: [
      { targetTable: 'users', relationshipType: 'many-to-one', foreignKey: 'updated_by_admin_id', description: 'Admin pengubah' },
    ],
  },

  admin_audit_logs: {
    tableName: 'admin_audit_logs',
    domainGroup: 'system',
    description: 'Catatan jejak rekam audit tidak dapat diubah (immutable append-only) untuk setiap tindakan admin.',
    primaryKey: 'id',
    columns: [
      { name: 'id', type: 'BIGINT UNSIGNED', isNullable: false, isPrimaryKey: true, description: 'Primary key log audit' },
      { name: 'admin_user_id', type: 'BIGINT UNSIGNED', isNullable: false, isForeignKey: true, references: 'users.id', description: 'ID akun admin pelaku aksi' },
      { name: 'action', type: 'VARCHAR(100)', isNullable: false, description: 'Kode tindakan (misal: VERIFY_DOC, UPDATE_SETTING)' },
      { name: 'entity_name', type: 'VARCHAR(60)', isNullable: false, description: 'Nama tabel target yang dimanipulasi' },
      { name: 'entity_id', type: 'BIGINT UNSIGNED', isNullable: false, description: 'ID baris target' },
      { name: 'old_values', type: 'JSON', isNullable: true, description: 'Snapshot data sebelum perubahan' },
      { name: 'new_values', type: 'JSON', isNullable: true, description: 'Snapshot data sesudah perubahan' },
      { name: 'ip_address', type: 'VARCHAR(45)', isNullable: true, description: 'IP address pengeksekusi' },
      { name: 'user_agent', type: 'VARCHAR(255)', isNullable: true, description: 'User agent pengeksekusi' },
      { name: 'created_at', type: 'DATETIME', isNullable: false, description: 'Waktu eksekusi' },
    ],
    relations: [
      { targetTable: 'users', relationshipType: 'many-to-one', foreignKey: 'admin_user_id', description: 'Admin penanggung jawab' },
    ],
  },

  // --------------------------------------------------------------------------
  // GRUP 9: MANAJEMEN & MONITORING PROVIDER AI (B1)
  // Akses ADMIN SAJA: kelima tabel ini tidak punya ownerForeignKey sehingga
  // isTableAllowedForRole otomatis menolak peran non-admin. encrypted_api_key
  // ditandai isSensitive — tidak pernah dikembalikan ke AI.
  // --------------------------------------------------------------------------
  ai_provider_configs: {
    tableName: 'ai_provider_configs',
    domainGroup: 'ai_management',
    description: 'Konfigurasi runtime masing-masing provider AI BANTUIN (endpoint, model, status koneksi terakhir).',
    primaryKey: 'id',
    columns: [
      { name: 'id', type: 'BIGINT UNSIGNED', isNullable: false, isPrimaryKey: true, description: 'Primary key konfigurasi provider' },
      { name: 'provider', type: 'VARCHAR(50)', isNullable: false, description: 'Slug ID unik provider (gemini, groq, deepseek, dsb)' },
      { name: 'name', type: 'VARCHAR(100)', isNullable: false, description: 'Nama display provider AI' },
      { name: 'api_endpoint', type: 'VARCHAR(255)', isNullable: false, description: 'Endpoint URL resmi HTTPS' },
      { name: 'encrypted_api_key', type: 'TEXT', isNullable: true, isSensitive: true, description: 'Kunci API terenkripsi AES-256-GCM - SANGAT RAHASIA' },
      { name: 'key_identifier', type: 'VARCHAR(64)', isNullable: false, description: 'Key Identifier untuk rotasi kunci' },
      { name: 'masked_key_preview', type: 'VARCHAR(60)', isNullable: true, description: 'Pratinjau sensor untuk UI tanpa mengekspos plaintext' },
      { name: 'selected_model', type: 'VARCHAR(100)', isNullable: false, description: 'Model yang dipilih untuk provider ini' },
      { name: 'default_model', type: 'VARCHAR(100)', isNullable: false, description: 'Model default provider' },
      { name: 'temperature', type: 'DECIMAL(3, 2)', isNullable: false, description: 'Temperature inferensi' },
      { name: 'max_output_tokens', type: 'INT UNSIGNED', isNullable: false, description: 'Batas token keluaran' },
      { name: 'request_timeout_ms', type: 'INT UNSIGNED', isNullable: false, description: 'Timeout request (milidetik)' },
      { name: 'retry_limit', type: 'TINYINT UNSIGNED', isNullable: false, description: 'Batas percobaan ulang' },
      { name: 'last_connection_status', type: "ENUM('not_configured', 'connected', 'disconnected', 'connection_error', 'disabled')", isNullable: false, description: 'Status koneksi terakhir' },
      { name: 'last_tested_at', type: 'DATETIME', isNullable: true, description: 'Waktu tes koneksi terakhir' },
      { name: 'last_error_message', type: 'TEXT', isNullable: true, description: 'Pesan error terakhir' },
      { name: 'created_at', type: 'DATETIME', isNullable: false, description: 'Waktu pembuatan' },
      { name: 'updated_at', type: 'DATETIME', isNullable: false, description: 'Waktu pembaruan terakhir' },
    ],
    relations: [],
  },

  ai_global_settings: {
    tableName: 'ai_global_settings',
    domainGroup: 'ai_management',
    description: 'Pengaturan provider aktif tunggal dan kebijakan fallback (single-row, id = 1).',
    primaryKey: 'id',
    columns: [
      { name: 'id', type: 'INT UNSIGNED', isNullable: false, isPrimaryKey: true, description: 'Selalu 1 (single-row pattern)' },
      { name: 'active_provider', type: 'VARCHAR(50)', isNullable: false, description: 'Slug provider AI yang sedang aktif' },
      { name: 'enable_fallback', type: 'BOOLEAN', isNullable: false, description: 'Apakah fallback provider diaktifkan' },
      { name: 'fallback_provider', type: 'VARCHAR(50)', isNullable: false, description: 'Slug provider cadangan' },
      { name: 'version', type: 'BIGINT UNSIGNED', isNullable: false, description: 'State counter untuk invalidasi cache' },
      { name: 'circuit_breaker_failure_threshold', type: 'TINYINT UNSIGNED', isNullable: false, description: 'Ambang gagal circuit breaker' },
      { name: 'circuit_breaker_cooldown_sec', type: 'INT UNSIGNED', isNullable: false, description: 'Cooldown circuit breaker (detik)' },
      { name: 'updated_by_admin_id', type: 'BIGINT UNSIGNED', isNullable: true, isForeignKey: true, references: 'users.id', description: 'Admin pengubah terakhir' },
      { name: 'updated_at', type: 'DATETIME', isNullable: false, description: 'Waktu perubahan' },
    ],
    relations: [
      { targetTable: 'users', relationshipType: 'many-to-one', foreignKey: 'updated_by_admin_id', description: 'Admin pengubah terakhir' },
    ],
  },

  ai_connection_test_logs: {
    tableName: 'ai_connection_test_logs',
    domainGroup: 'ai_management',
    description: 'Riwayat pengujian koneksi live provider AI.',
    primaryKey: 'id',
    columns: [
      { name: 'id', type: 'BIGINT UNSIGNED', isNullable: false, isPrimaryKey: true, description: 'Primary key log tes' },
      { name: 'provider', type: 'VARCHAR(50)', isNullable: false, description: 'Slug provider yang diuji' },
      { name: 'endpoint', type: 'VARCHAR(255)', isNullable: false, description: 'Endpoint yang diuji' },
      { name: 'model_tested', type: 'VARCHAR(100)', isNullable: false, description: 'Model yang diuji' },
      { name: 'status', type: "ENUM('success', 'invalid_api_key', 'invalid_endpoint', 'model_not_available', 'rate_limit_exceeded', 'timeout', 'provider_error', 'unknown_error')", isNullable: false, description: 'Hasil pengujian koneksi' },
      { name: 'http_status_code', type: 'INT', isNullable: true, description: 'Kode status HTTP respons' },
      { name: 'response_time_ms', type: 'INT UNSIGNED', isNullable: false, description: 'Waktu respons (milidetik)' },
      { name: 'error_message', type: 'TEXT', isNullable: true, description: 'Pesan error jika gagal' },
      { name: 'admin_user_id', type: 'BIGINT UNSIGNED', isNullable: true, description: 'Admin yang menjalankan tes (tanpa FK di DDL)' },
      { name: 'created_at', type: 'DATETIME', isNullable: false, description: 'Waktu pengujian' },
    ],
    relations: [],
  },

  ai_usage_logs: {
    tableName: 'ai_usage_logs',
    domainGroup: 'ai_management',
    description: 'Log analitik konsumsi token dan performa inferensi AI per provider.',
    primaryKey: 'id',
    columns: [
      { name: 'id', type: 'BIGINT UNSIGNED', isNullable: false, isPrimaryKey: true, description: 'Primary key log penggunaan' },
      { name: 'provider', type: 'VARCHAR(50)', isNullable: false, description: 'Slug provider' },
      { name: 'model', type: 'VARCHAR(100)', isNullable: false, description: 'Model yang dipakai' },
      { name: 'latency_ms', type: 'INT UNSIGNED', isNullable: false, description: 'Latensi inferensi (milidetik)' },
      { name: 'status', type: "ENUM('success', 'failed', 'fallback')", isNullable: false, description: 'Status inferensi' },
      { name: 'prompt_tokens', type: 'INT UNSIGNED', isNullable: true, description: 'Token input' },
      { name: 'completion_tokens', type: 'INT UNSIGNED', isNullable: true, description: 'Token output' },
      { name: 'total_tokens', type: 'INT UNSIGNED', isNullable: true, description: 'Total token konsumsi' },
      { name: 'error_category', type: 'VARCHAR(100)', isNullable: true, description: 'Kategori error bila gagal' },
      { name: 'is_fallback', type: 'BOOLEAN', isNullable: false, description: 'Apakah ini hasil fallback' },
      { name: 'fallback_from_provider', type: 'VARCHAR(50)', isNullable: true, description: 'Provider asal sebelum fallback' },
      { name: 'session_id', type: 'BIGINT UNSIGNED', isNullable: true, description: 'ID sesi chat terkait (tanpa FK di DDL)' },
      { name: 'user_role', type: 'VARCHAR(30)', isNullable: true, description: 'Peran pengguna pemicu inferensi' },
      { name: 'created_at', type: 'DATETIME', isNullable: false, description: 'Waktu inferensi' },
    ],
    relations: [],
  },

  ai_config_audit_logs: {
    tableName: 'ai_config_audit_logs',
    domainGroup: 'ai_management',
    description: 'Audit trail jejak rekam modifikasi konfigurasi AI administrator.',
    primaryKey: 'id',
    columns: [
      { name: 'id', type: 'BIGINT UNSIGNED', isNullable: false, isPrimaryKey: true, description: 'Primary key log audit AI' },
      { name: 'admin_user_id', type: 'BIGINT UNSIGNED', isNullable: false, description: 'Admin pelaku perubahan (tanpa FK di DDL)' },
      { name: 'provider', type: 'VARCHAR(50)', isNullable: false, description: 'Slug provider yang diubah' },
      { name: 'action', type: 'VARCHAR(100)', isNullable: false, description: 'Kode aksi (UPDATE_CONFIG, SWITCH_PROVIDER, ROTATE_KEY, TOGGLE_FALLBACK, TEST_CONNECTION, DELETE_PROVIDER)' },
      { name: 'changes', type: 'JSON', isNullable: true, description: 'Payload perubahan yang sudah disensor (API key tidak pernah tersimpan mentah)' },
      { name: 'ip_address', type: 'VARCHAR(45)', isNullable: true, description: 'IP address pengeksekusi' },
      { name: 'user_agent', type: 'VARCHAR(255)', isNullable: true, description: 'User agent pengeksekusi' },
      { name: 'created_at', type: 'DATETIME', isNullable: false, description: 'Waktu perubahan' },
    ],
    relations: [],
  },
};

/**
 * Menghasilkan ringkasan skema ringkas yang relevan untuk diinjeksikan ke prompt LLM
 * berdasarkan peran pengguna (Role-Filtered Schema Context).
 *
 * B9 — Ringkasan ini HANYA mengiklankan tabel yang benar-benar bisa dikueri
 * peran tersebut lewat queryDatabase (sesuai isTableAllowedForRole). Mengiklankan
 * tabel yang ditolak membuat AI mencoba, gagal, dan menjawab tanpa data.
 * Matriks akses nyata: admin = semua 32 tabel; guest = tabel publik saja;
 * customer = tabel milik sendiri (owner user_id/customer_id/
 * complainant_user_id) + payments lewat scope relasional (B14); technician =
 * tabel tugas sendiri (owner technician_id/user_id milik teknisi).
 */
export function getRoleFilteredSchemaSummary(role: 'customer' | 'technician' | 'admin' | 'guest'): string {
  if (role === 'guest') {
    return `Tabel Publik yang Relevan (hanya ini yang bisa dikueri tamu):
- appliance_categories: Kategori alat elektronik rumah tangga resmi (AC, Kulkas, Mesin Cuci, Pompa Air, TV, Dapur).
- services: Katalog paket jasa perbaikan dan tarif dasar resmi BANTUIN.
Biaya administrasi dan garansi 30 hari tersedia lewat katalog publik, bukan lewat kueri tabel.`;
  }

  if (role === 'customer') {
    return `Tabel Database yang Relevan untuk Pelanggan (hanya data milik sendiri yang bisa dikueri):
- customer_profiles: Profil diri, nama lengkap, kontak, alamat rumah Anda.
- repair_requests: Riwayat pesanan perbaikan Anda (kode order, status pengerjaan, merk/model alat, keluhan).
- invoices & payments: Tagihan invoice resmi Anda dan transaksi pembayarannya (status pembayaran yang benar dibaca dari payments.payment_status, bukan dari status invoice).
- repair_reviews & repair_complaints: Riwayat ulasan bintang dan pengaduan garansi Anda.
- notifications: Notifikasi yang dikirim kepada Anda.
- whatsapp_notifications: Log pengiriman WhatsApp (Fonnte) kepada Anda.
- ai_consultation_sessions: Sesi konsultasi AI Anda.
- appliance_categories & services: Katalog alat dan tarif resmi.
Nama teknisi yang menangani pesanan Anda tersedia lewat detail pesanan, bukan lewat kueri tabel teknisi.`;
  }

  if (role === 'technician') {
    return `Tabel Database yang Relevan untuk Mitra Teknisi (hanya tugas milik sendiri yang bisa dikueri):
- technician_profiles: Profil teknisi Anda, keahlian, pengalaman, dan skor rating rata-rata Anda.
- technician_assignments: Daftar tugas perbaikan yang ditugaskan kepada Anda (status penugasan: offered, accepted, completed).
- technician_schedules: Jadwal slot waktu kunjungan Anda ke lokasi pelanggan.
- notifications: Notifikasi yang dikirim kepada Anda.
- whatsapp_notifications: Log pengiriman WhatsApp (Fonnte) kepada Anda.
- ai_consultation_sessions: Sesi konsultasi AI Anda.
- appliance_categories & services: Katalog alat dan tarif resmi.
Detail pesanan tiap tugas (alamat pelanggan, merk alat, keluhan, NOMOR TELEPON pelanggan) tersedia lewat alat daftar tugas — pakai alat itu untuk nomor telepon. JANGAN mencoba JOIN ke users untuk nomor telepon: tabel users tidak dapat dikueri oleh teknisi, dan repair_requests tidak punya kolom telepon.`;
  }

  // Admin — seluruh 32 tabel (B5: daftar lengkap, selaras dengan matriks akses).
  return `Tabel Database Lengkap BANTUIN (Administrator View — seluruh 32 tabel bisa dikueri):
- users, user_otps, user_refresh_tokens: Manajemen akun, OTP, dan sesi seluruh pengguna.
- customer_profiles, technician_profiles, admin_profiles, technician_documents, technician_specializations: Profil, dokumen verifikasi, dan keahlian pengguna.
- appliance_categories, services: Katalog kategori alat dan paket layanan resmi.
- ai_consultation_sessions, ai_chat_messages: Sesi dan riwayat pesan konsultasi AI.
- repair_requests, repair_status_history, technician_assignments, technician_schedules, repair_diagnoses: Pengawasan seluruh pesanan perbaikan, linimasa status, penugasan, jadwal, dan estimasi biaya.
- repair_chat_rooms, repair_chat_messages: Ruang dan pesan chat pelanggan-teknisi per pesanan.
- invoices, payments: Pembukuan finansial, total perputaran omzet, piutang invoice tertunggak.
- repair_reviews, repair_complaints: Ulasan pelanggan dan manajemen pengaduan/eskalasi garansi 30 hari.
- notifications, whatsapp_notifications, system_settings, admin_audit_logs: Notifikasi in-app, log pengiriman WhatsApp (Fonnte), pengaturan konfigurasi operasional, dan riwayat audit aktivitas administrator.
- ai_provider_configs, ai_global_settings, ai_connection_test_logs, ai_usage_logs, ai_config_audit_logs: Konfigurasi provider AI, provider aktif, riwayat tes koneksi, konsumsi token, dan audit perubahan konfigurasi AI.`;
}

/**
 * Mengambil metadata skema tabel tertentu atau seluruh tabel yang terdaftar
 */
export function getTableSchemaMetadata(tableName?: string): TableMetadata | Record<string, TableMetadata> | null {
  if (!tableName) return BANTUIN_SCHEMA_REGISTRY;
  const cleanName = tableName.trim().toLowerCase();
  return BANTUIN_SCHEMA_REGISTRY[cleanName] || null;
}


