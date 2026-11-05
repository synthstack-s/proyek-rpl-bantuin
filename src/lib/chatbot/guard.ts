import { TopicValidationResult } from './types';

// Kata kunci bahaya darurat tinggi (Safety Hazards)
const HAZARD_PATTERNS = [
  /bau\s+(hangus|terbakar|gosong|gas|asap)/i,
  /(percikan\s+api|keluar\s+api|kebakaran|meledak|meletup)/i,
  /(kesetrum|sengatan\s+listrik|tegangan\s+tinggi)/i,
  /(colokan|stopkontak|kabel).*?(terendam|basah|kena\s+air|banjir)/i,
  /(asap\s+keluar|kabel\s+meleleh|kabel\s+terkelupas)/i,
  /(kebocoran\s+gas|gas\s+bocor|tabung\s+gas\s+berdesis)/i,
];

// Pola Prompt Injection / Jailbreak
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior)\s+instructions/i,
  /abaikan\s+(semua\s+)?instruksi/i,
  /(jailbreak|dan\s+mode|developer\s+mode)/i,
  /act\s+as\s+(an?\s+)?unrestricted/i,
  /kamu\s+sekarang\s+adalah/i,
  /system\s+prompt/i,
  /override\s+system/i,
  /pretend\s+you\s+are\s+not/i,
  /bocorkan\s+(rahasia|prompt|instruksi|api\s*key|password|kredensial)/i,
  /tampilkan\s+isi\s+(prompt|system\s+instruction|env|api\s*key)/i,
];

// Pola Topik Terlarang / Di Luar Lingkup BANTUIN
const OFF_TOPIC_PATTERNS = [
  // Coding / Programming murni yang tidak terkait BANTUIN
  /(tuliskan|buatkan|generate)\s+(kode|code|skrip|script|program|fungsi|function|aplikasi|html|css|python|javascript|php|java|c\+\+)\b/i,
  /(debug\s+kode|compile\s+error|react\s+hook|nodejs\s+express)/i,
  // Tugas Akademik / PR / Matematika Murni
  /(kerjakan\s+pr|tugas\s+sekolah|hitunglah\s+rumus|persamaan\s+matematika|turunan\s+dari|integral\s+dari)/i,
  /(\b\d+\s*[\+\-\*\/]\s*\d+\s*=\s*\?)/i,
  // Pengetahuan Umum Luar Lingkup
  /(siapa\s+presiden|ibukota\s+negara|sejarah\s+kemerdekaan|perang\s+dunia|luas\s+wilayah|teori\s+relativitas|fotosintesis)/i,
  // Hiburan / Politik / Gosip / Kripto
  /(rekomendasi\s+film|lirik\s+lagu|cerita\s+dongeng|ramalan\s+zodiak|berita\s+politik|pilpres|pemilu|crypto|bitcoin|saham)/i,
];

// Kata kunci perangkat elektronik rumah tangga BANTUIN
const APPLIANCE_KEYWORDS = [
  'ac', 'pendingin', 'air conditioner', 'freon', 'kondensor', 'evaporator',
  'kulkas', 'lemari es', 'freezer', 'chiller', 'showcase', 'kompresor',
  'mesin cuci', 'pengering', 'dryer', 'spin', 'tabung cuci', 'drainase', 'drain pump',
  'pompa air', 'jet pump', 'water heater', 'pemanas air', 'toren', 'otomatis pompa',
  'televisi', 'tv', 'led tv', 'smart tv', 'audio', 'speaker', 'home theater',
  'microwave', 'dispenser', 'blender', 'magic com', 'rice cooker', 'setrika', 'oven', 'kompor', 'air fryer'
];

// Kata kunci operasional dan bisnis BANTUIN
const BANTUIN_APP_KEYWORDS = [
  'bantuin', 'pesan', 'pesanan', 'pemesanan', 'order', 'orders', 'teknisi', 'jadwal', 'tarif', 'biaya',
  'harga', 'garansi', 'komplain', 'status', 'invoice', 'bayar', 'pembayaran', 'transaksi', 'keuangan',
  'registrasi', 'daftar', 'login', 'masuk', 'verifikasi', 'whatsapp', 'otp', 'fonnte',
  'akun', 'profil', 'data', 'diri', 'identitas', 'kategori', 'layanan', 'batal', 'alamat',
  'pengguna', 'user', 'users', 'pelanggan', 'customer', 'kustomer', 'admin', 'administrator',
  'konfigurasi', 'pengaturan', 'statistik', 'overview', 'dashboard', 'laporan', 'analitik',
  'perbaikan', 'servis', 'service', 'progres', 'lacak', 'tugas', 'pekerjaan', 'deadline',
  'terlambat', 'keterlambatan', 'tertunda', 'diagnosis', 'keluhan', 'audit', 'database', 'gemini'
];

/**
 * Validasi topik dan filter keamanan percakapan.
 * 
 * Aturan Otorisasi Keamanan:
 * 1. Prompt Injection dicegah mutlak untuk semua peran.
 * 2. Bahaya keselamatan (api, gas, sengatan listrik) selalu diberi peringatan darurat.
 * 3. Untuk pengguna terotentikasi (Admin, Teknisi, Pelanggan), pertanyaan operasional
 *    dan data aplikasi diizinkan penuh, hanya memblokir eksplisit injection & topik terlarang.
 * 4. Untuk Tamu (Guest), topik umum yang menyimpang diarahkan kembali ke layanan BANTUIN secara santun.
 */
export function validateTopicAndSafety(userMessage: string, role: string = 'guest'): TopicValidationResult {
  const normalized = userMessage.trim().toLowerCase();

  // 1. Cek Percobaan Prompt Injection (Berlaku untuk SEMUA peran)
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        isAllowed: false,
        reason: 'Permintaan ditolak: Manipulasi instruksi sistem terdeteksi.',
        isSafetyHazard: false,
      };
    }
  }

  // 2. Cek Bahaya Keselamatan Listrik / Kebakaran / Gas
  for (const pattern of HAZARD_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        isAllowed: true, // Tetap diproses untuk memberikan instruksi darurat keselamatan!
        isSafetyHazard: true,
        safetyAlert: `PERINGATAN KESELAMATAN TINGGI (BAHAYA LISTRIK/API/GAS):
1. Segera matikan sumber listrik utama (MCB rumah) atau cabut steker jika aman dilakukan tanpa menyentuh genangan air/bagian panas.
2. JANGAN mencoba menyentuh atau membongkar perangkat yang mengeluarkan asap, percikan api, atau bau gas/hangus.
3. Jauhkan anak-anak dan bahan mudah terbakar dari sekitar perangkat.
4. BANTUIN sangat menyarankan penanganan langsung oleh teknisi profesional tersertifikasi.`,
      };
    }
  }

  // 3. Deteksi Kata Kunci Perangkat atau Operasional BANTUIN
  const hasApplianceKeyword = APPLIANCE_KEYWORDS.some(kw => {
    return normalized.includes(kw);
  });

  const hasAppKeyword = BANTUIN_APP_KEYWORDS.some(kw => {
    return normalized.includes(kw);
  });

  // Deteksi kata gejala kerusakan umum
  const symptomKeywords = [
    'rusak', 'mati', 'bocor', 'panas', 'dingin', 'bunyi', 'berisik', 'getar',
    'berasap', 'kedip', 'error', 'tidak jalan', 'mati total', 'kurang dingin',
    'air mampet', 'konslet', 'trip', 'mcb turun', 'kendala', 'masalah', 'keluhan'
  ];
  const hasSymptomKeyword = symptomKeywords.some(kw => normalized.includes(kw));

  // 4. Cek Topik Terlarang Eksplisit (Coding murni luar aplikasi, tugas sekolah, politik, gosip)
  for (const pattern of OFF_TOPIC_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        isAllowed: false,
        reason: 'Topik di luar lingkup layanan aplikasi dan ekosistem BANTUIN.',
        isSafetyHazard: false,
      };
    }
  }

  // Deteksi kategori spesifik untuk bantuan routing / diagnosis
  let detectedCategory: string | undefined;
  if (/ac|pendingin|air conditioner|freon/i.test(normalized)) {
    detectedCategory = 'ac-pendingin-ruangan';
  } else if (/kulkas|lemari es|freezer|chiller/i.test(normalized)) {
    detectedCategory = 'kulkas-freezer';
  } else if (/mesin cuci|pengering|dryer/i.test(normalized)) {
    detectedCategory = 'mesin-cuci-pengering';
  } else if (/pompa air|jet pump|water heater|pemanas air/i.test(normalized)) {
    detectedCategory = 'pompa-air-water-heater';
  } else if (/televisi|tv|led tv|audio|speaker/i.test(normalized)) {
    detectedCategory = 'tv-audio-elektronik';
  } else if (/microwave|dispenser|blender|magic com|rice cooker|oven|kompor/i.test(normalized)) {
    detectedCategory = 'elektronik-dapur';
  }

  // 5. Pengguna Terotentikasi (Admin, Teknisi, Customer) diizinkan bertanya seputar operasional sistem
  if (role === 'admin' || role === 'technician' || role === 'customer') {
    return {
      isAllowed: true,
      isSafetyHazard: false,
      detectedCategory,
      isBantuinAppQuery: true,
    };
  }

  // 6. Untuk Tamu Publik (Guest):
  const greetings = ['halo', 'hai', 'pagi', 'siang', 'sore', 'malam', 'assalamualaikum', 'bantu', 'tolong', 'info', 'tes', 'test', 'siapa', 'apa'];
  const isGreetingOrGeneral = greetings.some(g => normalized.startsWith(g) || normalized.includes(g));

  if (!hasApplianceKeyword && !hasAppKeyword && !hasSymptomKeyword && !isGreetingOrGeneral) {
    return {
      isAllowed: false,
      reason: 'Pertanyaan tidak relevan dengan layanan perbaikan elektronik dan aplikasi BANTUIN.',
      isSafetyHazard: false,
    };
  }

  return {
    isAllowed: true,
    isSafetyHazard: false,
    detectedCategory,
    isBantuinAppQuery: hasAppKeyword,
  };
}

/**
 * Format standar pesan penolakan topik secara santun dan profesional
 */
export function getStandardRefusalMessage(reason?: string): string {
  const reasonText = reason ? `\n_Catatan: ${reason}_\n` : '';
  return `Mohon maaf, sebagai asisten AI resmi **BANTUIN**, saya khusus dilatih untuk memberikan panduan penggunaan aplikasi BANTUIN serta konsultasi awal perbaikan perangkat elektronik rumah tangga (seperti AC, Kulkas, Mesin Cuci, TV, Pompa Air, dan Elektronik Dapur).${reasonText}
Saya tidak dapat membantu topik di luar layanan perbaikan dan ekosistem BANTUIN (seperti pemrograman umum, tugas sekolah, politik, atau pengetahuan umum).

Ada kendala pada perangkat elektronik rumah tangga Anda atau pertanyaan seputar pemesanan teknisi BANTUIN yang bisa saya bantu?`;
}
