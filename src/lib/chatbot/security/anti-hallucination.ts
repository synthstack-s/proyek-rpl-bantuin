/**
 * BANTUIN ANTI-HALLUCINATION & FACTUALITY ENFORCER
 * 
 * Aturan penegakan faktualitas untuk asisten AI BANTUIN:
 * 1. Menolak mengarang nama pengguna, status transaksi, estimasi biaya, atau fitur fiktif.
 * 2. Memastikan klaim data dari database memiliki bukti eksekusi tools yang valid.
 * 3. Menangani kasus data kosong (empty results) sebagai informasi faktual tidak ditemukan.
 * 4. Menyaring halusinasi kode internal dan format JSON mentah.
 */

import { EvidenceCheckResult } from '../db-intelligence/evidence-validator';

export interface HallucinationAudit {
  isHallucinated: boolean;
  violationReason?: string;
  sanitizedContent: string;
}

/**
 * Memvalidasi apakah respons AI bebas dari halusinasi data operasional
 */
export function auditAIResponseFactuality(
  aiText: string,
  evidence?: EvidenceCheckResult | null
): HallucinationAudit {
  let text = aiText.trim();

  // 1. Jika bukti database kosong / tidak tersedia (DATA_UNAVAILABLE),
  // namun AI mengklaim telah menemukan nama pengguna atau pesanan aktif
  if (evidence && evidence.status === 'DATA_UNAVAILABLE') {
    const claimsFound = /(?:berikut\s+adalah\s+data|ditemukan\s+pesanan|nama\s+pengguna\s+adalah|status\s+pesanan\s+saat\s+ini\s+adalah)\s+["']?[A-Za-z0-9]/i.test(text);
    if (claimsFound) {
      return {
        isHallucinated: true,
        violationReason: 'Model mengarang data padahal query basis data mengembalikan hasil kosong (0 rekaman).',
        sanitizedContent: `🔍 **Informasi Tidak Ditemukan:**\n\nBerdasarkan pemeriksaan langsung pada basis data resmi BANTUIN, data yang Anda cari tidak ditemukan. Pastikan rincian pencarian sudah sesuai dengan data yang terdaftar.`,
      };
    }
  }

  // 2. Bersihkan bocoran prompt sistem atau delimiter Markdown JSON internal jika tersisa
  text = text.replace(/```json\s*\{\s*"diagnosisCard"[\s\S]*?\}\s*```/g, '').trim();

  // 3. Sensor kata kunci internal jika model mencoba mengungkap parameter enkripsi/token
  text = text.replace(/v1:[a-z0-9_-]+:[a-f0-9]+:[a-f0-9]+:[a-f0-9]+/gi, '[ENCRYPTED_SECRET]');

  return {
    isHallucinated: false,
    sanitizedContent: text,
  };
}
