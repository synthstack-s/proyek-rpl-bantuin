'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Wrench,
  Award,
  LogOut,
  Phone,
  MapPin,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Navigation,
  FileText,
  DollarSign,
  User,
  ShieldCheck,
  RefreshCw,
  X,
  Plus,
  Send,
  Power,
  ChevronRight,
  MessageSquare,
  Calendar,
  Star,
} from 'lucide-react';
import RepairChatDrawer from '@/components/chat/RepairChatDrawer';
import TechnicianScheduleModal from '@/components/schedules/TechnicianScheduleModal';

interface TaskItem {
  assignmentId: number;
  assignmentStatus: string;
  assignmentType: string;
  assignedAt: string;
  respondedAt: string | null;
  repairId: number;
  orderCode: string;
  orderStatus: string;
  categoryName: string;
  serviceName: string;
  device: string;
  problemDescription: string;
  problemPhotos: string[];
  addressText: string;
  latitude: number | null;
  longitude: number | null;
  customerName: string;
  customerPhone: string;
  invoice: {
    id: number;
    invoiceNumber: string;
    amount: number;
    status: string;
  } | null;
  diagnosis: {
    id: number;
    damageDetails: string;
    laborCost: number;
    partsCost: number;
    totalEstimate: number;
    customerApproval: string;
  } | null;
}

interface StatsData {
  totalAssignments: number;
  offeredCount: number;
  activeCount: number;
  completedCount: number;
  estimatedEarnings: number;
}

export function TechnicianDashboardClient({
  technicianName,
  technicianPhone,
  initialVerifiedStatus,
}: {
  technicianName: string;
  technicianPhone: string;
  initialVerifiedStatus: string;
}) {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [stats, setStats] = useState<StatsData>({
    totalAssignments: 0,
    offeredCount: 0,
    activeCount: 0,
    completedCount: 0,
    estimatedEarnings: 0,
  });
  const [activeTab, setActiveTab] = useState<'offered' | 'active' | 'completed'>('offered');
  const [isAvailable, setIsAvailable] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  // Modal Diagnosis
  const [isDiagnosisModalOpen, setIsDiagnosisModalOpen] = useState(false);
  const [selectedTaskForDiag, setSelectedTaskForDiag] = useState<TaskItem | null>(null);
  const [damageDetails, setDamageDetails] = useState('');
  const [laborCost, setLaborCost] = useState('100000');
  const [partsCost, setPartsCost] = useState('0');
  const [submittingDiag, setSubmittingDiag] = useState(false);

  // In-App Chat Drawer
  const [isChatDrawerOpen, setIsChatDrawerOpen] = useState(false);
  const [selectedTaskForChat, setSelectedTaskForChat] = useState<TaskItem | null>(null);

  // Schedule Visit Modal
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [selectedTaskForSchedule, setSelectedTaskForSchedule] = useState<TaskItem | null>(null);

  // Fetch Tasks
  const loadTasks = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/technician/tasks');
      const data = await res.json();
      if (data.success) {
        setTasks(data.data || []);
        if (data.stats) setStats(data.stats);

        // Jika ada tawaran tugas baru, default ke tab offered
        if (data.stats.offeredCount > 0) {
          setActiveTab('offered');
        } else if (data.stats.activeCount > 0) {
          setActiveTab('active');
        }
      }
    } catch (err) {
      console.error('Gagal mengambil tugas teknisi:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch Profile & Availability
  const loadProfile = async () => {
    try {
      const res = await fetch('/api/technician/profile');
      const data = await res.json();
      if (data.success && data.data) {
        setIsAvailable(data.data.isAvailable);
      }
    } catch (err) {
      console.error('Gagal mengambil ketersediaan teknisi:', err);
    }
  };

  useEffect(() => {
    loadTasks();
    loadProfile();
  }, []);

  // Toggle Availability
  const toggleAvailability = async () => {
    const newState = !isAvailable;
    setIsAvailable(newState);
    try {
      await fetch('/api/technician/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_available: newState }),
      });
    } catch {
      setIsAvailable(!newState);
      alert('Gagal memperbarui status kesiapan kerja');
    }
  };

  // Handle Workflow Action
  const handleTaskAction = async (assignmentId: number, action: string, payload: any = {}) => {
    if (action === 'reject') {
      const reason = prompt('Tuliskan alasan penolakan penugasan ini:');
      if (!reason) return;
      payload.rejection_reason = reason;
    }

    if (action === 'complete') {
      if (!confirm('Apakah Anda yakin perbaikan unit telah selesai dan berfungsi normal?')) return;
    }

    setActionLoading(assignmentId);
    try {
      const res = await fetch(`/api/technician/tasks/${assignmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.message || 'Gagal memperbarui tugas');
      } else {
        alert(data.message);
        loadTasks();
      }
    } catch {
      alert('Terjadi gangguan jaringan');
    } finally {
      setActionLoading(null);
    }
  };

  // Submit Diagnosis
  const handleSubmitDiagnosis = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTaskForDiag) return;

    setSubmittingDiag(true);
    try {
      const res = await fetch(`/api/technician/tasks/${selectedTaskForDiag.assignmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit_diagnosis',
          damage_details: damageDetails,
          labor_cost: Number(laborCost),
          parts_cost: Number(partsCost),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.message || 'Gagal mengajukan estimasi biaya');
      } else {
        alert('Estimasi biaya berhasil diajukan ke pelanggan!');
        setIsDiagnosisModalOpen(false);
        loadTasks();
      }
    } catch {
      alert('Terjadi kesalahan jaringan');
    } finally {
      setSubmittingDiag(false);
    }
  };

  // Filter tasks for active tab
  const filteredTasks = tasks.filter((t) => {
    if (activeTab === 'offered') return t.assignmentStatus === 'offered';
    if (activeTab === 'active') return t.assignmentStatus === 'accepted' && t.orderStatus !== 'completed' && t.orderStatus !== 'cancelled';
    if (activeTab === 'completed') return t.assignmentStatus === 'completed' || t.orderStatus === 'completed';
    return true;
  });

  return (
    <div className="space-y-8">
      {/* Availability & Header Action Bar (Liquid Glass) */}
      <div className="p-6 rounded-3xl bg-[#181913]/85 backdrop-blur-2xl border border-[#D8CFBC]/25 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-[#FFFBF4]/15 to-transparent pointer-events-none" />

        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${isAvailable ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-[#22241D] text-[#8C8678] border border-[#565449]/30'}`}>
            <Power className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-[#FFFBF4]">Status Siap Terima Job:</span>
              <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${isAvailable ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-[#22241D] text-[#ABA291] border-[#565449]/30'}`}>
                {isAvailable ? 'ONLINE (Aktif)' : 'OFFLINE (Istirahat)'}
              </span>
            </div>
            <p className="text-xs text-[#ABA291] mt-0.5">
              {isAvailable ? 'Sistem dapat menugaskan order pelanggan terdekat kepada Anda.' : 'Anda tidak akan menerima order baru saat mode istirahat aktif.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={toggleAvailability}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md ${isAvailable ? 'bg-[#22241D] hover:bg-[#2B2D24] text-[#D8CFBC] border border-[#D8CFBC]/15' : 'bg-[#FFFBF4] hover:bg-[#EAE3D5] text-[#11120D] shadow-black/30'}`}
          >
            {isAvailable ? 'Ubah ke Istirahat' : 'Aktifkan Siap Kerja'}
          </button>

          <button
            onClick={loadTasks}
            className="p-2 rounded-xl bg-[#22241D] hover:bg-[#2B2D24] border border-[#D8CFBC]/15 text-[#D8CFBC] hover:text-[#FFFBF4] transition-colors"
            title="Segarkan data tugas"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-[#181913]/75 backdrop-blur-md border border-[#D8CFBC]/15 relative overflow-hidden group hover:border-[#D8CFBC]/30 transition-all">
          <span className="text-xs text-[#ABA291] font-semibold block mb-1">Tawaran Baru</span>
          <div className="text-2xl font-black text-amber-300 font-mono">{stats.offeredCount}</div>
          <span className="text-[11px] text-[#8C8678]">Menunggu konfirmasi Anda</span>
        </div>

        <div className="p-5 rounded-2xl bg-[#181913]/75 backdrop-blur-md border border-[#D8CFBC]/15 relative overflow-hidden group hover:border-[#D8CFBC]/30 transition-all">
          <span className="text-xs text-[#ABA291] font-semibold block mb-1">Tugas Aktif</span>
          <div className="text-2xl font-black text-[#FFFBF4] font-mono">{stats.activeCount}</div>
          <span className="text-[11px] text-[#8C8678]">Dalam proses pengerjaan</span>
        </div>

        <div className="p-5 rounded-2xl bg-[#181913]/75 backdrop-blur-md border border-[#D8CFBC]/15 relative overflow-hidden group hover:border-[#D8CFBC]/30 transition-all">
          <span className="text-xs text-[#ABA291] font-semibold block mb-1">Pekerjaan Selesai</span>
          <div className="text-2xl font-black text-emerald-400 font-mono">{stats.completedCount}</div>
          <span className="text-[11px] text-[#8C8678]">Total job sukses</span>
        </div>

        <div className="p-5 rounded-2xl bg-[#181913]/75 backdrop-blur-md border border-[#D8CFBC]/15 relative overflow-hidden group hover:border-[#D8CFBC]/30 transition-all">
          <span className="text-xs text-[#ABA291] font-semibold block mb-1">Total Pendapatan Jasa</span>
          <div className="text-xl sm:text-2xl font-black text-[#D8CFBC] font-mono">
            Rp {stats.estimatedEarnings.toLocaleString('id-ID')}
          </div>
          <span className="text-[11px] text-emerald-400">Akumulasi ongkos kerja</span>
        </div>
      </div>

      {/* Task Tabs */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 border-b border-[#565449]/25 pb-2">
          <button
            onClick={() => setActiveTab('offered')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'offered'
                ? 'bg-[#FFFBF4] text-[#11120D] shadow-md shadow-black/30'
                : 'text-[#ABA291] hover:text-[#FFFBF4] bg-[#181913]/60 border border-[#565449]/20'
            }`}
          >
            <span>Tawaran Order Baru</span>
            {stats.offeredCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-[#11120D] text-[#FFFBF4] text-[10px] font-black">
                {stats.offeredCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('active')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'active'
                ? 'bg-[#FFFBF4] text-[#11120D] shadow-md shadow-black/30'
                : 'text-[#ABA291] hover:text-[#FFFBF4] bg-[#181913]/60 border border-[#565449]/20'
            }`}
          >
            <span>Pekerjaan Berjalan</span>
            {stats.activeCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-[#D8CFBC] text-[#11120D] text-[10px] font-black">
                {stats.activeCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('completed')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'completed'
                ? 'bg-[#FFFBF4] text-[#11120D] shadow-md shadow-black/30'
                : 'text-[#ABA291] hover:text-[#FFFBF4] bg-[#181913]/60 border border-[#565449]/20'
            }`}
          >
            <span>Riwayat Selesai</span>
          </button>
        </div>

        {/* Task Cards List */}
        {isLoading ? (
          <div className="py-16 text-center text-[#ABA291] space-y-2">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-[#D8CFBC]" />
            <p className="text-xs">Memuat tugas penugasan...</p>
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="py-16 text-center text-[#ABA291] bg-[#181913]/40 rounded-3xl border border-[#565449]/25 p-8 space-y-2">
            <CheckCircle2 className="w-10 h-10 mx-auto text-[#706E61]" />
            <h3 className="text-sm font-bold text-[#FFFBF4]">
              {activeTab === 'offered'
                ? 'Tidak Ada Tawaran Order Baru'
                : activeTab === 'active'
                ? 'Tidak Ada Pekerjaan yang Sedang Berjalan'
                : 'Belum Ada Riwayat Pekerjaan Selesai'}
            </h3>
            <p className="text-xs text-[#8C8678] max-w-sm mx-auto">
              {activeTab === 'offered'
                ? 'Pastikan status siap kerja Anda tetap AKTIF agar notifikasi order masuk secara instan.'
                : 'Tugas yang telah selesai dapat dilihat kembali kapan saja.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredTasks.map((t) => (
              <div
                key={t.assignmentId}
                className="p-6 rounded-3xl bg-[#181913]/85 backdrop-blur-2xl border border-[#D8CFBC]/20 hover:border-[#D8CFBC]/35 shadow-xl space-y-5 transition-colors text-left relative overflow-hidden"
              >
                <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-[#FFFBF4]/15 to-transparent pointer-events-none" />

                {/* Header Card */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#565449]/25">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-bold text-[#FFFBF4] bg-[#22241D] px-3 py-1 rounded-full border border-[#D8CFBC]/20">
                      #{t.orderCode}
                    </span>
                    <span className="text-xs font-bold text-[#FFFBF4]">
                      {t.categoryName} • <span className="text-[#D8CFBC] font-normal">{t.device}</span>
                    </span>
                  </div>

                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-[#22241D] text-[#D8CFBC] uppercase border border-[#565449]/30">
                    Status: {t.orderStatus}
                  </span>
                </div>

                {/* Problem & Customer Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="p-4 rounded-2xl bg-[#11120D]/60 border border-[#565449]/30 space-y-1.5">
                    <span className="text-[#8C8678] font-semibold block text-[11px] uppercase tracking-wider">Keluhan Pelanggan:</span>
                    <p className="text-[#FFFBF4] leading-relaxed italic">"{t.problemDescription}"</p>
                    <p className="text-[11px] text-[#D8CFBC] font-semibold pt-1">Layanan: {t.serviceName}</p>
                  </div>

                  <div className="p-4 rounded-2xl bg-[#11120D]/60 border border-[#565449]/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[#8C8678] font-semibold">Pelanggan:</span>
                      <span className="font-bold text-[#FFFBF4]">{t.customerName}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-[#8C8678] font-semibold">Alamat:</span>
                      <span className="text-[#D8CFBC] truncate max-w-xs text-right">{t.addressText}</span>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-[#565449]/20">
                      <a
                        href={`https://wa.me/${t.customerPhone.replace(/\D/g, '')}?text=Halo%20${encodeURIComponent(t.customerName)},%20saya%20teknisi%20BANTUIN%20untuk%20pesanan%20${t.orderCode}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] transition-colors shadow-xs"
                      >
                        <Phone className="w-3 h-3" />
                        <span>Hubungi WhatsApp ({t.customerPhone})</span>
                      </a>

                      {t.latitude && t.longitude && (
                        <a
                          href={`https://www.google.com/maps?q=${t.latitude},${t.longitude}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-[#D8CFBC] hover:underline"
                        >
                          <Navigation className="w-3 h-3" />
                          <span>Peta Navigasi</span>
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                {/* Status Diagnosis & Estimasi jika sudah ada */}
                {t.diagnosis && (
                  <div className="p-4 rounded-2xl bg-[#11120D]/60 border border-[#565449]/30 text-xs flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <span className="text-[#8C8678] block font-semibold">Estimasi Biaya Diajukan:</span>
                      <span className="font-mono font-bold text-[#FFFBF4]">
                        Ongkos Rp {t.diagnosis.laborCost.toLocaleString('id-ID')} + Sparepart Rp {t.diagnosis.partsCost.toLocaleString('id-ID')} ={' '}
                        <strong className="text-[#D8CFBC]">Rp {t.diagnosis.totalEstimate.toLocaleString('id-ID')}</strong>
                      </span>
                    </div>

                    <span
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase border ${
                        t.diagnosis.customerApproval === 'approved'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                          : t.diagnosis.customerApproval === 'rejected'
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                          : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                      }`}
                    >
                      Persetujuan Pelanggan: {t.diagnosis.customerApproval}
                    </span>
                  </div>
                )}

                {/* Workflow Actions Buttons */}
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#565449]/25">
                  {/* TAB 1: Tawaran Tugas Baru (Offered) */}
                  {t.assignmentStatus === 'offered' && (
                    <>
                      <button
                        onClick={() => handleTaskAction(t.assignmentId, 'accept')}
                        disabled={actionLoading === t.assignmentId}
                        className="px-5 py-2.5 rounded-xl bg-[#FFFBF4] hover:bg-[#EAE3D5] text-[#11120D] font-bold text-xs shadow-md shadow-black/30 transition-all disabled:opacity-50"
                      >
                        {actionLoading === t.assignmentId ? 'Memproses...' : '✓ Terima Tugas Ini'}
                      </button>

                      <button
                        onClick={() => handleTaskAction(t.assignmentId, 'reject')}
                        disabled={actionLoading === t.assignmentId}
                        className="px-4 py-2.5 rounded-xl bg-[#11120D] hover:bg-rose-900/40 text-rose-300 border border-[#565449]/30 text-xs font-semibold transition-colors disabled:opacity-50"
                      >
                        ✕ Tolak Tugas
                      </button>
                    </>
                  )}

                  {/* TAB 2: Tugas Sedang Berjalan (Active) */}
                  {t.assignmentStatus === 'accepted' && t.orderStatus !== 'completed' && (
                    <>
                      {/* Step A: Belum OTW */}
                      {['assigned'].includes(t.orderStatus) && (
                        <button
                          onClick={() => handleTaskAction(t.assignmentId, 'on_the_way')}
                          disabled={actionLoading === t.assignmentId}
                          className="px-4 py-2 rounded-xl bg-[#FFFBF4] hover:bg-[#EAE3D5] text-[#11120D] font-bold text-xs shadow-md shadow-black/30 transition-all flex items-center gap-1.5"
                        >
                          <Navigation className="w-3.5 h-3.5 text-[#11120D]" />
                          <span>Saya Sedang OTW Menuju Lokasi</span>
                        </button>
                      )}

                      {/* Step B: Sedang di perjalanan -> Tiba di lokasi */}
                      {['scheduled'].includes(t.orderStatus) && (
                        <button
                          onClick={() => handleTaskAction(t.assignmentId, 'start_diagnosis')}
                          disabled={actionLoading === t.assignmentId}
                          className="px-4 py-2 rounded-xl bg-[#FFFBF4] hover:bg-[#EAE3D5] text-[#11120D] font-bold text-xs shadow-md shadow-black/30 transition-all flex items-center gap-1.5"
                        >
                          <Wrench className="w-3.5 h-3.5 text-[#11120D]" />
                          <span>Tiba di Lokasi & Mulai Periksa Unit</span>
                        </button>
                      )}

                      {/* Step C: Mulai Diagnosa -> Input Hasil Diagnosa & Estimasi */}
                      {['in_diagnosis', 'assigned'].includes(t.orderStatus) && (
                        <button
                          onClick={() => {
                            setSelectedTaskForDiag(t);
                            setDamageDetails(t.diagnosis?.damageDetails || '');
                            setLaborCost(String(t.diagnosis?.laborCost || 100000));
                            setPartsCost(String(t.diagnosis?.partsCost || 0));
                            setIsDiagnosisModalOpen(true);
                          }}
                          className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-[#11120D] font-bold text-xs shadow-md shadow-black/30 transition-all flex items-center gap-1.5"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>Input Hasil Diagnosa & Estimasi Biaya</span>
                        </button>
                      )}

                      {/* Step D: Biaya Disetujui Pelanggan -> Mulai Eksekusi Perbaikan */}
                      {['customer_approved'].includes(t.orderStatus) && (
                        <button
                          onClick={() => handleTaskAction(t.assignmentId, 'start_repair')}
                          disabled={actionLoading === t.assignmentId}
                          className="px-4 py-2 rounded-xl bg-[#FFFBF4] hover:bg-[#EAE3D5] text-[#11120D] font-bold text-xs shadow-md shadow-black/30 transition-all flex items-center gap-1.5"
                        >
                          <Wrench className="w-3.5 h-3.5 text-[#11120D]" />
                          <span>Pelanggan Setuju - Mulai Perbaikan Unit</span>
                        </button>
                      )}

                      {/* Step E: Sedang Dikerjakan -> Selesaikan Pekerjaan */}
                      {['in_repair', 'customer_approved'].includes(t.orderStatus) && (
                        <button
                          onClick={() => handleTaskAction(t.assignmentId, 'complete')}
                          disabled={actionLoading === t.assignmentId}
                          className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#11120D] font-bold text-xs shadow-md shadow-black/30 transition-all flex items-center gap-1.5"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Pekerjaan Selesai & Terbitkan Nota</span>
                        </button>
                      )}

                      {/* Atur Jadwal Kunjungan Fisik */}
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTaskForSchedule(t);
                          setIsScheduleModalOpen(true);
                        }}
                        className="px-3.5 py-2 rounded-xl bg-[#22241D] hover:bg-[#2B2D24] text-[#D8CFBC] hover:text-[#FFFBF4] border border-[#D8CFBC]/15 text-xs font-semibold transition-colors flex items-center gap-1.5"
                      >
                        <Calendar className="w-3.5 h-3.5 text-[#D8CFBC]" />
                        <span>Atur Jadwal</span>
                      </button>

                      {/* Tombol Chat Pelanggan In-App */}
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTaskForChat(t);
                          setIsChatDrawerOpen(true);
                        }}
                        className="px-3.5 py-2 rounded-xl bg-[#22241D] hover:bg-[#2B2D24] text-[#D8CFBC] hover:text-[#FFFBF4] border border-[#D8CFBC]/15 text-xs font-semibold transition-colors flex items-center gap-1.5"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-[#D8CFBC]" />
                        <span>Chat Pelanggan</span>
                      </button>
                    </>
                  )}

                  {/* TAB 3: Pekerjaan Selesai */}
                  {(t.assignmentStatus === 'completed' || t.orderStatus === 'completed') && (
                    <div className="flex items-center gap-2 text-xs text-emerald-400 font-semibold">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Pekerjaan Sukses Diselesaikan (Garansi 30 Hari Aktif)</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Input Hasil Diagnosa & Estimasi Biaya */}
      {isDiagnosisModalOpen && selectedTaskForDiag && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#11120D]/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-[#181913]/95 border border-[#D8CFBC]/25 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-5 text-left relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-[#FFFBF4]/20 to-transparent pointer-events-none" />

            <div className="flex items-center justify-between border-b border-[#565449]/25 pb-3">
              <div>
                <h3 className="font-bold text-[#FFFBF4] text-base">Hasil Diagnosa & Estimasi Biaya</h3>
                <span className="text-xs text-[#D8CFBC] font-mono">Order #{selectedTaskForDiag.orderCode}</span>
              </div>
              <button onClick={() => setIsDiagnosisModalOpen(false)} className="text-[#ABA291] hover:text-[#FFFBF4]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitDiagnosis} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#D8CFBC] block">Rincian Temuan Kerusakan:</label>
                <textarea
                  rows={3}
                  required
                  value={damageDetails}
                  onChange={(e) => setDamageDetails(e.target.value)}
                  placeholder="Contoh: Kapasitor kompresor lemah, saluran pipa drainase tersumbat lumut tebal, butuh flushing dan penggantian kapasitor 35uF..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#565449]/40 bg-[#11120D] text-xs text-[#FFFBF4] placeholder-[#706E61] focus:outline-none focus:border-[#D8CFBC] resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#D8CFBC] block">Ongkos Jasa Kerja (Rp):</label>
                  <input
                    type="number"
                    min={0}
                    step={5000}
                    required
                    value={laborCost}
                    onChange={(e) => setLaborCost(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#565449]/40 bg-[#11120D] text-xs text-[#FFFBF4] font-mono focus:outline-none focus:border-[#D8CFBC]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#D8CFBC] block">Biaya Sparepart (Rp):</label>
                  <input
                    type="number"
                    min={0}
                    step={5000}
                    required
                    value={partsCost}
                    onChange={(e) => setPartsCost(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#565449]/40 bg-[#11120D] text-xs text-[#FFFBF4] font-mono focus:outline-none focus:border-[#D8CFBC]"
                  />
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-[#22241D] border border-[#D8CFBC]/20 flex items-center justify-between text-xs">
                <span className="font-semibold text-[#ABA291]">Total Estimasi untuk Pelanggan:</span>
                <span className="text-base font-extrabold text-[#FFFBF4] font-mono">
                  Rp {(Number(laborCost || 0) + Number(partsCost || 0)).toLocaleString('id-ID')}
                </span>
              </div>

              <p className="text-[11px] text-[#8C8678] italic">
                * Estimasi ini akan dikirimkan langsung ke pelanggan untuk disetujui sebelum Anda membongkar/memperbaiki unit.
              </p>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsDiagnosisModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-[#11120D] hover:bg-[#22241D] text-xs font-semibold text-[#D8CFBC] border border-[#565449]/30 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submittingDiag || !damageDetails.trim()}
                  className="px-5 py-2.5 rounded-xl bg-[#FFFBF4] hover:bg-[#EAE3D5] text-xs font-bold text-[#11120D] shadow-md shadow-black/30 transition-all disabled:opacity-50"
                >
                  {submittingDiag ? 'Mengirim...' : 'Kirim Estimasi ke Pelanggan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* In-App Chat Drawer */}
      {selectedTaskForChat && (
        <RepairChatDrawer
          isOpen={isChatDrawerOpen}
          onClose={() => {
            setIsChatDrawerOpen(false);
            setSelectedTaskForChat(null);
          }}
          repairRequestId={selectedTaskForChat.repairId}
          orderCode={selectedTaskForChat.orderCode}
          partnerName={selectedTaskForChat.customerName}
          partnerRole="customer"
        />
      )}

      {/* Schedule Modal */}
      {selectedTaskForSchedule && (
        <TechnicianScheduleModal
          repairId={selectedTaskForSchedule.repairId}
          orderCode={selectedTaskForSchedule.orderCode}
          isOpen={isScheduleModalOpen}
          onClose={() => {
            setIsScheduleModalOpen(false);
            setSelectedTaskForSchedule(null);
          }}
          onSuccess={loadTasks}
        />
      )}
    </div>
  );
}
