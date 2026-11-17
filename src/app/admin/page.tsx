import { AdminDashboardInteractive } from '@/components/admin/AdminDashboardInteractive';
import { getAdminDashboardData, emptyDashboardData } from '@/lib/admin-dashboard';

export const dynamic = 'force-dynamic';

// Data awal dasbor dibaca dari SATU sumber yang sama dengan API
// /api/admin/dashboard (src/lib/admin-dashboard.ts) agar angka SSR dan
// angka sesudah ganti rentang waktu TIDAK PERNAH berbeda. Bila database
// tidak dapat diakses, halaman tetap dirender dengan data kosong DAN
// pesan error yang terlihat — bukan angka demo.
export default async function AdminDashboardPage() {
  let initialData;
  try {
    initialData = await getAdminDashboardData('30d');
  } catch (err) {
    console.error('Gagal memuat data awal dashboard admin:', err);
    initialData = emptyDashboardData(
      '30d',
      'Database tidak dapat diakses saat ini — data dasbor gagal dimuat. Coba muat ulang halaman.'
    );
  }

  return (
    <div className="w-full">
      <AdminDashboardInteractive initialData={initialData} />
    </div>
  );
}
