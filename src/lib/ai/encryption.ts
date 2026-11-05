/**
 * ENCRYPTION MODULE - BANTUIN AI PROVIDER CREDENTIAL SECURITY
 * 
 * Menerapkan spesifikasi standar enterprise:
 * 1. Algoritma Authenticated Encryption: AES-256-GCM (Galois/Counter Mode).
 * 2. Versioned Envelope: v1:<kid>:<iv_hex>:<auth_tag_hex>:<cipher_hex>.
 * 3. Key Identification & Multiple Key Ring untuk seamless key rotation.
 * 4. Graceful error handling dengan custom typed error tanpa mengekspos plaintext.
 * 5. Masked preview generator aman untuk UI (tidak pernah mengirim ciphertext/plaintext ke browser).
 */

import crypto from 'crypto';

// Versi envelope enkripsi saat ini
export const ENCRYPTION_VERSION = 'v1';

// Key Identifier aktif saat ini
export const DEFAULT_KEY_ID = 'primary-2026';

// Custom Error Classes untuk penanganan kegagalan terstruktur
export class AIKeyDecryptionError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'AIKeyDecryptionError';
  }
}

export class UnknownKeyIdError extends AIKeyDecryptionError {
  constructor(keyId: string) {
    super(`Key identifier '${keyId}' tidak terdaftar pada Key Ring aktif.`, 'ERR_UNKNOWN_KID');
    this.name = 'UnknownKeyIdError';
  }
}

export class InvalidAuthTagError extends AIKeyDecryptionError {
  constructor() {
    super('Integritas data terkompromi atau kunci enkripsi salah (Auth Tag mismatch).', 'ERR_AUTH_TAG_FAILED');
    this.name = 'InvalidAuthTagError';
  }
}

export class InvalidPayloadFormatError extends AIKeyDecryptionError {
  constructor() {
    super('Format envelope payload enkripsi tidak valid.', 'ERR_INVALID_PAYLOAD_FORMAT');
    this.name = 'InvalidPayloadFormatError';
  }
}

/**
 * Key Ring Store: Menghubungkan Key Identifier dengan 32-byte derived key.
 * Kunci diturunkan secara deterministik menggunakan scrypt KDF (32 byte).
 */
const keyRingCache = new Map<string, Buffer>();

function getMasterSecretForKeyId(keyId: string): string {
  // Dukungan multiple key via env jika dikonfigurasi: AI_KEY_<KID>
  const envKey = process.env[`AI_KEY_${keyId.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`];
  if (envKey) return envKey;

  // Fallback standar menggunakan master secret aplikasi
  const baseSecret = process.env.AI_MASTER_KEY || process.env.JWT_ACCESS_SECRET || 'bantuin_production_ai_key_secret_2026_default_salt';
  return `${baseSecret}::${keyId}`;
}

/**
 * Menghasilkan 32-byte key menggunakan Scrypt KDF
 */
export function deriveKeyForId(keyId: string): Buffer {
  if (keyRingCache.has(keyId)) {
    return keyRingCache.get(keyId)!;
  }

  const secret = getMasterSecretForKeyId(keyId);
  const salt = `bantuin_ai_credentials_salt_${keyId}`;
  const derived = crypto.scryptSync(secret, salt, 32);
  keyRingCache.set(keyId, derived);
  return derived;
}

/**
 * Menghasilkan pratinjau sensor aman (Masked Preview) untuk UI.
 * Contoh: "AIza...****...8d2m" atau "gsk_...****...a1b2"
 */
export function maskApiKey(apiKey: string): string {
  if (!apiKey || typeof apiKey !== 'string') return '';
  const clean = apiKey.trim();
  if (clean.length <= 8) {
    return '****';
  }
  const prefix = clean.slice(0, 4);
  const suffix = clean.slice(-4);
  return `${prefix}...****...${suffix}`;
}

export interface EncryptedApiKeyResult {
  encryptedPayload: string;
  keyIdentifier: string;
  maskedPreview: string;
}

/**
 * Mengenkripsi API Key menggunakan AES-256-GCM terotentikasi.
 * Envelope: v1:<keyId>:<ivHex>:<tagHex>:<cipherHex>
 */
export function encryptApiKey(
  plainApiKey: string,
  keyId: string = process.env.AI_KEY_ID || DEFAULT_KEY_ID
): EncryptedApiKeyResult {
  if (!plainApiKey || typeof plainApiKey !== 'string' || !plainApiKey.trim()) {
    throw new Error('API key tidak boleh kosong.');
  }

  const cleanKey = plainApiKey.trim();
  const key = deriveKeyForId(keyId);
  const iv = crypto.randomBytes(12); // 12-byte IV standar untuk AES-GCM

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(cleanKey, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag(); // 16-byte authentication tag

  const ivHex = iv.toString('hex');
  const authTagHex = authTag.toString('hex');
  const cipherHex = ciphertext.toString('hex');

  const encryptedPayload = `${ENCRYPTION_VERSION}:${keyId}:${ivHex}:${authTagHex}:${cipherHex}`;

  return {
    encryptedPayload,
    keyIdentifier: keyId,
    maskedPreview: maskApiKey(cleanKey),
  };
}

/**
 * Mendekripsi API Key dari envelope terenkripsi dengan verifikasi integritas otentikasi.
 */
export function decryptApiKey(encryptedPayload: string): string {
  if (!encryptedPayload || typeof encryptedPayload !== 'string') {
    throw new InvalidPayloadFormatError();
  }

  const parts = encryptedPayload.split(':');
  if (parts.length !== 5) {
    throw new InvalidPayloadFormatError();
  }

  const [version, keyId, ivHex, authTagHex, cipherHex] = parts;

  if (version !== ENCRYPTION_VERSION) {
    throw new AIKeyDecryptionError(`Versi envelope enkripsi '${version}' tidak didukung.`, 'ERR_UNSUPPORTED_VERSION');
  }

  if (!keyId || !ivHex || !authTagHex || !cipherHex) {
    throw new InvalidPayloadFormatError();
  }

  let key: Buffer;
  try {
    key = deriveKeyForId(keyId);
  } catch {
    throw new UnknownKeyIdError(keyId);
  }

  try {
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const ciphertext = Buffer.from(cipherHex, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err: any) {
    if (err.message && err.message.includes('Unsupported state or unable to authenticate data')) {
      throw new InvalidAuthTagError();
    }
    throw new AIKeyDecryptionError(`Gagal mendekripsi kredensial API key: ${err.message}`, 'ERR_DECRYPTION_FAILED');
  }
}

/**
 * Utilitas Rotasi Kunci: Mendekripsi payload dengan key lama dan mengenkripsi ulang dengan target key baru.
 */
export function rotateApiKeyPayload(
  encryptedPayload: string,
  targetKeyId: string = process.env.AI_KEY_ID || DEFAULT_KEY_ID
): EncryptedApiKeyResult {
  const decrypted = decryptApiKey(encryptedPayload);
  return encryptApiKey(decrypted, targetKeyId);
}
