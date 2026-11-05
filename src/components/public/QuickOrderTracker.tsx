'use client';

import React, { useState } from 'react';
import { Search, Loader2, CheckCircle2, Clock, Wrench, AlertCircle, ArrowRight, ShieldCheck } from 'lucide-react';

interface TrackingData {
  orderCode: string;
  currentStatus: string;
  categoryName: string;
  serviceName: string;
  device: string;
  problemDescription: string;
  technicianName: string;
  invoiceStatus: string | null;
  invoiceAmount: number | null;
  createdAt: string;
  timeline: Array<{
    status: string;
    actor: string;
    notes: string | null;
    time: string;
  }>;
}

const statusMap: Record<string, { label: string; badge: string; desc: string }> = {
  submitted: { label: 'Pesanan Diterima', badge: 'bg-[#565449]/25 text-[#D8CFBC] border-[#D8CFBC]/20', desc: 'Permintaan perbaikan telah masuk ke sistem dan menunggu penugasan teknisi.' },
  assigned: { label: 'Teknisi Ditugaskan', badge: 'bg-[#565449]/35 text-[#FFFBF4] border-[#D8CFBC]/30', desc: 'Mitra teknisi terdekat telah ditugaskan untuk menangani perangkat Anda.' },
  scheduled: { label: 'Jadwal Terkonfirmasi', badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25', desc: 'Jadwal kunjungan teknisi ke lokasi Anda telah dijadwalkan.' },
  in_diagnosis: { label: 'Pemeriksaan Unit', badge: 'bg-amber-500/15 text-amber-300 border-amber-500/25', desc: 'Teknisi sedang melakukan inspeksi fisik dan diagnosa kerusakan di lokasi.' },
  estimated: { label: 'Estimasi Biaya Diajukan', badge: 'bg-amber-500/15 text-amber-300 border-amber-500/25', desc: 'Teknisi telah mengajukan rincian estimasi biaya untuk persetujuan Anda.' },
  customer_approved: { label: 'Biaya Disetujui', badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25', desc: 'Anda telah menyetujui estimasi biaya perbaikan.' },
  in_repair: { label: 'Proses Pengerjaan', badge: 'bg-[#D8CFBC]/20 text-[#FFFBF4] border-[#D8CFBC]/35', desc: 'Teknisi sedang melakukan perbaikan atau penggantian komponen unit.' },
  completed: { label: 'Perbaikan Selesai', badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', desc: 'Perbaikan telah selesai dan unit berfungsi normal. Garansi resmi 30 hari aktif!' },
  cancelled: { label: 'Dibatalkan', badge: 'bg-rose-500/15 text-rose-300 border-rose-500/25', desc: 'Pesanan perbaikan ini telah dibatalkan.' },
  complained: { label: 'Dalam Penanganan Aduan', badge: 'bg-rose-500/20 text-rose-300 border-rose-500/30', desc: 'Laporan klaim garansi atau keluhan sedang ditinjau oleh staf admin BANTUIN.' },
};

export function QuickOrderTracker() {
  const [orderCode, setOrderCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [trackingResult, setTrackingResult] = useState<TrackingData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = orderCode.trim();
    if (!code) return;

    setIsLoading(true);
    setErrorMessage(null);
    setTrackingResult(null);

    try {
      const res = await fetch(`/api/public/track?code=${encodeURIComponent(code)}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMessage(data.message || 'Nomor pesanan tidak ditemukan. Periksa kembali kode pesanan Anda.');
      } else {
        setTrackingResult(data.data);
      }
    } catch {
      setErrorMessage('Terjadi gangguan jaringan saat menghubungi server pelacakan.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Search Bar Input with Liquid Glass */}
      <form onSubmit={handleTrack} className="relative flex items-center">
        <input
          type="text"
          value={orderCode}
          onChange={(e) => setOrderCode(e.target.value)}
          placeholder="Masukkan Kode Pesanan (contoh: BAN-20261031-10001)..."
          className="w-full px-5 py-3.5 sm:py-4 pl-12 rounded-2xl bg-[#181913]/85 backdrop-blur-xl border border-[#D8CFBC]/25 text-[#FFFBF4] placeholder-[#8C8678] text-sm focus:outline-none focus:border-[#D8CFBC] focus:ring-2 focus:ring-[#D8CFBC]/20 shadow-xl transition-all"
        />
        <Search className="absolute left-4 w-5 h-5 text-[#8C8678]" />
        <button
          type="submit"
          disabled={isLoading || !orderCode.trim()}
          className="absolute right-2 px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl bg-[#FFFBF4] hover:bg-[#EAE3D5] active:scale-95 disabled:opacity-50 text-[#11120D] text-xs font-bold transition-all shadow-md shadow-black/30 flex items-center gap-1.5"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-[#11120D]" />
              <span>Melacak...</span>
            </>
          ) : (
            <>
              <span>Lacak</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </>
          )}
        </button>
      </form>

      {/* Error Message */}
      {errorMessage && (
        <div className="mt-4 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs flex items-center gap-3 backdrop-blur-md">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Tracking Result Box */}
      {trackingResult && (
        <div className="mt-6 p-6 rounded-3xl bg-[#181913]/90 backdrop-blur-2xl border border-[#D8CFBC]/25 shadow-2xl space-y-6 text-left relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-[#FFFBF4]/20 to-transparent pointer-events-none" />

          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#565449]/25">
            <div>
              <span className="text-[11px] font-bold tracking-wider text-[#D8CFBC] uppercase block">
                Hasil Pelacakan Pesanan Resmi
              </span>
              <h3 className="text-xl font-extrabold text-[#FFFBF4] font-mono mt-0.5">
                #{trackingResult.orderCode}
              </h3>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold border uppercase tracking-wide backdrop-blur-xs ${
                statusMap[trackingResult.currentStatus]?.badge || 'bg-[#565449]/20 text-[#D8CFBC] border-[#D8CFBC]/20'
              }`}
            >
              {statusMap[trackingResult.currentStatus]?.label || trackingResult.currentStatus}
            </span>
          </div>

          <p className="text-xs text-[#D8CFBC] leading-relaxed">
            {statusMap[trackingResult.currentStatus]?.desc}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-3.5 rounded-2xl bg-[#1F211A]/80 border border-[#D8CFBC]/15 space-y-1">
              <span className="text-[#8C8678] font-semibold block text-[11px] uppercase tracking-wider">Perangkat & Keluhan</span>
              <p className="font-bold text-[#FFFBF4]">{trackingResult.categoryName} • {trackingResult.device}</p>
              <p className="text-[#ABA291] italic line-clamp-2">"{trackingResult.problemDescription}"</p>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#1F211A]/80 border border-[#D8CFBC]/15 space-y-1">
              <span className="text-[#8C8678] font-semibold block text-[11px] uppercase tracking-wider">Mitra Teknisi</span>
              <p className="font-bold text-[#D8CFBC]">{trackingResult.technicianName || 'Dalam Proses Penugasan'}</p>
              <p className="text-[#ABA291]">
                Waktu Pemesanan: {new Date(trackingResult.createdAt).toLocaleDateString('id-ID', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </p>
            </div>
          </div>

          {/* Timeline Progres */}
          {trackingResult.timeline.length > 0 && (
            <div className="space-y-3 pt-2">
              <span className="text-xs font-bold text-[#D8CFBC] flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#D8CFBC]" />
                <span>Linimasa Riwayat Pengerjaan</span>
              </span>
              <div className="space-y-2 border-l-2 border-[#565449]/40 ml-2 pl-4">
                {trackingResult.timeline.map((item, idx) => (
                  <div key={idx} className="relative text-xs">
                    <div className="absolute -left-[22px] top-1 w-2.5 h-2.5 rounded-full bg-[#D8CFBC]" />
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[#FFFBF4] uppercase text-[11px]">
                        {statusMap[item.status]?.label || item.status}
                      </span>
                      <span className="text-[10px] text-[#8C8678]">
                        {new Date(item.time).toLocaleString('id-ID', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    {item.notes && <p className="text-[#ABA291] text-[11px] mt-0.5">{item.notes}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="p-3 rounded-2xl bg-[#1F211A]/80 border border-[#D8CFBC]/15 flex items-center justify-between text-xs">
            <span className="text-[#ABA291]">Ingin melihat rincian nota atau berkirim pesan dengan teknisi?</span>
            <a
              href="/login"
              className="text-[#D8CFBC] hover:text-[#FFFBF4] font-bold underline shrink-0 ml-2 transition-colors"
            >
              Masuk ke Akun
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
