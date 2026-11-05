'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Shield,
  Lock,
  Mail,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  HelpCircle,
  Loader2,
  Sliders,
} from 'lucide-react';
import { adminLoginSchema } from '@/lib/validations/auth';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    // 1. Validasi input sisi klien menggunakan Zod
    const validation = adminLoginSchema.safeParse({ email, password, rememberMe });
    if (!validation.success) {
      const firstError = validation.error.issues[0]?.message || 'Input tidak valid';
      setErrorMsg(firstError);
      return;
    }

    setIsSubmitting(true);

    try {
      // 2. Hubungkan langsung ke endpoint autentikasi server
      const res = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
          rememberMe,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMsg(data.message || 'Gagal masuk. Periksa kembali email dan kata sandi Anda.');
        setIsSubmitting(false);
        return;
      }

      // 3. Autentikasi berhasil: Arahkan ke callbackUrl atau dashboard /admin
      const searchParams = new URLSearchParams(window.location.search);
      const callbackUrl = searchParams.get('callbackUrl') || '/admin';

      router.push(callbackUrl);
      router.refresh();
    } catch {
      setErrorMsg('Gagal terhubung ke server autentikasi. Pastikan koneksi dan server berjalan.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#11120D] text-[#FFFBF4] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden selection:bg-[#D8CFBC]/25 selection:text-[#FFFBF4]">
      {/* Decorative ambient liquid glow in warm bone & olive */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[650px] h-[350px] bg-gradient-to-tr from-[#565449]/20 via-[#D8CFBC]/10 to-transparent blur-[140px] pointer-events-none rounded-full" />
      <div className="absolute -bottom-20 right-0 w-80 h-80 bg-[#565449]/15 rounded-full blur-[100px] pointer-events-none" />

      {/* Top back navigation */}
      <div className="absolute top-6 left-6 sm:top-8 sm:left-8 z-20">
        <Link
          href="/"
          className="text-xs font-medium text-[#ABA291] hover:text-[#FFFBF4] flex items-center gap-1.5 transition-colors px-3 py-1.5 rounded-xl bg-[#181913]/60 backdrop-blur-md border border-[#D8CFBC]/10 hover:border-[#D8CFBC]/25 shadow-xs"
        >
          <span>&larr; Beranda Portal</span>
        </Link>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        {/* Brand Logo & Icon */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-[#1A1C16] border border-[#D8CFBC]/20 flex items-center justify-center mx-auto shadow-2xl mb-4 group relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-tr from-[#565449]/30 to-transparent pointer-events-none" />
            <Shield className="w-7 h-7 text-[#D8CFBC] relative z-10" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#FFFBF4]">
            Login Administrator
          </h2>
          <p className="text-xs sm:text-sm text-[#ABA291] mt-1.5">
            Konsol kendali operasional platform resmi BANTUIN
          </p>
        </div>

        {/* Liquid Glass Login Card */}
        <div className="bg-[#181913]/80 backdrop-blur-2xl border border-[#D8CFBC]/20 p-6 sm:p-8 rounded-3xl shadow-2xl relative overflow-hidden">
          {/* Subtle rim highlight */}
          <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-[#FFFBF4]/20 to-transparent pointer-events-none" />

          {errorMsg && (
            <div className="p-3.5 mb-5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2.5 text-xs text-rose-300 animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email Field */}
            <div>
              <label className="block text-xs font-semibold text-[#D8CFBC] mb-1.5">
                Alamat Email Administrator
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#706E61]" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@bantuin.id"
                  required
                  autoComplete="email"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#11120D]/70 border border-[#565449]/40 text-sm text-[#FFFBF4] placeholder-[#706E61] focus:outline-none focus:border-[#D8CFBC] focus:ring-1 focus:ring-[#D8CFBC]/20 transition-all backdrop-blur-sm"
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-[#D8CFBC]">
                  Kata Sandi
                </label>
                <button
                  type="button"
                  onClick={() => alert('Fitur reset password admin dikelola secara terpusat oleh Super Administrator via CLI atau konsol database.')}
                  className="text-[11px] text-[#D8CFBC] hover:text-[#FFFBF4] transition-colors"
                >
                  Bantuan Sandi?
                </button>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#706E61]" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  autoComplete="current-password"
                  className="w-full pl-10 pr-11 py-2.5 rounded-xl bg-[#11120D]/70 border border-[#565449]/40 text-sm text-[#FFFBF4] placeholder-[#706E61] focus:outline-none focus:border-[#D8CFBC] focus:ring-1 focus:ring-[#D8CFBC]/20 transition-all backdrop-blur-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#706E61] hover:text-[#FFFBF4] transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Remember Me Checkbox */}
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-[#565449]/60 bg-[#11120D] text-[#D8CFBC] focus:ring-[#D8CFBC]/30 accent-[#565449]"
                />
                <span className="text-xs text-[#ABA291] select-none">Ingat sesi perangkat ini</span>
              </label>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#FFFBF4] hover:bg-[#EAE3D5] text-[#11120D] font-bold text-sm shadow-lg shadow-black/30 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-[#11120D]" />
                    <span>Memverifikasi Otorisasi...</span>
                  </>
                ) : (
                  <>
                    <span>Masuk ke Panel Admin</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Security Notice */}
          <div className="mt-6 pt-5 border-t border-[#565449]/30 flex items-start gap-2 text-[11px] text-[#8C8678]">
            <HelpCircle className="w-3.5 h-3.5 text-[#706E61] shrink-0 mt-0.5" />
            <span>
              Akses terbatas hanya untuk staf berwenang. Seluruh aktivitas login dicatat dan diverifikasi di server secara aman.
            </span>
          </div>

          <div className="mt-4 pt-3 text-center border-t border-[#565449]/20">
            <Link
              href="/login"
              className="text-xs text-[#D8CFBC] hover:text-[#FFFBF4] font-medium transition-colors"
            >
              &larr; Masuk sebagai Pelanggan atau Mitra Teknisi
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
