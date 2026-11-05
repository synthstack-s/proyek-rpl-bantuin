'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Wrench,
  User,
  KeyRound,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';

export default function ForgotPasswordPage() {
  const router = useRouter();

  // Step 1: Minta OTP | Step 2: Masukkan OTP & Sandi Baru | Step 3: Sukses
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [identifier, setIdentifier] = useState('');
  const [userId, setUserId] = useState<number | null>(null);
  const [targetPhone, setTargetPhone] = useState('');
  const [maskedPhone, setMaskedPhone] = useState('');

  // Step 2 Form
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [cooldown, setCooldown] = useState(60);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Countdown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // Handle Input Digit OTP
  const handleDigitChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const updated = [...otpDigits];
    updated[index] = digit;
    setOtpDigits(updated);
    setErrorMsg(null);

    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  // Submit Step 1: Kirim Kode OTP Reset
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) return;

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/auth/password/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim() }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMsg(data.message || 'Akun tidak ditemukan atau gagal mengirim OTP.');
        setIsSubmitting(false);
        return;
      }

      setUserId(data.data?.userId);
      setTargetPhone(data.data?.targetPhone);
      setMaskedPhone(data.data?.phone);
      setCooldown(data.data?.cooldownSeconds || 60);
      setStep(2);
      setTimeout(() => inputRefs.current[0]?.focus(), 150);
    } catch {
      setErrorMsg('Terjadi kesalahan jaringan saat meminta kode reset.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Kirim Ulang OTP
  const handleResendOtp = async () => {
    if (cooldown > 0 || isSubmitting) return;
    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/auth/password/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: targetPhone || identifier.trim() }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMsg(data.message || 'Gagal mengirim ulang kode OTP.');
        setIsSubmitting(false);
        return;
      }

      setCooldown(data.data?.cooldownSeconds || 60);
      setSuccessMsg('Kode OTP reset baru telah dikirimkan ke WhatsApp Anda!');
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch {
      setErrorMsg('Gagal mengirim ulang kode OTP.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Step 2: Verifikasi & Reset Password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const fullOtp = otpDigits.join('');
    if (fullOtp.length !== 6) {
      setErrorMsg('Silakan masukkan 6 digit kode OTP secara lengkap.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('Konfirmasi kata sandi tidak cocok dengan kata sandi baru.');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch('/api/auth/password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId || undefined,
          phone_number: targetPhone || undefined,
          otp_code: fullOtp,
          new_password: newPassword,
          confirm_password: confirmPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMsg(data.message || 'Gagal memperbarui kata sandi. Periksa kode OTP Anda.');
        setIsSubmitting(false);
        return;
      }

      setStep(3);
    } catch {
      setErrorMsg('Terjadi gangguan jaringan saat menyimpan kata sandi baru.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#11120D] text-[#FFFBF4] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden selection:bg-[#D8CFBC]/25 selection:text-[#FFFBF4]">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[350px] bg-gradient-to-tr from-[#565449]/20 via-[#D8CFBC]/10 to-transparent blur-[140px] pointer-events-none rounded-full" />
      <div className="absolute bottom-0 right-0 w-80 h-80 bg-[#565449]/15 rounded-full blur-[100px] pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 text-center">
        <Link href="/" className="inline-flex items-center gap-3 group mb-4">
          <div className="w-12 h-12 rounded-2xl bg-[#1A1C16] border border-[#D8CFBC]/25 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
            <KeyRound className="w-6 h-6 text-[#D8CFBC]" />
          </div>
          <div className="text-left">
            <span className="text-2xl font-black tracking-tight text-[#FFFBF4] block">
              BANTUIN
            </span>
            <span className="text-[11px] block text-[#D8CFBC] font-semibold tracking-wider uppercase">
              Pemulihan Akun
            </span>
          </div>
        </Link>

        <h2 className="text-2xl sm:text-3xl font-extrabold text-[#FFFBF4] tracking-tight">
          {step === 3 ? 'Kata Sandi Berhasil Diperbarui' : 'Atur Ulang Kata Sandi'}
        </h2>
        <p className="mt-2 text-xs sm:text-sm text-[#ABA291] max-w-sm mx-auto">
          {step === 1 && 'Masukkan email atau nomor WhatsApp terdaftar untuk menerima kode verifikasi OTP.'}
          {step === 2 && `Kode OTP 6 digit telah dikirim ke WhatsApp ${maskedPhone || 'Anda'}.`}
          {step === 3 && 'Akun Anda telah diamankan dengan kata sandi baru. Silakan masuk kembali.'}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="bg-[#181913]/80 backdrop-blur-2xl py-8 px-6 sm:px-10 shadow-2xl rounded-3xl border border-[#D8CFBC]/20 relative overflow-hidden">
          {/* Subtle top rim light */}
          <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-[#FFFBF4]/20 to-transparent pointer-events-none" />

          {/* Success Message Alert */}
          {successMsg && (
            <div className="mb-6 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-3 text-emerald-300 text-xs sm:text-sm animate-in fade-in">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{successMsg}</div>
            </div>
          )}

          {/* Error Message Alert */}
          {errorMsg && (
            <div className="mb-6 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3 text-rose-300 text-xs sm:text-sm animate-in fade-in">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{errorMsg}</div>
            </div>
          )}

          {/* STEP 1: INPUT IDENTIFIER */}
          {step === 1 && (
            <form onSubmit={handleRequestOtp} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#D8CFBC] mb-1.5">
                  Email atau Nomor WhatsApp Terdaftar
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#706E61]" />
                  <input
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="Contoh: 08123456789 atau user@example.com"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#565449]/40 bg-[#11120D]/70 text-sm text-[#FFFBF4] placeholder-[#706E61] focus:outline-none focus:border-[#D8CFBC] focus:ring-1 focus:ring-[#D8CFBC]/20 transition-all backdrop-blur-sm"
                  />
                </div>
                <p className="text-[11px] text-[#8C8678] mt-1">
                  Kode OTP pemulihan akan dikirimkan otomatis ke nomor WhatsApp akun Anda.
                </p>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting || !identifier.trim()}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#FFFBF4] hover:bg-[#EAE3D5] text-[#11120D] font-bold text-sm shadow-lg shadow-black/30 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-[#11120D]" />
                      <span>Mengirim Kode OTP...</span>
                    </>
                  ) : (
                    <>
                      <span>Kirim Kode Verifikasi WhatsApp</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>

              <div className="pt-4 text-center">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 text-xs text-[#8C8678] hover:text-[#FFFBF4] transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Kembali ke Halaman Masuk</span>
                </Link>
              </div>
            </form>
          )}

          {/* STEP 2: MASUKKAN OTP & KATA SANDI BARU */}
          {step === 2 && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#D8CFBC] text-center mb-2">
                  Ketik 6 Digit Kode OTP dari WhatsApp
                </label>
                <div className="flex items-center justify-between gap-2">
                  {otpDigits.map((digit, idx) => (
                    <input
                      key={idx}
                      ref={(el) => { inputRefs.current[idx] = el; }}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleDigitChange(idx, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(idx, e)}
                      className="w-12 h-13 text-center text-xl font-bold font-mono rounded-xl border border-[#565449]/40 bg-[#11120D]/80 text-[#FFFBF4] focus:outline-none focus:border-[#D8CFBC] focus:ring-1 focus:ring-[#D8CFBC]/20 transition-all backdrop-blur-sm"
                    />
                  ))}
                </div>
              </div>

              {/* Kata Sandi Baru */}
              <div>
                <label className="block text-xs font-semibold text-[#D8CFBC] mb-1.5">
                  Kata Sandi Baru
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#706E61]" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min. 8 karakter (huruf besar, kecil, angka)"
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

              {/* Konfirmasi Kata Sandi Baru */}
              <div>
                <label className="block text-xs font-semibold text-[#D8CFBC] mb-1.5">
                  Konfirmasi Kata Sandi Baru
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#706E61]" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Ketik ulang kata sandi baru"
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

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting || otpDigits.join('').length !== 6}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#FFFBF4] hover:bg-[#EAE3D5] text-[#11120D] font-bold text-sm shadow-lg shadow-black/30 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-[#11120D]" />
                      <span>Menyimpan Sandi Baru...</span>
                    </>
                  ) : (
                    <>
                      <span>Simpan Kata Sandi Baru</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>

              {/* Kirim Ulang OTP */}
              <div className="pt-2 text-center">
                {cooldown > 0 ? (
                  <span className="text-xs text-[#8C8678]">
                    Kirim ulang OTP dalam <strong className="text-[#FFFBF4] font-mono">{cooldown}s</strong>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    className="inline-flex items-center gap-1.5 text-xs text-[#D8CFBC] hover:text-[#FFFBF4] transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Kirim Ulang Kode OTP ke WhatsApp</span>
                  </button>
                )}
              </div>
            </form>
          )}

          {/* STEP 3: SUKSES */}
          {step === 3 && (
            <div className="text-center py-4 space-y-4">
              <div className="w-16 h-16 rounded-3xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <h3 className="text-lg font-bold text-[#FFFBF4]">Sandi Berhasil Diperbarui!</h3>
              <p className="text-xs text-[#ABA291] leading-relaxed max-w-xs mx-auto">
                Kata sandi baru akun Anda telah aktif dan dapat langsung digunakan untuk masuk ke platform BANTUIN.
              </p>

              <div className="pt-4">
                <Link
                  href="/login"
                  className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#FFFBF4] hover:bg-[#EAE3D5] text-[#11120D] font-bold text-sm shadow-lg shadow-black/30 transition-all"
                >
                  <span>Masuk ke Akun Sekarang</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 text-center text-xs text-[#8C8678] flex items-center justify-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Verifikasi Identitas Resmi Fonnte WhatsApp Gateway</span>
        </div>
      </div>
    </div>
  );
}
