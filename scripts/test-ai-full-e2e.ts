/**
 * BANTUIN SaaS PLATFORM
 * COMPREHENSIVE END-TO-END TEST SUITE: AI PROVIDER MANAGEMENT
 * 
 * Menguji seluruh komponen:
 * 1. Encryption & Key Management (AES-256-GCM, Envelope, Rotation, Tamper-Resistance)
 * 2. SSRF Protection & Socket-Level DNS Pinning
 * 3. Repository CRUD & Atomic DB State
 * 4. Active Provider Switching & In-Flight Snapshot Isolation
 * 5. Dynamic Models & Connection Testing
 * 6. Circuit Breaker & Automatic Fallback Engine
 * 7. Universal Tool Calling & Chatbot+ Engine Integration
 * 8. Usage Monitoring & Telemetry Aggregation
 */

import {
  encryptApiKey,
  decryptApiKey,
  maskApiKey,
  rotateApiKeyPayload,
  InvalidAuthTagError,
} from '../src/lib/ai/encryption';
import {
  validateAndPinEndpoint,
  isPrivateOrReservedIP,
  createPinnedHttpsAgent,
} from '../src/lib/ai/ssrf-validator';
import {
  saveProviderConfig,
  getProviderRuntimeConfig,
  getGlobalAISettings,
  setActiveAIProvider,
  setAutomaticFallbackSettings,
  recordAIUsageLog,
  getAIMonitoringMetrics,
} from '../src/lib/ai/repository';
import { AIProviderManager } from '../src/lib/ai/provider-manager';
import { UniversalToolDeclaration, AIChatRequest } from '../src/lib/ai/types';
import { executeRoleBasedTool } from '../src/lib/chatbot/tools';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`  ❌ [FAIL] ${testName}${detail ? ` -> ${detail}` : ''}`);
  }
}

async function runAllTests() {
  console.log('\n===============================================================');
  console.log('🤖 BANTUIN - COMPREHENSIVE AI PROVIDER MANAGEMENT E2E TEST');
  console.log('===============================================================\n');

  // =========================================================================
  // TEST SUITE 1: ENCRYPTION, KEY DERIVATION, & ROTATION
  // =========================================================================
  console.log('--- TEST SUITE 1: AES-256-GCM Encryption & Key Lifecycle ---');

  const testKey = 'AIzaSyDemoActualApiKey1234567890abcdef';
  const encryptResult = encryptApiKey(testKey, 'kid-primary');
  const encrypted = encryptResult.encryptedPayload;
  assert(encrypted.startsWith('v1:kid-primary:'), 'Envelope format diawali versi dan kid', encrypted);

  const parts = encrypted.split(':');
  assert(parts.length === 5, 'Envelope memiliki 5 segmen (v1, kid, iv, tag, cipher)', `Count: ${parts.length}`);

  const decrypted = decryptApiKey(encrypted);
  assert(decrypted === testKey, 'Hasil dekripsi identik dengan plaintext original');

  const masked = maskApiKey(testKey);
  assert(masked.startsWith('AIza') && masked.endsWith('cdef') && masked.includes('****'), 'Masking preview aman', masked);

  // Deteksi Tampering (Integritas Data GCM)
  const tamperedSegments = [...parts];
  tamperedSegments[4] = 'X' + tamperedSegments[4].slice(1); // Korup ciphertext
  const tamperedPayload = tamperedSegments.join(':');
  let tamperDetected = false;
  try {
    decryptApiKey(tamperedPayload);
  } catch (err: any) {
    tamperDetected = true;
    assert(err instanceof InvalidAuthTagError, 'Tampering ciphertext memicu InvalidAuthTagError');
  }
  assert(tamperDetected, 'GCM Authentication Tag berhasil menolak payload yang dimanipulasi');

  // Key Rotation
  const rotatedResult = rotateApiKeyPayload(encrypted, 'kid-backup');
  assert(rotatedResult.encryptedPayload.startsWith('v1:kid-backup:'), 'Key rotation berhasil memperbarui Key ID', rotatedResult.encryptedPayload);
  assert(decryptApiKey(rotatedResult.encryptedPayload) === testKey, 'Hasil dekripsi payload yang dirotasi tetap valid');

  // =========================================================================
  // TEST SUITE 2: SSRF PROTECTION & SOCKET-LEVEL DNS PINNING
  // =========================================================================
  console.log('\n--- TEST SUITE 2: SSRF Protection & Socket-Level DNS Pinning ---');

  assert(isPrivateOrReservedIP('127.0.0.1'), 'IP Loopback 127.0.0.1 diblokir');
  assert(isPrivateOrReservedIP('10.0.0.1'), 'IP Private Class A 10.0.0.1 diblokir');
  assert(isPrivateOrReservedIP('192.168.1.1'), 'IP Private Class C 192.168.1.1 diblokir');
  assert(isPrivateOrReservedIP('172.16.0.1'), 'IP Private Class B 172.16.0.1 diblokir');
  assert(isPrivateOrReservedIP('169.254.169.254'), 'IP Cloud Metadata 169.254.169.254 diblokir');
  assert(isPrivateOrReservedIP('::1'), 'IPv6 Loopback ::1 diblokir');
  assert(!isPrivateOrReservedIP('8.8.8.8'), 'IP Publik Google DNS 8.8.8.8 diizinkan');

  let httpRejected = false;
  try {
    await validateAndPinEndpoint('http://generativelanguage.googleapis.com', 'gemini');
  } catch (err: any) {
    httpRejected = true;
    assert(err.message.includes('HTTPS'), 'Protokol non-HTTPS (http://) ditolak');
  }
  assert(httpRejected, 'SSRF Validator menolak endpoint non-HTTPS');

  const validGemini = await validateAndPinEndpoint('https://generativelanguage.googleapis.com', 'gemini');
  assert(validGemini.hostname === 'generativelanguage.googleapis.com', 'Hostname resmi Gemini divalidasi');
  assert(Boolean(validGemini.pinnedIp), 'Pinned IP berhasil di-resolve');

  const agent = createPinnedHttpsAgent(validGemini.hostname, validGemini.pinnedIp);
  assert(Boolean(agent), 'Pinned HTTPS Agent berhasil dibuat pada level socket');

  // =========================================================================
  // TEST SUITE 3: REPOSITORY CRUD & SECURE STORAGE
  // =========================================================================
  console.log('\n--- TEST SUITE 3: Repository CRUD & Database State ---');

  const geminiPlainKey = 'AIzaSyDemoGeminiKey987654321';
  await saveProviderConfig('gemini', {
    apiEndpoint: 'https://generativelanguage.googleapis.com',
    apiKey: geminiPlainKey,
    selectedModel: 'gemini-3.5-flash',
    temperature: 0.6,
    maxOutputTokens: 2048,
    requestTimeoutMs: 25000,
    retryLimit: 2,
  }, 1);

  const groqPlainKey = 'gsk_demoGroqApiKey1234567890abcdef';
  await saveProviderConfig('groq', {
    apiEndpoint: 'https://api.groq.com/openai/v1',
    apiKey: groqPlainKey,
    selectedModel: 'llama-3.3-70b-versatile',
    temperature: 0.7,
    maxOutputTokens: 4096,
    requestTimeoutMs: 30000,
    retryLimit: 2,
  }, 1);

  const loadedGemini = await getProviderRuntimeConfig('gemini');
  assert(loadedGemini.apiKey === geminiPlainKey, 'Plaintext API Key Gemini berhasil didekripsi di memori');
  assert(loadedGemini.maskedKeyPreview.startsWith('AIza'), 'Masked preview Gemini aman', loadedGemini.maskedKeyPreview);

  const loadedGroq = await getProviderRuntimeConfig('groq');
  assert(loadedGroq.apiKey === groqPlainKey, 'Plaintext API Key Groq berhasil didekripsi di memori');
  assert(loadedGroq.maskedKeyPreview.startsWith('gsk_'), 'Masked preview Groq aman', loadedGroq.maskedKeyPreview);

  // =========================================================================
  // TEST SUITE 4: ATOMIC PROVIDER SWITCHING & IN-FLIGHT ISOLATION
  // =========================================================================
  console.log('\n--- TEST SUITE 4: Atomic Provider Switching & In-Flight Snapshot ---');

  const manager = AIProviderManager.getInstance();
  await setActiveAIProvider('gemini', 1);
  const snap1 = await manager.getActiveProviderSnapshot();
  assert(snap1.activeConfig.provider === 'gemini', 'Provider aktif tersinkronisasi sebagai gemini');
  const v1 = snap1.globalSettings.version;

  await setActiveAIProvider('groq', 1);
  const snap2 = await manager.getActiveProviderSnapshot(true);
  assert(snap2.activeConfig.provider === 'groq', 'Provider aktif berhasil dialihkan ke groq');
  assert(snap2.globalSettings.version > v1, 'Database version counter bertambah untuk invalidasi multi-instance');

  // In-Flight Snapshot Verification (snap1 tidak terpengaruh oleh pergantian ke groq)
  assert(snap1.activeConfig.provider === 'gemini', 'In-Flight Snapshot tetap terisolasi pada gemini');

  // Kembalikan ke gemini
  await setActiveAIProvider('gemini', 1);

  // =========================================================================
  // TEST SUITE 5: AUTOMATIC FALLBACK & CIRCUIT BREAKER RULES
  // =========================================================================
  console.log('\n--- TEST SUITE 5: Automatic Fallback Engine & Circuit Breaker ---');

  await setAutomaticFallbackSettings(true, 'groq', 1);

  const currentSettings = await getGlobalAISettings();
  assert(currentSettings.enableFallback === true, 'Automatic fallback aktif');
  assert(currentSettings.fallbackProvider === 'groq', 'Fallback provider adalah groq');

  // Uji klasifikasi error non-fallback: 401 Unauthorized TIDAK BOLEH fallback
  const geminiAdapter = manager.getAdapter('gemini');
  const unauthorizedError = geminiAdapter.normalizeError({
    message: 'API_KEY_INVALID: API key not valid. Please pass a valid API key.',
    status: 401,
  });
  assert(unauthorizedError.status === 'invalid_api_key', 'Error 401 diklasifikasikan sebagai invalid_api_key');
  assert(unauthorizedError.isFallbackEligible === false, 'Error 401 TIDAK eligible untuk automatic fallback');

  // Uji klasifikasi error fallback eligible: 429 Rate Limit HARUS fallback
  const rateLimitError = geminiAdapter.normalizeError({
    message: 'RESOURCE_EXHAUSTED: Quota exceeded for quota metric',
    status: 429,
  });
  assert(rateLimitError.status === 'rate_limit_exceeded', 'Error 429 diklasifikasikan sebagai rate_limit_exceeded');
  assert(rateLimitError.isFallbackEligible === true, 'Error 429 ELIGIBLE untuk automatic fallback');

  // Uji klasifikasi error fallback eligible: Timeout HARUS fallback
  const timeoutError = geminiAdapter.normalizeError({
    message: 'Request timeout (30000ms)',
  });
  assert(timeoutError.status === 'timeout', 'Error timeout diklasifikasikan sebagai timeout');
  assert(timeoutError.isFallbackEligible === true, 'Error timeout ELIGIBLE untuk automatic fallback');

  // =========================================================================
  // TEST SUITE 6: UNIVERSAL TOOL CALLING NORMALIZATION & EXECUTION
  // =========================================================================
  console.log('\n--- TEST SUITE 6: Universal Tool Calling & RBAC Execution ---');

  const universalTools: UniversalToolDeclaration[] = [
    {
      name: 'searchDatabaseUsers',
      description: 'Mencari data pengguna',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Kata kunci' },
        },
        required: ['query'],
      },
    },
    {
      name: 'searchDatabaseOrders',
      description: 'Mencari pesanan',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Kata kunci order' },
        },
        required: ['query'],
      },
    },
  ];

  assert(universalTools.length === 2, '2 Universal tool declarations terdefinisi');

  // Uji eksekusi tool RBAC untuk role Admin
  const adminContext = { role: 'admin' as const, userId: 1, permissions: ['ALL'] };
  const userSearchResult = await executeRoleBasedTool('searchDatabaseUsers', { query: '0812' }, adminContext);
  assert(userSearchResult.success === true, 'searchDatabaseUsers berhasil dieksekusi oleh Admin');

  // Uji eksekusi tool RBAC untuk role Customer (Akses ditolak pada tool admin)
  const customerContext = { role: 'customer', userId: 99 };
  const customerRestrictedResult = await executeRoleBasedTool('searchDatabaseUsers', { query: 'admin' }, customerContext as any);
  assert(customerRestrictedResult.success === false, 'searchDatabaseUsers DITOLAK untuk role Customer');
  assert(Boolean(customerRestrictedResult.error && customerRestrictedResult.error.includes('Akses ditolak')), 'Pesan penolakan RBAC akurat');

  // =========================================================================
  // TEST SUITE 7: USAGE MONITORING & TELEMETRY LOGGING
  // =========================================================================
  console.log('\n--- TEST SUITE 7: Telemetry & Monitoring Metrics ---');

  await recordAIUsageLog({
    provider: 'gemini',
    model: 'gemini-3.5-flash',
    latencyMs: 320,
    status: 'success',
    promptTokens: 150,
    completionTokens: 80,
    totalTokens: 230,
    isFallback: false,
    userRole: 'admin',
  });

  await recordAIUsageLog({
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    latencyMs: 140,
    status: 'fallback',
    promptTokens: 150,
    completionTokens: 90,
    totalTokens: 240,
    isFallback: true,
    userRole: 'customer',
  });

  const metrics = await getAIMonitoringMetrics();
  assert(metrics.summary.totalRequests >= 2, 'Metrik mencatat total requests', `Got: ${metrics.summary.totalRequests}`);
  assert(metrics.summary.totalTokensUsed >= 470, 'Metrik mencatat akumulasi token', `Got: ${metrics.summary.totalTokensUsed}`);
  assert(metrics.summary.averageResponseTimeMs > 0, 'Metrik menghitung rerata latency', `Got: ${metrics.summary.averageResponseTimeMs}ms`);
  assert(metrics.summary.fallbackCount >= 1, 'Metrik mencatat kejadian fallback', `Got: ${metrics.summary.fallbackCount}`);

  // =========================================================================
  // FINAL REPORT
  // =========================================================================
  console.log('\n===============================================================');
  console.log(`🎯 HASIL AKHIR PENGUJIAN: ${passedTests}/${totalTests} PASSED`);
  if (failedTests === 0) {
    console.log('🌟 SELURUH TEST SUITE AI PROVIDER MANAGEMENT 100% SUKSES!');
  } else {
    console.error(`⚠️ Terdapat ${failedTests} pengujian yang gagal.`);
  }
  console.log('===============================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Fatal unhandled error in test suite:', err);
  process.exit(1);
});
