/**
 * TEST: INTERFACE & DASHBOARD AWARENESS & CONCISE RESPONSE QUALITY
 */
import { processChatMessage } from '../src/lib/chatbot/engine';
import { ConsultationSession, ChatUserContext } from '../src/lib/chatbot/types';

async function testInterfaceAwareness() {
  console.log('--- TEST 1: ADMIN TANYA DATA DASHBOARD / LAYAR ---');

  const mockAdminSession: ConsultationSession = {
    id: 101,
    sessionUuid: 'test-admin-screen-session',
    userId: 1,
    categoryId: null,
    categoryName: null,
    categorySlug: null,
    initialSymptoms: null,
    preliminaryDiagnosis: null,
    recommendedAction: null,
    isConvertedToOrder: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const adminContext: ChatUserContext = {
    role: 'admin',
    userId: 1,
    name: 'Administrator',
    email: 'admin@bantuin.id',
    pageContext: {
      pathname: '/admin',
      pageTitle: 'Dashboard Admin | BANTUIN',
      visibleContentSummary: 'Kartu Metrik: Total Pesanan: 42; Pendapatan: Rp 4.500.000; Mitra Teknisi: 5; Pelanggan: 18',
    },
  };

  const res1 = await processChatMessage({
    userMessage: 'apa yang ditampilkan di dashboard ini?',
    session: mockAdminSession,
    userContext: adminContext,
  });

  console.log('\n[RESPONS CHATBOT]:\n', res1.reply);

  const containsPesanan = res1.reply.includes('Total Seluruh Pesanan');
  const containsPendapatan = res1.reply.includes('Total Pendapatan');
  const containsAkuntabilitas = res1.reply.includes('repair_orders') || res1.reply.includes('invoices') || res1.reply.includes('Pertanggungjawaban Data');
  const isConcise = !res1.reply.startsWith('Halo terima kasih') && res1.reply.length < 2000;

  console.log('\n--- VERIFIKASI ---');
  console.log('✅ Memuat data pesanan:', containsPesanan);
  console.log('✅ Memuat data keuangan/pendapatan:', containsPendapatan);
  console.log('✅ Memuat sumber pertanggungjawaban database:', containsAkuntabilitas);
  console.log('✅ Format ringkas, jelas, tanpa basa-basi:', isConcise);

  if (containsPesanan && containsPendapatan && containsAkuntabilitas && isConcise) {
    console.log('\n🎉 ALL CHECKS PASSED: Chatbot berhasil membaca dan mempertanggungjawabkan data interface secara ringkas dan berkualitas!');
    process.exit(0);
  } else {
    console.error('\n❌ CHECKS FAILED');
    process.exit(1);
  }
}

testInterfaceAwareness().catch((e) => {
  console.error(e);
  process.exit(1);
});
