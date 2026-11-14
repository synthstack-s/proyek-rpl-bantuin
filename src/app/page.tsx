import Link from 'next/link';
import {
  Wrench,
  Shield,
  CheckCircle2,
  UserPlus,
  LogIn,
  Award,
  Bot,
  Sparkles,
  ArrowRight,
  Clock,
  Coins,
  ShieldCheck,
  Search,
  Star,
  Tv,
  Refrigerator,
  Wind,
  WashingMachine,
  Droplets,
  Utensils,
  ChevronRight,
} from 'lucide-react';
import { QuickOrderTracker } from '@/components/public/QuickOrderTracker';
import { getUserSession } from '@/lib/auth';
import { LogoutButton } from '@/components/auth/LogoutButton';
import { ThemeToggle } from '@/components/theme/ThemeToggle';

export default async function HomePage() {
  const session = await getUserSession();
  const categories = [
    {
      title: 'Pendingin Ruangan (AC)',
      desc: 'Cuci AC berkala, perbaikan hembusan angin panas, perbaikan kebocoran air, dan pengisian freon R32/R410A.',
      startingPrice: 'Rp 65.000',
      icon: Wind,
      badge: 'Paling Populer',
    },
    {
      title: 'Lemari Es & Freezer',
      desc: 'Kulkas tidak dingin, freezer tidak beku, kompresor bising berisik, dan perbaikan kelistrikan sistem defrost.',
      startingPrice: 'Rp 85.000',
      icon: Refrigerator,
      badge: 'Spesialis Resmi',
    },
    {
      title: 'Mesin Cuci & Pengering',
      desc: 'Tabung tidak berputar, air tidak mau terbuang, getaran keras saat spin memeras pakaian, penggantian v-belt/dinamo.',
      startingPrice: 'Rp 80.000',
      icon: WashingMachine,
      badge: 'Garansi 30 Hari',
    },
    {
      title: 'Pompa Air & Water Heater',
      desc: 'Pompa cetak-cetek, dinamo pompa macet/terbakar, kuras toren, dan instalasi aman pemanas air water heater listrik/gas.',
      startingPrice: 'Rp 80.000',
      icon: Droplets,
      badge: 'Safety First',
    },
    {
      title: 'Televisi & Home Audio',
      desc: 'Layar TV gelap suara ada (ganti LED backlight), gambar bergaris, mati total (power supply board), dan audio home theater.',
      startingPrice: 'Rp 90.000',
      icon: Tv,
      badge: 'Komponen Asli',
    },
    {
      title: 'Peralatan Dapur Elektronik',
      desc: 'Microwave tidak memanas, dispenser bocor/tidak panas, rice cooker mati total/nasi cepat basi, blender dan oven listrik.',
      startingPrice: 'Rp 60.000',
      icon: Utensils,
      badge: 'Cepat & Rapi',
    },
  ];

  return (
    <main className="min-h-screen bg-[#FAFAFA] dark:bg-[#11120D] text-slate-900 dark:text-[#FFFBF4] selection:bg-[#D8CFBC]/25 selection:text-[#FFFBF4] flex flex-col justify-between relative overflow-hidden">
      {/* Ambient background glows for liquid glass reflections */}
      <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[900px] h-[450px] bg-gradient-to-b from-amber-500/10 via-amber-400/5 to-transparent dark:from-[#565449]/20 dark:via-[#D8CFBC]/8 dark:to-transparent blur-[140px] pointer-events-none rounded-full" />
      <div className="absolute top-[30%] -right-40 w-96 h-96 bg-amber-500/5 dark:bg-[#565449]/15 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-[65%] -left-40 w-96 h-96 bg-amber-400/5 dark:bg-[#D8CFBC]/10 rounded-full blur-[130px] pointer-events-none" />

      {/* 1. Header Navigation Bar (Integrated with Hero Section) */}
      <header className="landing-navbar sticky top-0 z-40 w-full bg-transparent px-4 sm:px-8 py-3.5 transition-all">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:bg-[#1A1C16] dark:border-[#D8CFBC]/25 dark:text-[#D8CFBC] flex items-center justify-center shadow-xs dark:shadow-md dark:shadow-black/40 group-hover:scale-105 transition-all">
              <Wrench className="w-5 h-5 text-amber-600 dark:text-[#D8CFBC]" />
            </div>
            <div>
              <span className="text-xl font-black tracking-tight text-slate-900 dark:text-[#FFFBF4] block">
                BANTUIN
              </span>
              <span className="text-[10px] block text-amber-700 dark:text-[#D8CFBC] font-semibold tracking-wider uppercase">
                Teknisi Elektronik Terpadu
              </span>
            </div>
          </Link>

          {/* Desktop Nav Links */}
          <nav className="hidden md:flex items-center gap-7 text-xs font-semibold text-slate-600 dark:text-[#ABA291]">
            <a href="#kategori" className="hover:text-slate-900 dark:hover:text-[#FFFBF4] transition-colors">
              Kategori Layanan
            </a>
            <a href="#alur" className="hover:text-slate-900 dark:hover:text-[#FFFBF4] transition-colors">
              Alur Perbaikan
            </a>
            <a href="#lacak" className="hover:text-slate-900 dark:hover:text-[#FFFBF4] transition-colors">
              Lacak Pesanan
            </a>
            <a href="#keunggulan" className="hover:text-slate-900 dark:hover:text-[#FFFBF4] transition-colors">
              Keunggulan
            </a>
          </nav>

          {/* User Auth CTA */}
          <div className="flex items-center gap-2.5">
            <ThemeToggle />
            {session ? (
              <div className="flex items-center gap-2.5">
                <Link
                  href={
                    session.role === 'technician'
                      ? '/technician/dashboard'
                      : session.role === 'admin'
                      ? '/admin'
                      : '/customer/dashboard'
                  }
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-[#FFFBF4] dark:hover:bg-[#EAE3D5] dark:text-[#11120D] text-xs font-bold shadow-sm transition-all hover:scale-[1.02]"
                >
                  <span>
                    {session.role === 'technician'
                      ? 'Portal Teknisi'
                      : session.role === 'admin'
                      ? 'Panel Admin'
                      : 'Dashboard Saya'}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
                <LogoutButton />
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  href="/login"
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-200/60 dark:bg-[#181913]/70 dark:border dark:border-[#D8CFBC]/15 dark:text-[#D8CFBC] dark:hover:text-[#FFFBF4] dark:hover:border-[#D8CFBC]/35 transition-all"
                >
                  <LogIn className="w-3.5 h-3.5 text-amber-600 dark:text-[#D8CFBC]" />
                  <span>Masuk</span>
                </Link>

                <Link
                  href="/register/customer"
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-[#FFFBF4] dark:hover:bg-[#EAE3D5] dark:text-[#11120D] text-xs font-bold shadow-sm transition-all hover:scale-[1.02]"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Daftar</span>
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 2. Hero Section */}
      <section className="relative pt-8 pb-20 md:pt-14 md:pb-32 px-4 sm:px-8">
        <div className="max-w-5xl mx-auto text-center relative z-10 space-y-6">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:bg-[#565449]/25 dark:border-[#D8CFBC]/20 dark:text-[#D8CFBC] text-xs font-semibold backdrop-blur-md">
            <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-[#FFFBF4]" />
            <span>Garansi Resmi Layanan 30 Hari Kalender</span>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight text-slate-900 dark:text-[#FFFBF4] leading-[1.15]">
            Perbaikan Elektronik Rumah Tangga <br className="hidden sm:inline" />
            <span className="bg-gradient-to-r from-amber-600 via-amber-700 to-slate-900 dark:from-[#FFFBF4] dark:via-[#D8CFBC] dark:to-[#ABA291] bg-clip-text text-transparent">
              Cepat, Transparan, & Terpercaya
            </span>
          </h1>

          <p className="text-slate-600 dark:text-[#D8CFBC] text-sm sm:text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
            Panggil mitra teknisi profesional tersertifikasi kompetensi (Zero-NIK) langsung ke rumah Anda untuk AC, kulkas, mesin cuci, pompa air, dan peralatan dapur.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
            <Link
              href="/?chat=true"
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200/90 text-slate-900 dark:bg-[#1A1C16]/80 dark:hover:bg-[#565449]/35 dark:border-[#D8CFBC]/25 dark:text-[#FFFBF4] font-bold text-sm shadow-md dark:shadow-xl backdrop-blur-md transition-all hover:scale-105"
            >
              <Bot className="w-5 h-5 text-amber-600 dark:text-[#D8CFBC]" />
              <span>Konsultasi Kerusakan (AI Chatbot+)</span>
            </Link>

            <Link
              href="/register/customer"
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-[#FFFBF4] dark:hover:bg-[#EAE3D5] dark:text-[#11120D] font-bold text-sm shadow-md dark:shadow-xl transition-all hover:scale-105"
            >
              <UserPlus className="w-4 h-4 text-white dark:text-[#11120D]" />
              <span>Pesan Teknisi Sekarang</span>
            </Link>

            <Link
              href="/register/technician"
              className="inline-flex items-center gap-2 px-5 py-3.5 rounded-2xl bg-slate-100 hover:bg-slate-200/70 border border-slate-200/80 text-slate-700 hover:text-slate-900 dark:bg-[#565449]/25 dark:hover:bg-[#565449]/40 dark:border-[#D8CFBC]/20 dark:text-[#D8CFBC] dark:hover:text-[#FFFBF4] text-sm font-semibold transition-all backdrop-blur-md"
            >
              <Award className="w-4 h-4 text-amber-600 dark:text-[#D8CFBC]" />
              <span>Gabung Mitra Teknisi</span>
            </Link>
          </div>

          {/* Quick Metrics Bar (Liquid Glass Cards) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-10 max-w-3xl mx-auto text-left">
            <div className="p-4 rounded-2xl bg-white/80 dark:bg-[#181913]/75 backdrop-blur-md border border-slate-200 dark:border-[#D8CFBC]/15 relative overflow-hidden group hover:border-slate-300 dark:hover:border-[#D8CFBC]/30 shadow-xs dark:shadow-none transition-all">
              <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-[#FFFBF4]">30 Hari</div>
              <div className="text-xs text-slate-500 dark:text-[#ABA291] font-medium mt-0.5">Garansi Servis Resmi</div>
            </div>
            <div className="p-4 rounded-2xl bg-white/80 dark:bg-[#181913]/75 backdrop-blur-md border border-slate-200 dark:border-[#D8CFBC]/15 relative overflow-hidden group hover:border-slate-300 dark:hover:border-[#D8CFBC]/30 shadow-xs dark:shadow-none transition-all">
              <div className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400">100%</div>
              <div className="text-xs text-slate-500 dark:text-[#ABA291] font-medium mt-0.5">Teknisi Tersertifikasi</div>
            </div>
            <div className="p-4 rounded-2xl bg-white/80 dark:bg-[#181913]/75 backdrop-blur-md border border-slate-200 dark:border-[#D8CFBC]/15 relative overflow-hidden group hover:border-slate-300 dark:hover:border-[#D8CFBC]/30 shadow-xs dark:shadow-none transition-all">
              <div className="text-xl sm:text-2xl font-black text-amber-600 dark:text-[#D8CFBC]">Zero-NIK</div>
              <div className="text-xs text-slate-500 dark:text-[#ABA291] font-medium mt-0.5">Privasi Pelanggan Terjaga</div>
            </div>
            <div className="p-4 rounded-2xl bg-white/80 dark:bg-[#181913]/75 backdrop-blur-md border border-slate-200 dark:border-[#D8CFBC]/15 relative overflow-hidden group hover:border-slate-300 dark:hover:border-[#D8CFBC]/30 shadow-xs dark:shadow-none transition-all">
              <div className="text-xl sm:text-2xl font-black text-amber-600 dark:text-amber-300">Fonnte OTP</div>
              <div className="text-xs text-slate-500 dark:text-[#ABA291] font-medium mt-0.5">Notifikasi WhatsApp Resmi</div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Section Lacak Cepat Pesanan (Quick Track) */}
      <section id="lacak" className="py-16 px-4 sm:px-8 bg-[#161712]/60 backdrop-blur-md border-y border-[#D8CFBC]/10">
        <div className="max-w-4xl mx-auto text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#565449]/20 border border-[#D8CFBC]/15 text-[#D8CFBC] text-xs font-semibold">
            <Search className="w-3.5 h-3.5 text-[#D8CFBC]" />
            <span>Layanan Pelacakan Terbuka</span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#FFFBF4]">
            Lacak Status Pengerjaan Pesanan Anda
          </h2>

          <p className="text-[#ABA291] text-xs sm:text-sm max-w-lg mx-auto">
            Masukkan kode order Anda untuk memantau apakah teknisi sedang menuju lokasi, memeriksa unit, atau menyelesaikan perbaikan.
          </p>

          <div className="pt-4">
            <QuickOrderTracker />
          </div>
        </div>
      </section>

      {/* 4. Section Kategori Peralatan Elektronik */}
      <section id="kategori" className="py-20 px-4 sm:px-8 max-w-7xl mx-auto w-full space-y-12">
        <div className="text-center space-y-3 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#565449]/20 border border-[#D8CFBC]/15 text-[#D8CFBC] text-xs font-semibold">
            <Wrench className="w-3.5 h-3.5" />
            <span>Kategori Spesialisasi BANTUIN</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#FFFBF4]">
            Peralatan Rumah Tangga yang Kami Layani
          </h2>
          <p className="text-[#ABA291] text-xs sm:text-sm">
            Semua kategori ditangani oleh teknisi mitra bersertifikasi keahlian dengan transparansi nota biaya.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {categories.map((cat, idx) => {
            const Icon = cat.icon;
            return (
              <div
                key={idx}
                className="group relative p-6 rounded-3xl bg-[#181913]/75 backdrop-blur-md border border-[#D8CFBC]/15 hover:border-[#D8CFBC]/35 transition-all duration-300 hover:-translate-y-1 shadow-lg hover:shadow-black/30 flex flex-col justify-between overflow-hidden"
              >
                {/* Subtle top rim light */}
                <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-[#FFFBF4]/15 to-transparent pointer-events-none" />

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-2xl bg-[#22241D] border border-[#D8CFBC]/20 flex items-center justify-center shadow-md">
                      <Icon className="w-6 h-6 text-[#D8CFBC]" />
                    </div>
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-[#565449]/25 text-[#D8CFBC] border border-[#D8CFBC]/15">
                      {cat.badge}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-lg font-bold text-[#FFFBF4] group-hover:text-[#D8CFBC] transition-colors">
                      {cat.title}
                    </h3>
                    <p className="text-xs text-[#ABA291] leading-relaxed mt-2">
                      {cat.desc}
                    </p>
                  </div>
                </div>

                <div className="pt-6 mt-6 border-t border-[#565449]/25 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-[#8C8678] block uppercase font-bold tracking-wider">Mulai Dari</span>
                    <span className="text-sm font-extrabold text-[#FFFBF4] font-mono">{cat.startingPrice}</span>
                  </div>

                  <Link
                    href={`/register/customer`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#22241D] group-hover:bg-[#FFFBF4] group-hover:text-[#11120D] text-xs font-semibold text-[#D8CFBC] border border-[#D8CFBC]/15 transition-all"
                  >
                    <span>Pesan</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 5. Section Alur Kerja (4 Langkah Mudah) */}
      <section id="alur" className="py-20 px-4 sm:px-8 bg-[#161712]/50 backdrop-blur-md border-t border-[#D8CFBC]/10">
        <div className="max-w-6xl mx-auto space-y-14">
          <div className="text-center space-y-3 max-w-2xl mx-auto">
            <h2 className="text-3xl font-extrabold text-[#FFFBF4]">
              Bagaimana Cara Kerja BANTUIN?
            </h2>
            <p className="text-[#ABA291] text-xs sm:text-sm">
              Alur pemesanan mudah, cepat, dan transparan dari awal hingga tuntas.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="p-6 rounded-3xl bg-[#181913]/75 backdrop-blur-md border border-[#D8CFBC]/15 relative space-y-3">
              <div className="w-10 h-10 rounded-xl bg-[#565449]/30 text-[#D8CFBC] font-black flex items-center justify-center font-mono border border-[#D8CFBC]/25">
                01
              </div>
              <h4 className="text-base font-bold text-[#FFFBF4]">Pesan atau Konsultasi AI</h4>
              <p className="text-xs text-[#ABA291] leading-relaxed">
                Pilih kategori perangkat atau ceritakan gejala kerusakan pada Chatbot+ untuk mendapatkan perkiraan solusi awal.
              </p>
            </div>

            <div className="p-6 rounded-3xl bg-[#181913]/75 backdrop-blur-md border border-[#D8CFBC]/15 relative space-y-3">
              <div className="w-10 h-10 rounded-xl bg-[#565449]/30 text-[#D8CFBC] font-black flex items-center justify-center font-mono border border-[#D8CFBC]/25">
                02
              </div>
              <h4 className="text-base font-bold text-[#FFFBF4]">Penugasan Teknisi Cepat</h4>
              <p className="text-xs text-[#ABA291] leading-relaxed">
                Sistem menugaskan mitra teknisi tersertifikasi kompetensi terdekat dengan konfirmasi jadwal kunjungan ke rumah.
              </p>
            </div>

            <div className="p-6 rounded-3xl bg-[#181913]/75 backdrop-blur-md border border-[#D8CFBC]/15 relative space-y-3">
              <div className="w-10 h-10 rounded-xl bg-[#565449]/30 text-[#D8CFBC] font-black flex items-center justify-center font-mono border border-[#D8CFBC]/25">
                03
              </div>
              <h4 className="text-base font-bold text-[#FFFBF4]">Inspeksi & Biaya Transparan</h4>
              <p className="text-xs text-[#ABA291] leading-relaxed">
                Teknisi memeriksa fisik unit di lokasi dan menerbitkan rincian biaya (jasa + sparepart) untuk disetujui tanpa biaya tersembunyi.
              </p>
            </div>

            <div className="p-6 rounded-3xl bg-[#181913]/75 backdrop-blur-md border border-[#D8CFBC]/15 relative space-y-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-300 font-black flex items-center justify-center font-mono border border-emerald-500/25">
                04
              </div>
              <h4 className="text-base font-bold text-[#FFFBF4]">Selesai & Garansi 30 Hari</h4>
              <p className="text-xs text-[#ABA291] leading-relaxed">
                Perbaikan selesai, pembayaran aman via QRIS/VA/COD, dan garansi resmi 30 hari langsung aktif otomatis.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Section Keunggulan & Jaminan Keamanan */}
      <section id="keunggulan" className="py-20 px-4 sm:px-8 max-w-6xl mx-auto w-full space-y-12">
        <div className="text-center space-y-3 max-w-2xl mx-auto">
          <h2 className="text-3xl font-extrabold text-[#FFFBF4]">
            Standar Kualitas & Keamanan BANTUIN
          </h2>
          <p className="text-[#ABA291] text-xs sm:text-sm">
            Kenyamanan dan keamanan pemilik rumah adalah prioritas tertinggi kami.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-3xl bg-[#181913]/75 backdrop-blur-md border border-[#D8CFBC]/15 space-y-3">
            <ShieldCheck className="w-8 h-8 text-[#D8CFBC]" />
            <h3 className="text-base font-bold text-[#FFFBF4]">Garansi 30 Hari Tanpa Ribet</h3>
            <p className="text-xs text-[#ABA291] leading-relaxed">
              Jika kendala yang sama berulang dalam 30 hari kalender, teknisi akan melakukan perbaikan ulang bebas biaya jasa perbaikan.
            </p>
          </div>

          <div className="p-6 rounded-3xl bg-[#181913]/75 backdrop-blur-md border border-[#D8CFBC]/15 space-y-3">
            <Award className="w-8 h-8 text-emerald-400" />
            <h3 className="text-base font-bold text-[#FFFBF4]">Kebijakan Zero-NIK & Legalitas</h3>
            <p className="text-xs text-[#ABA291] leading-relaxed">
              Verifikasi teknisi resmi berbasis dokumen kompetensi dan pengalaman riil, tanpa mengoleksi data sensitif KTP yang rentan disalahgunakan.
            </p>
          </div>

          <div className="p-6 rounded-3xl bg-[#181913]/75 backdrop-blur-md border border-[#D8CFBC]/15 space-y-3">
            <Coins className="w-8 h-8 text-amber-300" />
            <h3 className="text-base font-bold text-[#FFFBF4]">Bebas Biaya Tersembunyi</h3>
            <p className="text-xs text-[#ABA291] leading-relaxed">
              Semua biaya diterbitkan melalui invoice resmi di aplikasi sebelum perbaikan dimulai. Tidak ada manipulasi tarif oleh teknisi di lapangan.
            </p>
          </div>
        </div>
      </section>

      {/* 7. CTA Banner Gabung Mitra & Pelanggan */}
      <section className="py-16 px-4 sm:px-8 max-w-6xl mx-auto w-full">
        <div className="p-8 sm:p-12 rounded-3xl bg-gradient-to-r from-[#181913]/90 via-[#22241D]/80 to-[#181913]/90 backdrop-blur-2xl border border-[#D8CFBC]/25 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-8 text-center md:text-left relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-[#FFFBF4]/20 to-transparent pointer-events-none" />

          <div className="space-y-3">
            <span className="text-xs font-bold text-[#D8CFBC] uppercase tracking-widest block">
              Mitra Kerja Profesional
            </span>
            <h3 className="text-2xl sm:text-3xl font-black text-[#FFFBF4]">
              Apakah Anda Teknisi Elektronik Handal?
            </h3>
            <p className="text-xs sm:text-sm text-[#D8CFBC] max-w-xl leading-relaxed">
              Dapatkan order perbaikan harian dari pelanggan terdekat di kota Anda. Jam kerja fleksibel, bagi hasil transparan, dan jaminan sistem penugasan adil.
            </p>
          </div>

          <div className="shrink-0 flex flex-col sm:flex-row gap-3">
            <Link
              href="/register/technician"
              className="px-6 py-3.5 rounded-2xl bg-[#FFFBF4] hover:bg-[#EAE3D5] text-[#11120D] font-bold text-xs uppercase tracking-wider transition-all shadow-lg hover:scale-105"
            >
              Daftar Jadi Mitra Teknisi
            </Link>
            <Link
              href="/admin"
              className="px-5 py-3.5 rounded-2xl bg-[#565449]/30 hover:bg-[#565449]/50 text-[#D8CFBC] hover:text-[#FFFBF4] font-semibold text-xs border border-[#D8CFBC]/20 transition-all backdrop-blur-sm"
            >
              Admin Panel
            </Link>
          </div>
        </div>
      </section>

      {/* 8. Footer */}
      <footer className="border-t border-[#D8CFBC]/10 bg-[#11120D]/80 backdrop-blur-md py-10 px-4 sm:px-8 text-xs text-[#8C8678]">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 font-bold text-[#D8CFBC]">
            <Wrench className="w-4 h-4 text-[#D8CFBC]" />
            <span>BANTUIN Platform © {new Date().getFullYear()}</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/login" className="hover:text-[#FFFBF4] transition-colors">
              Masuk Akun
            </Link>
            <Link href="/register/customer" className="hover:text-[#FFFBF4] transition-colors">
              Daftar Pelanggan
            </Link>
            <Link href="/register/technician" className="hover:text-[#FFFBF4] transition-colors">
              Pendaftaran Mitra
            </Link>
            <Link href="/admin/login" className="hover:text-[#FFFBF4] transition-colors">
              Staf Administrasi
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
