'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Wrench,
  User,
  Phone,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  Loader2,
  ShieldCheck,
  Briefcase,
  FileText,
  Award,
} from 'lucide-react';

export default function RegisterTechnicianPage() {
  const router = useRouter();

  const [formData, setFormData] = useState({
    full_name: '',
    phone_number: '',
    email: '',
    password: '',
    confirm_password: '',
    years_of_experience: 1,
    bio: '',
    terms_accepted: false,
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (formData.password !== formData.confirm_password) {
      setErrorMsg('Konfirmasi kata sandi tidak cocok.');
      return;
    }

    if (!formData.terms_accepted) {
      setErrorMsg('Anda harus menyetujui syarat kemitraan teknisi BANTUIN.');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch('/api/auth/register/technician', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          years_of_experience: Number(formData.years_of_experience) || 0,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMsg(data.message || 'Gagal mendaftar teknisi. Periksa kembali isian formulir.');
        setIsSubmitting(false);
        return;
      }

      // Simpan session storage untuk target OTP
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('bantuin_otp_user_id', String(data.data?.userId || ''));
        sessionStorage.setItem('bantuin_otp_phone', data.data?.targetPhone || formData.phone_number);
        sessionStorage.setItem('bantuin_otp_masked', data.data?.phone || '');
        sessionStorage.setItem('bantuin_otp_role', 'technician');
      }

      router.push('/verify-otp');
    } catch {
      setErrorMsg('Terjadi gangguan jaringan saat menghubungi server BANTUIN.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#11120D] text-[#FFFBF4] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden selection:bg-[#D8CFBC]/25 selection:text-[#FFFBF4]">
      {/* Ambient background light */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[350px] bg-gradient-to-tr from-[#565449]/20 via-[#D8CFBC]/10 to-transparent blur-[140px] pointer-events-none rounded-full" />
      <div className="absolute bottom-0 right-0 w-80 h-80 bg-[#565449]/15 rounded-full blur-[100px] pointer-events-none" />

      {/* Top back navigation */}
      <div className="absolute top-6 left-6 sm:top-8 sm:left-8 z-20">
        <Link
          href="/"
          className="text-xs font-medium text-[#ABA291] hover:text-[#FFFBF4] flex items-center gap-1.5 transition-colors px-3 py-1.5 rounded-xl bg-[#181913]/60 backdrop-blur-md border border-[#D8CFBC]/10 hover:border-[#D8CFBC]/25 shadow-xs"
        >
          <span>&larr; Beranda Portal</span>
        </Link>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-xl relative z-10 text-center">
        <div className="flex justify-center mb-4">
          <Link href="/" className="inline-flex items-center gap-3 group">
            <div className="w-12 h-12 rounded-2xl bg-[#1A1C16] border border-[#D8CFBC]/25 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
              <Award className="w-6 h-6 text-[#D8CFBC]" />
            </div>
            <div className="text-left">
              <span className="text-2xl font-black tracking-tight text-[#FFFBF4] block">
                BANTUIN
              </span>
              <span className="text-[11px] block text-[#D8CFBC] font-semibold tracking-wider uppercase">
                Mitra Teknisi Profesional
              </span>
            </div>
          </Link>
        </div>

        <h2 className="text-2xl sm:text-3xl font-extrabold text-[#FFFBF4] tracking-tight">
          Bergabung Sebagai Teknisi Servis
        </h2>
        <p className="mt-2 text-xs sm:text-sm text-[#ABA291] max-w-md mx-auto">
          Dapatkan pelanggan perbaikan AC, kulkas, mesin cuci, TV, dan pompa air dengan sistem penugasan adil dan proteksi Zero-NIK.
        </p>

        {/* Zero-NIK Callout */}
        <div className="mt-4 p-3.5 rounded-2xl bg-[#181913]/70 border border-[#D8CFBC]/20 flex items-center gap-3 text-xs text-[#D8CFBC] text-left backdrop-blur-md">
          <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>
            <strong className="text-[#FFFBF4]">Kebijakan Zero-NIK:</strong> Kami tidak meminta scan KTP. Verifikasi kelayakan teknisi didasarkan pada sertifikat kompetensi (BNSP/BLK/Asosiasi) atau portofolio kerja.
          </span>
        </div>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-xl relative z-10">
        <div className="bg-[#181913]/80 backdrop-blur-2xl py-8 px-6 sm:px-10 shadow-2xl rounded-3xl border border-[#D8CFBC]/20 relative overflow-hidden">
          {/* Subtle top rim light */}
          <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-[#FFFBF4]/20 to-transparent pointer-events-none" />

          {errorMsg && (
            <div className="mb-6 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3 text-rose-300 text-xs sm:text-sm animate-in fade-in">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{errorMsg}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Nama Lengkap */}
              <div>
                <label className="block text-xs font-semibold text-[#D8CFBC] mb-1.5">
                  Nama Lengkap Sesuai Sertifikat
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#706E61]" />
                  <input
                    type="text"
                    required
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    placeholder="Contoh: Rahmat Hidayat"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#565449]/40 bg-[#11120D]/70 text-sm text-[#FFFBF4] placeholder-[#706E61] focus:outline-none focus:border-[#D8CFBC] focus:ring-1 focus:ring-[#D8CFBC]/20 transition-all backdrop-blur-sm"
                  />
                </div>
              </div>

              {/* Nomor WhatsApp */}
              <div>
                <label className="block text-xs font-semibold text-[#D8CFBC] mb-1.5">
                  Nomor WhatsApp Aktif
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#706E61]" />
                  <input
                    type="tel"
                    required
                    value={formData.phone_number}
                    onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                    placeholder="08123456789"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#565449]/40 bg-[#11120D]/70 text-sm text-[#FFFBF4] placeholder-[#706E61] focus:outline-none focus:border-[#D8CFBC] focus:ring-1 focus:ring-[#D8CFBC]/20 transition-all backdrop-blur-sm"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Email */}
              <div>
                <label className="block text-xs font-semibold text-[#D8CFBC] mb-1.5">
                  Alamat Email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#706E61]" />
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="rahmat@teknisi.id"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#565449]/40 bg-[#11120D]/70 text-sm text-[#FFFBF4] placeholder-[#706E61] focus:outline-none focus:border-[#D8CFBC] focus:ring-1 focus:ring-[#D8CFBC]/20 transition-all backdrop-blur-sm"
                  />
                </div>
              </div>

              {/* Tahun Pengalaman */}
              <div>
                <label className="block text-xs font-semibold text-[#D8CFBC] mb-1.5">
                  Pengalaman Servis (Tahun)
                </label>
                <div className="relative">
                  <Briefcase className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#706E61]" />
                  <input
                    type="number"
                    min="0"
                    max="50"
                    required
                    value={formData.years_of_experience}
                    onChange={(e) => setFormData({ ...formData, years_of_experience: Number(e.target.value) })}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#565449]/40 bg-[#11120D]/70 text-sm text-[#FFFBF4] placeholder-[#706E61] focus:outline-none focus:border-[#D8CFBC] focus:ring-1 focus:ring-[#D8CFBC]/20 transition-all backdrop-blur-sm"
                  />
                </div>
              </div>
            </div>

            {/* Kata Sandi & Konfirmasi */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#D8CFBC] mb-1.5">
                  Kata Sandi
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#706E61]" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="Min. 8 karakter"
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-[#565449]/40 bg-[#11120D]/70 text-sm text-[#FFFBF4] placeholder-[#706E61] focus:outline-none focus:border-[#D8CFBC] focus:ring-1 focus:ring-[#D8CFBC]/20 transition-all backdrop-blur-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#706E61] hover:text-[#FFFBF4]"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#D8CFBC] mb-1.5">
                  Konfirmasi Kata Sandi
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#706E61]" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    value={formData.confirm_password}
                    onChange={(e) => setFormData({ ...formData, confirm_password: e.target.value })}
                    placeholder="Ulangi kata sandi"
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-[#565449]/40 bg-[#11120D]/70 text-sm text-[#FFFBF4] placeholder-[#706E61] focus:outline-none focus:border-[#D8CFBC] focus:ring-1 focus:ring-[#D8CFBC]/20 transition-all backdrop-blur-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#706E61] hover:text-[#FFFBF4]"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Bio / Ringkasan Spesialisasi */}
            <div>
              <label className="block text-xs font-semibold text-[#D8CFBC] mb-1.5">
                Ringkasan Keahlian & Peralatan yang Dikuasai
              </label>
              <textarea
                rows={3}
                value={formData.bio}
                onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                placeholder="Contoh: Spesialisasi perbaikan AC Inverter, kulkas 2 pintu, dan kelistrikan modul mesin cuci."
                className="w-full px-4 py-2.5 rounded-xl border border-[#565449]/40 bg-[#11120D]/70 text-sm text-[#FFFBF4] placeholder-[#706E61] focus:outline-none focus:border-[#D8CFBC] focus:ring-1 focus:ring-[#D8CFBC]/20 transition-all resize-none backdrop-blur-sm"
              />
              <p className="text-[11px] text-[#8C8678] mt-1">
                Setelah nomor WhatsApp terverifikasi, Anda dapat mengunggah berkas sertifikat kompetensi pada dashboard teknisi.
              </p>
            </div>

            {/* Persetujuan Syarat */}
            <div className="pt-2">
              <label className="flex items-start gap-2.5 cursor-pointer text-xs text-[#ABA291]">
                <input
                  type="checkbox"
                  required
                  checked={formData.terms_accepted}
                  onChange={(e) => setFormData({ ...formData, terms_accepted: e.target.checked })}
                  className="mt-0.5 rounded border-[#565449]/60 text-[#D8CFBC] focus:ring-[#D8CFBC]/20 bg-[#11120D] accent-[#565449]"
                />
                <span>
                  Saya menyatakan data di atas benar dan menyetujui{' '}
                  <span className="text-[#FFFBF4] hover:underline">Ketentuan Kemitraan Teknisi</span> serta Kode Etik Servis BANTUIN.
                </span>
              </label>
            </div>

            {/* Tombol Submit */}
            <div className="pt-3">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#FFFBF4] hover:bg-[#EAE3D5] text-[#11120D] font-bold text-sm shadow-lg shadow-black/30 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-[#11120D]" />
                    <span>Mendaftarkan Teknisi & Mengirim OTP...</span>
                  </>
                ) : (
                  <>
                    <span>Daftar Mitra Teknisi & Verifikasi OTP</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>

          <div className="mt-6 pt-6 border-t border-[#565449]/30 text-center space-y-2 text-xs text-[#ABA291]">
            <p>
              Sudah memiliki akun mitra?{' '}
              <Link href="/login" className="font-semibold text-[#FFFBF4] hover:underline transition-colors">
                Masuk di sini
              </Link>
            </p>
            <p>
              Ingin mendaftar sebagai Pelanggan?{' '}
              <Link
                href="/register/customer"
                className="font-semibold text-[#D8CFBC] hover:underline transition-colors"
              >
                Daftar Akun Pelanggan
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
