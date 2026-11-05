import { getUserSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  Wrench,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Award,
  LogOut,
  User,
  Phone,
  AlertTriangle,
  Bot,
  Home,
} from 'lucide-react';
import { TechnicianDashboardClient } from '@/components/technician/TechnicianDashboardClient';
import { LogoutButton } from '@/components/auth/LogoutButton';
import { ThemeToggle } from '@/components/theme/ThemeToggle';

export const dynamic = 'force-dynamic';

export default async function TechnicianDashboardPage() {
  const session = await getUserSession();

  if (!session || session.role !== 'technician') {
    redirect('/login?callbackUrl=/technician/dashboard');
  }

  // Ambil profil teknisi dari database
  const techProfiles = await query<any[]>(
    `SELECT verified_status, rejection_reason, years_of_experience, rating_avg, rating_count, is_available
     FROM technician_profiles
     WHERE user_id = ? LIMIT 1`,
    [session.userId]
  );

  const profile = techProfiles[0] || {
    verified_status: 'pending',
    rejection_reason: null,
    years_of_experience: 0,
    rating_avg: 0,
    rating_count: 0,
    is_available: false,
  };

  const isDocVerified = profile.verified_status === 'verified';

  return (
    <div className="min-h-screen bg-[#11120D] text-[#FFFBF4] flex flex-col justify-between p-4 sm:p-8 lg:p-12 relative overflow-hidden selection:bg-[#D8CFBC]/25 selection:text-[#FFFBF4]">
      {/* Ambient background light */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[350px] bg-gradient-to-b from-[#565449]/20 via-[#D8CFBC]/10 to-transparent blur-[140px] pointer-events-none rounded-full" />
      <div className="absolute bottom-10 right-0 w-80 h-80 bg-[#565449]/15 rounded-full blur-[110px] pointer-events-none" />

      <div className="max-w-5xl mx-auto w-full space-y-8 relative z-10">
        {/* Header Bar */}
        <header className="flex items-center justify-between pb-6 border-b border-[#D8CFBC]/15">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-2xl bg-[#1A1C16] border border-[#D8CFBC]/25 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
              <Award className="w-5 h-5 text-[#D8CFBC]" />
            </div>
            <div>
              <span className="text-xl font-black tracking-tight text-[#FFFBF4] block">
                BANTUIN
              </span>
              <span className="text-xs text-[#D8CFBC] font-semibold uppercase tracking-wider">
                Portal Mitra Teknisi
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
              <span>Panduan AI</span>
            </Link>

            <ThemeToggle compact />
            <LogoutButton showTextOnMobile={true} />
          </div>
        </header>

        {/* Verification Status Banner */}
        <div className="p-6 sm:p-8 rounded-3xl bg-[#181913]/85 backdrop-blur-2xl border border-[#D8CFBC]/25 shadow-xl space-y-4 text-left relative overflow-hidden">
          {/* Subtle top rim light */}
          <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-[#FFFBF4]/20 to-transparent pointer-events-none" />

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-300 text-xs font-semibold border border-emerald-500/25">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>WhatsApp Terverifikasi Fonnte</span>
            </span>

            {isDocVerified ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#565449]/30 text-[#FFFBF4] text-xs font-semibold border border-[#D8CFBC]/25">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Sertifikasi Terverifikasi (Siap Terima Job)</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 text-amber-300 text-xs font-semibold border border-amber-500/25">
                <Clock className="w-3.5 h-3.5" />
                <span>Status Dokumen: {profile.verified_status.toUpperCase()}</span>
              </span>
            )}
          </div>

          <h1 className="text-2xl sm:text-3xl font-black text-[#FFFBF4] tracking-tight">
            Selamat Datang, Teknisi {session.name || 'Mitra BANTUIN'}!
          </h1>

          <p className="text-[#D8CFBC] text-xs sm:text-sm max-w-2xl leading-relaxed">
            Kelola tawaran order perbaikan pelanggan terdekat, update linimasa pengerjaan unit, dan ajukan nota estimasi biaya secara transparan langsung dari portal ini.
          </p>

          {!isDocVerified && (
            <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-600/40 flex items-start gap-3 text-xs text-amber-200">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-[#FFFBF4]">Tahap Verifikasi Dokumen</p>
                <p className="text-[#D8CFBC] mt-0.5">
                  Admin BANTUIN sedang meninjau dokumen kompetensi keahlian Anda (Zero-NIK). Setelah disetujui, tawaran order pelanggan akan otomatis masuk ke dashboard ini.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Profil Singkat & Kontak WA */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-left">
          <div className="p-4 rounded-2xl bg-[#181913]/70 backdrop-blur-md border border-[#D8CFBC]/15 space-y-1">
            <span className="text-[#ABA291] font-semibold flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-[#D8CFBC]" />
              <span>Profil Mitra</span>
            </span>
            <p className="font-bold text-[#FFFBF4] text-sm">{session.name}</p>
            <p className="text-[#ABA291]">Pengalaman: {profile.years_of_experience} Tahun</p>
          </div>

          <div className="p-4 rounded-2xl bg-[#181913]/70 backdrop-blur-md border border-[#D8CFBC]/15 space-y-1">
            <span className="text-[#ABA291] font-semibold flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-emerald-400" />
              <span>Nomor WhatsApp Aktif</span>
            </span>
            <p className="font-bold font-mono text-emerald-300 text-sm">{session.phoneNumber}</p>
            <p className="text-[#ABA291]">Notifikasi order instan aktif</p>
          </div>

          <div className="p-4 rounded-2xl bg-[#181913]/70 backdrop-blur-md border border-[#D8CFBC]/15 space-y-1">
            <span className="text-[#ABA291] font-semibold flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-amber-400" />
              <span>Performa & Rating</span>
            </span>
            <p className="font-bold text-[#FFFBF4] text-sm">
              ⭐ {Number(profile.rating_avg || 0).toFixed(1)} / 5.0
            </p>
            <p className="text-[#ABA291]">{profile.rating_count} ulasan kepuasan pelanggan</p>
          </div>
        </div>

        {/* Client Interactive Workspace */}
        <TechnicianDashboardClient
          technicianName={session.name || 'Mitra Teknisi'}
          technicianPhone={session.phoneNumber || ''}
          initialVerifiedStatus={profile.verified_status}
        />
      </div>

      <footer className="max-w-5xl mx-auto w-full text-center text-xs text-[#8C8678] pt-8 border-t border-[#D8CFBC]/15 mt-12">
        &copy; {new Date().getFullYear()} BANTUIN Platform. Seluruh hak cipta dilindungi.
      </footer>
    </div>
  );
}
