'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Wrench,
  User,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  Loader2,
  ShieldCheck,
} from 'lucide-react';

export default function UniversalLoginPage() {
  const router = useRouter();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!identifier.trim()) {
      setErrorMsg('Masukkan email atau nomor WhatsApp terdaftar Anda.');
      return;
    }

    if (!password) {
      setErrorMsg('Masukkan kata sandi akun Anda.');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: identifier.trim(),
          password,
          rememberMe,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        // Kasus khusus: akun belum verifikasi nomor WhatsApp
        if (data.needsVerification && data.data) {
          if (typeof window !== 'undefined') {
            sessionStorage.setItem('bantuin_otp_user_id', String(data.data.userId || ''));
            sessionStorage.setItem('bantuin_otp_phone', data.data.targetPhone || '');
            sessionStorage.setItem('bantuin_otp_masked', data.data.phone || '');
          }
          router.push('/verify-otp');
          return;
        }

        setErrorMsg(data.message || 'Email/Nomor WhatsApp atau kata sandi tidak cocok.');
        setIsSubmitting(false);
        return;
      }

      // Berhasil masuk!
      const callback = new URLSearchParams(window.location.search).get('callbackUrl');
      const targetUrl = callback || data.data?.redirectUrl || '/customer/dashboard';

      router.push(targetUrl);
      router.refresh();
    } catch {
      setErrorMsg('Gagal terhubung ke server autentikasi BANTUIN.');
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

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 text-center">
        <Link href="/" className="inline-flex items-center gap-3 group mb-4">
          <div className="w-12 h-12 rounded-2xl bg-[#1A1C16] border border-[#D8CFBC]/25 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
            <Wrench className="w-6 h-6 text-[#D8CFBC]" />
          </div>
          <div className="text-left">
            <span className="text-2xl font-black tracking-tight text-[#FFFBF4] block">
              BANTUIN
            </span>
            <span className="text-[11px] block text-[#D8CFBC] font-semibold tracking-wider uppercase">
              Platform Perbaikan Terpadu
            </span>
          </div>
        </Link>

        <h2 className="text-2xl sm:text-3xl font-extrabold text-[#FFFBF4] tracking-tight">
          Masuk ke Akun Anda
        </h2>
        <p className="mt-2 text-xs sm:text-sm text-[#ABA291] max-w-sm mx-auto">
          Akses layanan servis untuk Pelanggan atau pantau order perbaikan bagi Mitra Teknisi.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
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
            {/* Identifier: Email atau Nomor WhatsApp */}
            <div>
              <label className="block text-xs font-semibold text-[#D8CFBC] mb-1.5">
                Email atau Nomor WhatsApp
              </label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#706E61]" />
                <input
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="user@example.com atau 08123456789"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#565449]/40 bg-[#11120D]/70 text-sm text-[#FFFBF4] placeholder-[#706E61] focus:outline-none focus:border-[#D8CFBC] focus:ring-1 focus:ring-[#D8CFBC]/20 transition-all backdrop-blur-sm"
                />
              </div>
            </div>

            {/* Kata Sandi */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-[#D8CFBC]">
                  Kata Sandi
                </label>
                <Link
                  href="/forgot-password"
                  className="text-[11px] text-[#D8CFBC] hover:text-[#FFFBF4] transition-colors"
                >
                  Lupa kata sandi?
                </Link>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#706E61]" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan kata sandi Anda"
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

            {/* Remember Me */}
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-[#ABA291]">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-[#565449]/60 text-[#D8CFBC] focus:ring-[#D8CFBC]/20 bg-[#11120D] accent-[#565449]"
                />
                <span>Ingat perangkat ini (7 hari)</span>
              </label>
            </div>

            {/* Tombol Submit */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#FFFBF4] hover:bg-[#EAE3D5] text-[#11120D] font-bold text-sm shadow-lg shadow-black/30 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-[#11120D]" />
                    <span>Memverifikasi Kredensial...</span>
                  </>
                ) : (
                  <>
                    <span>Masuk ke Akun</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Opsi Pendaftaran */}
          <div className="mt-6 pt-6 border-t border-[#565449]/30 text-center space-y-2 text-xs text-[#ABA291]">
            <p>
              Belum memiliki akun?{' '}
              <Link href="/register/customer" className="font-semibold text-[#FFFBF4] hover:underline transition-colors">
                Daftar Pelanggan
              </Link>{' '}
              atau{' '}
              <Link href="/register/technician" className="font-semibold text-[#D8CFBC] hover:underline transition-colors">
                Mitra Teknisi
              </Link>
            </p>
            <p className="pt-2">
              Pengelola Sistem?{' '}
              <Link href="/admin/login" className="text-[#8C8678] hover:text-[#FFFBF4] underline transition-colors">
                Masuk ke Panel Administrator
              </Link>
            </p>
          </div>
        </div>

        <div className="mt-6 text-center text-xs text-[#8C8678] flex items-center justify-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Sesi Terenkripsi Aman • HttpOnly Cookie Protection</span>
        </div>
      </div>
    </div>
  );
}
