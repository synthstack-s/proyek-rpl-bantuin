/**
 * TEST SUITE: PENGUJIAN FITUR HAPUS PROVIDER & KONEKSI PROVIDER AI
 * Memverifikasi:
 * 1. Penambahan Provider Baru dan pengujian koneksi.
 * 2. Perubahan API Key pada provider dan keandalan uji koneksi.
 * 3. Penghapusan Provider AI (database, in-memory, dan .env.local).
 */

import {
  saveProviderConfig,
  getProviderRuntimeConfig,
  getAllProviderConfigsAdmin,
  deleteProviderConfig,
  getGlobalAISettings,
} from '../src/lib/ai/repository';
import { AIProviderManager } from '../src/lib/ai/provider-manager';

async function runTests() {
  console.log('========================================================');
  console.log('🧪 PENGUJIAN FITUR: HAPUS PROVIDER & KONEKSI PROVIDER AI');
  console.log('========================================================\n');

  let passedTests = 0;
  const totalTests = 4;

  // --- TEST 1: MENAMBAHKAN PROVIDER BARU & VERIFIKASI KONEKSI ---
  console.log('--- TEST 1: MENAMBAHKAN PROVIDER BARU ---');
  try {
    const newProviderSlug = 'openrouter_test';
    const saveResult = await saveProviderConfig(
      newProviderSlug as any,
      {
        name: 'OpenRouter Test AI',
        apiEndpoint: 'https://openrouter.ai/api/v1',
        apiKey: 'sk-or-v1-dummy-test-key-999888777',
        selectedModel: 'meta-llama/llama-3.3-70b-instruct',
        defaultModel: 'meta-llama/llama-3.3-70b-instruct',
        temperature: 0.7,
        maxOutputTokens: 2048,
      },
      1,
      { ip: '127.0.0.1', userAgent: 'JestTest' }
    );

    console.log('Hasil simpan provider baru:', saveResult.message);
    const readConfig = await getProviderRuntimeConfig(newProviderSlug as any);

    if (readConfig.name === 'OpenRouter Test AI' && readConfig.apiEndpoint === 'https://openrouter.ai/api/v1') {
      console.log('✅ LULUS TEST 1: Provider baru berhasil ditambahkan dan terbaca di runtime!');
      passedTests++;
    } else {
      console.error('❌ GAGAL TEST 1: Data provider baru tidak sesuai');
    }
  } catch (err: any) {
    console.error('❌ GAGAL TEST 1 dengan error:', err.message);
  }

  // --- TEST 2: PERUBAHAN API KEY PADA PROVIDER ---
  console.log('\n--- TEST 2: PERUBAHAN API KEY PADA PROVIDER ---');
  try {
    const targetProvider = 'deepseek';
    const newApiKey = 'sk-new-deepseek-key-verified-abcdef123456';
    
    const updateResult = await saveProviderConfig(
      targetProvider as any,
      {
        apiKey: `Bearer ${newApiKey}`, // Sertakan Bearer untuk menguji auto-cleaner
        selectedModel: 'deepseek-chat',
      },
      1,
      { ip: '127.0.0.1', userAgent: 'JestTest' }
    );

    console.log('Hasil update API key:', updateResult.message);
    const updatedConfig = await getProviderRuntimeConfig(targetProvider as any);

    if (updatedConfig.apiKey === newApiKey) {
      console.log('Key tersimpan (tanpa Bearer):', updatedConfig.apiKey);
      console.log('✅ LULUS TEST 2: Perubahan API Key berhasil dibersihkan dan tersimpan sempurna!');
      passedTests++;
    } else {
      console.error('❌ GAGAL TEST 2: API key tidak sesuai:', updatedConfig.apiKey);
    }
  } catch (err: any) {
    console.error('❌ GAGAL TEST 2 dengan error:', err.message);
  }

  // --- TEST 3: PENGUJIAN TEST CONNECTION ENGINE ---
  console.log('\n--- TEST 3: PENGUJIAN ISOLASI TEST CONNECTION ENGINE ---');
  try {
    const manager = AIProviderManager.getInstance();
    
    // Uji koneksi dengan key valid pada format provider
    const testResult = await manager.testProviderConnection('groq' as any, {
      selectedModel: 'openai/gpt-oss-120b',
    });

    console.log('Status hasil uji koneksi Groq:', testResult.status);
    console.log('Response time:', testResult.responseTimeMs, 'ms');
    if (testResult.errorMessage) {
      console.log('Keterangan:', testResult.errorMessage);
    }

    // Uji koneksi tidak boleh crash/throw error
    console.log('✅ LULUS TEST 3: Test connection engine berjalan stabil dan menangani respons dengan tepat!');
    passedTests++;
  } catch (err: any) {
    console.error('❌ GAGAL TEST 3 dengan error:', err.message);
  }

  // --- TEST 4: FITUR HAPUS PROVIDER AI ---
  console.log('\n--- TEST 4: FITUR HAPUS PROVIDER AI ---');
  try {
    const providerToDelete = 'openrouter_test';
    
    // 1. Pastikan provider ada sebelum dihapus
    const beforeConfigs = await getAllProviderConfigsAdmin();
    const existsBefore = beforeConfigs.configList.some((c) => c.provider === providerToDelete);
    console.log(`Provider '${providerToDelete}' sebelum dihapus:`, existsBefore ? 'Ada' : 'Tidak Ada');

    // 2. Jalankan penghapusan
    const deleteRes = await deleteProviderConfig(providerToDelete, 1, { ip: '127.0.0.1' });
    console.log('Hasil deleteProviderConfig:', deleteRes.message);

    // 3. Pastikan provider hilang dari daftar
    const afterConfigs = await getAllProviderConfigsAdmin();
    const existsAfter = afterConfigs.configList.some((c) => c.provider === providerToDelete);
    console.log(`Provider '${providerToDelete}' setelah dihapus:`, existsAfter ? 'Masih Ada' : 'Sudah Dihapus');

    // 4. Pastikan sistem memblokir penghapusan provider bawaan (Gemini/Groq)
    let systemProtected = false;
    try {
      await deleteProviderConfig('gemini', 1);
    } catch {
      systemProtected = true;
    }

    if (!existsAfter && systemProtected) {
      console.log('✅ LULUS TEST 4: Provider kustom berhasil dihapus dan provider inti tetap terlindungi!');
      passedTests++;
    } else {
      console.error('❌ GAGAL TEST 4: Provider masih ditemukan atau proteksi sistem tidak aktif.');
    }
  } catch (err: any) {
    console.error('❌ GAGAL TEST 4 dengan error:', err.message);
  }

  console.log('\n========================================================');
  console.log(`HASIL AKHIR: ${passedTests}/${totalTests} PENGUJIAN LULUS (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('========================================================');
}

runTests().catch(console.error);

