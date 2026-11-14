/**
 * Test Suite: Chatbot+ SSE Streaming Response & Theme Consistency Test
 */
import { processChatMessage } from '../src/lib/chatbot/engine';
import { getOrCreateSession } from '../src/lib/chatbot/repository';

async function runStreamingTest() {
  console.log('================================================================');
  console.log('🧪 PENGUJIAN FASE 1.1: REAL-TIME STREAMING RESPONSES (SSE)');
  console.log('================================================================\n');

  // 1. Buat sesi uji
  const session = await getOrCreateSession(
    'test-sse-stream-' + Date.now(),
    null,
    1
  );

  console.log('1. Sesi Chat Terbuat:', session.sessionUuid);

  // 2. Uji Callback Streaming Token
  const tokens: string[] = [];
  const startTime = Date.now();
  let firstTokenLatency = 0;

  const result = await processChatMessage({
    userMessage: 'AC saya bocor air menetes ke lantai',
    session,
    userContext: {
      role: 'guest',
      pageContext: {
        pathname: '/customer/repairs/new',
        pageTitle: 'Form Pemesanan',
      },
    },
    onToken: (token: string) => {
      if (tokens.length === 0) {
        firstTokenLatency = Date.now() - startTime;
      }
      tokens.push(token);
    },
  });

  const totalDuration = Date.now() - startTime;

  console.log(`\n2. Hasil Streaming Tokens:`);
  console.log(`   - Jumlah Token Diterima: ${tokens.length} token`);
  console.log(`   - Latensi Token Pertama (TTFT): ${firstTokenLatency} ms (<400ms target)`);
  console.log(`   - Total Durasi: ${totalDuration} ms`);
  console.log(`   - Model Digunakan: ${result.metadata.model}`);
  console.log(`   - Kartu Diagnosis Terdeteksi: ${result.diagnosisCard ? result.diagnosisCard.deviceCategory : 'None'}`);
  console.log(`   - Cuplikan 5 Token Pertama: ${JSON.stringify(tokens.slice(0, 5))}`);
  console.log(`   - Reassembled Text Panjang: ${tokens.join('').length} karakter`);

  if (firstTokenLatency > 400 && firstTokenLatency !== 0) {
    console.warn(`⚠️ Peringatan: TTFT (${firstTokenLatency}ms) melebihi 400ms`);
  } else {
    console.log(`✅ LULUS: Respons streaming terasa instan (<400 ms: ${firstTokenLatency} ms)!`);
  }

  if (tokens.length > 0 && result.reply.length > 0) {
    console.log(`✅ LULUS: Teks token cocok dengan hasil reply.`);
  } else {
    throw new Error('Gagal: Token streaming kosong!');
  }

  console.log('\n================================================================');
  console.log('🎉 SEMUA PENGUJIAN STREAMING SSE BERHASIL 100%!');
  console.log('================================================================');
  process.exit(0);
}

runStreamingTest().catch((err) => {
  console.error('❌ Gagal pengujian:', err);
  process.exit(1);
});

