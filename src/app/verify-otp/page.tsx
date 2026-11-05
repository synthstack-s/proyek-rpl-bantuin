'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Wrench,
  ShieldCheck,
  Phone,
  RefreshCw,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Loader2,
  MessageSquareCode,
  ArrowLeft,
} from 'lucide-react';

export default function VerifyOtpPage() {
  const router = useRouter();

  // State
  const [userId, setUserId] = useState<number | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [maskedPhone, setMaskedPhone] = useState('');
  const [role, setRole] = useState('customer');

  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const [cooldown, setCooldown] = useState(60);
  const [isResending, setIsResending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);

  // Ambil state dari sessionStorage saat dimuat
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedId = sessionStorage.getItem('bantuin_otp_user_id');
      const storedPhone = sessionStorage.getItem('bantuin_otp_phone');
      const storedMasked = sessionStorage.getItem('bantuin_otp_masked');
      const storedRole = sessionStorage.getItem('bantuin_otp_role');

      if (storedId) setUserId(Number(storedId));
      if (storedPhone) setPhoneNumber(storedPhone);
      if (storedMasked) setMaskedPhone(storedMasked);
      if (storedRole) setRole(storedRole);

      // Focus digit pertama
      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 100);
    }
  }, []);

  // Timer Countdown Kirim Ulang
  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  // Handle Input OTP per Digit
  const handleDigitChange = (index: number, value: string) => {
    // Hanya izinkan angka
    const digit = value.replace(/\D/g, '').slice(-1);
    const updated = [...otpDigits];
    updated[index] = digit;
    setOtpDigits(updated);
    setErrorMsg(null);

    // Auto-advance ke input berikutnya
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;

    const updated = [...otpDigits];
    for (let i = 0; i < 6; i++) {
      updated[i] = pasted[i] || '';
    }
    setOtpDigits(updated);

    const focusIdx = Math.min(pasted.length, 5);
    inputRefs.current[focusIdx]?.focus();
  };

  // Submit Verifikasi OTP
  const handleVerify = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg(null);

    const fullCode = otpDigits.join('');
    if (fullCode.length !== 6) {
      setErrorMsg('Silakan masukkan 6 digit kode OTP secara lengkap.');
      return;
    }

    setIsVerifying(true);

    try {
      const res = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId || undefined,
          phone_number: phoneNumber || undefined,
          otp_code: fullCode,
          purpose: 'registration',
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMsg(data.message || 'Kode OTP tidak valid atau telah kedaluwarsa.');
        if (data.remainingAttempts !== undefined) {
          setRemainingAttempts(data.remainingAttempts);
        }
        setIsVerifying(false);
        return;
      }

      setSuccessMsg('Verifikasi nomor WhatsApp sukses! Mengalihkan ke dashboard...');

      // Bersihkan session storage OTP
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('bantuin_otp_user_id');
        sessionStorage.removeItem('bantuin_otp_phone');
        sessionStorage.removeItem('bantuin_otp_masked');
        sessionStorage.removeItem('bantuin_otp_role');
      }

      // Redirect ke dashboard role bersangkutan
      setTimeout(() => {
        const dest = data.data?.redirectUrl || (role === 'technician' ? '/technician/dashboard' : '/customer/dashboard');
        router.push(dest);
        router.refresh();
      }, 1500);
    } catch {
      setErrorMsg('Gagal memverifikasi OTP karena kendala koneksi.');
      setIsVerifying(false);
    }
  };

  // Kirim Ulang OTP
  const handleResend = async () => {
    if (cooldown > 0 || isResending) return;
    setIsResending(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId || undefined,
          phone_number: phoneNumber || undefined,
          purpose: 'registration',
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMsg(data.message || 'Gagal mengirim ulang OTP.');
        if (data.cooldownSeconds) {
          setCooldown(data.cooldownSeconds);
        }
        setIsResending(false);
        return;
      }

      setSuccessMsg('Kode OTP baru telah berhasil dikirim ke WhatsApp Anda!');
      setCooldown(data.data?.cooldownSeconds || 60);
      setOtpDigits(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } catch {
      setErrorMsg('Gagal mengirim ulang OTP karena gangguan jaringan.');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#11120D] text-[#FFFBF4] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden selection:bg-[#D8CFBC]/25 selection:text-[#FFFBF4]">
      {/* Ambient background light */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[350px] bg-gradient-to-tr from-[#565449]/20 via-[#D8CFBC]/10 to-transparent blur-[140px] pointer-events-none rounded-full" />
      <div className="absolute bottom-0 right-0 w-80 h-80 bg-[#565449]/15 rounded-full blur-[100px] pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 text-center">
        <div className="w-16 h-16 rounded-3xl bg-[#1A1C16] border border-[#D8CFBC]/25 flex items-center justify-center shadow-xl mx-auto mb-4">
          <MessageSquareCode className="w-8 h-8 text-[#D8CFBC]" />
        </div>

        <h2 className="text-2xl sm:text-3xl font-extrabold text-[#FFFBF4] tracking-tight">
          Verifikasi Nomor WhatsApp
        </h2>
        <p className="mt-2 text-xs sm:text-sm text-[#ABA291] max-w-sm mx-auto leading-relaxed">
          Masukkan 6 digit kode OTP yang kami kirimkan ke nomor WhatsApp:{' '}
          <span className="font-mono font-bold text-[#FFFBF4] block mt-1 text-base">
            {maskedPhone || phoneNumber || 'Nomor WhatsApp Anda'}
          </span>
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
              <div className="flex-1 leading-relaxed">
                <p>{errorMsg}</p>
                {remainingAttempts !== null && remainingAttempts > 0 && (
                  <p className="mt-1 text-xs text-rose-400">
                    Sisa kesempatan percobaan: {remainingAttempts} kali.
                  </p>
                )}
              </div>
            </div>
          )}

          <form onSubmit={handleVerify} className="space-y-6">
            {/* 6 Digit Inputs */}
            <div>
              <label className="block text-xs font-semibold text-[#D8CFBC] text-center mb-3">
                Ketik 6 Digit Kode OTP
              </label>
              <div className="flex items-center justify-between gap-2 sm:gap-2.5" onPaste={handlePaste}>
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
                    className="w-12 h-14 sm:w-13 sm:h-16 text-center text-xl sm:text-2xl font-bold font-mono rounded-2xl border border-[#565449]/40 bg-[#11120D]/80 text-[#FFFBF4] focus:outline-none focus:border-[#D8CFBC] focus:ring-2 focus:ring-[#D8CFBC]/20 transition-all shadow-inner backdrop-blur-sm"
                  />
                ))}
              </div>
              <p className="text-[11px] text-[#8C8678] text-center mt-2.5">
                Masa berlaku kode: <span className="font-semibold text-[#D8CFBC]">5 menit</span>
              </p>
            </div>

            {/* Tombol Verifikasi */}
            <button
              type="submit"
              disabled={isVerifying || otpDigits.join('').length !== 6}
              className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-[#FFFBF4] hover:bg-[#EAE3D5] text-[#11120D] font-bold text-sm shadow-lg shadow-black/30 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isVerifying ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#11120D]" />
                  <span>Memvalidasi Kode...</span>
                </>
              ) : (
                <>
                  <span>Verifikasi Sekarang</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Bagian Kirim Ulang OTP */}
          <div className="mt-6 pt-6 border-t border-[#565449]/30 text-center space-y-3">
            <div className="text-xs text-[#ABA291]">
              Belum menerima kode OTP di WhatsApp?
            </div>

            {cooldown > 0 ? (
              <div className="inline-flex items-center gap-2 text-xs font-medium text-[#ABA291] bg-[#11120D]/70 px-3 py-1.5 rounded-xl border border-[#565449]/30">
                <RefreshCw className="w-3.5 h-3.5 text-[#D8CFBC] animate-spin" />
                <span>
                  Kirim ulang tersedia dalam <strong className="text-[#FFFBF4] font-mono">{cooldown} detik</strong>
                </span>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleResend}
                disabled={isResending}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#565449]/30 hover:bg-[#565449]/50 text-xs font-semibold text-[#D8CFBC] hover:text-[#FFFBF4] border border-[#D8CFBC]/15 transition-colors disabled:opacity-50"
              >
                {isResending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Mengirim Ulang via WhatsApp...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Kirim Ulang Kode OTP</span>
                  </>
                )}
              </button>
            )}

            {/* Opsi Ubah Nomor Telepon */}
            <div className="pt-2">
              <Link
                href={role === 'technician' ? '/register/technician' : '/register/customer'}
                className="inline-flex items-center gap-1.5 text-xs text-[#8C8678] hover:text-[#D8CFBC] transition-colors"
              >
                <ArrowLeft className="w-3 h-3" />
                <span>Nomor salah? Kembali ke pendaftaran</span>
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-6 text-center text-xs text-[#8C8678] flex items-center justify-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Pengiriman Resmi Fonnte WhatsApp Gateway API</span>
        </div>
      </div>
    </div>
  );
}
