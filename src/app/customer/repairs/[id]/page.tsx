'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Wrench,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  ArrowLeft,
  User,
  Phone,
  MapPin,
  Calendar,
  Layers,
  Coins,
  ShieldCheck,
  RefreshCw,
  Loader2,
  FileText,
  AlertTriangle,
  X,
  MessageSquare,
  CreditCard,
  QrCode,
  Banknote,
  Send,
  Star,
} from 'lucide-react';
import RepairChatDrawer from '@/components/chat/RepairChatDrawer';
import RepairReviewModal from '@/components/reviews/RepairReviewModal';

interface StatusHistoryItem {
  id: number;
  previousStatus: string | null;
  newStatus: string;
  actorRole: string;
  notes: string | null;
  createdAt: string;
}

interface RepairDetail {
  id: number;
  orderCode: string;
  status: string;
  deviceBrand: string;
  deviceModel: string;
  problemDescription: string;
  problemPhotos: string[];
  addressText: string;
  latitude: number;
  longitude: number;
  createdAt: string;
  updatedAt: string;
  category: {
    id: number;
    name: string;
    slug: string;
    iconUrl: string | null;
  };
  service: {
    id: number;
    name: string;
    basePrice: number;
    estimatedDurationMin: number;
  } | null;
  history: StatusHistoryItem[];
  technician: {
    name: string;
    phone: string;
    avatarUrl: string | null;
    yearsOfExperience: number;
    ratingAvg: number;
    ratingCount: number;
    assignmentStatus: string;
  } | null;
  diagnosis: {
    id: number;
    damageDetails: string;
    laborCost: number;
    partsCost: number;
    totalEstimate: number;
    customerApproval: string;
    rejectionReason: string | null;
  } | null;
  invoice: {
    invoiceNumber: string;
    totalAmount: number;
    status: string;
    paidAt: string | null;
  } | null;
}

const statusBadgeConfig: Record<string, { label: string; color: string; stepIdx: number }> = {
  submitted: { label: 'Pesanan Diajukan', color: 'bg-[#565449]/30 text-[#D8CFBC] border-[#D8CFBC]/20', stepIdx: 1 },
  assigned: { label: 'Teknisi Ditugaskan', color: 'bg-[#565449]/40 text-[#FFFBF4] border-[#D8CFBC]/30', stepIdx: 2 },
  scheduled: { label: 'Jadwal Terkonfirmasi', color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25', stepIdx: 2 },
  in_diagnosis: { label: 'Sedang Diperiksa', color: 'bg-amber-500/15 text-amber-300 border-amber-500/25', stepIdx: 3 },
  estimated: { label: 'Menunggu Persetujuan Biaya', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30', stepIdx: 3 },
  customer_approved: { label: 'Biaya Disetujui', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', stepIdx: 4 },
  in_repair: { label: 'Pengerjaan Perbaikan', color: 'bg-[#D8CFBC]/20 text-[#FFFBF4] border-[#D8CFBC]/30', stepIdx: 4 },
  completed: { label: 'Perbaikan Selesai', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', stepIdx: 5 },
  cancelled: { label: 'Pesanan Dibatalkan', color: 'bg-rose-500/15 text-rose-300 border-rose-500/25', stepIdx: 0 },
  complained: { label: 'Dalam Penanganan Keluhan', color: 'bg-rose-500/20 text-rose-300 border-rose-500/30', stepIdx: 5 },
};

export default function RepairDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const repairId = resolvedParams.id;
  const router = useRouter();

  const [repair, setRepair] = useState<RepairDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Modal Batal Pesanan
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isSubmittingCancel, setIsSubmittingCancel] = useState(false);

  // Modal Pembayaran
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'qris' | 'bank_transfer' | 'cash_on_delivery'>('qris');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  // Modal Komplain / Garansi
  const [isComplaintModalOpen, setIsComplaintModalOpen] = useState(false);
  const [complaintCategory, setComplaintCategory] = useState('recurring_damage');
  const [complaintDesc, setComplaintDesc] = useState('');
  const [isSubmittingComplaint, setIsSubmittingComplaint] = useState(false);

  // State Approval Diagnosis
  const [isSubmittingApproval, setIsSubmittingApproval] = useState(false);

  // In-App Chat Drawer
  const [isChatDrawerOpen, setIsChatDrawerOpen] = useState(false);

  // Review & Rating Modal
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [existingReview, setExistingReview] = useState<any | null>(null);

  // Jadwal Kunjungan Fisik
  const [schedules, setSchedules] = useState<any[]>([]);

  const fetchDetail = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/customer/repairs/${repairId}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Gagal memuat detail pesanan');
      }
      setRepair(data.data);

      // Ambil data ulasan jika ada
      try {
        const revRes = await fetch(`/api/customer/repairs/${repairId}/review`);
        const revData = await revRes.json();
        if (revRes.ok && revData.success && revData.data) {
          setExistingReview(revData.data);
        }
      } catch {}

      // Ambil data jadwal jika ada
      try {
        const schedRes = await fetch(`/api/repairs/${repairId}/schedule`);
        const schedData = await schedRes.json();
        if (schedRes.ok && schedData.success && schedData.data) {
          setSchedules(schedData.data);
        }
      } catch {}
    } catch (err: any) {
      setErrorMsg(err.message || 'Terjadi kesalahan sistem');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
  }, [repairId]);

  const handleCancelOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelReason.trim()) return;

    setIsSubmittingCancel(true);
    try {
      const res = await fetch(`/api/customer/repairs/${repairId}/cancel`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cancellation_reason: cancelReason.trim() }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        alert(data.message || 'Gagal membatalkan pesanan');
        return;
      }

      setIsCancelModalOpen(false);
      setCancelReason('');
      fetchDetail();
    } catch {
      alert('Terjadi kesalahan jaringan');
    } finally {
      setIsSubmittingCancel(false);
    }
  };

  const handleDiagnosisDecision = async (decision: 'approve' | 'reject') => {
    if (!repair?.diagnosis) return;

    let reason: string | undefined = undefined;
    if (decision === 'reject') {
      const inputReason = prompt('Masukkan alasan penolakan estimasi biaya:');
      if (inputReason === null) return;
      reason = inputReason.trim() || 'Biaya terlalu tinggi';
    }

    setIsSubmittingApproval(true);
    try {
      const res = await fetch(`/api/customer/repairs/${repairId}/estimate`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: decision,
          rejection_reason: reason,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.message || 'Gagal memperbarui status estimasi');
        return;
      }

      fetchDetail();
    } catch {
      alert('Gagal memproses persetujuan biaya');
    } finally {
      setIsSubmittingApproval(false);
    }
  };

  const handlePayInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repair?.invoice) return;

    setIsSubmittingPayment(true);
    try {
      const res = await fetch(`/api/customer/repairs/${repairId}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_method: paymentMethod,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.message || 'Gagal memproses pembayaran invoice');
        return;
      }

      setIsPaymentModalOpen(false);
      fetchDetail();
    } catch {
      alert('Terjadi gangguan jaringan saat membayar tagihan');
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const handleSubmitComplaint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!complaintDesc.trim()) return;

    setIsSubmittingComplaint(true);
    try {
      const res = await fetch(`/api/customer/repairs/${repairId}/complaint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          complaint_category: complaintCategory,
          description: complaintDesc.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.message || 'Gagal mengirimkan laporan keluhan');
        return;
      }

      setIsComplaintModalOpen(false);
      setComplaintDesc('');
      alert('Laporan pengaduan garansi Anda telah berhasil dikirim ke Admin BANTUIN.');
      fetchDetail();
    } catch {
      alert('Terjadi kesalahan jaringan');
    } finally {
      setIsSubmittingComplaint(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#11120D] text-[#FFFBF4] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-[#D8CFBC]" />
        <p className="text-xs text-[#ABA291]">Memuat status pesanan...</p>
      </div>
    );
  }

  if (errorMsg || !repair) {
    return (
      <div className="min-h-screen bg-[#11120D] text-[#FFFBF4] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mb-4">
          <AlertCircle className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-bold text-[#FFFBF4] mb-1">Pesanan Tidak Ditemukan</h2>
        <p className="text-xs text-[#ABA291] max-w-sm mb-6">{errorMsg || 'Data pesanan mungkin telah dihapus.'}</p>
        <Link
          href="/customer/dashboard"
          className="px-4 py-2 rounded-xl bg-[#FFFBF4] hover:bg-[#EAE3D5] text-xs font-bold text-[#11120D] transition-all"
        >
          Kembali ke Dashboard
        </Link>
      </div>
    );
  }

  const badgeInfo = statusBadgeConfig[repair.status] || {
    label: repair.status,
    color: 'bg-[#565449]/30 text-[#D8CFBC] border-[#D8CFBC]/20',
    stepIdx: 1,
  };

  const isCancelable = ['draft', 'submitted', 'assigned'].includes(repair.status);
  const showDiagnosisDecision = Boolean(
    repair.diagnosis &&
    (repair.status === 'estimated' || repair.diagnosis.customerApproval === 'pending')
  );
  const showPaymentAction = Boolean(
    repair.invoice &&
    repair.invoice.status === 'unpaid'
  );
  const showComplaintAction = Boolean(
    repair.status === 'completed' || repair.status === 'complained'
  );

  return (
    <div className="min-h-screen bg-[#11120D] text-[#FFFBF4] p-4 sm:p-8 lg:p-12 relative overflow-hidden selection:bg-[#D8CFBC]/25 selection:text-[#FFFBF4]">
      {/* Ambient background light */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[350px] bg-gradient-to-b from-[#565449]/20 via-[#D8CFBC]/10 to-transparent blur-[140px] pointer-events-none rounded-full" />
      <div className="absolute bottom-10 right-0 w-80 h-80 bg-[#565449]/15 rounded-full blur-[110px] pointer-events-none" />

      <div className="max-w-4xl mx-auto space-y-8 relative z-10">
        {/* Navigation Bar */}
        <div className="flex items-center justify-between pb-4 border-b border-[#D8CFBC]/15">
          <Link
            href="/customer/dashboard"
            className="inline-flex items-center gap-2 text-xs font-semibold text-[#ABA291] hover:text-[#FFFBF4] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Kembali ke Dashboard Pelanggan</span>
          </Link>

          <button
            onClick={fetchDetail}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#181913]/70 hover:bg-[#22241D] border border-[#D8CFBC]/15 text-xs text-[#D8CFBC] transition-all shadow-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Segarkan Status</span>
          </button>
        </div>

        {/* Order Header Banner */}
        <div className="p-6 sm:p-8 rounded-3xl bg-[#181913]/85 backdrop-blur-2xl border border-[#D8CFBC]/25 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-[#FFFBF4]/20 to-transparent pointer-events-none" />

          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs sm:text-sm font-bold text-[#FFFBF4] bg-[#22241D] px-3 py-1 rounded-full border border-[#D8CFBC]/25">
                {repair.orderCode}
              </span>
              <span className={`text-xs font-bold px-3 py-1 rounded-full border backdrop-blur-xs ${badgeInfo.color}`}>
                {badgeInfo.label}
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#FFFBF4] tracking-tight">
              {repair.category.name}
            </h1>

            <p className="text-xs sm:text-sm text-[#D8CFBC]">
              {repair.service ? repair.service.name : 'Inspeksi & Diagnosis Umum'} • Dipesan pada{' '}
              {new Date(repair.createdAt).toLocaleDateString('id-ID', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isCancelable && (
              <button
                onClick={() => setIsCancelModalOpen(true)}
                className="px-4 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold transition-colors"
              >
                Batalkan Pesanan
              </button>
            )}

            {showComplaintAction && (
              <button
                onClick={() => setIsComplaintModalOpen(true)}
                className="px-4 py-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold transition-colors flex items-center gap-1.5"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                <span>Klaim Garansi / Komplain</span>
              </button>
            )}
          </div>
        </div>

        {/* 1. KOTAK AKSI: Persetujuan Estimasi Biaya dari Teknisi */}
        {showDiagnosisDecision && repair.diagnosis && (
          <div className="p-6 rounded-3xl bg-[#1F211A]/90 backdrop-blur-xl border border-amber-500/40 shadow-xl space-y-4 animate-fadeIn relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-400" />
                <span>Teknisi Telah Mengajukan Rincian Biaya</span>
              </span>
              <span className="text-xs font-mono font-bold text-[#FFFBF4] bg-[#11120D]/80 px-3 py-1 rounded-full border border-amber-500/40">
                Total: Rp {repair.diagnosis.totalEstimate.toLocaleString('id-ID')}
              </span>
            </div>

            <div className="text-xs text-[#D8CFBC] space-y-1 bg-[#11120D]/70 p-4 rounded-2xl border border-[#565449]/30">
              <p className="font-bold text-[#FFFBF4] mb-1">Rincian Hasil Pemeriksaan Fisik:</p>
              <p className="italic">{repair.diagnosis.damageDetails}</p>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#565449]/20 text-[11px]">
                <span>Ongkos Jasa: Rp {repair.diagnosis.laborCost.toLocaleString('id-ID')}</span>
                <span>Biaya Sparepart: Rp {repair.diagnosis.partsCost.toLocaleString('id-ID')}</span>
              </div>
            </div>

            <p className="text-xs text-amber-200">
              Perbaikan baru akan dieksekusi setelah Anda menyetujui rincian biaya di atas.
            </p>

            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={() => handleDiagnosisDecision('approve')}
                disabled={isSubmittingApproval}
                className="px-5 py-2.5 rounded-xl bg-[#FFFBF4] hover:bg-[#EAE3D5] text-[#11120D] font-bold text-xs shadow-md shadow-black/30 transition-all disabled:opacity-50"
              >
                {isSubmittingApproval ? 'Memproses...' : '✓ Setujui Estimasi Biaya'}
              </button>

              <button
                onClick={() => handleDiagnosisDecision('reject')}
                disabled={isSubmittingApproval}
                className="px-4 py-2.5 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 font-semibold text-xs transition-colors disabled:opacity-50"
              >
                ✕ Tolak Biaya
              </button>
            </div>
          </div>
        )}

        {/* 2. KOTAK AKSI: Tagihan Invoice & Pembayaran */}
        {repair.invoice && (
          <div className="p-6 rounded-3xl bg-[#181913]/85 backdrop-blur-2xl border border-[#D8CFBC]/25 shadow-xl space-y-4 relative overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-[#D8CFBC]" />
                <span className="font-bold text-[#FFFBF4] text-sm">
                  Tagihan Invoice #{repair.invoice.invoiceNumber}
                </span>
              </div>
              <span
                className={`text-xs font-bold px-3 py-1 rounded-full uppercase border ${
                  repair.invoice.status === 'paid'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                }`}
              >
                {repair.invoice.status === 'paid' ? 'LUNAS' : 'MENUNGGU PEMBAYARAN'}
              </span>
            </div>

            <div className="flex items-baseline justify-between pt-2">
              <span className="text-xs text-[#ABA291] font-semibold">Total Tagihan Resmi:</span>
              <span className="text-xl sm:text-2xl font-extrabold text-[#FFFBF4] font-mono">
                Rp {repair.invoice.totalAmount.toLocaleString('id-ID')}
              </span>
            </div>

            {showPaymentAction && (
              <div className="pt-2">
                <button
                  onClick={() => setIsPaymentModalOpen(true)}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl bg-[#FFFBF4] hover:bg-[#EAE3D5] text-[#11120D] font-bold text-xs shadow-lg shadow-black/30 transition-all hover:scale-105"
                >
                  Bayar Tagihan Sekarang (QRIS / VA / COD)
                </button>
              </div>
            )}
          </div>
        )}

        {/* Progress Step Bar (Linimasa Visual) */}
        {repair.status !== 'cancelled' && (
          <div className="p-6 rounded-3xl bg-[#181913]/70 backdrop-blur-md border border-[#D8CFBC]/15">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#ABA291] block mb-4">
              Linimasa Proses Pengerjaan
            </span>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div
                className={`p-3 rounded-2xl border ${
                  badgeInfo.stepIdx >= 1
                    ? 'bg-[#22241D] border-[#D8CFBC]/30 text-[#FFFBF4] font-bold shadow-xs'
                    : 'bg-[#181913]/40 border-[#565449]/20 text-[#8C8678]'
                }`}
              >
                <div className="text-xs">1. Diajukan</div>
                <div className="text-[10px] text-[#ABA291] mt-0.5">Mencari teknisi</div>
              </div>

              <div
                className={`p-3 rounded-2xl border ${
                  badgeInfo.stepIdx >= 2
                    ? 'bg-[#22241D] border-[#D8CFBC]/30 text-[#FFFBF4] font-bold shadow-xs'
                    : 'bg-[#181913]/40 border-[#565449]/20 text-[#8C8678]'
                }`}
              >
                <div className="text-xs">2. Teknisi Siap</div>
                <div className="text-[10px] text-[#ABA291] mt-0.5">Menuju lokasi</div>
              </div>

              <div
                className={`p-3 rounded-2xl border ${
                  badgeInfo.stepIdx >= 3
                    ? 'bg-[#22241D] border-[#D8CFBC]/30 text-[#FFFBF4] font-bold shadow-xs'
                    : 'bg-[#181913]/40 border-[#565449]/20 text-[#8C8678]'
                }`}
              >
                <div className="text-xs">3. Diagnosis</div>
                <div className="text-[10px] text-[#ABA291] mt-0.5">Inspeksi fisik unit</div>
              </div>

              <div
                className={`p-3 rounded-2xl border ${
                  badgeInfo.stepIdx >= 5
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300 font-bold shadow-xs'
                    : 'bg-[#181913]/40 border-[#565449]/20 text-[#8C8678]'
                }`}
              >
                <div className="text-xs">4. Selesai</div>
                <div className="text-[10px] text-[#ABA291] mt-0.5">Garansi 30 hari</div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Kolom Kiri (2 Kolom): Detail Masalah & Riwayat */}
          <div className="md:col-span-2 space-y-6">
            {/* Detail Kerusakan */}
            <div className="p-6 rounded-3xl bg-[#181913]/80 backdrop-blur-2xl border border-[#D8CFBC]/20 space-y-4 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-[#FFFBF4]/15 to-transparent pointer-events-none" />

              <h3 className="text-sm font-bold text-[#FFFBF4] flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#D8CFBC]" />
                <span>Rincian Kerusakan Perangkat</span>
              </h3>

              <div className="grid grid-cols-2 gap-4 text-xs py-2 border-y border-[#565449]/25">
                <div>
                  <span className="text-[#8C8678] block">Merek Perangkat:</span>
                  <span className="font-semibold text-[#FFFBF4]">{repair.deviceBrand}</span>
                </div>
                <div>
                  <span className="text-[#8C8678] block">Model / Tipe:</span>
                  <span className="font-semibold text-[#FFFBF4]">{repair.deviceModel}</span>
                </div>
              </div>

              <div>
                <span className="text-xs text-[#ABA291] block mb-1">Gejala Kerusakan yang Dilaporkan:</span>
                <p className="text-xs sm:text-sm text-[#D8CFBC] leading-relaxed bg-[#11120D]/70 p-4 rounded-2xl border border-[#565449]/30">
                  {repair.problemDescription}
                </p>
              </div>

              {repair.problemPhotos.length > 0 && (
                <div>
                  <span className="text-xs text-[#ABA291] block mb-2">Foto / Lampiran Kerusakan:</span>
                  <div className="flex flex-wrap gap-2">
                    {repair.problemPhotos.map((url, i) => (
                      <a
                        key={i}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-[#D8CFBC] hover:text-[#FFFBF4] hover:underline bg-[#11120D]/80 px-3 py-1.5 rounded-xl border border-[#565449]/40 truncate max-w-xs transition-colors"
                      >
                        Foto Bukti #{i + 1}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Riwayat Mutasi Status (Audit Trail) */}
            <div className="p-6 rounded-3xl bg-[#181913]/80 backdrop-blur-2xl border border-[#D8CFBC]/20 space-y-4 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-[#FFFBF4]/15 to-transparent pointer-events-none" />

              <h3 className="text-sm font-bold text-[#FFFBF4] flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#D8CFBC]" />
                <span>Linimasa Riwayat Pesanan</span>
              </h3>

              <div className="space-y-4">
                {repair.history.map((h, idx) => (
                  <div key={h.id} className="flex items-start gap-3 relative">
                    {idx < repair.history.length - 1 && (
                      <div className="absolute left-2.5 top-5 bottom-0 w-0.5 bg-[#565449]/40" />
                    )}
                    <div className="w-5 h-5 rounded-full bg-[#22241D] border border-[#D8CFBC]/40 flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#FFFBF4]" />
                    </div>
                    <div className="flex-1 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[#FFFBF4]">
                          {statusBadgeConfig[h.newStatus]?.label || h.newStatus}
                        </span>
                        <span className="text-[10px] text-[#8C8678] font-mono">
                          {new Date(h.createdAt).toLocaleTimeString('id-ID', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="text-[#ABA291] mt-0.5">{h.notes || 'Status diperbarui oleh sistem.'}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Kolom Kanan (1 Kolom): Info Teknisi & Alamat */}
          <div className="space-y-6">
            {/* Info Teknisi Ditugaskan */}
            <div className="p-6 rounded-3xl bg-[#181913]/80 backdrop-blur-2xl border border-[#D8CFBC]/20 space-y-4 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-[#FFFBF4]/15 to-transparent pointer-events-none" />

              <h3 className="text-sm font-bold text-[#FFFBF4] flex items-center gap-2">
                <User className="w-4 h-4 text-[#D8CFBC]" />
                <span>Teknisi Bertugas</span>
              </h3>

              {repair.technician ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-[#22241D] border border-[#D8CFBC]/25 flex items-center justify-center text-[#FFFBF4] font-bold text-sm">
                      {repair.technician.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="font-bold text-[#FFFBF4] text-sm">{repair.technician.name}</h4>
                      <p className="text-xs text-amber-400">
                        ⭐ {repair.technician.ratingAvg.toFixed(1)} ({repair.technician.ratingCount} ulasan)
                      </p>
                      <p className="text-[11px] text-[#ABA291]">
                        Pengalaman: {repair.technician.yearsOfExperience} tahun
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setIsChatDrawerOpen(true)}
                      className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-[#FFFBF4] hover:bg-[#EAE3D5] text-[#11120D] font-bold text-xs shadow-md shadow-black/30 transition-all hover:scale-105"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Chat In-App</span>
                    </button>
                    <a
                      href={`https://wa.me/${repair.technician.phone.replace(/\D/g, '')}?text=Halo%20BANTUIN,%20terkait%20pesanan%20${repair.orderCode}`}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-[#565449]/30 hover:bg-[#565449]/50 text-[#D8CFBC] hover:text-[#FFFBF4] border border-[#D8CFBC]/20 font-semibold text-xs transition-colors"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>WhatsApp</span>
                    </a>
                  </div>
                </div>
              ) : (
                <div className="py-6 text-center text-[#ABA291] space-y-1">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#D8CFBC]" />
                  <p className="text-xs font-semibold text-[#FFFBF4]">Menghubungkan Teknisi</p>
                  <p className="text-[11px] text-[#8C8678]">
                    Sistem sedang mencocokkan mitra teknisi terdekat di wilayah Anda.
                  </p>
                </div>
              )}
            </div>

            {/* Jadwal Kunjungan Fisik */}
            {schedules.length > 0 && (
              <div className="p-5 rounded-3xl bg-[#181913]/70 border border-[#D8CFBC]/20 space-y-2 text-xs backdrop-blur-md">
                <div className="flex items-center gap-2 text-[#D8CFBC] font-bold">
                  <Calendar className="w-4 h-4" />
                  <span>Jadwal Kunjungan Fisik</span>
                </div>
                <p className="text-[#FFFBF4] font-semibold">
                  {new Date(schedules[0].scheduledDate).toLocaleDateString('id-ID', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </p>
                <p className="text-[#D8CFBC]">
                  Pukul {schedules[0].timeSlotStart.slice(0, 5)} - {schedules[0].timeSlotEnd.slice(0, 5)} WIB
                </p>
                {schedules[0].rescheduleReason && (
                  <p className="text-[11px] text-[#8C8678] italic">Catatan: {schedules[0].rescheduleReason}</p>
                )}
              </div>
            )}

            {/* Ulasan & Rating Teknisi */}
            {repair.status === 'completed' && repair.invoice?.status === 'paid' && (
              <div className="p-5 rounded-3xl bg-[#181913]/80 border border-[#D8CFBC]/20 space-y-3 shadow-xl text-xs backdrop-blur-md">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#FFFBF4] flex items-center gap-1.5">
                    <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                    <span>Ulasan Pelayanan</span>
                  </span>
                  {existingReview && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30">
                      Terverifikasi
                    </span>
                  )}
                </div>

                {existingReview ? (
                  <div className="space-y-1.5 bg-[#11120D]/70 p-3 rounded-2xl border border-[#565449]/30">
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          className={`w-3.5 h-3.5 ${
                            s <= existingReview.rating ? 'text-amber-400 fill-amber-400' : 'text-[#565449]'
                          }`}
                        />
                      ))}
                      <span className="text-amber-300 font-bold ml-1 text-xs">{existingReview.rating} / 5</span>
                    </div>
                    {existingReview.reviewText && (
                      <p className="text-[#D8CFBC] italic text-[11px]">&ldquo;{existingReview.reviewText}&rdquo;</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[#ABA291] text-[11px]">
                      Servis telah selesai dan lunas. Bagikan pengalaman dan kepuasan Anda terhadap teknisi.
                    </p>
                    <button
                      type="button"
                      onClick={() => setIsReviewModalOpen(true)}
                      className="w-full py-2.5 px-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-[#11120D] font-bold text-xs shadow-md shadow-black/30 transition-all flex items-center justify-center gap-1.5"
                    >
                      <Star className="w-3.5 h-3.5 fill-[#11120D]" />
                      <span>Beri Rating & Ulasan</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Alamat Pengerjaan */}
            <div className="p-6 rounded-3xl bg-[#181913]/80 border border-[#D8CFBC]/20 space-y-2 shadow-xl text-xs backdrop-blur-md">
              <h3 className="text-sm font-bold text-[#FFFBF4] flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#D8CFBC]" />
                <span>Lokasi Pengerjaan</span>
              </h3>
              <p className="text-[#D8CFBC] leading-relaxed bg-[#11120D]/70 p-3 rounded-xl border border-[#565449]/30">
                {repair.addressText}
              </p>
            </div>

            {/* Garansi Servis */}
            <div className="p-4 rounded-2xl bg-[#181913]/70 border border-[#D8CFBC]/20 flex items-start gap-2.5 text-xs text-[#D8CFBC] backdrop-blur-md">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                Servis dilindungi garansi resmi 30 hari. Simpan kode pesanan <strong className="text-[#FFFBF4]">{repair.orderCode}</strong> untuk klaim garansi jika unit rusak kembali.
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Pembayaran (Liquid Glass) */}
      {isPaymentModalOpen && repair.invoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#11120D]/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-[#181913]/95 border border-[#D8CFBC]/25 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5 relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-[#FFFBF4]/20 to-transparent pointer-events-none" />

            <div className="flex items-center justify-between border-b border-[#565449]/25 pb-3">
              <div>
                <h3 className="font-bold text-[#FFFBF4] text-base">Pembayaran Invoice</h3>
                <span className="text-xs text-[#D8CFBC] font-mono">#{repair.invoice.invoiceNumber}</span>
              </div>
              <button onClick={() => setIsPaymentModalOpen(false)} className="text-[#ABA291] hover:text-[#FFFBF4]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-[#22241D] border border-[#D8CFBC]/20 text-center space-y-1">
              <span className="text-xs text-[#D8CFBC] font-medium">Total yang harus dibayar:</span>
              <div className="text-2xl font-black text-[#FFFBF4] font-mono">
                Rp {repair.invoice.totalAmount.toLocaleString('id-ID')}
              </div>
            </div>

            <form onSubmit={handlePayInvoice} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-[#D8CFBC] block">Pilih Metode Pembayaran:</label>
                <div className="space-y-2">
                  <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${paymentMethod === 'qris' ? 'bg-[#22241D] border-[#D8CFBC] text-[#FFFBF4]' : 'bg-[#11120D]/60 border-[#565449]/30 text-[#D8CFBC]'}`}>
                    <input type="radio" name="payMethod" checked={paymentMethod === 'qris'} onChange={() => setPaymentMethod('qris')} className="accent-[#D8CFBC]" />
                    <QrCode className="w-5 h-5 text-[#D8CFBC]" />
                    <div>
                      <span className="text-xs font-bold block">QRIS (GoPay, OVO, Dana, ShopeePay)</span>
                      <span className="text-[11px] text-[#ABA291]">Pembayaran instan bebas biaya admin</span>
                    </div>
                  </label>

                  <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${paymentMethod === 'bank_transfer' ? 'bg-[#22241D] border-[#D8CFBC] text-[#FFFBF4]' : 'bg-[#11120D]/60 border-[#565449]/30 text-[#D8CFBC]'}`}>
                    <input type="radio" name="payMethod" checked={paymentMethod === 'bank_transfer'} onChange={() => setPaymentMethod('bank_transfer')} className="accent-[#D8CFBC]" />
                    <CreditCard className="w-5 h-5 text-[#D8CFBC]" />
                    <div>
                      <span className="text-xs font-bold block">Virtual Account Bank (BCA, Mandiri, BNI)</span>
                      <span className="text-[11px] text-[#ABA291]">Verifikasi otomatis 24 jam</span>
                    </div>
                  </label>

                  <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${paymentMethod === 'cash_on_delivery' ? 'bg-[#22241D] border-[#D8CFBC] text-[#FFFBF4]' : 'bg-[#11120D]/60 border-[#565449]/30 text-[#D8CFBC]'}`}>
                    <input type="radio" name="payMethod" checked={paymentMethod === 'cash_on_delivery'} onChange={() => setPaymentMethod('cash_on_delivery')} className="accent-[#D8CFBC]" />
                    <Banknote className="w-5 h-5 text-emerald-400" />
                    <div>
                      <span className="text-xs font-bold block">Tunai (COD) ke Teknisi di Tempat</span>
                      <span className="text-[11px] text-[#ABA291]">Bayar langsung setelah unit selesai diperbaiki</span>
                    </div>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-[#11120D] hover:bg-[#22241D] text-xs font-semibold text-[#D8CFBC] border border-[#565449]/30 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPayment}
                  className="px-5 py-2.5 rounded-xl bg-[#FFFBF4] hover:bg-[#EAE3D5] text-xs font-bold text-[#11120D] shadow-md shadow-black/30 transition-all disabled:opacity-50"
                >
                  {isSubmittingPayment ? 'Memproses...' : 'Konfirmasi Pelunasan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Klaim Garansi / Pengaduan */}
      {isComplaintModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#11120D]/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-[#181913]/95 border border-[#D8CFBC]/25 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 relative overflow-hidden">
            <div className="flex items-center justify-between border-b border-[#565449]/25 pb-3">
              <div>
                <h3 className="font-bold text-[#FFFBF4] text-base">Klaim Garansi & Pengaduan</h3>
                <span className="text-xs text-[#D8CFBC] font-mono">Pesanan #{repair.orderCode}</span>
              </div>
              <button onClick={() => setIsComplaintModalOpen(false)} className="text-[#ABA291] hover:text-[#FFFBF4]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitComplaint} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#D8CFBC] block">Kategori Keluhan:</label>
                <select
                  value={complaintCategory}
                  onChange={(e) => setComplaintCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#565449]/40 bg-[#11120D] text-xs text-[#FFFBF4] focus:outline-none focus:border-[#D8CFBC]"
                >
                  <option value="recurring_damage">Kerusakan Berulang (Klaim Garansi 30 Hari)</option>
                  <option value="poor_workmanship">Hasil Pengerjaan Kurang Memuaskan</option>
                  <option value="overcharging">Biaya Tidak Sesuai Estimasi Resmi</option>
                  <option value="technician_misbehavior">Perilaku Teknisi Kurang Sopan</option>
                  <option value="tardiness">Keterlambatan Jam Kunjungan</option>
                  <option value="other">Keluhan Lainnya</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#D8CFBC] block">Deskripsi Detail Keluhan:</label>
                <textarea
                  rows={4}
                  required
                  value={complaintDesc}
                  onChange={(e) => setComplaintDesc(e.target.value)}
                  placeholder="Ceritakan kendala yang dialami secara jelas..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#565449]/40 bg-[#11120D] text-xs text-[#FFFBF4] placeholder-[#706E61] focus:outline-none focus:border-[#D8CFBC] resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsComplaintModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-[#11120D] hover:bg-[#22241D] text-xs font-semibold text-[#D8CFBC] border border-[#565449]/30 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingComplaint || !complaintDesc.trim()}
                  className="px-5 py-2 rounded-xl bg-[#FFFBF4] hover:bg-[#EAE3D5] text-xs font-bold text-[#11120D] transition-all disabled:opacity-50"
                >
                  {isSubmittingComplaint ? 'Mengirim...' : 'Kirim Laporan Pengaduan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Batalkan Pesanan */}
      {isCancelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#11120D]/80 backdrop-blur-md animate-in fade-in">
          <div className="bg-[#181913]/95 border border-[#D8CFBC]/25 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 relative overflow-hidden">
            <div className="flex items-center justify-between border-b border-[#565449]/25 pb-3">
              <h3 className="font-bold text-[#FFFBF4] text-base">Batalkan Pesanan Servis?</h3>
              <button
                onClick={() => setIsCancelModalOpen(false)}
                className="text-[#ABA291] hover:text-[#FFFBF4]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-[#D8CFBC] leading-relaxed">
              Apakah Anda yakin ingin membatalkan pesanan servis <strong className="text-[#FFFBF4]">#{repair.orderCode}</strong>? Penugasan teknisi akan dibatalkan.
            </p>

            <form onSubmit={handleCancelOrder} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-[#D8CFBC] block mb-1">
                  Alasan Pembatalan:
                </label>
                <textarea
                  rows={3}
                  required
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Contoh: Jadwal bertabrakan, unit sudah diperbaiki kerabat, dll..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#565449]/40 bg-[#11120D] text-xs text-[#FFFBF4] placeholder-[#706E61] focus:outline-none focus:border-[#D8CFBC] resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCancelModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-[#11120D] hover:bg-[#22241D] text-xs font-semibold text-[#D8CFBC] border border-[#565449]/30 transition-colors"
                >
                  Kembali
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCancel || !cancelReason.trim()}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white transition-colors disabled:opacity-50"
                >
                  {isSubmittingCancel ? 'Membatalkan...' : 'Ya, Batalkan Pesanan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* In-App Real-time Chat Drawer */}
      <RepairChatDrawer
        isOpen={isChatDrawerOpen}
        onClose={() => setIsChatDrawerOpen(false)}
        repairRequestId={repair.id}
        orderCode={repair.orderCode}
        partnerName={repair.technician?.name || 'Mitra Teknisi'}
        partnerRole="technician"
      />

      {/* Review Modal */}
      <RepairReviewModal
        isOpen={isReviewModalOpen}
        onClose={() => setIsReviewModalOpen(false)}
        repairRequestId={repair.id}
        orderCode={repair.orderCode}
        technicianName={repair.technician?.name || 'Mitra Teknisi'}
        onReviewSubmitted={() => fetchDetail()}
      />
    </div>
  );
}
