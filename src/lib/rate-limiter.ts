/**
 * In-memory sliding window rate limiter untuk melindungi endpoint autentikasi dari serangan brute-force.
 */

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

