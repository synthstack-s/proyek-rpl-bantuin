import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { ensureAdminProfilesTable, saveAdminProfile, getAdminProfile } from '../src/lib/admin-profile';
import { getProviderRuntimeConfig, saveProviderConfig, getAllProviderConfigsAdmin } from '../src/lib/ai/repository';

async function testSuite() {
  console.log('========================================================');
  console.log('🧪 PENGUJIAN INTEGRASI PERBAIKAN: PROFIL ADMIN & AI API');
  console.log('========================================================\n');

  // -------------------------------------------------------------------------
  // TEST 1: PROFIL ADMIN (SIMPAN & AMBIL NAMA)
  // -------------------------------------------------------------------------
  console.log('--- TEST 1: SIMPAN & AMBIL PROFIL ADMIN ---');
  await ensureAdminProfilesTable();
  const testAdminId = 1;
  const newName = 'Budi Santoso - Head Admin 2026';

  await saveAdminProfile(testAdminId, { full_name: newName });
  const fetchedProfile = await getAdminProfile(testAdminId);

  console.log('Nama yang disimpan  :', newName);
  console.log('Nama yang didapat   :', fetchedProfile?.full_name);

  if (fetchedProfile?.full_name === newName) {
    console.log('✅ LULUS TEST 1: Nama profil admin berhasil disimpan dan terbaca kembali!');
  } else {
    throw new Error(`❌ GAGAL TEST 1: Ekspektasi "${newName}", tetapi mendapat "${fetchedProfile?.full_name}"`);
  }

  // -------------------------------------------------------------------------
  // TEST 2: AI PROVIDER RUNTIME CONFIG (API KEY & ENDPOINT PERSISTENCE)
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 2: SIMPAN & VERIFIKASI KONFIGURASI API KEY PROVIDER ---');
  const dummyNvidiaKey = 'nvapi-test-dummy-key-verified-12345';
  const saveRes = await saveProviderConfig(
    'nvidia',
    {
      name: 'NVIDIA NIM',
      apiEndpoint: 'https://integrate.api.nvidia.com/v1',
      apiKey: dummyNvidiaKey,
      selectedModel: 'meta/llama-3.2-90b-vision-instruct',
    },
    testAdminId
  );

  console.log('Pesan hasil simpan:', saveRes.message);
  console.log('Masked key preview:', saveRes.maskedKeyPreview);

  const updatedNvidia = await getProviderRuntimeConfig('nvidia');
  console.log('API Key tersimpan :', updatedNvidia.apiKey);
  console.log('Endpoint tersimpan:', updatedNvidia.apiEndpoint);
  console.log('Model tersimpan   :', updatedNvidia.selectedModel);

  if (updatedNvidia.apiKey === dummyNvidiaKey && updatedNvidia.apiEndpoint.includes('integrate.api.nvidia.com')) {
    console.log('✅ LULUS TEST 2: Pergantian API Key provider NVIDIA berhasil tersimpan di runtime & memory!');
  } else {
    throw new Error(`❌ GAGAL TEST 2: API key tidak cocok setelah disimpan.`);
  }

  // Restore previous NVIDIA API Key from .env.local
  if (process.env.NVIDIA_API_KEY && process.env.NVIDIA_API_KEY !== dummyNvidiaKey) {
    await saveProviderConfig(
      'nvidia',
      {
        name: 'NVIDIA NIM',
        apiEndpoint: 'https://integrate.api.nvidia.com/v1',
        apiKey: process.env.NVIDIA_API_KEY,
        selectedModel: 'meta/llama-3.2-90b-vision-instruct',
      },
      testAdminId
    );
    console.log('✔ Kredensial asli NVIDIA berhasil dipulihkan.');
  }

  // -------------------------------------------------------------------------
  // TEST 3: DISCOVERY SELURUH PROVIDER LENGKAP
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 3: DISCOVERY SELURUH PROVIDER AI ---');
  const allConfigs = await getAllProviderConfigsAdmin();
  const providerKeys = Object.keys(allConfigs.configs);
  console.log('Daftar provider terdaftar:', providerKeys);

  const requiredProviders = ['gemini', 'groq', 'nvidia', 'deepseek'];
  const allPresent = requiredProviders.every((p) => providerKeys.includes(p));

  if (allPresent) {
    console.log('✅ LULUS TEST 3: Seluruh provider inti (Gemini, Groq, NVIDIA, DeepSeek) terdaftar!');
  } else {
    throw new Error(`❌ GAGAL TEST 3: Ada provider inti yang hilang.`);
  }

  console.log('\n========================================================');
  console.log('🎉 SEMUA PENGUJIAN LULUS DENGAN SEMPURNA (100%)!');
  console.log('========================================================');
}

testSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});

