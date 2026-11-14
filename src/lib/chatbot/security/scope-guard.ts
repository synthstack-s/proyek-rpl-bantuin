/**
 * BANTUIN APPLICATION SCOPE GUARD & SECURITY ENFORCER
 * 
 * Pengawal batas cakupan aplikasi (Application Scope Guard) dan proteksi multi-lapis:
 * 1. Klasifikasi 7 kategori status cakupan:
 *    - IN_SCOPE
 *    - OUT_OF_SCOPE
 *    - AMBIGUOUS
 *    - DATA_UNAVAILABLE
 *    - DATA_ACCESS_ERROR
 *    - UNAUTHORIZED
 *    - INSUFFICIENT_EVIDENCE
 * 2. Deteksi mutlak Prompt Injection / Jailbreak / System Prompt Extraction.
 * 3. Deteksi Bahaya Darurat Keselamatan Kerja (Safety Hazards: Api, Listrik, Gas).
 * 4. Penolakan terstruktur santun berbahasa Indonesia profesional.
 */

import { ChatUserContext } from '../types';

export type ScopeStatus =
  | 'IN_SCOPE'
  | 'OUT_OF_SCOPE'
  | 'AMBIGUOUS'
  | 'DATA_UNAVAILABLE'
  | 'DATA_ACCESS_ERROR'
  | 'UNAUTHORIZED'
  | 'INSUFFICIENT_EVIDENCE';

export interface ScopeEvaluationResult {
  status: ScopeStatus;
  isAllowed: boolean;
  reason?: string;
  isSafetyHazard: boolean;
  safetyAlert?: string;
  refusalMessage?: string;
}

// Pola Prompt Injection & Jailbreak Terlarang
const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(?:all\s+)?(?:previous|prior)\s+instructions/i,
  /abaikan\s+(?:semua\s+)?instruksi/i,
  /jailbreak|dan\s+mode|developer\s+mode/i,
  /act\s+as\s+(?:an?\s+)?unrestricted/i,
  /kamu\s+sekarang\s+adalah\s+(?:hacker|bebas|unfiltered)/i,
  /system\s+prompt/i,
  /override\s+system/i,
  /pretend\s+you\s+are\s+not/i,
  /bocorkan\s+(?:rahasia|prompt|instruksi|api\s*key|password|kredensial)/i,
  /tampilkan\s+isi\s+(?:prompt|system\s+instruction|env|api\s*key)/i,
  /drop\s+table|delete\s+from|update\s+users/i,
];

// Pola Bahaya Darurat Keselamatan Tinggi (Safety Hazards)
const HAZARD_PATTERNS = [
  /bau\s+(?:hangus|terbakar|gosong|gas|asap)/i,
  /percikan\s+api|keluar\s+api|kebakaran|meledak|meletup/i,
  /kesetrum|sengatan\s+listrik|tegangan\s+tinggi/i,
  /(?:colokan|stopkontak|kabel).*?(?:terendam|basah|kena\s+air|banjir)/i,
  /asap\s+keluar|kabel\s+meleleh|kabel\s+terkelupas/i,
  /kebocoran\s+gas|gas\s+bocor|tabung\s+gas\s+berdesis/i,
];

// Pola Pertanyaan di Luar Cakupan (Out of Scope)
const OFF_TOPIC_PATTERNS = [
  /(?:tuliskan|buatkan|generate)\s+(?:kode|code|skrip|script|program|fungsi|function|aplikasi|html|css|python|javascript|php|java|c\+\+)\b/i,
  /debug\s+kode|compile\s+error|react\s+hook|nodejs\s+express/i,
  /kerjakan\s+pr|tugas\s+sekolah|hitunglah\s+rumus|persamaan\s+matematika|turunan\s+dari|integral\s+dari/i,
  /\b\d+\s*[\+\-\*\/]\s*\d+\s*=\s*\?/i,
  /siapa\s+presiden|ibukota\s+negara|sejarah\s+kemerdekaan|perang\s+dunia|luas\s+wilayah|teori\s+relativitas|fotosintesis/i,
  /rekomendasi\s+film|lirik\s+lagu|cerita\s+dongeng|ramalan\s+zodiak|berita\s+politik|pilpres|pemilu|crypto|bitcoin|saham/i,
  /resep\s+masakan|resep\s+kue|cara\s+memasak\s+(?:ayam|nasi|kue|rendang)/i,
];

/**
 * Evaluasi cakupan pertanyaan dan penegakan batas aplikasi BANTUIN
 */
export function evaluateApplicationScope(
  userMessage: string,
  userContext: ChatUserContext
): ScopeEvaluationResult {
  const norm = userMessage.trim().toLowerCase();

  // 1. Cek Prompt Injection (Mutlak ditolak untuk semua peran)
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(norm)) {
      return {
        status: 'UNAUTHORIZED',
        isAllowed: false,
        reason: 'Percobaan manipulasi instruksi sistem atau injeksi prompt terdeteksi.',
        isSafetyHazard: false,
        refusalMessage: '🛡️ **Permintaan Ditolak:** Manipulasi instruksi sistem atau ekstraksi prompt tidak diizinkan demi keamanan platform BANTUIN.',
      };
    }
  }

  // 2. Cek Bahaya Keselamatan Darurat (Safety Hazard)
  for (const pattern of HAZARD_PATTERNS) {
    if (pattern.test(norm)) {
      return {
        status: 'IN_SCOPE',
        isAllowed: true, // Tetap diizinkan agar AI dapat memberikan peringatan darurat
        isSafetyHazard: true,
        safetyAlert: `⚠️ **PERINGATAN KESELAMATAN DARURAT TINGGI (BAHAYA LISTRIK/API/GAS):**
1. Segera matikan sumber listrik utama (MCB kWh meter) atau tutup regulator gas secara aman.
2. JANGAN mencoba menyentuh atau membongkar unit yang mengeluarkan asap, percikan api, bau hangus, atau bau gas menyengat.
3. Jauhkan bahan mudah terbakar dan pastikan anak-anak berada di jarak aman.
4. BANTUIN mewajibkan penanganan langsung oleh teknisi profesional tersertifikasi untuk mencegah risiko fatal.`,
      };
    }
  }

  // 3. Cek Topik di Luar Cakupan (Out of Scope)
  for (const pattern of OFF_TOPIC_PATTERNS) {
    if (pattern.test(norm)) {
      return {
        status: 'OUT_OF_SCOPE',
        isAllowed: false,
        reason: 'Pertanyaan di luar cakupan aplikasi dan layanan perbaikan BANTUIN.',
        isSafetyHazard: false,
        refusalMessage: '🤖 **Di Luar Lingkup Aplikasi BANTUIN:**\n\nSaya adalah asisten cerdas khusus platform **BANTUIN (Layanan Servis Elektronik Rumah Tangga)**. Saya tidak dirancang untuk menjawab pertanyaan pengetahuan umum, tugas sekolah, penulisan kode pemrograman, resep masakan, atau topik di luar ekosistem aplikasi BANTUIN.\n\nSilakan ajukan pertanyaan seputar perbaikan elektronik rumah tangga (AC, kulkas, mesin cuci, pompa air, TV, dispenser/microwave) atau status pesanan dan layanan BANTUIN.',
      };
    }
  }

  // 4. Cek Pertanyaan Terlalu Singkat / Ambigu
  const cleaned = norm.replace(/[^a-z0-9]/g, '').trim();
  const isGreeting = /^(halo|hai|p|pagi|siang|sore|malam|permisi|tes|test|ping)$/i.test(cleaned);
  const isVagueIssue = /^(rusak|mati|error|tolong|bantu|servis|perbaikan)$/i.test(cleaned);
  if (isGreeting || isVagueIssue) {
    return {
      status: 'AMBIGUOUS',
      isAllowed: true,
      isSafetyHazard: false,
      refusalMessage: isGreeting
        ? 'Halo! Saya Asisten AI resmi BANTUIN. Ada yang bisa saya bantu seputar konsultasi perbaikan alat elektronik rumah tangga, informasi layanan, atau pemantauan pesanan Anda?'
        : 'Halo! Mohon berikan informasi lebih spesifik mengenai jenis peralatan elektronik apa yang mengalami kerusakan (misal: AC, kulkas, mesin cuci) dan apa kendala yang dialami?',
    };
  }

  return {
    status: 'IN_SCOPE',
    isAllowed: true,
    isSafetyHazard: false,
  };
}
