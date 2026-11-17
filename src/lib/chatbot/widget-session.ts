/**
 * Inisialisasi sesi widget chatbot dengan pemakaian ulang (reuse).
 *
 * Latar (bug loop sesi): widget dulu membuat sesi BARU (INSERT ke
 * ai_consultation_sessions) pada SETIAP mount dan SETIAP perpindahan
 * halaman — bahkan saat widget TERTUTUP — dan tidak pernah menyimpan UUID
 * sesi (localStorage hanya dihapus, tidak pernah ditulis). Widget
 * terpasang global di root layout, jadi setiap navigasi/refresh =
 * POST /api/chat/session baru (2x di dev karena React StrictMode),
 * sampai kena 429 (batas 10/menit/IP) dan mengisi tabel dengan sesi
 * yatim yang tidak pernah dipakai.
 *
 * Aturan baru:
 * - Sesi DIPAKAI ULANG bila UUID tersimpan DAN dibuat untuk halaman yang
 *   sama — server mengembalikan sesi yang sama lewat getOrCreateSession
 *   (1 SELECT, tanpa INSERT baru).
 * - Pindah halaman = sesi baru (reset per halaman dipertahankan), TETAPI
 *   hanya bila widget sedang terbuka — pemanggil (efek widget) yang
 *   memutuskan kapan memanggil helper ini; helper ini tidak tahu soal
 *   status buka/tutup widget.
 * - Bila UUID tersimpan ditolak server (403 — milik pengguna lain),
 *   storage dibersihkan dan dicoba SEKALI lagi tanpa UUID.
 * - 429 / error lain TIDAK di-retry — pemanggil menampilkan pesannya.
 *
 * Modul ini murni (tanpa React/DOM) agar bisa diuji di Node: `fetchFn`
 * dan `storage` diinjeksikan pemanggil.
 */

export const WIDGET_SESSION_UUID_KEY = 'bantuin_chat_uuid';
export const WIDGET_SESSION_PATH_KEY = 'bantuin_chat_path';

export interface WidgetSessionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type WidgetFetchFn = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string }
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<any>;
}>;

export interface WidgetSessionData {
  sessionUuid: string;
  sessionId: number;
  userRole: string;
  userName: string | null;
  suggestions: unknown[];
}

export type InitWidgetSessionResult =
  | { ok: true; data: WidgetSessionData; reused: boolean }
  | {
      ok: false;
      message: string;
      status: number;
      retryAfterSeconds?: number;
    };

export async function initWidgetSession(opts: {
  fetchFn: WidgetFetchFn;
  storage: WidgetSessionStorage;
  pathname: string;
  pageContext: unknown;
  /** Paksa sesi baru (tombol reset eksplisit) — abaikan UUID tersimpan. */
  forceNew?: boolean;
}): Promise<InitWidgetSessionResult> {
  const { fetchFn, storage, pathname, pageContext, forceNew } = opts;

  const storedUuid = forceNew ? null : storage.getItem(WIDGET_SESSION_UUID_KEY);
  const storedPath = forceNew ? null : storage.getItem(WIDGET_SESSION_PATH_KEY);
  // Pakai ulang hanya bila sesi tersimpan dibuat untuk halaman ini —
  // pindah halaman tetap mendapat sesi baru (reset per halaman).
  const reuseUuid =
    storedUuid && storedPath === pathname ? storedUuid : null;

  const postOnce = async (sessionUuid?: string) => {
    const res = await fetchFn('/api/chat/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(sessionUuid ? { sessionUuid } : {}),
        pageContext,
      }),
    });
    let data: any = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }
    return { res, data };
  };

  try {
    let { res, data } = await postOnce(reuseUuid ?? undefined);
    let reused = Boolean(reuseUuid);

    // 403 = UUID tersimpan milik pengguna lain (F1) — bersihkan storage
    // dan coba SEKALI lagi sebagai sesi baru. Bukan loop retry.
    if (res.status === 403 && reuseUuid) {
      storage.removeItem(WIDGET_SESSION_UUID_KEY);
      storage.removeItem(WIDGET_SESSION_PATH_KEY);
      ({ res, data } = await postOnce(undefined));
      reused = false;
    }

    if (!res.ok || !data?.success || !data?.session) {
      return {
        ok: false,
        message:
          (typeof data?.message === 'string' && data.message) ||
          'Gagal menginisialisasi sesi chat.',
        status: res.status,
        retryAfterSeconds:
          typeof data?.retryAfterSeconds === 'number'
            ? data.retryAfterSeconds
            : undefined,
      };
    }

    const sessionUuid = String(data.session.sessionUuid);
    storage.setItem(WIDGET_SESSION_UUID_KEY, sessionUuid);
    storage.setItem(WIDGET_SESSION_PATH_KEY, pathname);

    return {
      ok: true,
      reused,
      data: {
        sessionUuid,
        sessionId: Number(data.session.id),
        userRole: data.user?.role || 'guest',
        userName: data.user?.name ?? null,
        suggestions: Array.isArray(data.suggestions) ? data.suggestions : [],
      },
    };
  } catch {
    return {
      ok: false,
      message: 'Terjadi kendala jaringan saat menghubungi asisten AI.',
      status: 0,
    };
  }
}
