/**
 * BANTUIN DATABASE INTELLIGENCE - EVIDENCE VALIDATOR
 * 
 * Verifikator kecukupan bukti sebelum jawaban AI dikirim ke pengguna:
 * 1. Menjamin setiap klaim faktual didukung oleh data riil hasil query backend tools.
 * 2. Mencegah halusinasi data ketika hasil query kosong (DATA_UNAVAILABLE).
 * 3. Menolak kesimpulan yang tidak didukung data aktual.
 * 4. Menyediakan audit trail internal referensi data pendukung.
 */

export type EvidenceStatus =
  | 'SUFFICIENT_EVIDENCE'
  | 'DATA_UNAVAILABLE'
  | 'DATA_ACCESS_ERROR'
  | 'UNAUTHORIZED'
  | 'INSUFFICIENT_EVIDENCE';

export interface EvidenceCheckResult {
  status: EvidenceStatus;
  isValid: boolean;
  explanation: string;
  sanitizedData: any;
  recordCount: number;
  sourceTool: string;
}

/**
 * Memvalidasi hasil eksekusi database tool
 */
export function validateDatabaseEvidence(
  toolName: string,
  toolOutput: { success: boolean; data?: any; error?: string }
): EvidenceCheckResult {
  // 1. Jika tool mengembalikan error eksplisit (misal masalah izin akses / DB error)
  if (!toolOutput.success) {
    const errorMsg = toolOutput.error || 'Terjadi kendala saat mengambil data aktual.';
    const isAuth = errorMsg.toLowerCase().includes('akses ditolak') || errorMsg.toLowerCase().includes('izin');

    return {
      status: isAuth ? 'UNAUTHORIZED' : 'DATA_ACCESS_ERROR',
      isValid: false,
      explanation: errorMsg,
      sanitizedData: null,
      recordCount: 0,
      sourceTool: toolName,
    };
  }

  const rawData = toolOutput.data;

  // 2. Jika data kosong (null, undefined, array kosong)
  // F14: hasil kueri governed yang kosong berbentuk OBJEK
  // ({ rows: [], isEmpty: true, ... }) — bukan array dan bukan null —
  // sehingga sebelumnya lolos ke bawah dan dilabeli SUFFICIENT_EVIDENCE
  // (1 "rekaman"). isEmpty adalah penanda resmi himpunan kosong (B12 di
  // data-service: 0 baris, atau agregat bernilai null). COUNT = 0 bukan
  // isEmpty (nilainya 0, bukan null) sehingga tetap SUFFICIENT.
  if (
    rawData === null ||
    rawData === undefined ||
    (Array.isArray(rawData) && rawData.length === 0) ||
    (typeof rawData === 'object' && rawData.isEmpty === true)
  ) {
    return {
      status: 'DATA_UNAVAILABLE',
      isValid: false,
      explanation: `Data aktual tidak ditemukan dalam basis data sistem BANTUIN untuk pemanggilan ${toolName}.`,
      sanitizedData: null,
      recordCount: 0,
      sourceTool: toolName,
    };
  }

  // 3. Hitung jumlah rekaman yang diperoleh
  const count = Array.isArray(rawData) ? rawData.length : 1;

  return {
    status: 'SUFFICIENT_EVIDENCE',
    isValid: true,
    explanation: `Berhasil memverifikasi ${count} rekaman faktual dari basis data melalui ${toolName}.`,
    sanitizedData: rawData,
    recordCount: count,
    sourceTool: toolName,
  };
}

/**
 * Format penjelasan standar jika data tidak tersedia (Anti-Halusinasi)
 */
export function getEvidenceFallbackMessage(result: EvidenceCheckResult, querySubject: string): string {
  switch (result.status) {
    case 'UNAUTHORIZED':
      return `🛡️ **Akses Dibatasi (Keamanan & Privasi Data):**\n\n${result.explanation}`;

    case 'DATA_UNAVAILABLE':
      return `🔍 **Informasi Tidak Ditemukan:**\n\nBerdasarkan pemeriksaan langsung pada basis data BANTUIN, data terkait **${querySubject}** saat ini **belum tercatat** di sistem.\n\nPastikan kata kunci, kode pesanan, atau nomor telepon yang dicari sudah sesuai dengan akun yang terdaftar.`;

    case 'DATA_ACCESS_ERROR':
      return `⚠️ **Kendala Sistem Akses Data:**\n\nInformasi belum dapat diambil saat ini karena kendala teknis pada layanan basis data. Tim teknis BANTUIN telah mencatat kejadian ini untuk segera ditangani.`;

    default:
      return `Informasi belum dapat dipastikan karena bukti data belum mencukupi.`;
  }
}
