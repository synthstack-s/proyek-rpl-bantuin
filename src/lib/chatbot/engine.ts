/**
 * CHATBOT+ ENGINE: AI DATABASE ASSISTANT
 * 
 * Otak utama AI Database Assistant BANTUIN:
 * 1. Filter Topik & Keamanan Darurat (guard.ts)
 * 2. Pemahaman Konteks & Resolusi Entitas Sesi (context-manager.ts)
 * 3. Otorisasi Akses Data Aktual Berbasis Peran (data-service.ts)
 * 4. Modular Prompt Builder untuk Google Gemini API (prompt-builder.ts)
 * 5. Rekomendasi Pertanyaan Dinamis Berbasis Peran (suggested-prompts.ts)
 * 6. Eksekusi Tindakan Operasional Terkontrol (action-service.ts)
 * 7. Intelligent Database Expert System Fallback jika Gemini API offline/terkendala kuota.
 */

import {
  ChatUserContext,
  ConsultationSession,
  DiagnosisCard,
  QuickSuggestion,
  ChatMessageMetadata,
} from './types';
import { validateTopicAndSafety, getStandardRefusalMessage } from './guard';
import * as DataService from './data-service';
import * as ActionService from './action-service';
import { resolveConversationContext, updateSessionMemory } from './context-manager';
import { buildSystemPrompt } from './prompt-builder';
import { getRoleBasedSuggestedPrompts } from './suggested-prompts';
import { executeRoleBasedTool } from './tools';
import { getRoleFilteredSchemaSummary, getTableSchemaMetadata } from './schema-registry';
import { AIProviderManager } from '@/lib/ai/provider-manager';
import { UniversalToolDeclaration, UniversalChatMessage } from '@/lib/ai/types';
import {
  saveChatMessage,
  updateSessionDiagnosis,
  getSessionMessages,
} from './repository';
import { query } from '@/lib/db';

// Ekspor pembantu saran halaman untuk backward compatibility
export function getPageContextSuggestions(pathname?: string, role: string = 'guest'): QuickSuggestion[] {
  return getRoleBasedSuggestedPrompts(role as any, pathname);
}

/**
 * Intelligent Appliance Expert System untuk analisis diagnosis kerusakan
 */
export function getExpertSystemDiagnosis(
  message: string,
  categorySlug?: string,
  userContext?: ChatUserContext
): {
  reply: string;
  card?: DiagnosisCard;
  quickSuggestions: QuickSuggestion[];
  detectedCategoryId?: number;
} {
  const norm = message.toLowerCase();

  // 1. Pendingin Ruangan (AC)
  if (categorySlug === 'ac-pendingin-ruangan' || /ac|pendingin|freon|outdoor|indoor/i.test(norm)) {
    const isLeaking = /bocor|menetes|air\s+keluar|rembes/i.test(norm);
    if (isLeaking) {
      const card: DiagnosisCard = {
        deviceCategory: 'Pendingin Ruangan (AC)',
        categoryId: 1,
        categorySlug: 'ac-pendingin-ruangan',
        symptomsSummary: 'Air menetes atau bocor dari unit indoor AC ke dalam ruangan.',
        confidenceLevel: 'Sangat Mungkin',
        possibleCauses: [
          'Saluran pembuangan (drain pipe) tersumbat lendir atau lumut',
          'Kemiringan instalasi unit indoor kurang tepat',
          'Bak penampung air indoor kotor atau retak halus',
        ],
        safeCheckSteps: [
          'Matikan AC sementara dan letakkan wadah penampung di bawah tetesan',
          'Periksa apakah ujung selang pembuangan di luar rumah tertutup kotoran',
          'Hindari menusuk lubang drainase dengan kawat tajam',
        ],
        safetyHazardWarning: 'Jangan biarkan tetesan air mengenai stopkontak listrik atau kabel di dinding!',
        recommendedAction: 'Lakukan cuci servis AC dan flushing pipa drainase oleh teknisi resmi BANTUIN.',
        estimatedLaborCostRange: 'Rp 65.000 - Rp 100.000',
      };
      return {
        reply: `Halo! Tetesan air dari unit indoor AC umumnya disebabkan oleh **saluran pembuangan (drainase) yang tersumbat** kotoran atau lumut, sehingga air kondensasi meluap.

Berikut beberapa langkah aman awal yang dapat Anda lakukan:
1. Matikan unit AC terlebih dahulu untuk menghentikan akumulasi air kondensasi.
2. Pastikan tetesan air tidak mengenai stopkontak atau instalasi listrik di dinding.
3. Periksa ujung pipa pembuangan di bagian luar rumah apakah tersumbat atau terjepit.

Untuk mengatasi sumbatan saluran secara tuntas, teknisi BANTUIN dapat melakukan flushing saluran dan cuci unit dengan garansi 30 hari.`,
        card,
        detectedCategoryId: 1,
        quickSuggestions: [
          { label: 'Pesan Servis Cuci AC', prompt: 'Saya ingin pesan servis cuci AC sekarang' },
          { label: 'Berapa tarif servis AC?', prompt: 'Berapa tarif dan biaya servis AC di BANTUIN?' },
          { label: 'Apakah ada garansi?', prompt: 'Bagaimana ketentuan garansi servis BANTUIN?' },
        ],
      };
    }

    // Default: AC Kurang Dingin / Tidak Dingin
    const card: DiagnosisCard = {
      deviceCategory: 'Pendingin Ruangan (AC)',
      categoryId: 1,
      categorySlug: 'ac-pendingin-ruangan',
      symptomsSummary: 'AC menyala namun hembusan udara tidak dingin atau hanya seperti kipas angin biasa.',
      confidenceLevel: 'Kemungkinan Besar',
      possibleCauses: [
        'Filter saringan udara indoor tertutup debu tebal',
        'Tekanan gas pendingin (freon) berkurang akibat kebocoran mikro',
        'Kondensor unit outdoor kotor atau kapasitor kipas outdoor melemah',
      ],
      safeCheckSteps: [
        'Buka penutup depan indoor dan periksa filter saringan, cuci dengan air bersih jika berdebu',
        'Pastikan remote berada pada mode "COOL" (bukan FAN atau DRY) dengan target suhu 20-24°C',
        'Cek apakah unit outdoor menyala dan kipasnya berputar',
      ],
      safetyHazardWarning: null,
      recommendedAction: 'Jadwalkan inspeksi teknisi BANTUIN untuk pengecekan ampere kompresor dan tekanan freon.',
      estimatedLaborCostRange: 'Rp 75.000 - Rp 150.000',
    };
    return {
      reply: `Halo! Keluhan AC tidak dingin atau hanya mengeluarkan angin adalah kasus yang sangat umum pada pendingin ruangan.

**Kemungkinan penyebab utama:**
- Filter saringan udara indoor tertutup debu tebal sehingga sirkulasi hembusan udara terhambat.
- Unit outdoor kotor atau tekanan gas refrigeran (freon) berada di bawah standar operasional.
- Pengaturan remote belum berada pada mode pendingin aktif.

**Langkah pemeriksaan aman awal untuk Anda:**
1. Pastikan mode pada remote AC adalah **COOL** (simbol keping salju/snowflake) dengan target suhu 22°C - 24°C.
2. Buka tutup depan indoor dan cuci saringan kasa filternya bila berdebu tebal.
3. Cek apakah kipas pada unit outdoor berputar saat AC dihidupkan.

Jika setelah membersihkan filter udara tetap tidak dingin, kemungkinan besar freon perlu ditambah atau ada komponen kapasitor outdoor yang melemah. Teknisi resmi BANTUIN siap membantu memeriksa dengan perlindungan garansi 30 hari.`,
      card,
      detectedCategoryId: 1,
      quickSuggestions: [
        { label: 'Pesan Servis AC', prompt: 'Saya mau pesan perbaikan AC' },
        { label: 'Cek Tarif Servis AC', prompt: 'Berapa tarif dasar servis AC di BANTUIN?' },
        { label: 'Info Garansi Servis', prompt: 'Apakah ada garansi perbaikan di BANTUIN?' },
      ],
    };
  }

  // 2. Lemari Es & Freezer
  if (categorySlug === 'kulkas-freezer' || /kulkas|freezer|lemari\s+es|chiller/i.test(norm)) {
    const card: DiagnosisCard = {
      deviceCategory: 'Lemari Es & Freezer',
      categoryId: 2,
      categorySlug: 'kulkas-freezer',
      symptomsSummary: 'Kulkas tidak dingin merata atau bagian freezer membeku berlebihan.',
      confidenceLevel: 'Kemungkinan Besar',
      possibleCauses: [
        'Karet pintu kulkas (gasket) kotor, getas, atau longgar',
        'Kipas sirkulasi evaporator indoor mati atau terhalang bunga es',
        'Thermostat atau defrost timer mengalami kegagalan fungsi',
        'Kompresor overload atau freon berkurang akibat kebocoran',
      ],
      safeCheckSteps: [
        'Periksa kerapatan karet pintu menggunakan selembar kertas',
        'Beri jarak minimal 10 cm antara bagian belakang kulkas dengan dinding',
        'Lakukan defrost manual jika bunga es membeku tebal',
      ],
      safetyHazardWarning: 'Jangan mencongkel bunga es pada evaporator menggunakan pisau atau benda tajam!',
      recommendedAction: 'Jadwalkan pemeriksaan sistem defrost atau kelistrikan kulkas oleh mitra teknisi BANTUIN.',
      estimatedLaborCostRange: 'Rp 80.000 - Rp 180.000',
    };
    return {
      reply: `Halo! Masalah kulkas tidak dingin atau penumpukan bunga es yang tidak merata biasanya berkaitan dengan sistem sirkulasi udara atau komponen pengatur suhu (defrost system).

**Langkah pemeriksaan aman awal:**
1. Pastikan pintu kulkas menutup rapat sempurna. Anda bisa mengetesnya dengan menjepit kertas di pintu; jika mudah ditarik, karet pintu mungkin perlu dibersihkan atau diganti.
2. Pastikan ventilasi di bagian belakang kulkas tidak menempel dinding agar panas kondensor terbuang baik.
3. Hindari menusuk atau mencongkel bunga es dengan benda tajam karena dapat melubangi pipa evaporator.

Teknisi BANTUIN dapat melakukan pengecekan relay kompresor, sensor defrost, dan sirkulasi freon secara presisi.`,
      card,
      detectedCategoryId: 2,
      quickSuggestions: [
        { label: 'Pesan Teknisi Kulkas', prompt: 'Saya mau pesan servis kulkas' },
        { label: 'Cek Tarif Servis Kulkas', prompt: 'Berapa tarif servis kulkas di BANTUIN?' },
      ],
    };
  }

  // 3. Mesin Cuci
  if (categorySlug === 'mesin-cuci-pengering' || /mesin\s+cuci|pengering|dryer|spin/i.test(norm)) {
    const card: DiagnosisCard = {
      deviceCategory: 'Mesin Cuci & Pengering',
      categoryId: 3,
      categorySlug: 'mesin-cuci-pengering',
      symptomsSummary: 'Mesin cuci bermasalah pada putaran, saluran pembuangan air, atau getaran keras.',
      confidenceLevel: 'Kemungkinan Besar',
      possibleCauses: [
        'Saringan filter pembuangan (drain filter) tersumbat koin atau serat pakaian',
        'Tali kipas (fan belt) dinamo aus atau kendor',
        'Kapasitor motor penggerak melemah atau modul PCB error',
      ],
      safeCheckSteps: [
        'Periksa dan bersihkan saringan filter pembuangan di bagian bawah depan mesin cuci',
        'Pastikan posisi kaki mesin cuci rata pada permukaan lantai',
        'Jangan mengisi pakaian melebihi kapasitas beban maksimal mesin',
      ],
      safetyHazardWarning: 'Cabut steker dari stopkontak sebelum memeriksa saluran air atau bagian belakang unit!',
      recommendedAction: 'Gunakan layanan perbaikan mesin cuci resmi BANTUIN untuk pengecekan mekanikal dan modul.',
      estimatedLaborCostRange: 'Rp 85.000 - Rp 200.000',
    };
    return {
      reply: `Halo! Gangguan pada mesin cuci umumnya terjadi pada saluran pembuangan yang tersumbat atau komponen mekanikal motor penggerak.

**Langkah pemeriksaan awal yang aman:**
1. Periksa bagian filter pembuangan (biasanya ada di bagian depan bawah mesin cuci bukaan depan/top loading) dari sumbatan kotoran atau koin.
2. Pastikan selang pembuangan tidak terlipat atau terjepit.
3. Pastikan mesin cuci diletakkan pada permukaan lantai yang rata kokoh untuk menghindari getaran berlebih saat proses memeras (spin).

Jika mesin tetap tidak berputar atau mengeluarkan kode error, mitra teknisi BANTUIN dapat mengecek fan belt, kapasitor, atau modul PCB elektronik dengan aman.`,
      card,
      detectedCategoryId: 3,
      quickSuggestions: [
        { label: 'Pesan Servis Mesin Cuci', prompt: 'Saya mau pesan servis mesin cuci' },
        { label: 'Cek Tarif Mesin Cuci', prompt: 'Berapa biaya perbaikan mesin cuci di BANTUIN?' },
      ],
    };
  }

  // General Response
  return {
    reply: `Halo! Saya **BANTUIN Database Assistant**. BANTUIN melayani perbaikan dan perawatan 6 kategori peralatan elektronik rumah tangga resmi: Pendingin Ruangan (AC), Lemari Es & Freezer, Mesin Cuci & Pengering, Pompa Air & Water Heater, Televisi & Audio, serta Peralatan Dapur Elektronik.

Silakan ceritakan kendala yang dialami perangkat Anda, atau tanyakan informasi seputar pesanan, teknisi, dan layanan resmi BANTUIN.`,
    quickSuggestions: getRoleBasedSuggestedPrompts(userContext?.role || 'guest'),
  };
}

/**
 * PIPELINE UTAMA PEMROSESAN PESAN CHATBOT+
 */
export async function processChatMessage(params: {
  userMessage: string;
  session: ConsultationSession;
  userContext: ChatUserContext;
}): Promise<{
  reply: string;
  metadata: ChatMessageMetadata;
  diagnosisCard?: DiagnosisCard | null;
}> {
  const { userMessage, session, userContext } = params;
  const startTime = Date.now();
  const currentPath = userContext.pageContext?.pathname || '/';
  const norm = userMessage.toLowerCase().trim();

  // 1. FILTER TOPIK & KEAMANAN (Safety & Prompt Injection Guard)
  // Berikan konteks peran agar pengguna terotentikasi tidak salah ditolak
  const validation = validateTopicAndSafety(userMessage, userContext.role);

  if (!validation.isAllowed) {
    const refusalReply = getStandardRefusalMessage(validation.reason);
    const metadata: ChatMessageMetadata = {
      topicRefused: true,
      responseTimeMs: Date.now() - startTime,
      quickSuggestions: getRoleBasedSuggestedPrompts(userContext.role, currentPath),
    };

    await saveChatMessage(session.id, 'user', userMessage);
    await saveChatMessage(session.id, 'assistant', refusalReply, metadata, 0, metadata.responseTimeMs);

    return {
      reply: refusalReply,
      metadata,
    };
  }

  // Jika terdeteksi bahaya keselamatan kerja (listrik/kebakaran/gas), sisipkan peringatan darurat
  let safetyAlertPrefix = '';
  if (validation.isSafetyHazard && validation.safetyAlert) {
    safetyAlertPrefix = `⚠️ **${validation.safetyAlert}**\n\n---\n\n`;
  }

  // 2. KELOLA MEMORI SESI & RESOLUSI ENTITAS PERCAKAPAN
  const rawHistory = await getSessionMessages(session.id);
  const contextEntities = resolveConversationContext(userMessage, rawHistory, session.id);

  // 3. PENGAMBILAN DATA DATABASE AKTUAL SESUAI PERAN & INTENT PENGGUNA
  let dbContextSummary = '';
  let directReply: string | null = null;
  let dynamicSuggestions = getRoleBasedSuggestedPrompts(userContext.role, currentPath, {
    activeOrderCode: contextEntities.activeOrderCode || undefined,
  });

  // ==========================================================================
  // GLOBAL: DETEKSI PERTANYAAN MODEL & PROVIDER AI (SEMUA ROLE & ADMIN)
  // ==========================================================================
  if (
    /model\s+(?:apa|ai|llm)|provider\s+(?:apa|ai)|kamu\s+(?:pakai|menggunakan|ditenagai|berbasis)\s+(?:model|ai|gemini|groq|llm|teknologi)|siapa\s+(?:otak|mesin|model)\s+ai|apa\s+model\s+(?:yang\s+)?(?:dipakai|digunakan|aktif)|model\s+yang\s+(?:sedang\s+)?(?:dipakai|digunakan|aktif)|versi\s+ai|provider\s+aktif|ai\s+provider/i.test(norm)
  ) {
    const snapshot = await AIProviderManager.getInstance().getActiveProviderSnapshot();
    const activeConf = snapshot.activeConfig;
    const global = snapshot.globalSettings;
    const statusBadge =
      activeConf.lastConnectionStatus === 'connected'
        ? '🟢 Terhubung & Normal'
        : activeConf.lastConnectionStatus === 'not_configured'
        ? '🟡 Belum Dikonfigurasi'
        : activeConf.lastConnectionStatus === 'connection_error'
        ? '🔴 Gangguan Koneksi'
        : '⚪ Disconnected';

    directReply = `🤖 **Informasi Model & Provider AI Aktif (BANTUIN Assistant):**

Saat ini asisten AI BANTUIN aktif beroperasi menggunakan:
- **Provider AI Aktif:** **${activeConf.name}** (\`${activeConf.provider}\`)
- **Model yang Digunakan:** **\`${activeConf.selectedModel}\`**
- **Status Koneksi:** ${statusBadge}
- **API Endpoint:** \`${activeConf.apiEndpoint}\`
- **Parameter Inferensi:**
  - Suhu (Temperature): \`${activeConf.temperature}\`
  - Max Output: \`${activeConf.maxOutputTokens} tokens\`
  - Request Timeout: \`${activeConf.requestTimeoutMs} ms\`
- **Fitur Automatic Fallback:** ${global.enableFallback ? `✅ Aktif (Otomatis beralih ke **${global.fallbackProvider.toUpperCase()}** jika provider utama kendala)` : '❌ Nonaktif'}

${userContext.role === 'admin' ? '💡 _Catatan Administrator: Anda dapat mengganti provider aktif, memilih model lain, atau menambah provider kustom kapan saja melalui menu **Pengaturan Sistem → AI Provider Management**._' : 'Asisten AI BANTUIN siap membantu kebutuhan konsultasi dan operasional servis peralatan rumah tangga Anda.'}`;
  }

  // ==========================================================================
  // A. KATEGORI KHUSUS GUEST (TAMU PUBLIK)
  // ==========================================================================
  if (userContext.role === 'guest') {
    if (/apa\s+itu\s+bantuin|tujuan\s+aplikasi|tentang\s+bantuin/i.test(norm)) {
      const guide = DataService.getAppGuide('tentang');
      directReply = `**${guide.title}**\n\n${guide.content}`;
    } else if (/layanan\s+(tersedia|apa\s+saja)|katalog|kategori\s+alat/i.test(norm)) {
      const categories = await DataService.getPublicApplianceCategories();
      directReply = `🏠 **Kategori Peralatan Rumah Tangga yang Dilayani BANTUIN:**\n\n` +
        categories.map((c, i) => `**${i + 1}. ${c.name}**\n${c.description ? `   _${c.description}_\n` : ''}`).join('\n') +
        `\nSemua perbaikan ditangani oleh mitra teknisi profesional tersertifikasi dan bergaransi 30 hari.`;
    } else if (/daftar|register|cara\s+mendaftar|apakah.*otp/i.test(norm)) {
      const guide = DataService.getAppGuide('daftar');
      directReply = `**${guide.title}**\n\n${guide.content}`;
    } else if (/login|masuk|cara\s+login/i.test(norm)) {
      const guide = DataService.getAppGuide('login');
      directReply = `**${guide.title}**\n\n${guide.content}`;
    } else if (/cara\s+pesan|proses\s+pemesanan|alur\s+pemesanan/i.test(norm)) {
      const guide = DataService.getAppGuide('alur');
      directReply = `**${guide.title}**\n\n${guide.content}`;
    } else if (/proses\s+perbaikan|alur\s+perbaikan/i.test(norm)) {
      const guide = DataService.getAppGuide('alur');
      directReply = `**${guide.title}**\n\n${guide.content}`;
    } else if (/cara\s+bayar|metode\s+pembayaran|pembayaran/i.test(norm)) {
      const guide = DataService.getAppGuide('bayar');
      directReply = `**${guide.title}**\n\n${guide.content}`;
    } else if (/garansi/i.test(norm)) {
      const guide = DataService.getAppGuide('garansi');
      directReply = `**${guide.title}**\n\n${guide.content}`;
    } else if (/pesanan\s+saya|status\s+perbaikan|tagihan\s+saya|profil\s+saya/i.test(norm)) {
      directReply = `Untuk mengakses data pribadi, melacak status pesanan, atau melihat tagihan perbaikan Anda, silakan **Masuk (Login)** terlebih dahulu ke akun BANTUIN Anda.`;
    } else if (/siapa\s+(?:\w+\s+){0,2}(?:nama\s+)?(?:pengguna|user|customer|pelanggan|teknisi|pemilik|akun)|nama\s+pengguna|pemilik\s+(?:nomor|no|email|akun)/i.test(norm) || contextEntities.activePhoneNumber || contextEntities.activeEmail) {
      directReply = `Untuk mengakses informasi pengguna, melacak pesanan, atau melihat riwayat perbaikan di BANTUIN, silakan **Masuk (Login)** terlebih dahulu menggunakan akun terdaftar Anda.`;
    }
  }

  // ==========================================================================
  // B. KATEGORI KHUSUS CUSTOMER (PELANGGAN)
  // ==========================================================================
  if (userContext.role === 'customer' && userContext.userId) {
    const custId = userContext.userId;

    // Profil Pelanggan & Pembaruan
    if (/siapa\s+nama\s+saya|email\s+yang\s+terdaftar|kapan\s+saya\s+mendaftar|profil\s+saya|profil.*lengkap|memperbarui\s+profil|data\s+diri/i.test(norm)) {
      const profile = await DataService.getCustomerProfile(custId);
      if (profile) {
        directReply = `👤 **Informasi Data Diri Anda (BANTUIN Customer):**
- **Nama Lengkap:** ${profile.fullName}
- **Email:** ${profile.email}
- **Nomor WhatsApp:** ${profile.phoneNumber} (${profile.isVerified ? '✅ Terverifikasi' : '⚠️ Belum Verifikasi'})
- **Alamat Tersimpan:** ${profile.defaultAddress}
- **Kota / Kode Pos:** ${profile.city} (${profile.postalCode})
- **Status Akun:** ${profile.status.toUpperCase()}
- **Terdaftar Sejak:** ${new Date(profile.registeredAt).toLocaleDateString('id-ID', { dateStyle: 'long' })}
- **Kelengkapan Profil:** ${profile.isProfileComplete ? '✅ Lengkap' : '⚠️ Belum Lengkap'}

💡 **Cara Memperbarui Profil:** Anda dapat memperbarui nama, nomor telepon, dan alamat utama melalui menu **Pengaturan Akun** di dashboard profil BANTUIN.`;
      } else {
        directReply = 'Data profil Anda belum tercatat lengkap di database BANTUIN. Silakan perbarui di menu profil dashboard.';
      }
    }

    // Larangan Mengakses Data Pengguna Lain (RBAC Customer Isolation)
    else if (/siapa\s+(?:nama\s+)?(?:pengguna|user|customer|pelanggan|teknisi|pemilik|akun)|pemilik\s+(?:nomor|no|email|akun)/i.test(norm) && (contextEntities.activePhoneNumber || contextEntities.activeEmail || /\d{8,15}/.test(norm))) {
      const targetPhone = contextEntities.activePhoneNumber || norm.match(/\d{8,15}/)?.[0];
      if (userContext.phoneNumber && targetPhone && (userContext.phoneNumber.includes(targetPhone) || targetPhone.includes(userContext.phoneNumber.replace(/[^0-9]/g, '')))) {
        const profile = await DataService.getCustomerProfile(custId);
        directReply = `👤 Nomor telepon \`${targetPhone}\` adalah nomor WhatsApp terdaftar milik akun Anda sendiri atas nama **${profile?.fullName || userContext.name}** (${profile?.isVerified ? '✅ Terverifikasi' : '⚠️ Belum Verifikasi'}).`;
      } else {
        directReply = `🛡️ **Akses Dibatasi (Keamanan & Privasi Data):**\n\nSesuai prinsip perlindungan privasi dan keamanan data BANTUIN, Anda hanya diizinkan mengakses informasi yang berkaitan dengan akun dan pesanan Anda sendiri. Anda tidak memiliki izin untuk mencari atau melihat data identitas pengguna lain.`;
      }
    }

    // Layanan yang tersedia
    else if (/layanan\s+apa\s+saja|katalog\s+layanan/i.test(norm)) {
      const categories = await DataService.getPublicApplianceCategories();
      directReply = `🏠 **Kategori Peralatan yang Dilayani BANTUIN:**\n\n` +
        categories.map((c, i) => `**${i + 1}. ${c.name}**\n${c.description ? `   _${c.description}_\n` : ''}`).join('\n') +
        `\nSilakan pilih layanan yang sesuai untuk mengajukan pemesanan teknisi resmi.`;
    }

    // Pembatalan Pesanan
    else if (/cara\s+membatalkan|batalkan\s+pesanan|batal\s+pesanan/i.test(norm)) {
      const guide = DataService.getCustomerCancellationGuide();
      directReply = `📋 **${guide.title}**\n\n${guide.content}`;
    }

    // Keluhan & Komplain
    else if (/menyampaikan\s+keluhan|ajukan\s+komplain|klaim\s+garansi|komplain/i.test(norm)) {
      const guide = DataService.getCustomerComplaintGuide();
      directReply = `🛡️ **${guide.title}**\n\n${guide.content}`;
    }

    // Tagihan & Invoice & Pembayaran
    else if (/tagihan|invoice|belum\s+dibayar|biaya\s+perbaikan|pembayaran\s+berhasil|riwayat\s+transaksi/i.test(norm)) {
      const invoices = await DataService.getCustomerInvoices(custId);
      if (invoices === null) {
        directReply = 'Tagihan Anda tidak dapat dibaca saat ini (database tidak dapat diakses). Coba lagi nanti.';
      } else if (invoices.length === 0) {
        directReply = `Saat ini tidak ada tagihan invoice aktif di akun Anda. Tagihan resmi baru akan diterbitkan secara transparan setelah teknisi menyelesaikan inspeksi/perbaikan dan disetujui oleh Anda.`;
      } else {
        directReply = `📋 **Data Tagihan Invoice Anda:**\n\n` +
          invoices.map((inv, i) => `**${i + 1}. Invoice ${inv.invoiceNumber}** (Order #${inv.orderCode})\n- Kategori: ${inv.categoryName}\n- Total Tagihan: **Rp ${inv.totalAmount.toLocaleString('id-ID')}**\n- Status Pembayaran: **${inv.status.toUpperCase()}**\n- Metode Pembayaran: ${inv.paymentMethod}\n- Jatuh Tempo: ${new Date(inv.dueDate).toLocaleDateString('id-ID')}\n`).join('\n') +
          `\nPembayaran dapat dilakukan aman menggunakan QRIS otomatis atau Transfer Virtual Account melalui aplikasi.`;
      }
    }

    // Komunikasi & Pesan dari Teknisi
    else if (/pesan\s+terbaru\s+dari\s+teknisi|catatan\s+terbaru|pesan\s+teknisi|hubungi\s+teknisi/i.test(norm)) {
      const messages = await DataService.getCustomerMessages(custId, contextEntities.activeOrderCode || 1);
      if (messages === null) {
        directReply = 'Pesan teknisi tidak dapat dibaca saat ini (database tidak dapat diakses). Coba lagi nanti.';
      } else if (messages.length === 0) {
        directReply = `Belum ada pesan chat terbaru dari teknisi untuk pesanan Anda. Anda dapat mengirim pesan langsung melalui fitur **Chat Pesanan** di aplikasi BANTUIN.`;
      } else {
        directReply = `💬 **Pesan Koordinasi Teknisi Terbaru:**\n\n` +
          messages.map((m, i) => `**${i + 1}. ${m.senderName}:**\n"${m.content}"\n_Waktu: ${new Date(m.createdAt).toLocaleString('id-ID')}_\n`).join('\n') +
          `\nAnda dapat membalas chat langsung melalui panel chat pesanan di aplikasi.`;
      }
    }

    // Teknisi Penangan
    else if (/siapa\s+teknisi|teknisi\s+yang\s+menangani|kontak\s+teknisi/i.test(norm)) {
      const repairs = await DataService.getCustomerRepairs(custId, { limit: 1 });
      if (repairs === null) {
        directReply = 'Pesanan Anda tidak dapat dibaca saat ini (database tidak dapat diakses). Coba lagi nanti.';
      } else if (repairs.length === 0) {
        directReply = `Anda belum memiliki pesanan perbaikan aktif di sistem BANTUIN. Silakan ajukan pesanan teknisi terlebih dahulu.`;
      } else {
        const r = repairs[0];
        if (r.technician) {
          directReply = `👨‍🔧 **Mitra Teknisi untuk Pesanan #${r.orderCode}:**
- **Nama Teknisi:** ${r.technician.name}
- **Rating Kepuasan:** ⭐ ${r.technician.rating.toFixed(1)} / 5.0
- **Status Pesanan:** ${r.status.toUpperCase()}
${r.technician.phone ? `- **Nomor Telepon Koordinasi:** ${r.technician.phone}` : ''}

Anda dapat berkomunikasi secara langsung dengan teknisi melalui fitur **Chat Pesanan** di aplikasi BANTUIN.`;
        } else {
          directReply = `Pesanan Anda #${r.orderCode} saat ini masih berstatus **${r.status.toUpperCase()}** dan sedang dalam proses pencocokan mitra teknisi terdekat. Kami akan segera memberi notifikasi ketika teknisi telah ditugaskan.`;
        }
      }
    }

    // Status Pesanan & Perkembangan Perbaikan
    else if (/status\s+pesanan|perkembangan\s+perbaikan|pesanan\s+saya|pesanan\s+terbaru|belum\s+diproses|sudah\s+selesai|diagnosis\s+kerusakan|tindakan\s+perbaikan|estimasi\s+perbaikan/i.test(norm) || contextEntities.activeOrderCode) {
      const specificOrderCode = contextEntities.activeOrderCode;
      let orderDetail = null;

      if (specificOrderCode) {
        orderDetail = await DataService.getCustomerRepairDetail(custId, specificOrderCode);
      }

      if (!orderDetail) {
        const repairs = await DataService.getCustomerRepairs(custId, { limit: 3 });
        if (repairs === null) {
          directReply = 'Pesanan Anda tidak dapat dibaca saat ini (database tidak dapat diakses). Coba lagi nanti.';
        } else if (repairs.length === 0) {
          directReply = `Saat ini Anda belum memiliki pesanan perbaikan aktif di database BANTUIN. Jika membutuhkan perbaikan AC, Kulkas, atau peralatan rumah tangga lainnya, silakan klik tombol **Pesan Layanan** di aplikasi.`;
        } else {
          directReply = `📋 **Daftar Pesanan Perbaikan Anda:**\n\n` +
            repairs.map((r, i) => `**${i + 1}. Pesanan #${r.orderCode}** (${r.categoryName})\n- Perangkat: ${r.device}\n- Status: **${r.status.toUpperCase()}**\n- Keluhan: ${r.problem}\n- Teknisi: ${r.technician?.name || 'Menunggu Penugasan'}\n- Estimasi/Biaya: ${r.diagnosis?.estimate ? `Rp ${r.diagnosis.estimate.toLocaleString('id-ID')}` : 'Menunggu Inspeksi'}\n`).join('\n') +
            `\nUntuk melihat linimasa lengkap atau live chat teknisi, silakan buka menu **Pesanan Saya**.`;
        }
      } else {
        directReply = `📋 **Rincian Status Pesanan #${orderDetail.orderCode}:**
- **Kategori:** ${orderDetail.categoryName} (${orderDetail.device})
- **Status Saat Ini:** **${orderDetail.status.toUpperCase()}**
- **Keluhan:** ${orderDetail.problem}
- **Teknisi Bertugas:** ${orderDetail.technician?.name || 'Menunggu Penugasan'}
${orderDetail.schedule ? `- **Jadwal Kunjungan:** ${orderDetail.schedule.date} (${orderDetail.schedule.timeSlot})` : ''}
${orderDetail.diagnosis ? `- **Hasil Diagnosis:** ${orderDetail.diagnosis.damageDetails}\n- **Estimasi Biaya:** Rp ${orderDetail.diagnosis.totalEstimate.toLocaleString('id-ID')} (Persetujuan: ${orderDetail.diagnosis.approvalStatus.toUpperCase()})` : ''}
${orderDetail.invoice ? `- **Status Tagihan:** Rp ${orderDetail.invoice.totalAmount.toLocaleString('id-ID')} (${orderDetail.invoice.status.toUpperCase()})` : ''}
- **Waktu Pengajuan:** ${new Date(orderDetail.createdAt).toLocaleString('id-ID')}`;
      }
    }
  }

  // ==========================================================================
  // C. KATEGORI KHUSUS TECHNICIAN (TEKNISI)
  // ==========================================================================
  if (userContext.role === 'technician' && userContext.userId) {
    const techId = userContext.userId;

    // Profil & Riwayat Kinerja Teknisi
    if (/siapa\s+nama\s+saya|profil\s+saya/i.test(norm)) {
      const [profile, metrics] = await Promise.all([
        DataService.getTechnicianProfile(techId),
        DataService.getTechnicianPerformanceMetrics(techId),
      ]);

      if (metrics === null) {
        directReply = 'Data kinerja Anda tidak dapat dibaca saat ini (database tidak dapat diakses). Coba lagi nanti.';
      } else {
        directReply = `👨‍🔧 **Ringkasan Profil & Aktivitas Kinerja Rekan Teknisi:**
- **Nama Lengkap:** ${profile?.fullName || userContext.name}
- **Email:** ${profile?.email}
- **Nomor WhatsApp:** ${profile?.phoneNumber}
- **Rating Rata-Rata:** ⭐ ${profile?.ratingAvg.toFixed(2)} (${profile?.ratingCount} ulasan)
- **Pengalaman:** ${profile?.experienceYears} Tahun
- **Keahlian:** ${profile?.specializations.join(', ') || 'Elektronik Rumah Tangga'}
- **Total Pekerjaan Selesai:** **${metrics.stats.completed} pesanan**
- **Tugas Aktif Saat Ini:** **${metrics.pendingTasksCount} tugas**
- **Rata-rata Waktu Penyelesaian:** ${metrics.averageCompletionHours}`;
      }
    }

    // Statistik & Laporan Pekerjaan Selesai / Waktu Penyelesaian
    else if (/jumlah\s+tugas|pekerjaan\s+yang\s+sudah\s+saya\s+selesai|pekerjaan\s+yang\s+sudah\s+selesai|tugas\s+yang\s+belum\s+selesai|rata-rata\s+waktu|pekerjaan\s+masih\s+tertunda|penyebab\s+pekerjaan\s+tertunda|ringkasan\s+aktivitas|ringkasan\s+pekerjaan|performa/i.test(norm)) {
      const metrics = await DataService.getTechnicianPerformanceMetrics(techId);
      if (metrics === null) {
        directReply = 'Data kinerja Anda tidak dapat dibaca saat ini (database tidak dapat diakses). Coba lagi nanti.';
      } else {
        directReply = `📊 **Laporan Kinerja & Aktivitas Pekerjaan Anda:**
- **Pekerjaan Selesai Tuntas:** **${metrics.stats.completed} pesanan**
- **Tugas Sedang Diterima / Berjalan:** **${metrics.stats.accepted} tugas**
- **Tawaran Tugas Baru (Offered):** **${metrics.stats.offered} tugas**
- **Tugas Belum Selesai (Pending):** **${metrics.pendingTasksCount} tugas**
- **Rata-rata Waktu Penyelesaian:** **${metrics.averageCompletionHours}**
- **Tugas Ditolak:** ${metrics.stats.rejected} tugas

💡 **Catatan Kinerja:** Pekerjaan tertunda umumnya disebabkan oleh waktu tunggu kedatangan suku cadang pengganti atau penyesuaian jadwal kunjungan ulang oleh pelanggan.`;
      }
    }

    // Manajemen Tugas & Tugas Hari Ini
    else if (/tugas\s+hari\s+ini|apa\s+saja\s+tugas|tugas\s+mana\s+yang\s+paling\s+mendesak|paling\s+mendesak|deadline|pekerjaan\s+terlambat|detail\s+perangkat|siapa\s+customer/i.test(norm)) {
      const tasks = await DataService.getTechnicianAssignedTasks(techId, { limit: 5 });
      if (tasks === null) {
        directReply = 'Daftar tugas Anda tidak dapat dibaca saat ini (database tidak dapat diakses). Coba lagi nanti.';
      } else if (tasks.length === 0) {
        directReply = `Halo Rekan Teknisi! Saat ini tidak ada tugas perbaikan aktif yang ditugaskan kepada Anda. Tetap pantau dashboard teknisi Anda.`;
      } else {
        directReply = `🛠️ **Daftar Tugas Perbaikan Anda:**\n\n` +
          tasks.map((t, i) => `**${i + 1}. Order #${t.orderCode}** (${t.categoryName} - ${t.device})\n- Status Tugas: **${t.assignmentStatus.toUpperCase()}** (Order: ${t.orderStatus})\n- Pelanggan: **${t.customerName}** (${t.customerPhone})\n- Alamat: ${t.address}\n- Keluhan: ${t.problem}\n- Jadwal: **${t.schedule}**\n- Urgensi: ${t.assignmentStatus === 'offered' ? '🔴 Butuh Konfirmasi Cepat' : '🟡 Dalam Jadwal'}\n`).join('\n') +
          `\nAnda dapat memperbarui status kunjungan langsung melalui asisten ini atau dashboard teknisi.`;
      }
    }

    // Diagnosis & Pemeriksaan Awal
    else if (/keluhan\s+customer|riwayat\s+kerusakan|penyebab\s+kerusakan|pemeriksaan\s+awal|rekomendasi\s+tindakan|catatan\s+diagnosis/i.test(norm)) {
      const tasks = await DataService.getTechnicianAssignedTasks(techId, { limit: 1 });
      if (tasks === null) {
        directReply = 'Data tugas Anda tidak dapat dibaca saat ini (database tidak dapat diakses). Coba lagi nanti.';
      } else if (tasks.length === 0) {
        directReply = `Belum ada tugas aktif untuk menampilkan data diagnosis.`;
      } else {
        const t = tasks[0];
        directReply = `🔍 **Data Diagnosis & Keluhan Tugas #${t.orderCode}:**
- **Perangkat:** ${t.device} (${t.categoryName})
- **Keluhan Pelanggan:** "${t.problem}"
- **Langkah Pemeriksaan Awal:** Periksa ampere beban, cek tegangan stopkontak, dan lakukan visual inspection pada komponen utama.
${t.diagnosis ? `- **Catatan Diagnosis:** ${t.diagnosis.damageDetails}\n- **Estimasi Biaya:** Rp ${t.diagnosis.estimate.toLocaleString('id-ID')} (Approval: ${t.diagnosis.approvalStatus})` : '- **Catatan Diagnosis:** Belum dilakukan pengisian form diagnosis di aplikasi.'}`;
      }
    }

    // Komunikasi dengan Customer
    else if (/customer\s+yang\s+harus\s+dihubungi|pesan\s+terbaru\s+dari\s+customer|informasi\s+yang\s+perlu\s+disampaikan/i.test(norm)) {
      const tasks = await DataService.getTechnicianAssignedTasks(techId, { limit: 1 });
      if (tasks === null) {
        directReply = 'Data tugas Anda tidak dapat dibaca saat ini (database tidak dapat diakses). Coba lagi nanti.';
      } else if (tasks.length === 0) {
        directReply = `Saat ini tidak ada customer dari tugas aktif yang perlu Anda hubungi.`;
      } else {
        const t = tasks[0];
        directReply = `📞 **Customer Tugas Aktif Anda (#${t.orderCode}):**
- **Nama Pelanggan:** ${t.customerName}
- **Nomor Kontak:** ${t.customerPhone}
- **Alamat Kunjungan:** ${t.address}
- **Informasi yang Perlu Disampaikan:** Konfirmasikan estimasi jam kedatangan, sampaikan SOP pemeriksaan awal, dan minta izin sebelum membongkar penutup unit.`;
      }
    }

    // SOP & Prosedur Operasional Teknisi
    else if (/sop\s+penerimaan|prosedur\s+pemeriksaan|prosedur\s+penggantian|tidak\s+dapat\s+diperbaiki|sop/i.test(norm)) {
      const sop = DataService.getTechnicianSOP(norm);
      directReply = `📘 **${sop.title}:**\n\n` + sop.steps.join('\n');
    }

    // Tindakan Aksi Teknisi: Perbarui Status
    // N4: kode order WAJIB disebut eksplisit di pesan yang sama
    // (orderCodeFromCurrentMessage === true). Jangan pernah mengeksekusi aksi
    // pada kode order yang diingat dari pesan lama (entitas sesi bisa
    // kedaluwarsa dan aksi akan mengubah pesanan yang salah).
    else if (/terima\s+tugas|menuju\s+lokasi|mulai\s+diagnosa|mulai\s+perbaikan/i.test(norm)) {
      const explicitOrderCode = contextEntities.orderCodeFromCurrentMessage === true
        ? contextEntities.activeOrderCode
        : null;
      if (!explicitOrderCode) {
        directReply = 'Untuk memperbarui status tugas, sebutkan kode ordernya di pesan yang sama, contoh: "terima tugas REP-2026-0001".';
      } else {
        let actionType: 'accept' | 'on_the_way' | 'start_diagnosis' | 'start_repair' = 'on_the_way';
        if (/terima/i.test(norm)) actionType = 'accept';
        else if (/diagnosa/i.test(norm)) actionType = 'start_diagnosis';
        else if (/perbaikan/i.test(norm)) actionType = 'start_repair';

        const actionResult = await ActionService.executeTechnicianTaskStatusUpdate(userContext, {
          orderCodeOrId: explicitOrderCode,
          newStatus: actionType,
          notes: userMessage,
        });

        directReply = actionResult.success
          ? `✅ **Berhasil:** ${actionResult.message}`
          : `⚠️ **Gagal:** ${actionResult.message}`;
      }
    }
  }

  // ==========================================================================
  // D. KATEGORI KHUSUS ADMINISTRATOR (ADMIN)
  // ==========================================================================
  if (userContext.role === 'admin') {
    // 0. Metrik tunggal yang lugas (jawab hanya angka yang ditanya)
    const singleMetric = norm.replace(/[?!.]+$/g, '').trim();
    if (/^(berapa\s+)?total\s+pendapatan$/.test(singleMetric) || singleMetric === 'pendapatan') {
      const finance = await DataService.getAdminFinancialAnalytics();
      directReply = finance === null ? 'Data tidak dapat dibaca saat ini (database tidak dapat diakses). Coba lagi nanti.' : `Total Pendapatan Terkonfirmasi: Rp ${finance.totalRevenuePaid.toLocaleString('id-ID')}`;
    } else if (/^(berapa\s+)?total\s+pengguna$/.test(singleMetric) || /^(berapa\s+)?jumlah\s+pengguna$/.test(singleMetric)) {
      const stats = await DataService.getAdminUserStats();
      directReply = stats === null ? 'Data tidak dapat dibaca saat ini (database tidak dapat diakses). Coba lagi nanti.' : `Total Pengguna Terdaftar: ${stats.totalUsers}`;
    } else if (/^(berapa\s+)?total\s+pesanan$/.test(singleMetric) || /^(berapa\s+)?jumlah\s+pesanan$/.test(singleMetric)) {
      const overview = await DataService.getAdminOperationalOverview();
      directReply = overview === null ? 'Data tidak dapat dibaca saat ini (database tidak dapat diakses). Coba lagi nanti.' : `Total Seluruh Pesanan: ${overview.orders.total} pesanan`;
    } else if (/^(berapa\s+)?total\s+(customer|pelanggan)$/.test(singleMetric) || /^(berapa\s+)?jumlah\s+(customer|pelanggan)$/.test(singleMetric)) {
      const custData = await DataService.getAdminCustomerAnalytics();
      directReply = custData === null ? 'Data tidak dapat dibaca saat ini (database tidak dapat diakses). Coba lagi nanti.' : `Total Pelanggan Terdaftar: ${custData.totalCustomers} akun`;
    } else if (/^(berapa\s+)?total\s+teknisi$/.test(singleMetric) || /^(berapa\s+)?jumlah\s+teknisi$/.test(singleMetric)) {
      const stats = await DataService.getAdminUserStats();
      directReply = stats === null ? 'Data tidak dapat dibaca saat ini (database tidak dapat diakses). Coba lagi nanti.' : `Total Mitra Teknisi: ${stats.technicians.total}`;
    } else if (/^(berapa\s+)?(total\s+|jumlah\s+)?pengguna\s+aktif$/.test(singleMetric)) {
      const stats = await DataService.getAdminUserStats();
      directReply = stats === null ? 'Data tidak dapat dibaca saat ini (database tidak dapat diakses). Coba lagi nanti.' : `Total Pengguna Aktif: ${stats.customers.active + stats.technicians.active + stats.admins.active}`;
    } else if (/^(berapa\s+)?(total\s+|jumlah\s+)?(customer|pelanggan)\s+aktif$/.test(singleMetric)) {
      const stats = await DataService.getAdminUserStats();
      directReply = stats === null ? 'Data tidak dapat dibaca saat ini (database tidak dapat diakses). Coba lagi nanti.' : `Total Pelanggan Aktif: ${stats.customers.active}`;
    } else if (/^(berapa\s+)?(total\s+|jumlah\s+)?teknisi\s+aktif$/.test(singleMetric)) {
      const stats = await DataService.getAdminUserStats();
      directReply = stats === null ? 'Data tidak dapat dibaca saat ini (database tidak dapat diakses). Coba lagi nanti.' : `Total Teknisi Aktif: ${stats.technicians.active}`;
    }

    // 0a. Daftar nama pengguna (mode list lugas: "siapa saja nama customer" -> list nama saja)
    else if (
      /siapa\s+(?:\w+\s+){0,2}(?:nama\s+)?(pengguna|user|customer|pelanggan|teknisi|pemilik|akun)|daftar\s+(?:nama\s+)?(pengguna|user|customer|pelanggan|teknisi|pemilik|akun)|list\s+(?:nama\s+)?(pengguna|user|customer|pelanggan|teknisi|pemilik|akun)/i.test(norm) &&
      !contextEntities.activePhoneNumber && !contextEntities.activeEmail && !contextEntities.activeUserUuid && !/\d{8,15}/.test(norm)
    ) {
      const listRoleMatch = norm.match(/(?:siapa\s+(?:\w+\s+){0,2}(?:nama\s+)?|daftar\s+(?:nama\s+)?|list\s+(?:nama\s+)?)(pengguna|user|customer|pelanggan|teknisi|pemilik|akun)/i);
      const roleWord = (listRoleMatch?.[1] || '').toLowerCase();
      const listRole = roleWord === 'customer' || roleWord === 'pelanggan' ? 'customer' : roleWord === 'teknisi' ? 'technician' : null;
      const roleLabel = listRole === 'customer' ? 'customer' : listRole === 'technician' ? 'teknisi' : 'pengguna';
      const wantsActiveOnly = /\baktif\b/i.test(norm) && !/tidak\s+aktif|nonaktif/i.test(norm);
      const names = await DataService.getUserNameList(listRole, 50, wantsActiveOnly ? 'active' : undefined);
      if (names === null) {
        directReply = 'Tidak dapat membaca daftar nama saat ini (database tidak dapat diakses). Coba lagi nanti.';
      } else if (names.length === 0) {
        directReply = wantsActiveOnly ? `Belum ada ${roleLabel} aktif terdaftar.` : `Belum ada ${roleLabel} terdaftar.`;
      } else {
        directReply = names.map((n, i) => `${i + 1}. ${n}`).join('\n');
      }
    }

    // 1. Dashboard, Total Pesanan & Status Perbaikan
    else if (/total\s+pesanan|pesanan\s+bulan\s+ini|pesanan\s+hari\s+ini|pesanan\s+yang\s+dibatalkan|pesanan\s+dibatalkan|perbaikan\s+berdasarkan\s+status|ringkasan\s+operasional|dashboard|operasional\s+hari\s+ini/i.test(norm)) {
      const overview = await DataService.getAdminOperationalOverview();
      if (overview === null) {
        directReply = 'Ringkasan operasional tidak dapat dibaca saat ini (database tidak dapat diakses). Coba lagi nanti.';
      } else {
        directReply = `📊 **Ringkasan Operasional & Total Pesanan BANTUIN (Admin Dashboard):**
- **Total Seluruh Pesanan:** **${overview.orders.total} pesanan**
- **Menunggu Penugasan (Submitted):** **${overview.orders.submitted}**
- **Penugasan Diterima (Assigned):** **${overview.orders.assigned}**
- **Terjadwal Kunjungan (Scheduled):** **${overview.orders.scheduled}**
- **Sedang Diagnosa (In Diagnosis):** **${overview.orders.inDiagnosis}**
- **Dalam Pengerjaan (In Repair):** **${overview.orders.inRepair}**
- **Selesai Tuntas (Completed):** **${overview.orders.completed}**
- **Pesanan Dibatalkan (Cancelled):** **${overview.orders.cancelled}**
- **Mitra Teknisi Aktif:** **${overview.technicians.active} teknisi**
- **Pelanggan Aktif Terdaftar:** **${overview.customers.active} akun**
- **Pengaduan Terbuka (Open Complaints):** **${overview.complaints.active} kasus**`;
      }
    }

    // 2. Analitik Customer / Pelanggan
    else if (/customer|pelanggan/i.test(norm) && /daftar|terbaru|baru|sering|terbanyak|belum\s+selesai|riwayat|total/i.test(norm)) {
      const custData = await DataService.getAdminCustomerAnalytics();
      if (custData === null) {
        directReply = 'Analitik pelanggan tidak dapat dibaca saat ini (database tidak dapat diakses). Coba lagi nanti.';
      } else {
        directReply = `👥 **Analisis Pelanggan BANTUIN (Customer Intelligence):**
- **Total Pelanggan Terdaftar:** **${custData.totalCustomers} akun**
- **Pelanggan Baru Bulan Ini:** **${custData.newCustomersThisMonth} pelanggan**

**Daftar Pelanggan Terbaru:**\n` +
        custData.recentCustomers.map((c, i) => `${i + 1}. **${c.name}** (${c.phone}) - Kota: ${c.city} - _Daftar: ${c.registeredAt}_`).join('\n') +
        `\n\n**Pelanggan dengan Pesanan Sedang Berjalan:**\n` +
        custData.pendingOrders.map((p, i) => `${i + 1}. **${p.customerName}** (Order #${p.orderCode}) - ${p.category} [${p.status.toUpperCase()}]`).join('\n');
      }
    }

    // 3. Analitik & Beban Kerja Mitra Teknisi
    else if (/teknisi/i.test(norm) && /total|aktif|terbanyak|tertunda|performa|rata-rata|beban\s+kerja|statistik/i.test(norm)) {
      const workload = await DataService.getAdminTechnicianWorkload();
      if (workload === null) {
        directReply = 'Data beban kerja teknisi tidak dapat dibaca saat ini (database tidak dapat diakses). Coba lagi nanti.';
      } else if (workload.length === 0) {
        directReply = 'Belum ada data teknisi yang tercatat di database BANTUIN.';
      } else {
        directReply = `👨‍🔧 **Analitik Kinerja & Beban Kerja Mitra Teknisi:**\n\n| No | Nama Teknisi | Rating | Tugas Aktif | Pekerjaan Selesai | Kesiapan |\n| :--- | :--- | :---: | :---: | :---: | :---: |\n` +
          workload.map((w, i) => `| ${i + 1} | ${w.name} | ⭐ ${w.ratingAvg.toFixed(1)} (${w.ratingCount}) | **${w.activeTasks}** | ${w.completedTasks} | ${w.isAvailable ? 'Aktif' : 'Sibuk'} |`).join('\n') +
          `\n_Catatan: Teknisi dengan beban kerja tertinggi diprioritaskan untuk penyeimbangan kuota order terdekat._`;
      }
    }

    // 4. Perbaikan Tertunda / Keterlambatan / Belum Diproses
    else if (/belum\s+diproses|belum\s+dapat\s+teknisi|belum\s+mendapatkan\s+teknisi|terlambat|keterlambatan|penyebab\s+keterlambatan|perbaikan\s+tertunda/i.test(norm)) {
      const delayed = await DataService.getAdminDelayedRepairs();
      if (delayed === null) {
        directReply = 'Data perbaikan tertunda tidak dapat dibaca saat ini (database tidak dapat diakses). Coba lagi nanti.';
      } else if (delayed.length === 0) {
        directReply = `✅ **Status Aman:** Saat ini tidak ada pesanan perbaikan yang terdeteksi mengalami keterlambatan atau penundaan kritis di sistem BANTUIN.`;
      } else {
        directReply = `⚠️ **Daftar Pesanan Memerlukan Perhatian (Tertunda / Unassigned):**\n\n` +
          delayed.map((d, i) => `**${i + 1}. Order #${d.orderCode}** (${d.categoryName})\n- Status: **${d.status.toUpperCase()}**\n- Durasi Tunggu: **${d.elapsedHours} jam**\n- Teknisi: ${d.technician}\n- Penyebab Keterlambatan: ${d.cause}\n`).join('\n');
      }
    }

    // 5. Keuangan & Transaksi Platform
    else if (/total\s+transaksi|pendapatan|omzet|tagihan\s+belum\s+dibayar|pembayaran\s+gagal|transaksi\s+berhasil|keuangan|laba/i.test(norm)) {
      const finance = await DataService.getAdminFinancialAnalytics();
      if (finance === null) {
        directReply = 'Data keuangan tidak dapat dibaca saat ini (database tidak dapat diakses). Coba lagi nanti.';
      } else {
        directReply = `💰 **Rekapitulasi Keuangan Platform BANTUIN:**
- **Total Seluruh Invoice:** ${finance.totalInvoices} tagihan
- **Total Pendapatan Terkonfirmasi (Lunas):** **Rp ${finance.totalRevenuePaid.toLocaleString('id-ID')}**
- **Total Biaya Platform (Platform Fee):** **Rp ${finance.totalPlatformFee.toLocaleString('id-ID')}**
- **Piutang Invoice Tertunggak (Unpaid):** **Rp ${finance.totalUnpaidAmount.toLocaleString('id-ID')}**\n\n**Sebaran Metode Pembayaran Berhasil:**\n` +
        finance.paymentMethodsBreakdown.map(p => `- ${p.method.toUpperCase()}: ${p.transactionCount} transaksi (Rp ${p.volume.toLocaleString('id-ID')})`).join('\n');
      }
    }

    // 6. Laporan & Analisis Strategis
    else if (/laporan\s+operasional|bandingkan\s+jumlah\s+pesanan|layanan\s+paling\s+diminati|kendala\s+operasional|tren\s+penyelesaian|rekomendasi\s+peningkatan\s+efisiensi/i.test(norm)) {
      const rep = await DataService.getAdminOperationalReport();
      if (rep === null) {
        directReply = 'Laporan operasional tidak dapat dibaca saat ini (database tidak dapat diakses). Coba lagi nanti.';
      } else {
        directReply = `📈 **Laporan Strategis Operasional Platform:**
- **Pesanan Bulan Ini:** **${rep.monthlyComparison.currentMonthOrders} pesanan** (Bulan Sebelumnya: ${rep.monthlyComparison.previousMonthOrders} | Pertumbuhan: **${rep.monthlyComparison.growthPercent}**)
- **Pendapatan Bulan Ini:** **${rep.monthlyComparison.currentMonthRevenue}** (Pertumbuhan: **${rep.monthlyComparison.revenueGrowthPercent}**)

**Layanan Paling Diminati:**\n` +
        rep.topServices.map((s, i) => `${i + 1}. **${s.name}**: ${s.requests} pesanan (${s.share})`).join('\n') +
        `\n\n**Kendala Operasional Sering Terjadi:**\n` +
        rep.frequentIssues.map(f => `- ${f.issue} (Dampak: ${f.impact})`).join('\n') +
        `\n\n**Rekomendasi Peningkatan Efisiensi:**\n` +
        rep.efficiencyRecommendations.map(r => `✅ ${r}`).join('\n');
      }
    }

    // 7. Notifikasi Gagal
    else if (/notifikasi.*gagal|gagal\s+dikirim/i.test(norm)) {
      const notif = await DataService.getAdminNotificationStatus();
      if (notif === null) {
        directReply = 'Status notifikasi tidak dapat dibaca saat ini (database tidak dapat diakses). Coba lagi nanti.';
      } else {
        directReply = `📱 **Status Pengiriman Notifikasi WhatsApp OTP:**
- **Total Notifikasi Terkirim:** **${notif.totalSent}**
- **Berhasil Diterima (Delivered):** **${notif.delivered}**
- **Gagal Dikirim (Failed):** **${notif.failed}**\n\n**Rincian Log Kegagalan:**\n` +
        notif.failedLogs.map((l, i) => `${i + 1}. Tujuan: \`${l.phone}\` - Penyebab: ${l.reason} (${l.createdAt})`).join('\n');
      }
    }

    // 8. Diagnostik Sistem, Database, OTP & AI
    else if (/status\s+database|layanan\s+otp|gemini\s+api|status\s+sistem|kesehatan\s+sistem/i.test(norm)) {
      const health = await DataService.getAdminSystemHealth();
      directReply = `🖥️ **Laporan Status Kesehatan Sistem BANTUIN:**
- **Basis Data MySQL 8.0:** ${health.database.connected ? '✅ Terhubung Normal' : '❌ Terputus'} (Latensi: ${health.database.latencyMs} ms)
- **Gateway WhatsApp OTP (Fonnte):** Status Terakhir: **${health.whatsappFonnte.lastStatus.toUpperCase()}**
- **Model Gemini AI:** ${health.geminiAi.model} (${health.geminiAi.apiKeyConfigured ? '✅ Kunci API Terkonfigurasi' : '⚠️ API Key Belum Disetel'})
- **Waktu Server:** ${new Date(health.serverTime).toLocaleString('id-ID')}`;
    }

    // 9. Pengaturan Konfigurasi Sistem
    else if (/konfigurasi|system\s+settings|pengaturan\s+aplikasi|pengaturan\s+sistem/i.test(norm)) {
      const settings = await DataService.getAdminSystemSettings();
      if (settings === null) {
        directReply = 'Pengaturan sistem tidak dapat dibaca saat ini (database tidak dapat diakses). Coba lagi nanti.';
      } else if (settings.length === 0) {
        directReply = 'Belum ada pengaturan sistem yang tercatat di database BANTUIN.';
      } else {
        directReply = `⚙️ **Pengaturan Konfigurasi Sistem BANTUIN (Admin View):**\n\n` +
          settings.map((s, i) => `**${i + 1}. ${s.key}** [${s.group}]\n- Nilai: \`${s.value}\`\n${s.description ? `- Deskripsi: ${s.description}\n` : ''}`).join('\n');
      }
    }

    // 10. Log Audit Aktivitas Admin
    else if (/audit\s+log|aktivitas\s+administrasi|jejak\s+audit/i.test(norm)) {
      const logs = await DataService.getAdminRecentAuditLogs(5);
      if (logs === null) {
        directReply = 'Log audit tidak dapat dibaca saat ini (database tidak dapat diakses). Coba lagi nanti.';
      } else if (logs.length === 0) {
        directReply = 'Belum ada aktivitas administrator yang tercatat di database BANTUIN.';
      } else {
        directReply = `📜 **Riwayat Aktivitas Administrator Terbaru (Audit Trail):**\n\n` +
          logs.map((l, i) => `**${i + 1}. Aksi: ${l.action}**\n- Entitas: \`${l.entityName}\` (ID: ${l.entityId})\n- Admin: ${l.adminEmail}\n- Waktu: ${new Date(l.createdAt).toLocaleString('id-ID')}\n`).join('\n');
      }
    }

    // 11. Statistik Pengguna Berdasarkan Role
    else if (/total\s+pengguna|statistik\s+user|jumlah\s+user|pengguna\s+berdasarkan\s+role/i.test(norm)) {
      const stats = await DataService.getAdminUserStats();
      if (stats === null) {
        directReply = 'Statistik pengguna tidak dapat dibaca saat ini (database tidak dapat diakses). Coba lagi nanti.';
      } else {
        directReply = `👥 **Statistik Pengguna Sistem BANTUIN:**
- **Total Pengguna Terdaftar:** **${stats.totalUsers}**
- **Pelanggan (Customer):** ${stats.customers.total} (${stats.customers.active} Aktif, ${stats.customers.pending} Menunggu OTP)
- **Mitra Teknisi:** ${stats.technicians.total} (${stats.technicians.active} Aktif, ${stats.technicians.pending} Menunggu Verifikasi)
- **Administrator:** ${stats.admins.total} Akun`;
      }
    }

    // 12. Pencarian Pengguna Berdasarkan Nomor Telepon, Email, UUID, atau Nama (Admin User Search)
    else if (
      /siapa\s+(?:\w+\s+){0,2}(?:nama\s+)?(?:pengguna|user|customer|pelanggan|teknisi|pemilik|akun)|nama\s+pengguna|pemilik\s+(?:nomor|no|email|akun)|cari\s+(?:pengguna|user|customer|pelanggan|teknisi)|data\s+(?:pengguna|user|customer|pelanggan|teknisi)/i.test(norm) ||
      ((norm.includes('telepon') || norm.includes('phone') || norm.includes('no hp') || norm.includes('nomor') || norm.includes('email') || norm.includes('uuid')) &&
        Boolean(contextEntities.activePhoneNumber || contextEntities.activeEmail || contextEntities.activeUserUuid || /\d{8,15}/.test(norm)))
    ) {
      const searchTerm = contextEntities.activePhoneNumber ||
        contextEntities.activeEmail ||
        contextEntities.activeUserUuid ||
        norm.match(/\b\d{8,15}\b/)?.[0] ||
        userMessage.replace(/siapa\s+nama\s+pengguna\s+(?:dengan\s+)?(?:nomor\s+telepon|email|uuid|nama)?/i, '').replace(/cari\s+(?:pengguna|user|customer|teknisi)/i, '').trim();

      const matchedUsers = await DataService.searchDatabaseUsers(searchTerm, { limit: 5 });
      if (matchedUsers.length === 0) {
        directReply = `🔍 **Hasil Pencarian Basis Data Pengguna:**\n\nBerdasarkan pencarian pada sistem BANTUIN, data pengguna dengan kata kunci \`${searchTerm}\` **tidak ditemukan** dalam database pengguna aktif maupun arsip.\n\nPastikan nomor telepon, alamat email, atau UUID yang dimasukkan sudah benar dan terdaftar di BANTUIN.`;
      } else {
        directReply = `👤 **Hasil Pencarian Basis Data Pengguna (Admin Console):**\n\n` +
          matchedUsers.map((u, i) => {
            const roleBadge = u.role === 'customer' ? 'Pelanggan (Customer)' : u.role === 'technician' ? 'Mitra Teknisi' : 'Administrator';
            return `**${i + 1}. Data Pengguna #${u.id}:**
- **Nama Lengkap:** **${u.fullName}**
- **Peran (Role):** **${roleBadge}**
- **Nomor Telepon / WA:** \`${u.phoneNumber}\` (${u.isVerified ? '✅ Terverifikasi' : '⚠️ Belum Verifikasi'})
- **Alamat Email:** \`${u.email}\`
- **Status Akun:** **${u.status.toUpperCase()}**
${u.city ? `- **Kota Domisili:** ${u.city}` : ''}
${u.address ? `- **Alamat Tersimpan:** ${u.address}` : ''}
${u.technicianDetails ? `- **Rating Teknisi:** ⭐ ${u.technicianDetails.ratingAvg.toFixed(1)} (${u.technicianDetails.ratingCount} ulasan) | Pengalaman: ${u.technicianDetails.yearsOfExperience} Tahun` : ''}
- **UUID Sistem:** \`${u.uuid}\`
- **Terdaftar Pada:** ${new Date(u.registeredAt).toLocaleDateString('id-ID', { dateStyle: 'long' })}`;
          }).join('\n\n') +
          `\n\n💡 _Catatan Admin: Untuk mengelola status akun, verifikasi, atau riwayat transaksi pengguna ini, silakan buka menu **Manajemen Pengguna** di Admin Console._`;
      }
    }

    // 13. Pencarian & Detail Pesanan Spesifik (Order Lookup)
    else if (contextEntities.activeOrderCode || /detail\s+pesanan|cari\s+pesanan|status\s+order|lacak\s+order/i.test(norm)) {
      const orderSearchTerm = contextEntities.activeOrderCode || norm.match(/\b(?:REP|BAN|ORD)-[A-Za-z0-9-]+\b/i)?.[0] || '';
      if (orderSearchTerm) {
        const orders = await DataService.searchDatabaseOrders(orderSearchTerm, { limit: 3 });
        if (orders.length > 0) {
          directReply = `📋 **Rincian Pesanan Perbaikan Basis Data (Admin Intelligence):**\n\n` +
            orders.map((o, i) => `**${i + 1}. Pesanan #${o.orderCode}** (${o.category})
- **Perangkat:** ${o.device}
- **Status Operasional:** **${o.status.toUpperCase()}**
- **Keluhan:** "${o.problem}"
- **Pelanggan:** **${o.customerName}** (\`${o.customerPhone}\`)
- **Lokasi Pengerjaan:** ${o.address}
- **Teknisi Bertugas:** **${o.technicianName}** ${o.technicianRating ? `(⭐ ${o.technicianRating.toFixed(1)})` : ''}
- **Tagihan Invoice:** ${o.invoiceNumber ? `\`${o.invoiceNumber}\` - Rp ${o.totalAmount?.toLocaleString('id-ID')} [${o.invoiceStatus.toUpperCase()}]` : 'Belum Diterbitkan'}
- **Waktu Diajukan:** ${new Date(o.createdAt).toLocaleString('id-ID')}`).join('\n\n');
        }
      }
    }

    // 14. Pencarian Tagihan Invoice Spesifik (Invoice Lookup)
    else if (contextEntities.activeInvoiceNumber || /tagihan\s+invoice|cek\s+invoice|nomor\s+invoice/i.test(norm)) {
      const invSearchTerm = contextEntities.activeInvoiceNumber || norm.match(/\bINV-[A-Za-z0-9-]+\b/i)?.[0] || '';
      if (invSearchTerm) {
        const invoices = await DataService.searchDatabaseInvoices(invSearchTerm, { limit: 3 });
        if (invoices.length > 0) {
          directReply = `📋 **Data Tagihan Invoice Basis Data (Admin View):**\n\n` +
            invoices.map((inv, i) => `**${i + 1}. Invoice #${inv.invoiceNumber}** (Order #${inv.orderCode})
- **Kategori Layanan:** ${inv.category}
- **Nama Pelanggan:** **${inv.customerName}** (\`${inv.customerPhone}\`)
- **Rincian Biaya:** Jasa Rp ${inv.laborCost.toLocaleString('id-ID')} | Suku Cadang Rp ${inv.partsCost.toLocaleString('id-ID')} | Biaya Layanan Rp ${inv.serviceFee.toLocaleString('id-ID')}
- **Total Pembayaran:** **Rp ${inv.totalAmount.toLocaleString('id-ID')}**
- **Status Tagihan:** **${inv.status.toUpperCase()}**
- **Jatuh Tempo:** ${new Date(inv.dueDate).toLocaleDateString('id-ID')}`).join('\n\n');
        }
      }
    }

    // 15. Skema & Metadata Basis Data (Database Architecture Inspection)
    else if (/struktur\s+database|skema\s+database|metadata\s+tabel|daftar\s+tabel|relasi\s+tabel/i.test(norm)) {
      const schemaSummary = getRoleFilteredSchemaSummary('admin');
      directReply = `🗄️ **Arsitektur & Skema Basis Data BANTUIN (MySQL 8.0):**\n\n${schemaSummary}\n\n💡 Seluruh akses query pada BANTUIN diproteksi oleh Row-Level Security, parameterized queries, dan whitelist column projection untuk menjamin integritas data dan kepatuhan UU PDP.`;
    }
  }

  // JIKA DATA DAPAT DIJAWAB LANGSUNG SECARA DETERMINISTIK OLEH DATA SERVICE
  if (directReply) {
    const finalReply = `${safetyAlertPrefix}${directReply}`;
    const metadata: ChatMessageMetadata = {
      model: 'bantuin-database-intelligence-v1',
      responseTimeMs: Date.now() - startTime,
      quickSuggestions: dynamicSuggestions,
    };

    await saveChatMessage(session.id, 'user', userMessage);
    await saveChatMessage(session.id, 'assistant', finalReply, metadata, 0, metadata.responseTimeMs);

    return {
      reply: finalReply,
      metadata,
    };
  }

  // ==========================================================================
  // E. PEMANGGILAN MULTI-PROVIDER AI (GEMINI & GROQ VIA AI PROVIDER MANAGER)
  // ==========================================================================
  // Jika pemanggilan AI gagal, simpan alasannya agar fallback expert system
  // di bawah TIDAK menyamar sebagai jawaban AI (lihat bagian F).
  let aiGatewayError: string | null = null;

  if (process.env.FORCE_OFFLINE_AI !== 'true') {
    try {
      const providerManager = AIProviderManager.getInstance();
      const snapshot = await providerManager.getActiveProviderSnapshot();
      const hasActiveKey = Boolean(snapshot.activeConfig.apiKey && snapshot.activeConfig.apiKey.trim());
      const hasFallbackKey = Boolean(snapshot.fallbackConfig && snapshot.fallbackConfig.apiKey && snapshot.fallbackConfig.apiKey.trim());

      if (hasActiveKey || hasFallbackKey) {
        // Siapkan ringkasan konteks database aktual untuk pengguna ini
        if (userContext.role === 'customer' && userContext.userId) {
          const [profile, repairs, invoices] = await Promise.all([
            DataService.getCustomerProfile(userContext.userId),
            DataService.getCustomerRepairs(userContext.userId, { limit: 3 }),
            DataService.getCustomerInvoices(userContext.userId),
          ]);
          // N1: repairs/invoices null saat DB error (kosong = []).
          const repairsList = repairs || [];
          const invoicesList = invoices || [];
          if (repairs === null || invoices === null) {
            dbContextSummary += 'Data pesanan/tagihan tidak dapat dibaca saat ini (database tidak dapat diakses).\n';
          }
          dbContextSummary += `Profil Customer: Nama: ${profile?.fullName || '-'}, Telp: ${profile?.phoneNumber || '-'}, Alamat: ${profile?.defaultAddress || '-'}\n`;
          dbContextSummary += `Pesanan Terkini: ${repairsList.length} pesanan tercatat.\n`;
          repairsList.forEach(r => {
            dbContextSummary += `  - Order #${r.orderCode}: Alat: ${r.device} (${r.categoryName}), Status: ${r.status}, Teknisi: ${r.technician?.name || 'Belum ada'}\n`;
          });
          dbContextSummary += `Tagihan Invoice: ${invoicesList.length} invoice (${invoicesList.filter(i => i.status === 'unpaid').length} belum lunas).\n`;
        } else if (userContext.role === 'technician' && userContext.userId) {
          const tasks = await DataService.getTechnicianAssignedTasks(userContext.userId, { limit: 5 });
          const tasksList = tasks || [];
          if (tasks === null) {
            dbContextSummary += 'Data tugas tidak dapat dibaca saat ini (database tidak dapat diakses).\n';
          }
          dbContextSummary += `Tugas Aktif Teknisi: ${tasksList.length} penugasan.\n`;
          tasksList.forEach(t => {
            dbContextSummary += `  - Order #${t.orderCode}: Pelanggan: ${t.customerName}, Status: ${t.assignmentStatus}, Alamat: ${t.address}\n`;
          });
        } else if (userContext.role === 'admin') {
          const [overview, workload, finance, userStats] = await Promise.all([
            DataService.getAdminOperationalOverview(),
            DataService.getAdminTechnicianWorkload(),
            DataService.getAdminFinancialAnalytics(),
            DataService.getAdminUserStats(),
          ]);
          // N1: overview/finance/userStats null saat DB error (kosong = objek 0).
          if (overview === null || finance === null || userStats === null) {
            dbContextSummary += 'Ringkasan admin tidak dapat dibaca saat ini (database tidak dapat diakses).\n';
          } else {
            const totalActiveUsers = userStats.customers.active + userStats.technicians.active + userStats.admins.active;
            dbContextSummary += `Ringkasan Admin: Total Pesanan: ${overview.orders.total}, Menunggu: ${overview.orders.submitted}, Dikerjakan: ${overview.orders.inRepair}, Selesai: ${overview.orders.completed}, Mitra Teknisi Aktif: ${overview.technicians.active}, Pelanggan Aktif: ${overview.customers.active}, Total Pengguna Aktif: ${totalActiveUsers}, Total Pengguna Terdaftar: ${userStats.totalUsers}\n`;
            dbContextSummary += `Keuangan: Total Pendapatan: Rp ${finance.totalRevenuePaid.toLocaleString('id-ID')}, Piutang Tertunggak: Rp ${finance.totalUnpaidAmount.toLocaleString('id-ID')}, Total Invoice: ${finance.totalInvoices}\n`;
          }
          dbContextSummary += `Teknisi: ${(workload || []).length} mitra teknisi aktif terdaftar.\n`;

          if (currentPath.includes('/admin/users') || contextEntities.activePhoneNumber || contextEntities.activeEmail || contextEntities.activeUserUuid) {
            const userRecords = await DataService.searchDatabaseUsers(
              contextEntities.activePhoneNumber || contextEntities.activeEmail || contextEntities.activeUserUuid || '',
              { limit: 6 }
            );
            if (userRecords.length > 0) {
              dbContextSummary += `\nDaftar Pengguna Relevan Basis Data:\n` +
                userRecords.map(u => `  - ID #${u.id} (${u.fullName}): Role: ${u.role}, Email: ${u.email}, Telp: ${u.phoneNumber}, Status: ${u.status}, UUID: ${u.uuid}`).join('\n') + '\n';
            }
          }
          if (currentPath.includes('/admin/repairs') || contextEntities.activeOrderCode) {
            const orderRecords = await DataService.searchDatabaseOrders(contextEntities.activeOrderCode || '', { limit: 5 });
            if (orderRecords.length > 0) {
              dbContextSummary += `\nDaftar Pesanan Relevan Basis Data:\n` +
                orderRecords.map(o => `  - Order #${o.orderCode}: Alat: ${o.device} (${o.category}), Status: ${o.status}, Pelanggan: ${o.customerName} (${o.customerPhone})`).join('\n') + '\n';
            }
          }
        }

        const activeSnapshot = await providerManager.getActiveProviderSnapshot();
        const systemPrompt = buildSystemPrompt(userContext, dbContextSummary, {
          activeProvider: activeSnapshot.activeConfig.provider,
          providerName: activeSnapshot.activeConfig.name,
          activeModel: activeSnapshot.activeConfig.selectedModel,
        });

        const universalTools: UniversalToolDeclaration[] = [
          {
            name: 'searchDatabaseUsers',
            description: 'Mencari data pengguna (customer, teknisi, admin) berdasarkan nomor telepon, email, nama lengkap, atau UUID di seluruh basis data BANTUIN.',
            parameters: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'Kata kunci pencarian: nomor telepon (cth 628... / 08...), alamat email, nama lengkap, atau UUID pengguna' },
              },
              required: ['query'],
            },
          },
          {
            name: 'searchDatabaseOrders',
            description: 'Mencari pesanan perbaikan berdasarkan kode pesanan (#BAN-..., #REP-...), nama customer, nama alat, atau status operasional.',
            parameters: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'Kode pesanan (#BAN-...), nama customer, nama alat, atau status' },
              },
              required: ['query'],
            },
          },
          {
            name: 'searchDatabaseInvoices',
            description: 'Mencari data tagihan invoice berdasarkan nomor invoice (#INV-...) atau kode pesanan (#BAN-...).',
            parameters: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'Nomor invoice (#INV-...) atau kode pesanan' },
              },
              required: ['query'],
            },
          },
          {
            name: 'searchDatabaseTechnicians',
            description: 'Mencari data mitra teknisi berdasarkan nama atau keahlian spesialisasi.',
            parameters: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'Nama teknisi atau kata kunci spesialisasi' },
              },
              required: ['query'],
            },
          },
          {
            name: 'queryDatabase',
            description: 'Kueri BACA data dari tabel database BANTUIN mana pun yang diizinkan untuk peran pengguna. Gunakan untuk pertanyaan data apa pun yang tidak terjawab alat pencarian lain: total, jumlah, daftar, rekap, dan perbandingan. Hanya SELECT; server yang membangun SQL-nya dan menegakkan izin peran, kolom sensitif tidak pernah dikembalikan. Satu putaran tool saja: bila perlu beberapa kueri, panggil queryDatabase beberapa kali sekaligus.',
            parameters: {
              type: 'object',
              properties: {
                table: { type: 'string', description: 'Nama tabel (misal: repair_requests, invoices, users, customer_profiles, technician_profiles, payments, services)' },
                columns: { type: 'string', description: 'Kolom yang diambil, dipisah koma (misal: "full_name,email" atau "customer_profiles.full_name"). Kosongkan untuk semua kolom non-sensitif.' },
                joins: { type: 'string', description: 'Tabel yang di-JOIN, dipisah koma (relasi harus ada di skema; misal: "customer_profiles" saat tabel dasar repair_requests)' },
                filterColumn: { type: 'string', description: 'Kolom filter pertama (misal: "current_status" atau "invoices.status")' },
                filterOperator: { type: 'string', enum: ['=', '!=', '>', '>=', '<', '<=', 'LIKE', 'IN'], description: 'Operator filter pertama' },
                filterValue: { type: 'string', description: 'Nilai filter pertama. Untuk LIKE: substring yang dicari. Untuk IN: beberapa nilai dipisah koma.' },
                filterColumn2: { type: 'string', description: 'Kolom filter kedua (opsional)' },
                filterOperator2: { type: 'string', enum: ['=', '!=', '>', '>=', '<', '<=', 'LIKE', 'IN'], description: 'Operator filter kedua' },
                filterValue2: { type: 'string', description: 'Nilai filter kedua' },
                aggregateFunction: { type: 'string', enum: ['count', 'sum', 'avg', 'min', 'max'], description: 'Fungsi agregasi (misal: "sum" untuk total, "count" untuk jumlah)' },
                aggregateColumn: { type: 'string', description: 'Kolom yang diagregasi (misal: "total_amount"; kosongkan untuk count semua baris)' },
                groupBy: { type: 'string', description: 'Kolom GROUP BY (misal: "current_status" untuk rekap per status)' },
                orderByColumn: { type: 'string', description: 'Kolom pengurutan' },
                orderByDirection: { type: 'string', enum: ['ASC', 'DESC'], description: 'Arah pengurutan' },
                limit: { type: 'number', description: 'Maksimal baris (default 20, maks 100)' },
              },
              required: ['table'],
            },
          },
        ];

        // Susun histori chat untuk Universal Messages
        const universalMessages: UniversalChatMessage[] = [
          { role: 'system', content: systemPrompt },
        ];

        for (const h of rawHistory) {
          if (!h.message || !h.message.trim()) continue;
          const role = h.role === 'assistant' ? 'assistant' : 'user';
          if (universalMessages.length > 1 && universalMessages[universalMessages.length - 1].role === role) {
            universalMessages[universalMessages.length - 1].content += `\n${h.message}`;
          } else {
            universalMessages.push({ role, content: h.message });
          }
        }

        while (universalMessages.length > 1 && universalMessages[1].role !== 'user') {
          universalMessages.splice(1, 1);
        }

        if (universalMessages.length > 1 && universalMessages[universalMessages.length - 1].role === 'user') {
          universalMessages[universalMessages.length - 1].content += `\n${userMessage}`;
        } else {
          universalMessages.push({ role: 'user', content: userMessage });
        }

        // Panggil provider AI aktif melalui AIProviderManager
        let aiResponse = await providerManager.generateChatCompletion({
          messages: universalMessages,
          tools: universalTools,
          sessionId: session.id,
          userRole: userContext.role,
        });

        // Tangani pemanggilan function calling (Tool Execution) secara multi-turn
        if (aiResponse.toolCalls && aiResponse.toolCalls.length > 0) {
          const assistantTurn: UniversalChatMessage = {
            role: 'assistant',
            content: aiResponse.content || '',
            toolCalls: aiResponse.toolCalls,
          };
          universalMessages.push(assistantTurn);

          for (const tc of aiResponse.toolCalls) {
            const toolResult = await executeRoleBasedTool(tc.name, tc.arguments, userContext);
            universalMessages.push({
              role: 'tool',
              toolCallId: tc.id,
              name: tc.name,
              content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult),
            });
          }

          // Request follow-up completion setelah tool dijalankan
          aiResponse = await providerManager.generateChatCompletion({
            messages: universalMessages,
            sessionId: session.id,
            userRole: userContext.role,
          });
        }

        let fullText = aiResponse.content || '';

        // Ekstrak diagnosisCard jika ada
        let extractedCard: DiagnosisCard | null = null;
        let cleanedText = fullText;

        const jsonMatch = fullText.match(/```json\s*(\{[\s\S]*?\})\s*```/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[1]);
            if (parsed.diagnosisCard) {
              extractedCard = parsed.diagnosisCard;
              cleanedText = fullText.replace(jsonMatch[0], '').trim();
            }
          } catch {
            // ignore parsing error
          }
        }

        const finalReply = `${safetyAlertPrefix}${cleanedText}`;
        const metadata: ChatMessageMetadata = {
          model: `${aiResponse.provider}:${aiResponse.model}${aiResponse.isFallback ? ' (fallback)' : ''}`,
          responseTimeMs: aiResponse.latencyMs,
          diagnosisCard: extractedCard,
          quickSuggestions: dynamicSuggestions,
        };

        await saveChatMessage(session.id, 'user', userMessage);
        await saveChatMessage(session.id, 'assistant', finalReply, metadata, 0, metadata.responseTimeMs);

        if (extractedCard) {
          let catId = session.categoryId;
          if (!catId && extractedCard.categorySlug) {
            const catRows = await query<any[]>(
              `SELECT id FROM appliance_categories WHERE slug = ? LIMIT 1`,
              [extractedCard.categorySlug]
            );
            if (catRows.length > 0) catId = Number(catRows[0].id);
          }

          await updateSessionDiagnosis(session.id, {
            categoryId: catId,
            initialSymptoms: extractedCard.symptomsSummary,
            preliminaryDiagnosis: extractedCard.possibleCauses.join('; '),
            recommendedAction: extractedCard.recommendedAction,
          });
        }

        return {
          reply: finalReply,
          metadata,
          diagnosisCard: extractedCard,
        };
      }
    } catch (err: any) {
      aiGatewayError = err?.message || String(err);
      console.warn('[AI Provider Gateway] Menggunakan fallback BANTUIN Database Expert System:', aiGatewayError);
    }
  }

  // ==========================================================================
  // F. FALLBACK INTELLIGENT EXPERT SYSTEM (DIAGNOSIS & APP GUIDANCE)
  // ==========================================================================
  const fallback = getExpertSystemDiagnosis(
    userMessage,
    session.categorySlug || validation.detectedCategory,
    userContext
  );

  // Jika AI sempat dicoba tetapi gagal, JANGAN menyajikan jawaban expert system
  // seolah-olah berasal dari AI. Beri label yang jelas beserta alasannya, agar
  // admin dan pengguna tahu provider AI sedang tidak terhubung.
  const offlineNotice = aiGatewayError
    ? `⚠️ *Mode offline:* layanan AI sedang tidak tersedia (${aiGatewayError}), jadi jawaban berikut berasal dari sistem pakar BANTUIN, bukan dari AI.\n\n`
    : '';
  const finalReply = `${safetyAlertPrefix}${offlineNotice}${fallback.reply}`;
  const metadata: ChatMessageMetadata = {
    model: 'bantuin-expert-system-v1',
    responseTimeMs: Date.now() - startTime,
    diagnosisCard: fallback.card || null,
    quickSuggestions: fallback.quickSuggestions,
    aiError: aiGatewayError,
  };

  await saveChatMessage(session.id, 'user', userMessage);
  await saveChatMessage(session.id, 'assistant', finalReply, metadata, 0, metadata.responseTimeMs);

  if (fallback.card) {
    const targetCatId = session.categoryId || fallback.detectedCategoryId;
    await updateSessionDiagnosis(session.id, {
      categoryId: targetCatId,
      initialSymptoms: fallback.card.symptomsSummary,
      preliminaryDiagnosis: fallback.card.possibleCauses.join('; '),
      recommendedAction: fallback.card.recommendedAction,
    });
  }

  return {
    reply: finalReply,
    metadata,
    diagnosisCard: fallback.card || null,
  };
}
