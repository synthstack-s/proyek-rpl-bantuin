/**
 * TEST SUITE TAHAP 2: DATABASE MIGRATION & ENCRYPTION MODULE
 */

import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import {
  encryptApiKey,
  decryptApiKey,
  maskApiKey,
  rotateApiKeyPayload,
  InvalidAuthTagError,
  InvalidPayloadFormatError,
} from '../src/lib/ai/encryption';

import {
  isPrivateIPv4,
  isPrivateIPv6,
  validateAndPinEndpoint,
  createPinnedHttpsAgent,
  SSRFValidationError,
} from '../src/lib/ai/ssrf-validator';

import { runAIMigration } from './run-ai-migration';

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    console.log(`  ✔ [PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`  ❌ [FAIL] ${testName}`);
    if (detail) console.error(`     Detail: ${detail}`);
    throw new Error(`Assertion failed: ${testName}`);
  }
}

async function runTahap2Tests() {
  console.log('================================================================');
  console.log('🧪 BANTUIN AI PROVIDER MANAGEMENT - TEST SUITE TAHAP 2');
  console.log('   (Database Migration, AES-256-GCM Encryption & SSRF Defense)');
  console.log('================================================================\n');

  // --------------------------------------------------------------------------
  // TEST GRUP 1: ENKRIPSI AES-256-GCM DENGAN VERSIONING & KEY ROTATION
  // --------------------------------------------------------------------------
  console.log('--- TEST GRUP 1: Enkripsi Kredensial AES-256-GCM ---');

  const testKey = 'AIzaSyDemoGoogleGeminiRealAPIKeySecret12345';
  const encResult = encryptApiKey(testKey, 'primary-2026');

  assert(encResult.encryptedPayload.startsWith('v1:primary-2026:'), 'Payload enkripsi menggunakan format versioning v1:primary-2026');
  assert(encResult.maskedPreview === 'AIza...****...2345', 'Masked preview menghasilkan sensor aman "AIza...****...2345"');

  const parts = encResult.encryptedPayload.split(':');
  assert(parts.length === 5, 'Envelope terbagi atas 5 bagian (v1:kid:iv:tag:cipher)');
  assert(parts[2].length === 24, 'IV berukuran 12 byte (24 karakter hex)');
  assert(parts[3].length === 32, 'Auth Tag berukuran 16 byte (32 karakter hex)');

  // Dekripsi normal
  const decrypted = decryptApiKey(encResult.encryptedPayload);
  assert(decrypted === testKey, 'Dekripsi berhasil mengembalikan plaintext API key asli');

  // Uji Integritas & Anti-Tampering (Modifikasi 1 karakter ciphertext)
  const tamperedCipher = encResult.encryptedPayload.slice(0, -2) + 'aa';
  let caughtTamper = false;
  try {
    decryptApiKey(tamperedCipher);
  } catch (err: any) {
    caughtTamper = err instanceof InvalidAuthTagError || err.name === 'InvalidAuthTagError' || err.message.includes('Auth Tag');
  }
  assert(caughtTamper, 'Deteksi manipulasi data: Ciphertext yang diubah ditolak oleh Auth Tag verification');

  // Uji Rotasi Kunci
  const rotated = rotateApiKeyPayload(encResult.encryptedPayload, 'rotated-2027');
  assert(rotated.keyIdentifier === 'rotated-2027', 'Rotasi kunci berhasil menghasilkan keyIdentifier rotated-2027');
  const decryptedRotated = decryptApiKey(rotated.encryptedPayload);
  assert(decryptedRotated === testKey, 'Payload hasil rotasi kunci tetap dapat didekripsi sempurna');

  // Uji Format Invalid
  let caughtInvalidFormat = false;
  try {
    decryptApiKey('malformed_envelope_string');
  } catch (err: any) {
    caughtInvalidFormat = err instanceof InvalidPayloadFormatError;
  }
  assert(caughtInvalidFormat, 'Payload berformat salah ditolak dengan InvalidPayloadFormatError');

  console.log('');

  // --------------------------------------------------------------------------
  // TEST GRUP 2: PERTAHANAN SSRF & PEMBLOKIRAN PRIVATE IP
  // --------------------------------------------------------------------------
  console.log('--- TEST GRUP 2: Pertahanan SSRF & Filter Private IP ---');

  // IPv4 Private & Reserved Ranges
  assert(isPrivateIPv4('127.0.0.1'), 'Memblokir Loopback IPv4 127.0.0.1');
  assert(isPrivateIPv4('10.0.1.25'), 'Memblokir Private Network 10.0.0.0/8');
  assert(isPrivateIPv4('172.20.10.5'), 'Memblokir Private Network 172.16.0.0/12');
  assert(isPrivateIPv4('192.168.1.100'), 'Memblokir Private Network 192.168.0.0/16');
  assert(isPrivateIPv4('169.254.169.254'), 'Memblokir Cloud Metadata Service 169.254.169.254');
  assert(isPrivateIPv4('100.64.0.1'), 'Memblokir Carrier-Grade NAT 100.64.0.0/10');
  assert(!isPrivateIPv4('8.8.8.8'), 'Mengizinkan Public IP Publik 8.8.8.8');

  // IPv6 Private & Reserved Ranges
  assert(isPrivateIPv6('::1'), 'Memblokir Loopback IPv6 ::1');
  assert(isPrivateIPv6('fe80::1ff:fe23:4567:890a'), 'Memblokir Link-Local IPv6 fe80::');
  assert(isPrivateIPv6('fc00::1'), 'Memblokir Unique Local IPv6 fc00::');
  assert(isPrivateIPv6('::ffff:192.168.1.1'), 'Memblokir IPv4-mapped IPv6 privat');

  // Endpoint Protocol & Localhost Validation
  let caughtHttpReject = false;
  try {
    await validateAndPinEndpoint('http://api.groq.com/openai/v1');
  } catch (err: any) {
    caughtHttpReject = err instanceof SSRFValidationError && err.code === 'ERR_INSECURE_PROTOCOL';
  }
  assert(caughtHttpReject, 'Menolak endpoint berprotokol HTTP biasa (Wajib HTTPS)');

  let caughtLocalhostReject = false;
  try {
    await validateAndPinEndpoint('https://localhost:8080/v1');
  } catch (err: any) {
    caughtLocalhostReject = err instanceof SSRFValidationError && err.code === 'ERR_LOCAL_HOST';
  }
  assert(caughtLocalhostReject, 'Menolak endpoint ke localhost / internal host');

  // Validasi Endpoint Resmi Google Gemini & Groq
  const geminiEndpointValidation = await validateAndPinEndpoint(
    'https://generativelanguage.googleapis.com',
    'gemini'
  );
  assert(geminiEndpointValidation.isValid, 'Endpoint resmi Google Gemini tervalidasi publik');
  assert(geminiEndpointValidation.isOfficialHostname, 'Mengenali generativelanguage.googleapis.com sebagai official host');
  assert(geminiEndpointValidation.resolvedIps.length > 0, 'DNS resolution menghasilkan daftar IP publik valid');
  assert(Boolean(geminiEndpointValidation.pinnedIp), 'DNS pinning memilih IP publik terverifikasi');

  // Verifikasi DNS Socket Pinning Agent
  const agent = createPinnedHttpsAgent(geminiEndpointValidation.hostname, geminiEndpointValidation.pinnedIp);
  assert(agent instanceof Object && (agent as any).options?.servername === geminiEndpointValidation.hostname, 'Socket-Level Pinning Agent menyetel SNI servername sesuai hostname resmi');

  console.log('');

  // --------------------------------------------------------------------------
  // TEST GRUP 3: EKSEKUSI MIGRASI DATABASE 002
  // --------------------------------------------------------------------------
  console.log('--- TEST GRUP 3: Eksekusi Migrasi Database 002 ---');

  const migrationResult = await runAIMigration();
  assert(migrationResult.success, 'Eksekusi migrasi database 002 berhasil');

  console.log('\n================================================================');
  console.log(`🎉 SELURUH PENGUJIAN TAHAP 2 SUKSES: ${passedTests}/${totalTests} PASS!`);
  console.log('================================================================\n');

  process.exit(0);
}

runTahap2Tests().catch((err) => {
  console.error('Fatal Tahap 2 Test Error:', err);
  process.exit(1);
});
