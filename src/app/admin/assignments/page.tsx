'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  UserCheck,
  Search,
  Filter,
  RefreshCw,
  Eye,
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  ArrowRightLeft,
  Calendar,
  User,
  Phone,
  Wrench,
  ChevronLeft,
  ChevronRight,
  X,
  FileText,
  Star,
} from 'lucide-react';

interface AssignmentItem {
  id: number;
  repair_request_id: number;
  technician_id: number;
  assigned_by_user_id: number | null;
  assignment_type: string;
  status: string;
  rejection_reason: string | null;
  created_at: string;
  responded_at: string | null;
  order_code: string;
  device_brand: string | null;
  device_model: string | null;
  repair_status: string;
  address_text: string;
  technician_name: string;
  technician_phone: string;
  technician_rating: number;
  customer_name: string;
  customer_phone: string | null;
  assigned_by_admin_email: string | null;
}

interface TechnicianOption {
  id: number;
  user_id: number;
  full_name: string;
  phone_number: string;
  is_available: boolean;
  rating_average: number;
}

interface RepairOption {
  id: number;
  order_code: string;
  device_brand: string | null;
  device_model: string | null;
  customer_name: string;
  current_status: string;
}

export default function AssignmentsAdminPage() {
  const [assignments, setAssignments] = useState<AssignmentItem[]>([]);
  const [technicians, setTechnicians] = useState<TechnicianOption[]>([]);
  const [availableOrders, setAvailableOrders] = useState<RepairOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filters & Pagination
  const [search, setSearch] = useState('');
  // Debounce pencarian: tanpa ini, setiap ketukan tombol mengubah `search`
  // → fetchAssignments berubah identitas → useEffect memanggil ulang API
  // (1 fetch per karakter yang diketik). Tunggu 400ms setelah ketukan
  // terakhir sebelum menerapkan filter — input tetap responsif karena
  // `search` (nilai input) berubah langsung, hanya fetch-nya yang
  // ditunda. Reset halaman ke 1 ikut di dalam timer yang sama agar tidak
  // ada fetch ekstra dengan filter lama.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // Stats
  const [stats, setStats] = useState({
    total: 0,
    offered: 0,
    accepted: 0,
    completed: 0,
    rejected_or_cancelled: 0,
  });

  // Modals
  const [selectedAssignment, setSelectedAssignment] = useState<AssignmentItem | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createOrderId, setCreateOrderId] = useState('');
  const [createTechId, setCreateTechId] = useState('');
  const [createNote, setCreateNote] = useState('');
  const [isCreateSubmitting, setIsCreateSubmitting] = useState(false);

  const [isReassignOpen, setIsReassignOpen] = useState(false);
  const [reassignTarget, setReassignTarget] = useState<AssignmentItem | null>(null);
  const [newTechId, setNewTechId] = useState('');
  const [reassignReason, setReassignReason] = useState('');
  const [isReassignSubmitting, setIsReassignSubmitting] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch Assignments
  const fetchAssignments = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        status: statusFilter,
      });
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());

      const res = await fetch(`/api/admin/assignments?${params.toString()}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Gagal memuat daftar penugasan');
      }

      setAssignments(json.data || []);
      setTotalPages(json.meta?.totalPages || 1);
      setTotalItems(json.meta?.total || 0);
      if (json.stats) setStats(json.stats);
    } catch (err: any) {
      setErrorMsg(err.message || 'Terjadi kesalahan sistem');
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, statusFilter, debouncedSearch]);

  // Load Metadata
  useEffect(() => {
    async function loadMeta() {
      try {
        const [techRes, repRes] = await Promise.all([
          fetch('/api/admin/technicians?limit=50'),
          fetch('/api/admin/repairs?limit=50&status=all'),
        ]);
        const techJson = await techRes.json();
        if (techJson.success) setTechnicians(techJson.data || []);

        const repJson = await repRes.json();
        if (repJson.success) {
          // Filter hanya pesanan yang belum selesai atau belum batal
          const validOrders = (repJson.data || []).filter(
            (o: any) => !['completed', 'cancelled'].includes(o.current_status)
          );
          setAvailableOrders(validOrders);
        }
      } catch (e) {
        console.error('Failed to load metadata', e);
      }
    }
    loadMeta();
  }, []);

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  // Submit Create Assignment
  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createOrderId || !createTechId) {
      showToast('error', 'Pilih pesanan dan teknisi terlebih dahulu');
      return;
    }
    setIsCreateSubmitting(true);
    try {
      const res = await fetch('/api/admin/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repair_request_id: createOrderId,
          technician_id: createTechId,
          notes: createNote,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Gagal membuat penugasan');
      showToast('success', json.message);
      setIsCreateOpen(false);
      setCreateOrderId('');
      setCreateTechId('');
      setCreateNote('');
      fetchAssignments();
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setIsCreateSubmitting(false);
    }
  };

  // Submit Reassign
  const handleReassign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reassignTarget || !newTechId) {
      showToast('error', 'Pilih teknisi pengganti terlebih dahulu');
      return;
    }
    setIsReassignSubmitting(true);
    try {
      const res = await fetch(`/api/admin/assignments/${reassignTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reassign',
          new_technician_id: newTechId,
          reason: reassignReason,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Gagal mengalihkan tugas');
      showToast('success', json.message);
      setIsReassignOpen(false);
      fetchAssignments();
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setIsReassignSubmitting(false);
    }
  };

  // Cancel Assignment
  const handleCancelAssignment = async (item: AssignmentItem) => {
    if (!confirm(`Batalkan penugasan teknisi ${item.technician_name} untuk pesanan ${item.order_code}?`)) return;
    try {
      const res = await fetch(`/api/admin/assignments/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'cancel',
          reason: 'Dibatalkan oleh Administrator via Panel Penugasan',
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Gagal membatalkan');
      showToast('success', json.message);
      fetchAssignments();
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  // Status Badge Helper
  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'offered':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock className="w-3 h-3" /> Menunggu Konfirmasi
          </span>
        );
      case 'accepted':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <UserCheck className="w-3 h-3" /> Diterima / Aktif
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" /> Selesai Bertugas
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <XCircle className="w-3 h-3" /> Ditolak Teknisi
          </span>
        );
      case 'reassigned':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <ArrowRightLeft className="w-3 h-3" /> Dialihkan
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/20">
            <XCircle className="w-3 h-3" /> Dibatalkan
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-300">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 text-[#FFFBF4]">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl shadow-xl border backdrop-blur-xl transition-all text-sm font-medium ${
            toast.type === 'success'
              ? 'bg-[#181913]/95 border-emerald-500/40 text-emerald-300'
              : 'bg-[#181913]/95 border-rose-500/40 text-rose-300'
          }`}
        >
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4 text-rose-400" />}
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-[#D8CFBC]/15 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#FFFBF4] flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#D8CFBC]/10 border border-[#D8CFBC]/20 flex items-center justify-center text-[#D8CFBC]">
              <UserCheck className="w-5 h-5" />
            </div>
            Penugasan Teknisi
          </h1>
          <p className="text-sm text-[#D8CFBC]/70 mt-1">
            Atur penugasan teknisi manual, pantau penerimaan tugas, dan kelola eskalasi pengalihan kerja.
          </p>
        </div>
        <div className="flex gap-2.5">
          <button
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FFFBF4] hover:bg-[#D8CFBC] text-[#11120D] text-xs font-bold transition shadow-md hover:scale-105 active:scale-95"
          >
            <Plus className="w-4 h-4" />
            Tugaskan Manual
          </button>
          <button
            onClick={fetchAssignments}
            disabled={isLoading}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#1C1D17] hover:bg-[#252720] text-[#D8CFBC] hover:text-[#FFFBF4] text-xs font-medium transition border border-[#D8CFBC]/20 shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Segarkan
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
        <div className="bg-[#181913]/90 border border-[#D8CFBC]/20 rounded-2xl p-4 shadow-sm relative overflow-hidden backdrop-blur-xl">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-[#D8CFBC]/30 to-transparent absolute top-0 left-0" />
          <p className="text-[11px] font-medium text-[#D8CFBC]/70 uppercase tracking-wider">Total Penugasan</p>
          <p className="text-2xl font-bold text-[#FFFBF4] mt-1.5 font-mono">{stats.total}</p>
        </div>
        <div className="bg-[#181913]/90 border border-amber-500/25 rounded-2xl p-4 shadow-sm relative overflow-hidden backdrop-blur-xl">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-amber-500/30 to-transparent absolute top-0 left-0" />
          <p className="text-[11px] font-medium text-amber-300 uppercase tracking-wider">Menunggu Respon</p>
          <p className="text-2xl font-bold text-amber-400 mt-1.5 font-mono">{stats.offered}</p>
        </div>
        <div className="bg-[#181913]/90 border border-[#D8CFBC]/25 rounded-2xl p-4 shadow-sm relative overflow-hidden backdrop-blur-xl">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-[#D8CFBC]/30 to-transparent absolute top-0 left-0" />
          <p className="text-[11px] font-medium text-[#D8CFBC] uppercase tracking-wider">Aktif / Diterima</p>
          <p className="text-2xl font-bold text-[#D8CFBC] mt-1.5 font-mono">{stats.accepted}</p>
        </div>
        <div className="bg-[#181913]/90 border border-emerald-500/25 rounded-2xl p-4 shadow-sm relative overflow-hidden backdrop-blur-xl">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent absolute top-0 left-0" />
          <p className="text-[11px] font-medium text-emerald-300 uppercase tracking-wider">Tugas Selesai</p>
          <p className="text-2xl font-bold text-emerald-400 mt-1.5 font-mono">{stats.completed}</p>
        </div>
        <div className="bg-[#181913]/90 border border-rose-500/25 rounded-2xl p-4 shadow-sm relative overflow-hidden backdrop-blur-xl">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-rose-500/30 to-transparent absolute top-0 left-0" />
          <p className="text-[11px] font-medium text-rose-300 uppercase tracking-wider">Ditolak / Batal</p>
          <p className="text-2xl font-bold text-rose-400 mt-1.5 font-mono">{stats.rejected_or_cancelled}</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-[#181913]/80 border border-[#D8CFBC]/15 rounded-2xl p-4 flex flex-col md:flex-row gap-3 shadow-sm backdrop-blur-xl">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8B8878]" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              // Hanya ubah nilai input; fetch + reset halaman menunggu
              // debounce 400ms (lihat useEffect debouncedSearch di atas).
              setSearch(e.target.value);
            }}
            placeholder="Cari kode pesanan, nama teknisi, nomor HP, atau nama pelanggan..."
            className="w-full bg-[#11120D] border border-[#D8CFBC]/20 rounded-xl pl-10 pr-4 py-2 text-xs sm:text-sm text-[#FFFBF4] placeholder-[#8B8878] focus:outline-none focus:border-[#D8CFBC] transition"
          />
        </div>
        <div className="flex gap-2.5">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="bg-[#11120D] border border-[#D8CFBC]/20 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-[#FFFBF4] focus:outline-none focus:border-[#D8CFBC]"
          >
            <option value="all">Semua Status Penugasan</option>
            <option value="offered">Menunggu Respon (offered)</option>
            <option value="accepted">Diterima / Aktif (accepted)</option>
            <option value="completed">Selesai (completed)</option>
            <option value="rejected">Ditolak Teknisi (rejected)</option>
            <option value="reassigned">Dialihkan (reassigned)</option>
            <option value="cancelled">Dibatalkan (cancelled)</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#181913]/90 border border-[#D8CFBC]/20 rounded-3xl overflow-hidden shadow-lg backdrop-blur-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-[#FFFBF4]">
            <thead className="bg-[#141510]/95 text-[11px] font-semibold uppercase tracking-wider text-[#D8CFBC] border-b border-[#D8CFBC]/15">
              <tr>
                <th className="px-5 py-3.5">ID / Kode Pesanan</th>
                <th className="px-4 py-3.5">Teknisi Ditugaskan</th>
                <th className="px-4 py-3.5">Pelanggan & Lokasi</th>
                <th className="px-4 py-3.5">Status Penugasan</th>
                <th className="px-4 py-3.5">Jenis</th>
                <th className="px-4 py-3.5">Waktu Penugasan</th>
                <th className="px-5 py-3.5 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D8CFBC]/10">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[#D8CFBC]/60">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#D8CFBC] mb-2" />
                    Memuat riwayat penugasan...
                  </td>
                </tr>
              ) : assignments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[#D8CFBC]/60">
                    <UserCheck className="w-10 h-10 mx-auto text-[#565449] mb-2" />
                    Belum ada rekaman penugasan teknisi yang sesuai.
                  </td>
                </tr>
              ) : (
                assignments.map((item) => (
                  <tr key={item.id} className="hover:bg-[#1C1D17]/60 transition">
                    <td className="px-5 py-4">
                      <div className="font-mono font-semibold text-[#D8CFBC]">#{item.id}</div>
                      <div className="text-xs text-[#FFFBF4] font-medium font-mono">{item.order_code}</div>
                      <div className="text-[11px] text-[#D8CFBC]/70">
                        {item.device_brand || 'Perangkat'} {item.device_model || ''}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-medium text-[#FFFBF4] flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-[#D8CFBC]" />
                        {item.technician_name}
                      </div>
                      <div className="text-xs text-[#D8CFBC]/70 flex items-center gap-1 mt-0.5 font-mono">
                        <Phone className="w-3 h-3 text-[#565449]" />
                        {item.technician_phone}
                      </div>
                      <div className="text-[11px] text-amber-300 flex items-center gap-1 mt-0.5">
                        <Star className="w-3 h-3 fill-amber-400" />
                        {item.technician_rating || 5.0}★
                      </div>
                    </td>
                    <td className="px-4 py-4 max-w-xs">
                      <div className="font-medium text-[#FFFBF4]">{item.customer_name}</div>
                      <div className="text-xs text-[#D8CFBC]/70 truncate">{item.address_text}</div>
                    </td>
                    <td className="px-4 py-4">{renderStatusBadge(item.status)}</td>
                    <td className="px-4 py-4">
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#1C1D17] text-[#D8CFBC] font-medium border border-[#D8CFBC]/20">
                        {item.assignment_type === 'manual_admin' ? 'Manual Admin' : 'Auto Sistem'}
                      </span>
                      {item.assigned_by_admin_email && (
                        <div className="text-[10px] text-[#D8CFBC]/50 mt-1 font-mono">{item.assigned_by_admin_email}</div>
                      )}
                    </td>
                    <td className="px-4 py-4 text-xs text-[#D8CFBC]/70 font-mono">
                      <div>
                        {new Date(item.created_at).toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </div>
                      <div className="text-[11px] text-[#D8CFBC]/50">
                        {new Date(item.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => {
                            setSelectedAssignment(item);
                            setIsDetailOpen(true);
                          }}
                          title="Lihat Detail Penugasan"
                          className="p-1.5 rounded-xl bg-[#1C1D17] hover:bg-[#252720] text-[#D8CFBC] hover:text-[#FFFBF4] transition border border-[#D8CFBC]/20"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {['offered', 'accepted'].includes(item.status) && (
                          <>
                            <button
                              onClick={() => {
                                setReassignTarget(item);
                                setNewTechId('');
                                setReassignReason('');
                                setIsReassignOpen(true);
                              }}
                              title="Alihkan ke Teknisi Lain"
                              className="p-1.5 rounded-xl bg-[#1C1D17] hover:bg-[#252720] text-purple-400 hover:text-purple-300 transition border border-purple-500/30"
                            >
                              <ArrowRightLeft className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleCancelAssignment(item)}
                              title="Batalkan Penugasan"
                              className="p-1.5 rounded-xl bg-[#1C1D17] hover:bg-[#252720] text-rose-400 hover:text-rose-300 transition border border-rose-500/30"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="p-4 border-t border-[#D8CFBC]/15 bg-[#141510]/60 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-[#D8CFBC]/70">
          <div>
            Menampilkan <span className="text-[#FFFBF4] font-medium font-mono">{assignments.length}</span> dari{' '}
            <span className="text-[#FFFBF4] font-medium font-mono">{totalItems}</span> penugasan
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1.5 rounded-xl bg-[#1C1D17] hover:bg-[#252720] text-[#D8CFBC] hover:text-[#FFFBF4] disabled:opacity-40 transition border border-[#D8CFBC]/15"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-[#FFFBF4] font-medium font-mono">
              Halaman {page} dari {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1.5 rounded-xl bg-[#1C1D17] hover:bg-[#252720] text-[#D8CFBC] hover:text-[#FFFBF4] disabled:opacity-40 transition border border-[#D8CFBC]/15"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* MODAL 1: Buat Penugasan Baru */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-[#11120D]/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#181913]/95 border border-[#D8CFBC]/25 rounded-3xl w-full max-w-lg p-6 shadow-2xl backdrop-blur-2xl">
            <div className="flex justify-between items-center mb-4 border-b border-[#D8CFBC]/15 pb-3">
              <h3 className="text-lg font-bold text-[#FFFBF4] flex items-center gap-2">
                <Plus className="w-5 h-5 text-[#D8CFBC]" />
                Tugaskan Teknisi Manual
              </h3>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="p-1 rounded-xl bg-[#1C1D17] hover:bg-[#252720] text-[#D8CFBC] hover:text-[#FFFBF4]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAssignment} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-[#D8CFBC] block mb-1.5">Pilih Pesanan Perbaikan Aktif</label>
                <select
                  value={createOrderId}
                  onChange={(e) => setCreateOrderId(e.target.value)}
                  className="w-full bg-[#11120D] border border-[#D8CFBC]/20 rounded-xl px-3.5 py-2.5 text-sm text-[#FFFBF4] focus:outline-none focus:border-[#D8CFBC]"
                >
                  <option value="">-- Pilih Tiket Pesanan --</option>
                  {availableOrders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.order_code} - {o.customer_name} ({o.device_brand || 'Alat'} {o.device_model || ''}) [Status: {o.current_status}]
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-[#D8CFBC] block mb-1.5">Pilih Teknisi Mitra</label>
                <select
                  value={createTechId}
                  onChange={(e) => setCreateTechId(e.target.value)}
                  className="w-full bg-[#11120D] border border-[#D8CFBC]/20 rounded-xl px-3.5 py-2.5 text-sm text-[#FFFBF4] focus:outline-none focus:border-[#D8CFBC]"
                >
                  <option value="">-- Pilih Teknisi Tersedia --</option>
                  {technicians.map((t) => (
                    <option key={t.user_id} value={t.user_id}>
                      {t.full_name} ({t.phone_number}) {t.is_available ? '• Siap Kerja' : '• Sedang Bertugas'} - Rating: {t.rating_average || 5.0}★
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-[#D8CFBC] block mb-1.5">Instruksi Khusus untuk Teknisi</label>
                <textarea
                  value={createNote}
                  onChange={(e) => setCreateNote(e.target.value)}
                  rows={3}
                  placeholder="Catatan pengerjaan atau kondisi alamat lapangan..."
                  className="w-full bg-[#11120D] border border-[#D8CFBC]/20 rounded-xl p-3 text-xs text-[#FFFBF4] placeholder-[#8B8878] focus:outline-none focus:border-[#D8CFBC]"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 rounded-xl bg-[#1C1D17] hover:bg-[#252720] text-[#D8CFBC] hover:text-[#FFFBF4] text-xs font-medium transition border border-[#D8CFBC]/15"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isCreateSubmitting || !createOrderId || !createTechId}
                  className="px-4 py-2 rounded-xl bg-[#FFFBF4] hover:bg-[#D8CFBC] text-[#11120D] text-xs font-bold transition flex items-center gap-1.5 shadow-md disabled:opacity-50"
                >
                  {isCreateSubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                  Tugaskan Sekarang
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Alihkan ke Teknisi Lain */}
      {isReassignOpen && reassignTarget && (
        <div className="fixed inset-0 z-50 bg-[#11120D]/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#181913]/95 border border-[#D8CFBC]/25 rounded-3xl w-full max-w-md p-6 shadow-2xl backdrop-blur-2xl">
            <h3 className="text-lg font-bold text-[#FFFBF4] flex items-center gap-2 mb-2">
              <ArrowRightLeft className="w-5 h-5 text-purple-400" />
              Alihkan Tugas ke Teknisi Lain
            </h3>
            <p className="text-xs text-[#D8CFBC] mb-4 font-mono">
              Pesanan: {reassignTarget.order_code} (Sebelumnya: {reassignTarget.technician_name})
            </p>

            <form onSubmit={handleReassign} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-[#D8CFBC] block mb-1.5">Pilih Teknisi Pengganti</label>
                <select
                  value={newTechId}
                  onChange={(e) => setNewTechId(e.target.value)}
                  className="w-full bg-[#11120D] border border-[#D8CFBC]/20 rounded-xl px-3.5 py-2.5 text-sm text-[#FFFBF4] focus:outline-none focus:border-[#D8CFBC]"
                >
                  <option value="">-- Pilih Teknisi --</option>
                  {technicians
                    .filter((t) => t.user_id !== reassignTarget.technician_id)
                    .map((t) => (
                      <option key={t.user_id} value={t.user_id}>
                        {t.full_name} ({t.phone_number}) {t.is_available ? '• Siap Kerja' : '• Sedang Bertugas'} - Rating: {t.rating_average || 5.0}★
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-[#D8CFBC] block mb-1.5">Alasan Pengalihan</label>
                <textarea
                  value={reassignReason}
                  onChange={(e) => setReassignReason(e.target.value)}
                  rows={3}
                  placeholder="Contoh: Teknisi sebelumnya mengalami kendala darurat / sakit..."
                  className="w-full bg-[#11120D] border border-[#D8CFBC]/20 rounded-xl p-3 text-xs text-[#FFFBF4] placeholder-[#8B8878] focus:outline-none focus:border-[#D8CFBC]"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsReassignOpen(false)}
                  className="px-4 py-2 rounded-xl bg-[#1C1D17] hover:bg-[#252720] text-[#D8CFBC] hover:text-[#FFFBF4] text-xs font-medium transition border border-[#D8CFBC]/15"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isReassignSubmitting || !newTechId}
                  className="px-4 py-2 rounded-xl bg-purple-500 hover:bg-purple-400 text-[#11120D] text-xs font-bold transition flex items-center gap-1.5 shadow-md disabled:opacity-50"
                >
                  {isReassignSubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                  Konfirmasi Pengalihan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Detail Penugasan */}
      {isDetailOpen && selectedAssignment && (
        <div className="fixed inset-0 z-50 bg-[#11120D]/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#181913]/95 border border-[#D8CFBC]/25 rounded-3xl w-full max-w-md p-6 shadow-2xl backdrop-blur-2xl">
            <div className="flex justify-between items-center mb-4 border-b border-[#D8CFBC]/15 pb-3">
              <h3 className="text-lg font-bold text-[#FFFBF4] flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-[#D8CFBC]" />
                Detail Penugasan #{selectedAssignment.id}
              </h3>
              <button
                onClick={() => setIsDetailOpen(false)}
                className="p-1 rounded-xl bg-[#1C1D17] hover:bg-[#252720] text-[#D8CFBC] hover:text-[#FFFBF4]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="bg-[#11120D] p-3 rounded-2xl border border-[#D8CFBC]/15">
                <span className="text-[#D8CFBC]/70 block mb-1">Status Penugasan:</span>
                {renderStatusBadge(selectedAssignment.status)}
              </div>

              <div className="bg-[#11120D] p-3 rounded-2xl border border-[#D8CFBC]/15">
                <span className="text-[#D8CFBC] block mb-1 font-semibold">Informasi Pesanan:</span>
                <p className="font-mono text-[#FFFBF4] font-medium">{selectedAssignment.order_code}</p>
                <p className="text-[#FFFBF4] mt-1">
                  {selectedAssignment.device_brand || 'Perangkat'} {selectedAssignment.device_model || ''}
                </p>
                <p className="text-[#D8CFBC]/70 mt-1">Alamat: {selectedAssignment.address_text}</p>
              </div>

              <div className="bg-[#11120D] p-3 rounded-2xl border border-[#D8CFBC]/15">
                <span className="text-[#D8CFBC] block mb-1 font-semibold">Teknisi:</span>
                <p className="text-[#FFFBF4] font-medium">{selectedAssignment.technician_name}</p>
                <p className="text-[#D8CFBC]/70 font-mono">{selectedAssignment.technician_phone}</p>
              </div>

              {selectedAssignment.rejection_reason && (
                <div className="bg-rose-950/30 p-3 rounded-2xl border border-rose-500/30 text-rose-300">
                  <span className="font-semibold block mb-0.5">Catatan / Alasan:</span>
                  <p>{selectedAssignment.rejection_reason}</p>
                </div>
              )}
            </div>

            <div className="mt-5 pt-3 border-t border-[#D8CFBC]/15 flex justify-end">
              <button
                onClick={() => setIsDetailOpen(false)}
                className="px-4 py-2 rounded-xl bg-[#1C1D17] hover:bg-[#252720] text-[#D8CFBC] hover:text-[#FFFBF4] text-xs font-medium border border-[#D8CFBC]/15"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
