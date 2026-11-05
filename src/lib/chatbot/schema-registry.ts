/**
 * SCHEMA REGISTRY - BANTUIN DATABASE INTELLIGENCE
 * 
 * Menyediakan metadata mesin untuk seluruh 25 tabel basis data MySQL 8.0 BANTUIN.
 * Menjamin model AI memahami struktur, relasi, primary/foreign key, dan batasan sensitivitas data
 * tanpa memberikan kredensial atau akses SQL langsung.
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
  domainGroup: 'identity' | 'profile_catalog' | 'ai_consultation' | 'repairs' | 'communication' | 'finance' | 'reviews_disputes' | 'system';
  description: string;
  primaryKey: string;
  ownerForeignKey?: string; // Misal: 'customer_id', 'user_id', 'technician_id' untuk row-level authorization
  columns: TableColumnMetadata[];
  relations: Array<{
    targetTable: string;
    relationshipType: 'one-to-one' | 'one-to-many' | 'many-to-one';
    foreignKey: string;
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
      { name: 'deleted_at', type: 'DATETIME', isNullable: true, description: 'Stempel waktu soft-delete' },
      { name: 'created_at', type: 'DATETIME', isNullable: false, description: 'Waktu pendaftaran akun' },
      { name: 'updated_at', type: 'DATETIME', isNullable: false, description: 'Waktu pembaruan akun terakhir' },
    ],
    relations: [
      { targetTable: 'customer_profiles', relationshipType: 'one-to-one', foreignKey: 'customer_profiles.user_id', description: 'Profil data diri pelanggan' },
      { targetTable: 'technician_profiles', relationshipType: 'one-to-one', foreignKey: 'technician_profiles.user_id', description: 'Profil data teknisi mitra' },
      { targetTable: 'repair_requests', relationshipType: 'one-to-many', foreignKey: 'repair_requests.customer_id', description: 'Daftar pesanan perbaikan pelanggan' },
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
      { targetTable: 'technician_documents', relationshipType: 'one-to-many', foreignKey: 'technician_documents.technician_profile_id', description: 'Dokumen sertifikasi keahlian' },
      { targetTable: 'technician_specializations', relationshipType: 'one-to-many', foreignKey: 'technician_specializations.technician_profile_id', description: 'Kategori spesialisasi keahlian' },
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
      { name: 'issuing_organization', type: 'VARCHAR(150)', isNullable: true, description: 'Lembaga penerbit sertifikat' },
      { name: 'document_number', type: 'VARCHAR(100)', isNullable: true, description: 'Nomor seri sertifikat' },
      { name: 'issue_date', type: 'DATE', isNullable: true, description: 'Tanggal terbit' },
      { name: 'expiry_date', type: 'DATE', isNullable: true, description: 'Tanggal kedaluwarsa' },
      { name: 'verification_status', type: "ENUM('pending', 'approved', 'rejected', 'revision_required')", isNullable: false, description: 'Status persetujuan admin' },
      { name: 'admin_notes', type: 'TEXT', isNullable: true, description: 'Catatan admin pemeriksa' },
      { name: 'created_at', type: 'DATETIME', isNullable: false, description: 'Waktu unggah' },
    ],
    relations: [
      { targetTable: 'technician_profiles', relationshipType: 'many-to-one', foreignKey: 'technician_profile_id', description: 'Profil teknisi' },
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
    ],
    relations: [
      { targetTable: 'services', relationshipType: 'one-to-many', foreignKey: 'services.category_id', description: 'Paket layanan perbaikan spesifik' },
      { targetTable: 'repair_requests', relationshipType: 'one-to-many', foreignKey: 'repair_requests.category_id', description: 'Pesanan perbaikan pada kategori ini' },
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
      { targetTable: 'users', relationshipType: 'many-to-one', foreignKey: 'customer_id', description: 'Pelanggan pemesan' },
      { targetTable: 'appliance_categories', relationshipType: 'many-to-one', foreignKey: 'category_id', description: 'Kategori alat' },
      { targetTable: 'repair_status_history', relationshipType: 'one-to-many', foreignKey: 'repair_status_history.repair_request_id', description: 'Audit linimasa mutasi status' },
      { targetTable: 'technician_assignments', relationshipType: 'one-to-many', foreignKey: 'technician_assignments.repair_request_id', description: 'Penugasan teknisi' },
      { targetTable: 'repair_diagnoses', relationshipType: 'one-to-many', foreignKey: 'repair_diagnoses.repair_request_id', description: 'Hasil inspeksi teknis lapangan' },
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
    ],
    relations: [
      { targetTable: 'repair_requests', relationshipType: 'one-to-one', foreignKey: 'repair_request_id', description: 'Pesanan terkait' },
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
      { name: 'created_at', type: 'DATETIME', isNullable: false, description: 'Waktu kirim' },
    ],
    relations: [
      { targetTable: 'users', relationshipType: 'many-to-one', foreignKey: 'user_id', description: 'Penerima notifikasi' },
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
      { name: 'created_at', type: 'DATETIME', isNullable: false, description: 'Waktu eksekusi' },
    ],
    relations: [
      { targetTable: 'users', relationshipType: 'many-to-one', foreignKey: 'admin_user_id', description: 'Admin penanggung jawab' },
    ],
  },
};

/**
 * Menghasilkan ringkasan skema ringkas yang relevan untuk diinjeksikan ke prompt LLM
 * berdasarkan peran pengguna (Role-Filtered Schema Context)
 */
export function getRoleFilteredSchemaSummary(role: 'customer' | 'technician' | 'admin' | 'guest'): string {
  if (role === 'guest') {
    return `Tabel Publik yang Relevan:
- appliance_categories: Kategori alat elektronik rumah tangga resmi (AC, Kulkas, Mesin Cuci, Pompa Air, TV, Dapur).
- services: Katalog paket jasa perbaikan dan tarif dasar resmi BANTUIN.
- system_settings: Biaya administrasi standar, jaminan garansi 30 hari.`;
  }

  if (role === 'customer') {
    return `Tabel Database yang Relevan untuk Pelanggan (Row-Level Isolated):
- customer_profiles: Profil diri, nama lengkap, kontak, alamat rumah Anda.
- repair_requests: Riwayat pesanan perbaikan Anda (kode order, status pengerjaan, merk/model alat, keluhan).
- repair_status_history: Linimasa pembaruan status pengerjaan pesanan Anda.
- technician_assignments & technician_profiles: Nama teknisi resmi yang ditugaskan menangani pesanan Anda.
- repair_diagnoses: Hasil inspeksi fisik teknisi, rincian estimasi ongkos pengerjaan, estimasi sparepart, dan approval.
- invoices & payments: Tagihan invoice resmi Anda dan status pelunasan.
- repair_reviews & repair_complaints: Riwayat ulasan bintang dan pengaduan garansi Anda.
- appliance_categories & services: Katalog alat dan tarif resmi.`;
  }

  if (role === 'technician') {
    return `Tabel Database yang Relevan untuk Mitra Teknisi:
- technician_profiles: Profil teknisi Anda, keahlian, pengalaman, dan skor rating rata-rata Anda.
- technician_assignments: Daftar tugas perbaikan yang ditugaskan kepada Anda (status: offered, accepted, in_repair, completed).
- technician_schedules: Jadwal slot waktu kunjungan Anda ke lokasi pelanggan.
- repair_requests: Rincian pesanan yang ditugaskan kepada Anda (alamat pelanggan, nomor telepon, merk alat, keluhan).
- repair_diagnoses: Catatan inspeksi teknis, kebutuhan sparepart, dan estimasi biaya yang Anda susun.
- repair_reviews: Ulasan dan rating kepuasan yang Anda terima dari pelanggan.`;
  }

  // Admin
  return `Tabel Database Lengkap BANTUIN (Administrator View):
- users, customer_profiles, technician_profiles: Manajemen dan demografi seluruh pengguna.
- repair_requests, repair_status_history, technician_assignments: Pengawasan seluruh pesanan perbaikan dan keterlambatan tugas.
- repair_diagnoses: Pengawasan estimasi biaya dan persetujuan pelanggan.
- invoices, payments: Pembukuan finansial, total perputaran omzet, piutang invoice tertunggak.
- repair_complaints: Manajemen pengaduan dan eskalasi garansi 30 hari.
- system_settings: Pengaturan konfigurasi operasional dan komisi platform.
- admin_audit_logs: Riwayat audit aktivitas administrator.`;
}

/**
 * Mengambil metadata skema tabel tertentu atau seluruh tabel yang terdaftar
 */
export function getTableSchemaMetadata(tableName?: string): TableMetadata | Record<string, TableMetadata> | null {
  if (!tableName) return BANTUIN_SCHEMA_REGISTRY;
  const cleanName = tableName.trim().toLowerCase();
  return BANTUIN_SCHEMA_REGISTRY[cleanName] || null;
}


