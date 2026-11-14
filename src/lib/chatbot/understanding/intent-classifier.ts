/**
 * BANTUIN AI UNDERSTANDING ENGINE - INTENT CLASSIFIER & ENTITY EXTRACTOR
 * 
 * Sistem pemahaman bahasa alami (NLU) untuk Bahasa Indonesia formal & informal:
 * 1. Normalisasi slang, singkatan, dan typo umum Indonesia.
 * 2. Klasifikasi maksud (Intent Classification) multi-kelas.
 * 3. Ekstraksi entitas kunci (Order Code, Invoice, Phone, Email, Kategori Alat, Gejala).
 * 4. Resolusi ambiguitas dan pembuatan rekomendasi klarifikasi.
 */

export type UserIntent =
  | 'DIAGNOSIS_QUERY'          // Konsultasi kerusakan alat & cara penanganan
  | 'ORDER_STATUS_QUERY'       // Pertanyaan status, linimasa & perkembangan pesanan
  | 'ORDER_DETAIL_QUERY'       // Pertanyaan rincian detail pesanan tertentu
  | 'INVOICE_BILLING_QUERY'    // Pertanyaan tagihan, nominal biaya, pembayaran & bukti
  | 'TECHNICIAN_QUERY'         // Pertanyaan seputar mitra teknisi, rating, kontak
  | 'USER_PROFILE_QUERY'       // Pertanyaan profil diri, email, kontak, tanggal daftar
  | 'SYSTEM_APP_GUIDE'         // Panduan fitur, cara daftar/login, garansi 30 hari
  | 'ADMIN_OPERATIONAL_QUERY'  // Monitoring dashboard, beban kerja teknisi, audit, keuangan
  | 'AI_SYSTEM_QUERY'          // Pertanyaan model AI yang aktif, provider, parameter
  | 'SAFETY_HAZARD'            // Bahaya darurat tinggi (api, sengatan listrik, gas bocor)
  | 'OUT_OF_SCOPE'             // Di luar cakupan aplikasi BANTUIN
  | 'AMBIGUOUS_QUERY';         // Maksud belum jelas, butuh klarifikasi

export interface ExtractedEntities {
  orderCode?: string;
  invoiceNumber?: string;
  phoneNumber?: string;
  email?: string;
  applianceCategorySlug?: string;
  applianceCategoryName?: string;
  symptoms: string[];
  actionVerb?: string;
  isAmbiguous: boolean;
  clarificationPrompt?: string;
}

export interface UnderstandingResult {
  intent: UserIntent;
  confidence: number;
  normalizedMessage: string;
  entities: ExtractedEntities;
  requiresDatabase: boolean;
  targetDomain: 'appliance' | 'order' | 'finance' | 'technician' | 'profile' | 'admin' | 'system' | 'general';
}

// Kamus normalisasi singkatan & typo bahasa Indonesia
const SLANG_DICTIONARY: Record<string, string> = {
  'sy': 'saya',
  'aq': 'saya',
  'gw': 'saya',
  'gue': 'saya',
  'km': 'kamu',
  'lu': 'kamu',
  'lo': 'kamu',
  'u': 'kamu',
  'klkas': 'kulkas',
  'kulkas': 'kulkas',
  'msn': 'mesin',
  'cuci': 'cuci',
  'pomp': 'pompa',
  'pmpa': 'pompa',
  'tknisi': 'teknisi',
  'teknsi': 'teknisi',
  'teknis': 'teknisi',
  'psnan': 'pesanan',
  'psn': 'pesan',
  'ordr': 'order',
  'kpn': 'kapan',
  'dmn': 'dimana',
  'gmn': 'bagaimana',
  'bgmn': 'bagaimana',
  'brapa': 'berapa',
  'brp': 'berapa',
  'byr': 'bayar',
  'pembayaran': 'pembayaran',
  'batalin': 'batalkan',
  'batal': 'batal',
  'grnsi': 'garansi',
  'kmplain': 'komplain',
  'aduan': 'komplain',
  'no': 'nomor',
  'nmr': 'nomor',
  'tlp': 'telepon',
  'telp': 'telepon',
  'wa': 'whatsapp',
  'hp': 'handphone',
  'dgn': 'dengan',
  'yg': 'yang',
  'krn': 'karena',
  'sdh': 'sudah',
  'udh': 'sudah',
  'blm': 'belum',
  'belom': 'belum',
  'ga': 'tidak',
  'gak': 'tidak',
  'ngga': 'tidak',
  'nggak': 'tidak',
  'tdk': 'tidak',
  'bisa': 'bisa',
  'bs': 'bisa',
  'aja': 'saja',
  'aj': 'saja',
  'netes': 'menetes',
  'bcor': 'bocor',
  'rsak': 'rusak',
  'matot': 'mati total',
};

/**
 * Normalisasi teks Indonesia (Menghilangkan typo dan slang umum)
 */
export function normalizeIndonesianText(text: string): string {
  const words = text.toLowerCase().trim().split(/\s+/);
  const normalizedWords = words.map((w) => {
    // Hilangkan tanda baca yang menempel
    const cleanWord = w.replace(/^[^\w]+|[^\w]+$/g, '');
    return SLANG_DICTIONARY[cleanWord] || cleanWord;
  });
  return normalizedWords.join(' ');
}

/**
 * Ekstraksi entitas dari pesan pengguna
 */
export function extractEntities(rawText: string, normalizedText: string): ExtractedEntities {
  const entities: ExtractedEntities = {
    symptoms: [],
    isAmbiguous: false,
  };

  // 1. Ekstraksi Order Code (contoh: BAN-20261105-0001, BAN-001, REP-101, ORD-01)
  const orderMatch = rawText.match(/\b(?:BAN|REP|ORD)-[A-Za-z0-9-]+\b/i) ||
    rawText.match(/#\s*([A-Za-z0-9-]+)/);
  if (orderMatch) {
    entities.orderCode = orderMatch[0].replace(/^#\s*/, '').toUpperCase();
  }

  // 2. Ekstraksi Invoice Number (contoh: INV-20261105-0001, INV-001)
  const invMatch = rawText.match(/\bINV-[A-Za-z0-9-]+\b/i);
  if (invMatch) {
    entities.invoiceNumber = invMatch[0].toUpperCase();
  }

  // 3. Ekstraksi Nomor Telepon WhatsApp (08..., +628..., 628...)
  const phoneMatch = rawText.match(/(?:\+62|62|0)8[1-9][0-9]{7,11}\b/);
  if (phoneMatch) {
    entities.phoneNumber = phoneMatch[0];
  }

  // 4. Ekstraksi Email
  const emailMatch = rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) {
    entities.email = emailMatch[0].toLowerCase();
  }

  // 5. Ekstraksi Kategori Peralatan
  if (/ac|pendingin|air conditioner|freon/i.test(normalizedText)) {
    entities.applianceCategorySlug = 'ac-pendingin-ruangan';
    entities.applianceCategoryName = 'Pendingin Ruangan (AC)';
  } else if (/kulkas|lemari es|freezer|chiller/i.test(normalizedText)) {
    entities.applianceCategorySlug = 'kulkas-freezer';
    entities.applianceCategoryName = 'Lemari Es & Freezer';
  } else if (/mesin cuci|pengering|dryer/i.test(normalizedText)) {
    entities.applianceCategorySlug = 'mesin-cuci-pengering';
    entities.applianceCategoryName = 'Mesin Cuci & Pengering';
  } else if (/pompa air|jet pump|water heater|pemanas air/i.test(normalizedText)) {
    entities.applianceCategorySlug = 'pompa-air-water-heater';
    entities.applianceCategoryName = 'Pompa Air & Water Heater';
  } else if (/televisi|tv|led tv|speaker|audio/i.test(normalizedText)) {
    entities.applianceCategorySlug = 'tv-audio-elektronik';
    entities.applianceCategoryName = 'Televisi & Home Audio';
  } else if (/microwave|dispenser|blender|magic com|rice cooker|oven|kompor/i.test(normalizedText)) {
    entities.applianceCategorySlug = 'elektronik-dapur';
    entities.applianceCategoryName = 'Peralatan Dapur Elektronik';
  }

  // 6. Ekstraksi Gejala Kerusakan
  const symptomPatterns = [
    'bocor', 'menetes', 'tidak dingin', 'kurang dingin', 'mati total', 'berasap',
    'berisik', 'bergetar', 'bau hangus', 'kedip', 'error', 'tidak berputar',
    'air tidak keluar', 'konslet', 'trip', 'mcb turun', 'pintu tidak rapat'
  ];

  for (const s of symptomPatterns) {
    if (normalizedText.includes(s)) {
      entities.symptoms.push(s);
    }
  }

  return entities;
}

/**
 * Mengklasifikasikan intent pengguna berdasarkan pemahaman semantik
 */
export function classifyUserIntent(rawMessage: string): UnderstandingResult {
  const norm = normalizeIndonesianText(rawMessage);
  const entities = extractEntities(rawMessage, norm);

  // 1. Deteksi Bahaya Keselamatan (Safety Hazard)
  if (
    /bau\s+(?:hangus|terbakar|gosong|gas|asap)|percikan\s+api|keluar\s+api|kebakaran|meledak|kesetrum|sengatan\s+listrik|kabel\s+(?:meleleh|terkelupas|terendam)/i.test(norm)
  ) {
    return {
      intent: 'SAFETY_HAZARD',
      confidence: 0.99,
      normalizedMessage: norm,
      entities,
      requiresDatabase: false,
      targetDomain: 'system',
    };
  }

  // 2. Deteksi Pertanyaan Model & Provider AI
  if (
    /model\s+(?:apa|ai|llm)|provider\s+(?:apa|ai)|kamu\s+(?:pakai|menggunakan|ditenagai|berbasis)\s+(?:model|ai|gemini|groq|llm)|siapa\s+(?:otak|mesin|model)\s+ai|apa\s+model\s+(?:yang\s+)?(?:dipakai|digunakan|aktif)|versi\s+ai|provider\s+aktif|ai\s+provider/i.test(norm)
  ) {
    return {
      intent: 'AI_SYSTEM_QUERY',
      confidence: 0.98,
      normalizedMessage: norm,
      entities,
      requiresDatabase: true,
      targetDomain: 'system',
    };
  }

  // 3. Deteksi Topik di Luar Cakupan (Out of Scope)
  if (
    /(?:tuliskan|buatkan|generate)\s+(?:kode|code|skrip|script|program|fungsi|aplikasi|html|css|python|javascript|php)\b/i.test(norm) ||
    /kerjakan\s+pr|tugas\s+sekolah|hitunglah\s+rumus|persamaan\s+matematika|turunan\s+dari|integral\s+dari/i.test(norm) ||
    /siapa\s+presiden|ibukota\s+negara|sejarah\s+kemerdekaan|perang\s+dunia|rekomendasi\s+film|lirik\s+lagu|cerita\s+dongeng|ramalan\s+zodiak|berita\s+politik|pilpres|crypto|bitcoin|saham/i.test(norm)
  ) {
    return {
      intent: 'OUT_OF_SCOPE',
      confidence: 0.95,
      normalizedMessage: norm,
      entities,
      requiresDatabase: false,
      targetDomain: 'general',
    };
  }

  // 4. Deteksi Pertanyaan Terlalu Singkat / Ambigous
  const trimmed = norm.replace(/[^a-z0-9]/g, '').trim();
  const greetingOnly = /^(halo|hai|p|pagi|siang|sore|malam|permisi|tes|test|ping)$/i.test(trimmed);
  const vagueIssueOnly = /^(rusak|mati|error|tolong|bantu|servis|perbaikan)$/i.test(trimmed);

  if (greetingOnly || vagueIssueOnly) {
    entities.isAmbiguous = true;
    entities.clarificationPrompt = greetingOnly
      ? 'Halo! Saya asisten resmi BANTUIN. Ada yang bisa saya bantu terkait perbaikan peralatan elektronik atau pesanan Anda?'
      : 'Bisa ceritakan lebih spesifik jenis peralatan apa yang mengalami kerusakan (misal: AC, kulkas, mesin cuci) dan apa kendalanya?';

    return {
      intent: 'AMBIGUOUS_QUERY',
      confidence: 0.85,
      normalizedMessage: norm,
      entities,
      requiresDatabase: false,
      targetDomain: 'general',
    };
  }

  // 5. Deteksi Pertanyaan Pengguna / Profil Pribadi
  if (
    /siapa\s+nama\s+saya|profil\s+saya|data\s+diri|email\s+yang\s+terdaftar|kapan\s+saya\s+mendaftar|nomor\s+telepon\s+saya/i.test(norm) ||
    (/profil/i.test(norm) && /saya|akun/i.test(norm))
  ) {
    return {
      intent: 'USER_PROFILE_QUERY',
      confidence: 0.95,
      normalizedMessage: norm,
      entities,
      requiresDatabase: true,
      targetDomain: 'profile',
    };
  }

  // 6. Deteksi Tagihan & Keuangan (Invoices & Billing)
  if (
    /tagihan|invoice|belum\s+dibayar|biaya\s+perbaikan|ongkos|biaya|tarif|pembayaran|cara\s+bayar|metode\s+pembayaran|qris|virtual\s+account|cod/i.test(norm) ||
    Boolean(entities.invoiceNumber)
  ) {
    return {
      intent: 'INVOICE_BILLING_QUERY',
      confidence: 0.92,
      normalizedMessage: norm,
      entities,
      requiresDatabase: true,
      targetDomain: 'finance',
    };
  }

  // 7. Deteksi Status & Linimasa Pesanan
  if (
    /status\s+(?:pesanan|order|perbaikan)|perkembangan\s+perbaikan|pesanan\s+saya|lacak\s+pesanan|kapan\s+selesai|kapan\s+teknisi\s+datang|jadwal\s+kunjungan/i.test(norm) ||
    Boolean(entities.orderCode)
  ) {
    return {
      intent: entities.orderCode ? 'ORDER_DETAIL_QUERY' : 'ORDER_STATUS_QUERY',
      confidence: 0.94,
      normalizedMessage: norm,
      entities,
      requiresDatabase: true,
      targetDomain: 'order',
    };
  }

  // 8. Deteksi Pertanyaan Teknisi
  if (
    /teknisi\s+yang\s+menangani|siapa\s+teknisi|kontak\s+teknisi|rating\s+teknisi|tugas\s+teknisi|beban\s+kerja\s+teknisi/i.test(norm)
  ) {
    return {
      intent: 'TECHNICIAN_QUERY',
      confidence: 0.90,
      normalizedMessage: norm,
      entities,
      requiresDatabase: true,
      targetDomain: 'technician',
    };
  }

  // 9. Deteksi Monitoring Operasional Administrator
  if (
    /total\s+pesanan|ringkasan\s+operasional|dashboard|statistik|perbaikan\s+tertunda|keterlambatan|omzet|pendapatan|audit\s+log|kesehatan\s+sistem|pengaturan\s+sistem/i.test(norm)
  ) {
    return {
      intent: 'ADMIN_OPERATIONAL_QUERY',
      confidence: 0.93,
      normalizedMessage: norm,
      entities,
      requiresDatabase: true,
      targetDomain: 'admin',
    };
  }

  // 10. Deteksi Panduan Aplikasi BANTUIN
  if (
    /cara\s+(?:daftar|pesan|bayar|login|batalkan|komplain)|apa\s+itu\s+bantuin|garansi\s+30\s+hari|aturan\s+garansi|katalog\s+layanan/i.test(norm)
  ) {
    return {
      intent: 'SYSTEM_APP_GUIDE',
      confidence: 0.91,
      normalizedMessage: norm,
      entities,
      requiresDatabase: true,
      targetDomain: 'system',
    };
  }

  // 11. Deteksi Konsultasi Gejala Kerusakan (Diagnosis Query)
  if (
    entities.applianceCategorySlug ||
    entities.symptoms.length > 0 ||
    /rusak|bocor|tidak\s+dingin|mati|berasap|berisik|kenapa|mengapa|penyebab|cara\s+mengatasi/i.test(norm)
  ) {
    return {
      intent: 'DIAGNOSIS_QUERY',
      confidence: 0.88,
      normalizedMessage: norm,
      entities,
      requiresDatabase: false,
      targetDomain: 'appliance',
    };
  }

  // Default Fallback
  return {
    intent: 'SYSTEM_APP_GUIDE',
    confidence: 0.70,
    normalizedMessage: norm,
    entities,
    requiresDatabase: true,
    targetDomain: 'system',
  };
}
