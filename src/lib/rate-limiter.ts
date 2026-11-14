/**
 * In-memory sliding window rate limiter untuk melindungi endpoint autentikasi dari serangan brute-force.
 */

/**
 * S5/F3 — Mengurai IP klien dari header `x-forwarded-for` dengan benar.
 *
 * ASUMSI DEPLOYMENT: aplikasi berjalan di belakang SATU trusted reverse
 * proxy (mis. Nginx/Vercel/CDN) yang MENIMPA header ini dengan IP klien
 * yang dilihatnya. Bila proxy hanya MENAMBAH (append) tanpa menimpa, entri
 * pertama masih merupakan klaim klien dan bisa dipalsukan — dalam kondisi
 * itu IP hanya boleh dipakai sebagai sinyal sekunder (lihat pemakaian di
 * route chat: kunci utama adalah identitas user/sesi, IP hanya backstop),
 * JANGAN PERNAH sebagai satu-satunya kunci pembatas.
 *
 * Aturan parsing: ambil HANYA entri pertama daftar (asal asli di balik
 * proxy), validasi bentuk IPv4/IPv6 secara ketat, kembalikan `null` bila
 * tidak ada/tidak valid — pemanggil memakai bucket bersama ('unknown')
 * untuk nilai null, yang justru LEBIH ketat (satu kuota untuk semua
 * request tanpa IP valid) daripada memberi tiap nilai sampah kuota baru.
 * Sebelumnya route memakai SELURUH nilai header mentah sebagai kunci,
 * sehingga setiap nilai berbeda (termasuk daftar koma yang dimodifikasi)
 * mendapat kuota baru.
 */
export function parseClientIpFromForwardedHeader(headerValue: string | null | undefined): string | null {
  if (!headerValue) return null;
  let first = headerValue.split(',')[0]?.trim();
  if (!first || first.length > 45) return null;
  // Bentuk bracketed IPv6 ("[::1]") — buang kurungnya.
  if (first.startsWith('[') && first.endsWith(']')) {
    first = first.slice(1, -1);
  }
  if (isValidIPv4(first) || isValidIPv6(first)) return first;
  return null;
}

function isValidIPv4(s: string): boolean {
  const parts = s.split('.');
  if (parts.length !== 4) return false;
  for (const p of parts) {
    // Oktet desimal tanpa leading zero ("01" ditolak) dan bernilai 0-255.
    if (!/^(0|[1-9][0-9]{0,2})$/.test(p)) return false;
    if (Number(p) > 255) return false;
  }
  return true;
}

function isValidIPv6(s: string): boolean {
  let addr = s;
  // Ekor IPv4 tersemat ("::ffff:192.168.1.1") — validasi bagian IPv4-nya,
  // lalu ganti dengan dua grup heksa placeholder untuk cek struktural.
  if (addr.includes('.')) {
    const lastColon = addr.lastIndexOf(':');
    if (lastColon === -1) return false;
    if (!isValidIPv4(addr.slice(lastColon + 1))) return false;
    addr = `${addr.slice(0, lastColon)}:0:0`;
  }
  if (!addr.includes(':') || addr.includes(':::')) return false;
  const halves = addr.split('::');
  if (halves.length > 2) return false;
  const checkGroups = (g: string): boolean => {
    if (g === '') return true;
    const groups = g.split(':');
    return groups.every((h) => /^[0-9a-fA-F]{1,4}$/.test(h));
  };
  if (halves.length === 2) {
    // '::' wajib mewakili minimal satu grup nol.
    const headCount = halves[0] === '' ? 0 : halves[0].split(':').length;
    const tailCount = halves[1] === '' ? 0 : halves[1].split(':').length;
    if (headCount + tailCount > 7) return false;
    return checkGroups(halves[0]) && checkGroups(halves[1]);
  }
  // Tanpa kompresi: tepat 8 grup.
  const groups = addr.split(':');
  return groups.length === 8 && checkGroups(addr);
}

interface RateLimitRecord {
  attempts: number;
  blockedUntil: number | null;
  lastAttemptAt: number;
}

const loginAttemptsMap = new Map<string, RateLimitRecord>();

// Bersihkan record lama setiap 10 menit agar memori tidak bocor
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of loginAttemptsMap.entries()) {
      if (record.blockedUntil && record.blockedUntil < now && now - record.lastAttemptAt > 30 * 60 * 1000) {
        loginAttemptsMap.delete(key);
      } else if (!record.blockedUntil && now - record.lastAttemptAt > 15 * 60 * 1000) {
        loginAttemptsMap.delete(key);
      }
    }
  }, 10 * 60 * 1000);
}

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 menit
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000; // 15 menit

export function checkLoginRateLimit(identifier: string): {
  allowed: boolean;
  remainingAttempts: number;
  retryAfterSeconds?: number;
} {
  const now = Date.now();
  const record = loginAttemptsMap.get(identifier);

  if (!record) {
    return { allowed: true, remainingAttempts: MAX_FAILED_ATTEMPTS };
  }

  // Jika sedang diblokir
  if (record.blockedUntil && record.blockedUntil > now) {
    const retryAfterSeconds = Math.ceil((record.blockedUntil - now) / 1000);
    return {
      allowed: false,
      remainingAttempts: 0,
      retryAfterSeconds,
    };
  }

  // Jika periode pemblokiran sudah lewat, reset counter
  if (record.blockedUntil && record.blockedUntil <= now) {
    loginAttemptsMap.delete(identifier);
    return { allowed: true, remainingAttempts: MAX_FAILED_ATTEMPTS };
  }

  // Jika jendela percobaan sudah kedaluwarsa
  if (now - record.lastAttemptAt > ATTEMPT_WINDOW_MS) {
    loginAttemptsMap.delete(identifier);
    return { allowed: true, remainingAttempts: MAX_FAILED_ATTEMPTS };
  }

  return {
    allowed: record.attempts < MAX_FAILED_ATTEMPTS,
    remainingAttempts: Math.max(0, MAX_FAILED_ATTEMPTS - record.attempts),
  };
}

export function recordFailedLoginAttempt(identifier: string): {
  isBlocked: boolean;
  remainingAttempts: number;
  retryAfterSeconds?: number;
} {
  const now = Date.now();
  const record = loginAttemptsMap.get(identifier) || {
    attempts: 0,
    blockedUntil: null,
    lastAttemptAt: now,
  };

  record.attempts += 1;
  record.lastAttemptAt = now;

  if (record.attempts >= MAX_FAILED_ATTEMPTS) {
    record.blockedUntil = now + LOCKOUT_DURATION_MS;
    loginAttemptsMap.set(identifier, record);
    return {
      isBlocked: true,
      remainingAttempts: 0,
      retryAfterSeconds: Math.ceil(LOCKOUT_DURATION_MS / 1000),
    };
  }

  loginAttemptsMap.set(identifier, record);
  return {
    isBlocked: false,
    remainingAttempts: MAX_FAILED_ATTEMPTS - record.attempts,
  };
}

export function clearLoginRateLimit(identifier: string): void {
  loginAttemptsMap.delete(identifier);
}

// In-memory sliding window rate limiter untuk API Chatbot+
const chatRateLimitMap = new Map<string, { count: number; resetAt: number }>();

// L8: map terpisah untuk endpoint admin AI (tes koneksi & daftar model) —
// pemakaian normal admin tidak boleh berbagi kuota dengan rate limit chat.
const adminAiRateLimitMap = new Map<string, { count: number; resetAt: number }>();

// Map terpisah untuk pengiriman WhatsApp manual admin — mengikuti pola L8:
// kuota WA tidak boleh berbagi dengan chat maupun endpoint admin AI.
const adminWaRateLimitMap = new Map<string, { count: number; resetAt: number }>();

// Helper jendela geser per-menit yang dipakai checkChatRateLimit dan
// checkAdminAiRateLimit (logika yang sama, map terpisah). Panggilan yang
// lolos ikut dihitung; panggilan yang dibatasi TIDAK menambah hitungan.
function checkWindowedRateLimit(
  map: Map<string, { count: number; resetAt: number }>,
  identifier: string,
  maxRequestsPerMinute: number
): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const record = map.get(identifier);

  if (!record || now > record.resetAt) {
    map.set(identifier, { count: 1, resetAt: now + 60 * 1000 });
    return { allowed: true };
  }

  if (record.count >= maxRequestsPerMinute) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((record.resetAt - now) / 1000),
    };
  }

  record.count += 1;
  return { allowed: true };
}

export function checkChatRateLimit(identifier: string, maxRequestsPerMinute = 30): {
  allowed: boolean;
  retryAfterSeconds?: number;
} {
  return checkWindowedRateLimit(chatRateLimitMap, identifier, maxRequestsPerMinute);
}

/**
 * L8: rate limit per-admin untuk endpoint admin AI yang mahal (tes koneksi
 * melakukan lookup DNS + 2 request HTTPS ke provider dan menulis log ke DB;
 * pengambilan model juga memanggil API provider). Default 10/menit per
 * (admin, provider, aksi) — pemakaian normal admin jauh di bawah ini,
 * sementara sesi admin yang dicuri / skrip berulang tidak bisa membakar
 * kuota provider atau membanjiri ai_connection_test_logs.
 */
export function checkAdminAiRateLimit(identifier: string, maxRequestsPerMinute = 10): {
  allowed: boolean;
  retryAfterSeconds?: number;
} {
  return checkWindowedRateLimit(adminAiRateLimitMap, identifier, maxRequestsPerMinute);
}

/**
 * Rate limit per-admin untuk pengiriman WhatsApp manual (route
 * /api/admin/whatsapp/send). Default 10/menit per admin — pemakaian normal
 * jauh di bawah ini, sementara sesi admin yang dicuri / skrip berulang
 * tidak bisa membanjiri penerima atau menghabiskan kuota Fonnte.
 * Notifikasi OTOMATIS (perubahan status pesanan) tidak memakai limit ini:
 * ia sudah dibatasi satu pesan per transisi + dedupe di wa-notifications.
 */
export function checkAdminWaRateLimit(identifier: string, maxRequestsPerMinute = 10): {
  allowed: boolean;
  retryAfterSeconds?: number;
} {
  return checkWindowedRateLimit(adminWaRateLimitMap, identifier, maxRequestsPerMinute);
}

