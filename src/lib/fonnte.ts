/**
 * BANTUIN - Layanan Integrasi Gateway WhatsApp Fonnte
 * Dokumentasi API Resmi: https://docs.fonnte.com/api-send-message/
 */

export interface FonnteSendResult {
  success: boolean;
  messageId?: string;
  process?: string;
  detail?: string;
  error?: string;
  rawResponse?: any;
}

/**
 * Normalisasi nomor telepon ke format internasional standar Fonnte (misal: 6281234567890).
 * Menangani format: 08xxx, +628xxx, 628xxx, 8xxx.
 */
export function normalizePhoneNumber(rawPhone: string): string {
  if (!rawPhone) return '';

  // Buang karakter non-digit kecuali tanda plus di awal
  let cleaned = rawPhone.trim().replace(/[^\d+]/g, '');

  if (cleaned.startsWith('+')) {
    cleaned = cleaned.slice(1);
  }

  // Jika diawali 08, ganti menjadi 628
  if (cleaned.startsWith('08')) {
    cleaned = '628' + cleaned.slice(2);
  } else if (cleaned.startsWith('8')) {
    cleaned = '628' + cleaned.slice(1);
  }

  return cleaned;
}

/**
 * Validasi apakah nomor telepon memiliki format yang valid untuk WhatsApp di Indonesia
 */
export function isValidIndonesianPhone(phone: string): boolean {
  const normalized = normalizePhoneNumber(phone);
  // Nomor HP seluler Indonesia: diawali 628, panjang antara 10 sampai 15 digit
  return /^628\d{8,12}$/.test(normalized);
}

/**
 * Masking nomor WhatsApp untuk tampilan publik aman (misal: 62812****7890)
 */
export function maskPhoneNumber(phone: string): string {
  const norm = normalizePhoneNumber(phone);
  if (norm.length <= 6) return norm;
  const start = norm.slice(0, 5);
  const end = norm.slice(-3);
  return `${start}****${end}`;
}

/**
 * Mengirim pesan WhatsApp melalui Fonnte API
 */
export async function sendWhatsAppMessage(
  targetPhone: string,
  message: string
): Promise<FonnteSendResult> {
  const token = process.env.FONNTE_API_TOKEN;
  const apiUrl = process.env.FONNTE_API_URL || 'https://api.fonnte.com/send';

  const normalizedPhone = normalizePhoneNumber(targetPhone);
  if (!normalizedPhone) {
    return {
      success: false,
      error: 'Nomor telepon tujuan tidak valid atau kosong',
    };
  }

  // Mode Mock khusus pengujian otomatis tanpa mengonsumsi kuota
  if (process.env.MOCK_FONNTE === 'true') {
    return {
      success: true,
      messageId: 'MOCK_MSG_' + Date.now(),
      process: 'mock_delivered',
      detail: 'Mock Fonnte delivery success',
    };
  }

  if (!token) {
    return {
      success: false,
      error: 'FONNTE_API_TOKEN belum dikonfigurasi pada environment server',
    };
  }

  try {
    const formData = new URLSearchParams();
    formData.append('target', normalizedPhone);
    formData.append('message', message);
    formData.append('countryCode', '62');

    // Timeout 10 detik dengan AbortSignal
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        // Catatan: Fonnte API menggunakan header Authorization: TOKEN (tanpa prefiks Bearer)
        Authorization: token,
      },
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const rawJson = await response.json().catch(() => null);

    if (!response.ok) {
      const errReason = rawJson?.reason || rawJson?.detail || `HTTP ${response.status} ${response.statusText}`;
      return {
        success: false,
        error: `Gagal mengirim WhatsApp: ${errReason}`,
        rawResponse: rawJson,
      };
    }

    if (rawJson && rawJson.status === true) {
      const msgId = Array.isArray(rawJson.id) ? String(rawJson.id[0]) : String(rawJson.id || '');
      return {
        success: true,
        messageId: msgId,
        process: rawJson.process || 'pending',
        detail: rawJson.detail || 'success! message in queue',
        rawResponse: rawJson,
      };
    } else {
      const reason = rawJson?.reason || rawJson?.detail || 'Fonnte menolak pengiriman pesan';
      return {
        success: false,
        error: reason,
        rawResponse: rawJson,
      };
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return {
        success: false,
        error: 'Permintaan ke gateway Fonnte mengalami timeout (10 detik)',
      };
    }
    return {
      success: false,
      error: err.message || 'Terjadi kesalahan jaringan saat menghubungi gateway WhatsApp',
    };
  }
}

/**
 * Template resmi pengiriman OTP WhatsApp BANTUIN
 */
export async function sendOtpWhatsApp(
  targetPhone: string,
  otpCode: string,
  expiryMinutes = 5
): Promise<FonnteSendResult> {
  const message = [
    '*BANTUIN - Kode Verifikasi*',
    '',
    `Kode OTP kamu: *${otpCode}*`,
    '',
    `Kode berlaku selama ${expiryMinutes} menit. Jangan bagikan kode ini kepada siapa pun.`,
    '',
    'Jika kamu tidak meminta kode ini, abaikan pesan tersebut.',
  ].join('\n');

  return sendWhatsAppMessage(targetPhone, message);
}

