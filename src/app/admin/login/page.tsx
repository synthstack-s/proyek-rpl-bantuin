import { redirect } from 'next/navigation';

/**
 * Rute /admin/login dipertahankan sebagai REDIRECT ke /login — BUKAN
 * halaman login terpisah.
 *
 * BANTUIN memakai SATU panel login di /login untuk semua peran (admin,
 * pelanggan, teknisi); redirect sesudah login ditentukan dari role akun
 * di database. Panel login admin terpisah dihapus; rute ini ada agar
 * bookmark dan tautan lama ke /admin/login tidak 404.
 *
 * Middleware juga mengalihkan /admin/login -> /login sebelum halaman ini
 * sempat di-render; redirect di sini adalah jaring pengaman bila
 * middleware dilewati. callbackUrl diteruskan hanya bila berupa path
 * relatif internal (mencegah open redirect).
 */
export default async function AdminLoginRedirect({
  searchParams,
}: {
  searchParams?: Promise<{ callbackUrl?: string | string[] }>;
}) {
  const params = await searchParams;
  const raw = params?.callbackUrl;
  const callbackUrl = Array.isArray(raw) ? raw[0] : raw;
  const safeCallback =
    callbackUrl && callbackUrl.startsWith('/') && !callbackUrl.startsWith('//')
      ? callbackUrl
      : null;

  redirect(
    safeCallback ? `/login?callbackUrl=${encodeURIComponent(safeCallback)}` : '/login'
  );
}
