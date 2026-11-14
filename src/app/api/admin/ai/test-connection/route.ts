import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { AIProviderManager } from '@/lib/ai/provider-manager';
import { getProviderRuntimeConfig } from '@/lib/ai/repository';
import { checkAdminAiRateLimit } from '@/lib/rate-limiter';
import { AIProviderType } from '@/lib/ai/types';

/**
 * POST /api/admin/ai/test-connection
 * Menjalankan uji koneksi langsung ke provider AI tanpa mengubah status provider aktif
 */
export async function POST(req: NextRequest) {
  try {
    const adminSession = await getAdminSession();
    if (!adminSession || adminSession.role !== 'admin') {
      return NextResponse.json(
        { success: false, message: 'Akses ditolak: Hanya administrator yang dapat menguji koneksi AI.' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { provider, apiEndpoint, apiKey, selectedModel, usesStoredCredentials, requestTimeoutMs } = body;

    if (!provider || typeof provider !== 'string' || !provider.trim()) {
      return NextResponse.json(
        { success: false, message: "Parameter 'provider' wajib diisi." },
        { status: 400 }
      );
    }

    // M2: normalisasi slug provider (trim + lowercase) agar konsisten dengan
    // slug tersimpan di database.
    const normalizedProvider = provider.trim().toLowerCase() as AIProviderType;

    // L8: batasi tes koneksi per admin per provider (10 tes/menit) — setiap
    // tes melakukan lookup DNS + 2 request HTTPS ke provider dan menulis
    // baris log ke DB. Dicek SEBELUM inferensi kredensial (yang membaca DB)
    // agar panggilan yang dibatasi tidak membebani DB sama sekali.
    const rateLimit = checkAdminAiRateLimit(`ai-test:${adminSession.userId}:${normalizedProvider}`, 10);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          message: `Terlalu banyak tes koneksi untuk provider ${normalizedProvider}. Silakan tunggu ${rateLimit.retryAfterSeconds} detik sebelum mencoba lagi.`,
        },
        { status: 429 }
      );
    }

    // H1: tentukan apakah tes ini memakai kredensial tersimpan atau override
    // dari form yang belum disimpan. Hanya tes kredensial tersimpan yang boleh
    // memperbarui status tersimpan (lihat recordConnectionTestLog).
    // - Bila klien mengirim `usesStoredCredentials` boolean secara eksplisit
    //   (panel admin selalu mengirimnya, dari perbandingan field form dengan
    //   nilai yang dimuat dari server), nilai itu yang dipakai.
    // - Bila tidak ada (klien lama / panggilan API langsung), inferensikan
    //   dengan membandingkan override yang dikirim dengan konfigurasi
    //   tersimpan: override yang dikirim dan BERBEDA dari yang tersimpan
    //   berarti tes override. Override yang kosong/tidak dikirim bukan
    //   perbedaan — manager memakai nilai tersimpan untuk field tersebut.
    let storedCredentialsTest: boolean;
    if (typeof usesStoredCredentials === 'boolean') {
      storedCredentialsTest = usesStoredCredentials;
    } else {
      const stored = await getProviderRuntimeConfig(normalizedProvider);
      const keyDiffers =
        typeof apiKey === 'string' && apiKey.trim().length > 0 &&
        apiKey.trim() !== (stored.apiKey || '').trim();
      const endpointDiffers =
        typeof apiEndpoint === 'string' && apiEndpoint.trim().length > 0 &&
        apiEndpoint.trim() !== (stored.apiEndpoint || '').trim();
      const modelDiffers =
        typeof selectedModel === 'string' && selectedModel.trim().length > 0 &&
        selectedModel.trim() !== (stored.selectedModel || '').trim();
      storedCredentialsTest = !(keyDiffers || endpointDiffers || modelDiffers);
    }

    const manager = AIProviderManager.getInstance();
    const result = await manager.testProviderConnection(
      normalizedProvider,
      {
        apiEndpoint,
        apiKey,
        selectedModel,
        // L7: teruskan timeout dari form ke probe adapter (manager menjepit
        // ke 5s–120s; nilai non-numerik/tidak ada memakai timeout tersimpan).
        requestTimeoutMs,
      },
      adminSession.userId,
      { usesStoredCredentials: storedCredentialsTest }
    );

    return NextResponse.json({
      success: true,
      connected: result.status === 'success',
      result,
    });
  } catch (err: any) {
    console.error('Error in POST /api/admin/ai/test-connection:', err);
    return NextResponse.json(
      {
        success: false,
        message: err.message || 'Gagal menjalankan uji koneksi provider AI.',
      },
      { status: 400 }
    );
  }
}
