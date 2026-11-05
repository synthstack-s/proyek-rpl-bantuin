import { getUserSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  Wrench,
  CheckCircle2,
  Clock,
  ShieldCheck,
  PlusCircle,
  Calendar,
  LogOut,
  User,
  Phone,
  Mail,
  ArrowRight,
  ClipboardList,
  MapPin,
  Bot,
  CreditCard,
  Sparkles,
  Home,
} from 'lucide-react';
import { LogoutButton } from '@/components/auth/LogoutButton';
import { ThemeToggle } from '@/components/theme/ThemeToggle';

export const dynamic = 'force-dynamic';

export default async function CustomerDashboardPage() {
  const session = await getUserSession();

  if (!session || session.role !== 'customer') {
    redirect('/login?callbackUrl=/customer/dashboard');
  }

  // 1. Ambil profil customer
  const profileRows = await query<any[]>(
    `SELECT cp.full_name, cp.default_address, cp.city, cp.postal_code, u.phone_number, u.email
     FROM users u
     LEFT JOIN customer_profiles cp ON u.id = cp.user_id
     WHERE u.id = ? LIMIT 1`,
    [session.userId]
  );
  const profile = profileRows[0] || {};

  // 2. Ambil riwayat pesanan pelanggan dari database
  const repairs = await query<any[]>(
    `SELECT r.id, r.order_code, r.device_brand, r.device_model, r.problem_description,
            r.current_status, r.created_at,
            c.name AS category_name,
            s.name AS service_name,
            inv.status AS invoice_status, inv.total_amount AS invoice_amount,
            tp.full_name AS technician_name
     FROM repair_requests r
     JOIN appliance_categories c ON r.category_id = c.id
     LEFT JOIN services s ON r.service_id = s.id
     LEFT JOIN invoices inv ON inv.repair_request_id = r.id
     LEFT JOIN technician_assignments ta ON (ta.repair_request_id = r.id AND ta.status IN ('accepted', 'completed'))
     LEFT JOIN technician_profiles tp ON ta.technician_id = tp.user_id
     WHERE r.customer_id = ? AND r.deleted_at IS NULL
     ORDER BY r.id DESC LIMIT 15`,
    [session.userId]
  );

  const totalOrders = repairs.length;
  const activeOrders = repairs.filter(
    (r) => !['completed', 'cancelled'].includes(r.current_status)
  ).length;
  const completedOrders = repairs.filter((r) => r.current_status === 'completed').length;
  const unpaidInvoices = repairs.filter((r) => r.invoice_status === 'unpaid').length;

  return (
    <div className="min-h-screen bg-[#11120D] text-[#FFFBF4] flex flex-col justify-between p-4 sm:p-8 lg:p-12 relative overflow-hidden selection:bg-[#D8CFBC]/25 selection:text-[#FFFBF4]">
      {/* Ambient background light */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[350px] bg-gradient-to-b from-[#565449]/20 via-[#D8CFBC]/10 to-transparent blur-[140px] pointer-events-none rounded-full" />
      <div className="absolute bottom-10 right-0 w-80 h-80 bg-[#565449]/15 rounded-full blur-[110px] pointer-events-none" />

      <div className="max-w-5xl mx-auto w-full space-y-8 relative z-10">
        {/* Top Navbar */}
        <header className="flex items-center justify-between pb-6 border-b border-[#D8CFBC]/15">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-2xl bg-[#1A1C16] border border-[#D8CFBC]/25 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
              <Wrench className="w-5 h-5 text-[#D8CFBC]" />
            </div>
            <div>
              <span className="text-xl font-black tracking-tight text-[#FFFBF4] block">
                BANTUIN
              </span>
              <span className="text-xs text-[#D8CFBC] font-semibold uppercase tracking-wider">
                Portal Pelanggan
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-2.5">
            <Link
              href="/"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#181913]/70 border border-[#D8CFBC]/15 hover:border-[#D8CFBC]/35 text-xs font-semibold text-[#D8CFBC] hover:text-[#FFFBF4] transition-colors shadow-xs"
              title="Kembali ke Menu Pengunjung"
            >
              <Home className="w-4 h-4 text-[#D8CFBC]" />
              <span>Menu Pengunjung</span>
            </Link>

            <Link
              href="/?chat=true"
              className="hidden md:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#181913]/70 border border-[#D8CFBC]/15 hover:border-[#D8CFBC]/35 text-xs font-semibold text-[#D8CFBC] hover:text-[#FFFBF4] transition-colors shadow-xs"
            >
              <Bot className="w-4 h-4 text-[#D8CFBC]" />
              <span>AI Konsultasi</span>
            </Link>

            <Link
              href="/customer/repairs/new"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#FFFBF4] hover:bg-[#EAE3D5] text-xs font-bold text-[#11120D] shadow-md shadow-black/30 transition-all hover:scale-105"
            >
              <PlusCircle className="w-4 h-4 text-[#11120D]" />
              <span>Pesan Servis Baru</span>
            </Link>

            <ThemeToggle compact />
            <LogoutButton showTextOnMobile={true} />
          </div>
        </header>

        {/* Welcome Banner (Liquid Glass) */}
        <div className="p-6 sm:p-8 rounded-3xl bg-[#181913]/85 backdrop-blur-2xl border border-[#D8CFBC]/25 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden">
          {/* Subtle top rim light */}
          <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-[#FFFBF4]/20 to-transparent pointer-events-none" />

          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-300 text-xs font-semibold border border-emerald-500/25">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Akun Pelanggan Resmi Terverifikasi</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-[#FFFBF4] tracking-tight">
              Halo, {profile.full_name || session.name || 'Pelanggan BANTUIN'}!
            </h1>
            <p className="text-[#D8CFBC] text-xs sm:text-sm max-w-xl leading-relaxed">
              Pantau jadwal kunjungan teknisi, setujui estimasi biaya secara transparan, dan dapatkan jaminan garansi 30 hari untuk setiap perbaikan elektronik rumah tangga Anda.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5 shrink-0">
            <Link
              href="/customer/repairs/new"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-[#FFFBF4] hover:bg-[#EAE3D5] text-[#11120D] font-bold text-xs uppercase tracking-wider shadow-lg shadow-black/30 transition-all hover:scale-105"
            >
              <PlusCircle className="w-4 h-4 text-[#11120D]" />
              <span>Panggil Teknisi</span>
            </Link>
          </div>
        </div>

        {/* Metric Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl bg-[#181913]/75 backdrop-blur-md border border-[#D8CFBC]/15 relative overflow-hidden group hover:border-[#D8CFBC]/30 transition-all">
            <span className="text-xs text-[#ABA291] font-semibold block mb-1">Pesanan Berjalan</span>
            <div className="text-2xl font-black text-[#FFFBF4] font-mono">{activeOrders}</div>
            <span className="text-[11px] text-[#8C8678]">Dalam proses / inspeksi</span>
          </div>

          <div className="p-5 rounded-2xl bg-[#181913]/75 backdrop-blur-md border border-[#D8CFBC]/15 relative overflow-hidden group hover:border-[#D8CFBC]/30 transition-all">
            <span className="text-xs text-[#ABA291] font-semibold block mb-1">Servis Selesai</span>
            <div className="text-2xl font-black text-emerald-400 font-mono">{completedOrders}</div>
            <span className="text-[11px] text-[#8C8678]">Perbaikan bergaransi</span>
          </div>

          <div className="p-5 rounded-2xl bg-[#181913]/75 backdrop-blur-md border border-[#D8CFBC]/15 relative overflow-hidden group hover:border-[#D8CFBC]/30 transition-all">
            <span className="text-xs text-[#ABA291] font-semibold block mb-1">Tagihan Belum Bayar</span>
            <div className="text-2xl font-black text-amber-300 font-mono">{unpaidInvoices}</div>
            <span className="text-[11px] text-[#8C8678]">Menunggu pelunasan</span>
          </div>

          <div className="p-5 rounded-2xl bg-[#181913]/75 backdrop-blur-md border border-[#D8CFBC]/15 relative overflow-hidden group hover:border-[#D8CFBC]/30 transition-all">
            <span className="text-xs text-[#ABA291] font-semibold block mb-1">Total Permintaan</span>
            <div className="text-2xl font-black text-[#D8CFBC] font-mono">{totalOrders}</div>
            <span className="text-[11px] text-[#8C8678]">Riwayat servis akun</span>
          </div>
        </div>

        {/* Profil Data Diri & Lokasi */}
        <div className="p-5 rounded-2xl bg-[#181913]/60 backdrop-blur-md border border-[#D8CFBC]/15 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#22241D] border border-[#D8CFBC]/20 flex items-center justify-center shrink-0">
              <User className="w-4 h-4 text-[#D8CFBC]" />
            </div>
            <div>
              <span className="font-bold text-[#FFFBF4] block">{profile.full_name || session.name}</span>
              <span className="text-[#ABA291] font-mono">WhatsApp: {profile.phone_number || session.phoneNumber}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[#ABA291]">
            <MapPin className="w-4 h-4 text-[#D8CFBC] shrink-0" />
            <span className="truncate max-w-sm">
              Alamat: {profile.default_address || 'Belum diatur (diisi saat membuat pesanan)'} {profile.city ? `(${profile.city})` : ''}
            </span>
          </div>
        </div>

        {/* Daftar Pesanan Servis Terbaru */}
        <div className="p-6 rounded-3xl bg-[#181913]/85 backdrop-blur-2xl border border-[#D8CFBC]/20 shadow-xl space-y-4 relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-[#FFFBF4]/15 to-transparent pointer-events-none" />

          <div className="flex items-center justify-between pb-3 border-b border-[#565449]/25">
            <div>
              <h2 className="text-base font-bold text-[#FFFBF4] flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-[#D8CFBC]" />
                <span>Riwayat & Pesanan Perbaikan Anda</span>
              </h2>
              <p className="text-xs text-[#ABA291] mt-0.5">
                Pantau progres status, persetujuan estimasi, dan pembayaran nota perbaikan
              </p>
            </div>

            <Link
              href="/customer/repairs/new"
              className="text-xs font-bold text-[#D8CFBC] hover:text-[#FFFBF4] flex items-center gap-1 transition-colors"
            >
              <span>+ Buat Baru</span>
            </Link>
          </div>

          {repairs.length === 0 ? (
            <div className="py-12 text-center text-[#ABA291] space-y-3">
              <Clock className="w-10 h-10 mx-auto text-[#706E61]" />
              <div>
                <h3 className="text-sm font-semibold text-[#FFFBF4]">Belum Ada Pesanan Servis</h3>
                <p className="text-xs text-[#8C8678] max-w-sm mx-auto mt-1">
                  Mulai ajukan permohonan perbaikan pertama Anda untuk perangkat AC, kulkas, mesin cuci, atau alat elektronik lainnya.
                </p>
              </div>
              <Link
                href="/customer/repairs/new"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#FFFBF4] hover:bg-[#EAE3D5] text-xs font-bold text-[#11120D] transition-all shadow-md shadow-black/30"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Pesan Servis Pertama Anda</span>
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-[#565449]/25">
              {repairs.map((r) => (
                <div
                  key={r.id}
                  className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-[#565449]/10 px-3 rounded-2xl transition-colors"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-[#D8CFBC]">
                        #{r.order_code}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#565449]/30 text-[#D8CFBC] border border-[#D8CFBC]/20 uppercase">
                        {r.current_status}
                      </span>
                      {r.invoice_status && (
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border ${
                            r.invoice_status === 'paid'
                              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25'
                              : 'bg-amber-500/15 text-amber-300 border-amber-500/25'
                          }`}
                        >
                          Invoice: {r.invoice_status}
                        </span>
                      )}
                    </div>

                    <h4 className="text-sm font-bold text-[#FFFBF4]">
                      {r.category_name} •{' '}
                      <span className="text-[#D8CFBC] font-normal">
                        {[r.device_brand, r.device_model].filter(Boolean).join(' ') || 'Elektronik'}
                      </span>
                    </h4>

                    <p className="text-xs text-[#ABA291] line-clamp-1 max-w-md">
                      {r.problem_description}
                    </p>

                    {r.technician_name && (
                      <p className="text-[11px] text-[#D8CFBC]">
                        Teknisi Bertugas: <strong className="text-[#FFFBF4]">{r.technician_name}</strong>
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-[#8C8678] hidden sm:inline">
                      {new Date(r.created_at).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>

                    <Link
                      href={`/customer/repairs/${r.id}`}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#22241D] hover:bg-[#FFFBF4] hover:text-[#11120D] text-xs font-bold text-[#D8CFBC] border border-[#D8CFBC]/15 transition-all shadow-sm"
                    >
                      <span>Detail & Lacak</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <footer className="max-w-5xl mx-auto w-full text-center text-xs text-[#8C8678] pt-8 border-t border-[#D8CFBC]/15 mt-12">
        &copy; {new Date().getFullYear()} BANTUIN Platform. Seluruh hak cipta dilindungi.
      </footer>
    </div>
  );
}
