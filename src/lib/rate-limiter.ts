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

export function checkChatRateLimit(identifier: string, maxRequestsPerMinute = 30): {
  allowed: boolean;
  retryAfterSeconds?: number;
} {
  const now = Date.now();
  const record = chatRateLimitMap.get(identifier);

  if (!record || now > record.resetAt) {
    chatRateLimitMap.set(identifier, { count: 1, resetAt: now + 60 * 1000 });
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

