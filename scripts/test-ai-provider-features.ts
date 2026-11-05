/**
 * TEST SUITE: AI PROVIDER MANAGEMENT ENHANCEMENTS
 * BANTUIN SaaS PLATFORM
 * 
 * Verifikasi:
 * 1. Simpan & Tampilkan API Key terdekripsi untuk Admin Form (Mask/Unmask toggle).
 * 2. Fitur Tambah Provider AI Kustom Dinamis (DeepSeek, OpenAI, OpenRouter, dll.).
 * 3. Hapus Provider Kustom (Proteksi agar default gemini/groq tidak bisa dihapus).
 * 4. Chatbot+ Recognition terhadap pertanyaan Model & Provider AI yang aktif.
 */

import {
  saveProviderConfig,
  getProviderRuntimeConfig,
  getAllProviderConfigsAdmin,
  deleteProviderConfig,
  setActiveAIProvider,
} from '../src/lib/ai/repository';
import { AIProviderManager } from '../src/lib/ai/provider-manager';
import { processChatMessage } from '../src/lib/chatbot/engine';
import { ChatUserContext, ConsultationSession } from '../src/lib/chatbot/types';

async function runTests() {
  console.log('===============================================================');
  console.log('🚀 MEMULAI PENGUJIAN FITUR AI PROVIDER MANAGEMENT (ENHANCED)');
  console.log('===============================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string) {
    total++;
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      process.exitCode = 1;
    }
  }

  // TEST 1: Simpan API Key Groq dan Ambil Kembali untuk Form Admin
  console.log('--- TEST GROUP 1: API KEY STORAGE & PREFILL REVEAL ---');
  const sampleGroqKey = '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';
  const saveGroqResult = await saveProviderConfig(
    'groq',
    {
      apiKey: sampleGroqKey,
      selectedModel: 'openai/gpt-oss-120b',
      temperature: 0.7,
      maxOutputTokens: 2048,
    },
    1,
    { ip: '127.0.0.1', userAgent: 'TestSuite' }
  );

  assert(saveGroqResult.success === true, 'saveProviderConfig untuk Groq berhasil disimpan');
  assert(Boolean(saveGroqResult.maskedKeyPreview), 'Masked key preview terbuat dengan benar');

  const adminConfigs = await getAllProviderConfigsAdmin();
  assert(Boolean(adminConfigs.configs['groq']), 'Admin configs memuat provider groq');
  assert(
    adminConfigs.configs['groq'].apiKey === sampleGroqKey,
    'API Key Groq terdekripsi secara akurat untuk diisi ke form admin input (Bisa Dilihat & Diedit)'
  );
  assert(
    adminConfigs.configs['groq'].selectedModel === 'openai/gpt-oss-120b',
    'Model pilihan Groq tersimpan sesuai konfigurasi'
  );

  // TEST 2: Tambah Provider AI Kustom Dinamis (DeepSeek AI)
  console.log('\n--- TEST GROUP 2: DYNAMIC CUSTOM PROVIDER CREATION ---');
  const deepseekSave = await saveProviderConfig(
    'deepseek',
    {
      name: 'DeepSeek AI',
      apiEndpoint: 'https://api.deepseek.com/v1',
      apiKey: 'sk-deepseek-test-key-1234567890',
      selectedModel: 'deepseek-chat',
      defaultModel: 'deepseek-chat',
      temperature: 0.8,
      maxOutputTokens: 4096,
    },
    1,
    { ip: '127.0.0.1', userAgent: 'TestSuite' }
  );

  assert(deepseekSave.success === true, 'Berhasil menambahkan custom provider DeepSeek AI');
  assert(deepseekSave.config.name === 'DeepSeek AI', 'Nama provider kustom tersimpan dengan benar');
  assert(deepseekSave.config.apiEndpoint === 'https://api.deepseek.com/v1', 'Endpoint kustom tersimpan');

  const updatedAdminConfigs = await getAllProviderConfigsAdmin();
  assert(Boolean(updatedAdminConfigs.configs['deepseek']), 'Provider deepseek muncul di daftar provider admin');
  assert(
    updatedAdminConfigs.configs['deepseek'].apiKey === 'sk-deepseek-test-key-1234567890',
    'Kunci API DeepSeek terdekripsi siap ditampilkan di form tab DeepSeek'
  );

  // TEST 3: AI Provider Manager melayani custom provider via OpenAI Compatible adapter
  console.log('\n--- TEST GROUP 3: ADAPTER RESOLUTION FOR CUSTOM PROVIDERS ---');
  const manager = AIProviderManager.getInstance();
  const deepseekAdapter = manager.getAdapter('deepseek');
  assert(Boolean(deepseekAdapter), 'AIProviderManager berhasil me-resolve adapter untuk custom provider deepseek');
  assert(deepseekAdapter.providerName === 'deepseek', 'Adapter name sesuai dengan slug kustom');

  // TEST 4: Chatbot+ Model & Provider Recognition
  console.log('\n--- TEST GROUP 4: CHATBOT+ MODEL & PROVIDER RECOGNITION ---');
  // Set Groq sebagai active provider untuk pengujian
  await manager.switchActiveProvider('groq', 1);

  const mockSession: ConsultationSession = {
    id: 9999,
    sessionUuid: 'test-session',
    userId: 1,
    isConvertedToOrder: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const adminContext: ChatUserContext = {
    userId: 1,
    role: 'admin',
    name: 'Super Administrator',
    email: 'admin@bantuin.id',
    pageContext: {
      pathname: '/admin/settings',
    },
  };

  const queries = [
    'Model apa yang sedang dipakai?',
    'Kamu pakai AI apa sekarang?',
    'Siapa provider AI kamu?',
    'Model AI apa yang aktif saat ini?',
  ];

  for (const q of queries) {
    const res = await processChatMessage({
      userMessage: q,
      session: mockSession,
      userContext: adminContext,
    });

    assert(Boolean(res.reply), `Chatbot merespons pertanyaan: "${q}"`);
    assert(
      res.reply.includes('Groq AI') || res.reply.includes('groq'),
      `Respons memuat nama provider aktif (Groq AI) untuk query: "${q}"`
    );
    assert(
      res.reply.includes('openai/gpt-oss-120b') || res.reply.includes('Model'),
      `Respons memuat model yang digunakan untuk query: "${q}"`
    );
    assert(
      res.reply.includes('Pengaturan Sistem') || res.reply.includes('Administrator'),
      `Respons menyertakan panduan administrator untuk mengelola provider`
    );
  }

  // TEST 5: Proteksi Hapus Provider
  console.log('\n--- TEST GROUP 5: PROVIDER DELETION & SAFETY GUARD ---');
  let threwOnGeminiDelete = false;
  try {
    await deleteProviderConfig('gemini', 1);
  } catch (err: any) {
    threwOnGeminiDelete = true;
  }
  assert(threwOnGeminiDelete, 'Penghapusan default provider (gemini) dicegah demi integritas sistem');

  const deleteDeepseek = await deleteProviderConfig('deepseek', 1);
  assert(deleteDeepseek.success === true, 'Provider kustom deepseek dapat dihapus dengan aman');
  const finalConfigs = await getAllProviderConfigsAdmin();
  assert(!finalConfigs.configs['deepseek'], 'Provider deepseek sudah terhapus dari daftar aktif');

  console.log('\n===============================================================');
  console.log(`🎉 HASIL PENGUJIAN: ${passed}/${total} PENGUJIAN BERHASIL (${Math.round((passed / total) * 100)}%)`);
  console.log('===============================================================');
}

runTests().catch((err) => {
  console.error('Fatal Test Error:', err);
  process.exit(1);
});
