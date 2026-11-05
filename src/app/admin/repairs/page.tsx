'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ClipboardList,
  Search,
  Filter,
  RefreshCw,
  Eye,
  UserCheck,
  Edit,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Wrench,
  User,
  Phone,
  MapPin,
  Calendar,
  DollarSign,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  X,
  FileText,
  ShieldAlert,
} from 'lucide-react';

interface RepairItem {
  id: number;
  order_code: string;
  customer_id: number;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  category_id: number;
  category_name: string;
  service_id: number | null;
  service_name: string | null;
  device_brand: string | null;
  device_model: string | null;
  problem_description: string;
  problem_photos: string[];
  address_text: string;
  latitude: number;
  longitude: number;
  current_status: string;
  assigned_technician_id: number | null;
  assigned_technician_name: string | null;
  assignment_status: string | null;
  invoice_id: number | null;
  invoice_number: string | null;
  invoice_amount: number | null;
  invoice_status: string | null;
  created_at: string;
  updated_at: string;
}

interface RepairDetail extends RepairItem {
  customer_saved_address?: string;
  service_base_price?: number;
  assignments: Array<{
    id: number;
    technician_id: number;
    technician_name: string;
    technician_phone: string;
    rating_average: number;
    status: string;
    assignment_type: string;
    created_at: string;
  }>;
  statusHistory: Array<{
    id: number;
    previous_status: string | null;
    new_status: string;
    actor_role: string;
    notes: string | null;
    changed_by_name: string;
    created_at: string;
  }>;
  invoice?: {
    id: number;
    invoice_number: string;
    subtotal_labor: number;
    subtotal_parts: number;
    service_fee: number;
    total_amount: number;
    status: string;
    due_date: string;
    paid_at: string | null;
    payments_list?: any;
  } | null;
  complaints?: any[];
}

interface TechnicianOption {
  id: number;
  user_id: number;
  full_name: string;
  phone_number: string;
  is_available: boolean;
  is_verified: boolean;
  rating_average: number;
}

interface CategoryOption {
  id: number;
  name: string;
}

export default function RepairsAdminPage() {
  const [repairs, setRepairs] = useState<RepairItem[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [technicians, setTechnicians] = useState<TechnicianOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filter & Pagination
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // Stats
  const [stats, setStats] = useState({
    total: 0,
    submitted: 0,
    in_progress: 0,
    completed: 0,
    issues_or_cancelled: 0,
  });

  // Modals
  const [selectedRepair, setSelectedRepair] = useState<RepairDetail | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [statusActionTarget, setStatusActionTarget] = useState<RepairItem | null>(null);
  const [newStatus, setNewStatus] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [isStatusSubmitting, setIsStatusSubmitting] = useState(false);

  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<RepairItem | null>(null);
  const [selectedTechId, setSelectedTechId] = useState<string>('');
  const [assignNote, setAssignNote] = useState('');
  const [isAssignSubmitting, setIsAssignSubmitting] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  // Fetch Repairs
  const fetchRepairs = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        status: statusFilter,
        category_id: categoryFilter,
      });
      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(`/api/admin/repairs?${params.toString()}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Gagal memuat data permintaan perbaikan');
      }

      setRepairs(json.data || []);
      setTotalPages(json.meta?.totalPages || 1);
      setTotalItems(json.meta?.total || 0);
      if (json.stats) {
        setStats(json.stats);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Terjadi kesalahan sistem');
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, statusFilter, categoryFilter, search]);

  // Load Categories & Technicians for Dropdowns
  useEffect(() => {
    async function loadMeta() {
      try {
        const [catRes, techRes] = await Promise.all([
          fetch('/api/admin/categories?limit=50'),
          fetch('/api/admin/technicians?limit=50'),
        ]);
        const catJson = await catRes.json();
        if (catJson.success) setCategories(catJson.data || []);

        const techJson = await techRes.json();
        if (techJson.success) setTechnicians(techJson.data || []);
      } catch (e) {
        console.error('Failed to load metadata', e);
      }
    }
    loadMeta();
  }, []);

  useEffect(() => {
    fetchRepairs();
  }, [fetchRepairs]);

  // Detail Modal Handler
  const openDetail = async (item: RepairItem) => {
    setIsDetailOpen(true);
    setIsDetailLoading(true);
    setSelectedRepair(null);
    try {
      const res = await fetch(`/api/admin/repairs/${item.id}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Gagal mengambil detail');
      }
      setSelectedRepair(json.data);
    } catch (err: any) {
      showToast('error', err.message);
      setIsDetailOpen(false);
    } finally {
      setIsDetailLoading(false);
    }
  };

  // Status Modal Handler
  const openStatusModal = (item: RepairItem) => {
    setStatusActionTarget(item);
    setNewStatus(item.current_status);
    setStatusNote('');
    setIsStatusModalOpen(true);
  };

  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusActionTarget) return;
    setIsStatusSubmitting(true);
    try {
      const res = await fetch(`/api/admin/repairs/${statusActionTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_status',
          status: newStatus,
          notes: statusNote,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Gagal memperbarui status');
      showToast('success', json.message);
      setIsStatusModalOpen(false);
      fetchRepairs();
      if (isDetailOpen && selectedRepair?.id === statusActionTarget.id) {
        openDetail(statusActionTarget);
      }
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setIsStatusSubmitting(false);
    }
  };

  // Assign Modal Handler
  const openAssignModal = (item: RepairItem) => {
    setAssignTarget(item);
    setSelectedTechId(item.assigned_technician_id ? item.assigned_technician_id.toString() : '');
    setAssignNote('');
    setIsAssignModalOpen(true);
  };

  const handleAssignTechnician = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignTarget || !selectedTechId) {
      showToast('error', 'Pilih teknisi terlebih dahulu');
      return;
    }
    setIsAssignSubmitting(true);
    try {
      const res = await fetch(`/api/admin/repairs/${assignTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'assign_technician',
          technician_id: selectedTechId,
          notes: assignNote,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Gagal menugaskan teknisi');
      showToast('success', json.message);
      setIsAssignModalOpen(false);
      fetchRepairs();
      if (isDetailOpen && selectedRepair?.id === assignTarget.id) {
        openDetail(assignTarget);
      }
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setIsAssignSubmitting(false);
    }
  };

  // Status Badge Helper
  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'submitted':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
            <Clock className="w-3 h-3" /> Baru Masuk
          </span>
        );
      case 'assigned':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#D8CFBC]/15 text-[#FFFBF4] border border-[#D8CFBC]/30">
            <UserCheck className="w-3 h-3 text-[#D8CFBC]" /> Teknisi Ditugaskan
          </span>
        );
      case 'scheduled':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/15 text-purple-300 border border-purple-500/30">
            <Calendar className="w-3 h-3" /> Terjadwal
          </span>
        );
      case 'in_diagnosis':
      case 'in_repair':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#565449]/40 text-[#D8CFBC] border border-[#D8CFBC]/25">
            <Wrench className="w-3 h-3 text-[#D8CFBC]" /> Sedang Dikerjakan
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" /> Selesai
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30">
            <XCircle className="w-3 h-3" /> Dibatalkan
          </span>
        );
      case 'complained':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-500/15 text-orange-300 border border-orange-500/30">
            <AlertTriangle className="w-3 h-3" /> Ada Komplain
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#1C1D17] text-[#D8CFBC] border border-[#D8CFBC]/20">
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
              <ClipboardList className="w-5 h-5" />
            </div>
            Permintaan Perbaikan
          </h1>
          <p className="text-sm text-[#D8CFBC]/70 mt-1">
            Pantau dan kelola tiket perbaikan, inspeksi lapangan, penugasan teknisi, dan status pengerjaan.
          </p>
        </div>
        <button
          onClick={fetchRepairs}
          disabled={isLoading}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#1C1D17] hover:bg-[#252720] text-[#D8CFBC] hover:text-[#FFFBF4] text-xs font-medium transition border border-[#D8CFBC]/20 shadow-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Segarkan
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
        <div className="bg-[#181913]/90 border border-[#D8CFBC]/20 rounded-2xl p-4 shadow-sm relative overflow-hidden backdrop-blur-xl">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-[#D8CFBC]/30 to-transparent absolute top-0 left-0" />
          <p className="text-[11px] font-medium text-[#D8CFBC]/70 uppercase tracking-wider">Total Pesanan</p>
          <p className="text-2xl font-bold text-[#FFFBF4] mt-1.5 font-mono">{stats.total}</p>
        </div>
        <div className="bg-[#181913]/90 border border-amber-500/25 rounded-2xl p-4 shadow-sm relative overflow-hidden backdrop-blur-xl">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-amber-500/30 to-transparent absolute top-0 left-0" />
          <p className="text-[11px] font-medium text-amber-300 uppercase tracking-wider">Butuh Penugasan</p>
          <p className="text-2xl font-bold text-amber-400 mt-1.5 font-mono">{stats.submitted}</p>
        </div>
        <div className="bg-[#181913]/90 border border-[#D8CFBC]/25 rounded-2xl p-4 shadow-sm relative overflow-hidden backdrop-blur-xl">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-[#D8CFBC]/30 to-transparent absolute top-0 left-0" />
          <p className="text-[11px] font-medium text-[#D8CFBC] uppercase tracking-wider">Dalam Pengerjaan</p>
          <p className="text-2xl font-bold text-[#D8CFBC] mt-1.5 font-mono">{stats.in_progress}</p>
        </div>
        <div className="bg-[#181913]/90 border border-emerald-500/25 rounded-2xl p-4 shadow-sm relative overflow-hidden backdrop-blur-xl">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent absolute top-0 left-0" />
          <p className="text-[11px] font-medium text-emerald-300 uppercase tracking-wider">Selesai</p>
          <p className="text-2xl font-bold text-emerald-400 mt-1.5 font-mono">{stats.completed}</p>
        </div>
        <div className="bg-[#181913]/90 border border-rose-500/25 rounded-2xl p-4 shadow-sm relative overflow-hidden backdrop-blur-xl">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-rose-500/30 to-transparent absolute top-0 left-0" />
          <p className="text-[11px] font-medium text-rose-300 uppercase tracking-wider">Kendala / Batal</p>
          <p className="text-2xl font-bold text-rose-400 mt-1.5 font-mono">{stats.issues_or_cancelled}</p>
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
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Cari kode pesanan, nama pelanggan, perangkat, atau alamat..."
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
            <option value="all">Semua Status</option>
            <option value="submitted">Baru Masuk (Submitted)</option>
            <option value="assigned">Teknisi Ditugaskan</option>
            <option value="scheduled">Terjadwal</option>
            <option value="in_diagnosis">Inspeksi / Diagnosis</option>
            <option value="in_repair">Sedang Dikerjakan</option>
            <option value="completed">Selesai</option>
            <option value="cancelled">Dibatalkan</option>
            <option value="complained">Komplain</option>
          </select>

          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(1);
            }}
            className="bg-[#11120D] border border-[#D8CFBC]/20 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-[#FFFBF4] focus:outline-none focus:border-[#D8CFBC]"
          >
            <option value="all">Semua Kategori</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-[#181913]/90 border border-[#D8CFBC]/20 rounded-3xl overflow-hidden shadow-lg backdrop-blur-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-[#FFFBF4]">
            <thead className="bg-[#141510]/95 text-[11px] font-semibold uppercase tracking-wider text-[#D8CFBC] border-b border-[#D8CFBC]/15">
              <tr>
                <th className="px-5 py-3.5">Kode Pesanan</th>
                <th className="px-4 py-3.5">Pelanggan</th>
                <th className="px-4 py-3.5">Perangkat & Kategori</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5">Teknisi</th>
                <th className="px-4 py-3.5">Tagihan</th>
                <th className="px-4 py-3.5">Tanggal</th>
                <th className="px-5 py-3.5 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D8CFBC]/10">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-[#D8CFBC]/60">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#D8CFBC] mb-2" />
                    Memuat data permintaan perbaikan...
                  </td>
                </tr>
              ) : repairs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-[#D8CFBC]/60">
                    <ClipboardList className="w-10 h-10 mx-auto text-[#565449] mb-2" />
                    Tidak ada pesanan perbaikan yang sesuai kriteria filter.
                  </td>
                </tr>
              ) : (
                repairs.map((item) => (
                  <tr key={item.id} className="hover:bg-[#1C1D17]/60 transition">
                    <td className="px-5 py-4 font-mono font-semibold text-[#FFFBF4]">
                      <span className="text-[#D8CFBC] hover:text-[#FFFBF4] hover:underline cursor-pointer" onClick={() => openDetail(item)}>
                        {item.order_code}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-medium text-[#FFFBF4]">{item.customer_name}</div>
                      <div className="text-xs text-[#D8CFBC]/70">{item.customer_phone || item.customer_email || '-'}</div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-[#FFFBF4] font-medium">
                        {item.device_brand || 'Perangkat'} {item.device_model || ''}
                      </div>
                      <div className="text-xs text-[#D8CFBC]/70">{item.category_name}</div>
                    </td>
                    <td className="px-4 py-4">{renderStatusBadge(item.current_status)}</td>
                    <td className="px-4 py-4">
                      {item.assigned_technician_name ? (
                        <div className="flex items-center gap-1.5 text-[#FFFBF4]">
                          <UserCheck className="w-3.5 h-3.5 text-[#D8CFBC]" />
                          <span>{item.assigned_technician_name}</span>
                        </div>
                      ) : (
                        <button
                          onClick={() => openAssignModal(item)}
                          className="text-xs px-2.5 py-1 rounded-xl bg-[#FFFBF4] text-[#11120D] hover:bg-[#D8CFBC] transition font-bold shadow-xs"
                        >
                          + Tugaskan
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      {item.invoice_amount ? (
                        <div>
                          <div className="font-medium text-[#FFFBF4] font-mono">
                            Rp {Number(item.invoice_amount).toLocaleString('id-ID')}
                          </div>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                              item.invoice_status === 'paid'
                                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                            }`}
                          >
                            {item.invoice_status === 'paid' ? 'LUNAS' : 'BELUM BAYAR'}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-[#D8CFBC]/50">Belum ada tagihan</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-xs text-[#D8CFBC]/70 font-mono">
                      {new Date(item.created_at).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => openDetail(item)}
                          title="Lihat Detail Pesanan"
                          className="p-1.5 rounded-xl bg-[#1C1D17] hover:bg-[#252720] text-[#D8CFBC] hover:text-[#FFFBF4] transition border border-[#D8CFBC]/20"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openAssignModal(item)}
                          title="Tugaskan / Ganti Teknisi"
                          className="p-1.5 rounded-xl bg-[#1C1D17] hover:bg-[#252720] text-[#D8CFBC] hover:text-[#FFFBF4] transition border border-[#D8CFBC]/20"
                        >
                          <UserCheck className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openStatusModal(item)}
                          title="Ubah Status Manual"
                          className="p-1.5 rounded-xl bg-[#1C1D17] hover:bg-[#252720] text-amber-400 hover:text-amber-300 transition border border-amber-500/30"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
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
            Menampilkan <span className="text-[#FFFBF4] font-medium font-mono">{repairs.length}</span> dari{' '}
            <span className="text-[#FFFBF4] font-medium font-mono">{totalItems}</span> pesanan
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

      {/* MODAL 1: Detail Lengkap Pesanan */}
      {isDetailOpen && (
        <div className="fixed inset-0 z-50 bg-[#11120D]/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#181913]/95 border border-[#D8CFBC]/25 rounded-3xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl backdrop-blur-2xl">
            <div className="sticky top-0 bg-[#181913]/95 border-b border-[#D8CFBC]/15 p-5 flex justify-between items-center z-10 backdrop-blur-md">
              <div>
                <h3 className="text-lg font-bold text-[#FFFBF4] flex items-center gap-2">
                  <ClipboardList className="w-5 h-5 text-[#D8CFBC]" />
                  Detail Pesanan Perbaikan
                </h3>
                <p className="text-xs font-mono text-[#D8CFBC] mt-0.5">{selectedRepair?.order_code}</p>
              </div>
              <button
                onClick={() => setIsDetailOpen(false)}
                className="p-1.5 rounded-xl bg-[#1C1D17] hover:bg-[#252720] text-[#D8CFBC] hover:text-[#FFFBF4] transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {isDetailLoading ? (
                <div className="py-16 text-center text-[#D8CFBC]/60">
                  <RefreshCw className="w-8 h-8 animate-spin mx-auto text-[#D8CFBC] mb-2" />
                  Mengambil data lengkap pesanan...
                </div>
              ) : selectedRepair ? (
                <>
                  {/* Status & Quick Info */}
                  <div className="bg-[#11120D] border border-[#D8CFBC]/20 rounded-2xl p-4 flex flex-wrap justify-between items-center gap-3">
                    <div>
                      <span className="text-xs text-[#D8CFBC]/70 block mb-1">Status Saat Ini:</span>
                      {renderStatusBadge(selectedRepair.current_status)}
                    </div>
                    <div>
                      <span className="text-xs text-[#D8CFBC]/70 block mb-1">Dibuat Pada:</span>
                      <span className="text-xs font-medium text-[#FFFBF4] font-mono">
                        {new Date(selectedRepair.created_at).toLocaleString('id-ID')}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => openAssignModal(selectedRepair)}
                        className="px-3 py-1.5 rounded-xl bg-[#FFFBF4] hover:bg-[#D8CFBC] text-[#11120D] text-xs font-bold transition shadow-sm"
                      >
                        Tugaskan Teknisi
                      </button>
                      <button
                        onClick={() => openStatusModal(selectedRepair)}
                        className="px-3 py-1.5 rounded-xl bg-[#1C1D17] hover:bg-[#252720] text-[#D8CFBC] hover:text-[#FFFBF4] text-xs font-medium transition border border-[#D8CFBC]/20"
                      >
                        Ubah Status
                      </button>
                    </div>
                  </div>

                  {/* Customer & Location */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-[#11120D] border border-[#D8CFBC]/15 rounded-2xl p-4">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-[#D8CFBC] mb-3 flex items-center gap-1.5">
                        <User className="w-4 h-4 text-[#D8CFBC]" /> Informasi Pelanggan
                      </h4>
                      <p className="text-sm font-bold text-[#FFFBF4]">{selectedRepair.customer_name}</p>
                      <p className="text-xs text-[#D8CFBC] mt-1 flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-[#565449]" />
                        {selectedRepair.customer_phone || '-'}
                      </p>
                      <p className="text-xs text-[#D8CFBC]/70 mt-0.5">{selectedRepair.customer_email || '-'}</p>
                    </div>

                    <div className="bg-[#11120D] border border-[#D8CFBC]/15 rounded-2xl p-4">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-[#D8CFBC] mb-3 flex items-center gap-1.5">
                        <MapPin className="w-4 h-4 text-rose-400" /> Lokasi Pengerjaan
                      </h4>
                      <p className="text-xs text-[#FFFBF4] leading-relaxed">{selectedRepair.address_text}</p>
                      <p className="text-[11px] text-[#D8CFBC]/60 mt-2 font-mono">
                        Koordinat: {selectedRepair.latitude}, {selectedRepair.longitude}
                      </p>
                    </div>
                  </div>

                  {/* Device & Symptoms */}
                  <div className="bg-[#11120D] border border-[#D8CFBC]/15 rounded-2xl p-4">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-[#D8CFBC] mb-3 flex items-center gap-1.5">
                      <Wrench className="w-4 h-4 text-amber-400" /> Perangkat & Deskripsi Kerusakan
                    </h4>
                    <div className="grid grid-cols-2 gap-3 mb-3 text-xs">
                      <div>
                        <span className="text-[#D8CFBC]/70">Kategori:</span>{' '}
                        <span className="text-[#FFFBF4] font-medium">{selectedRepair.category_name}</span>
                      </div>
                      <div>
                        <span className="text-[#D8CFBC]/70">Merek / Model:</span>{' '}
                        <span className="text-[#FFFBF4] font-medium">
                          {selectedRepair.device_brand || '-'} {selectedRepair.device_model || ''}
                        </span>
                      </div>
                    </div>
                    <div className="bg-[#181913] p-3 rounded-xl border border-[#D8CFBC]/15 text-xs text-[#D8CFBC] leading-relaxed">
                      {selectedRepair.problem_description}
                    </div>

                    {selectedRepair.problem_photos && selectedRepair.problem_photos.length > 0 && (
                      <div className="mt-3">
                        <span className="text-xs text-[#D8CFBC] block mb-2">Foto Bukti Kerusakan:</span>
                        <div className="flex gap-2 overflow-x-auto pb-1">
                          {selectedRepair.problem_photos.map((url, i) => (
                            <a key={i} href={url} target="_blank" rel="noreferrer" className="block shrink-0">
                              <img
                                src={url}
                                alt={`Kerusakan ${i + 1}`}
                                className="w-20 h-20 object-cover rounded-xl border border-[#D8CFBC]/20 hover:opacity-80 transition"
                              />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Invoice Summary */}
                  {selectedRepair.invoice && (
                    <div className="bg-[#11120D] border border-[#D8CFBC]/15 rounded-2xl p-4">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-[#D8CFBC] mb-3 flex items-center gap-1.5">
                        <DollarSign className="w-4 h-4 text-emerald-400" /> Rincian Tagihan (Invoice #{selectedRepair.invoice.invoice_number})
                      </h4>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-3 font-mono">
                        <div>
                          <span className="text-[#D8CFBC]/70 block font-sans">Jasa:</span>
                          <span className="text-[#FFFBF4] font-medium">
                            Rp {Number(selectedRepair.invoice.subtotal_labor).toLocaleString('id-ID')}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#D8CFBC]/70 block font-sans">Sparepart:</span>
                          <span className="text-[#FFFBF4] font-medium">
                            Rp {Number(selectedRepair.invoice.subtotal_parts).toLocaleString('id-ID')}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#D8CFBC]/70 block font-sans">Platform Fee:</span>
                          <span className="text-[#FFFBF4] font-medium">
                            Rp {Number(selectedRepair.invoice.service_fee).toLocaleString('id-ID')}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#D8CFBC]/70 block font-sans">Total Tagihan:</span>
                          <span className="text-emerald-400 font-bold">
                            Rp {Number(selectedRepair.invoice.total_amount).toLocaleString('id-ID')}
                          </span>
                        </div>
                      </div>
                      <div className="text-xs flex items-center gap-2">
                        <span className="text-[#D8CFBC]">Status Pembayaran:</span>
                        <span
                          className={`font-semibold px-2 py-0.5 rounded-full text-[11px] ${
                            selectedRepair.invoice.status === 'paid'
                              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                              : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                          }`}
                        >
                          {selectedRepair.invoice.status.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Status Timeline */}
                  <div className="bg-[#11120D] border border-[#D8CFBC]/15 rounded-2xl p-4">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-[#D8CFBC] mb-3 flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-[#D8CFBC]" /> Linimasa Riwayat Status
                    </h4>
                    {selectedRepair.statusHistory && selectedRepair.statusHistory.length > 0 ? (
                      <div className="space-y-3 relative before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#D8CFBC]/20">
                        {selectedRepair.statusHistory.map((sh) => (
                          <div key={sh.id} className="relative pl-6 text-xs">
                            <div className="absolute left-1 top-1.5 w-2.5 h-2.5 rounded-full bg-[#D8CFBC] -translate-x-1/2 ring-4 ring-[#181913]" />
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-[#FFFBF4] uppercase">{sh.new_status}</span>
                              <span className="text-[11px] text-[#D8CFBC]/60 font-mono">
                                {new Date(sh.created_at).toLocaleString('id-ID')}
                              </span>
                              <span className="text-[10px] px-2 py-0.5 bg-[#181913] text-[#D8CFBC] rounded-full border border-[#D8CFBC]/20">
                                oleh {sh.changed_by_name} ({sh.actor_role})
                              </span>
                            </div>
                            {sh.notes && <p className="text-[#D8CFBC]/80 mt-1">{sh.notes}</p>}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-[#D8CFBC]/60">Belum ada catatan linimasa.</p>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Ubah Status Manual */}
      {isStatusModalOpen && statusActionTarget && (
        <div className="fixed inset-0 z-50 bg-[#11120D]/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#181913]/95 border border-[#D8CFBC]/25 rounded-3xl w-full max-w-md p-6 shadow-2xl backdrop-blur-2xl">
            <h3 className="text-lg font-bold text-[#FFFBF4] flex items-center gap-2 mb-2">
              <Edit className="w-5 h-5 text-amber-400" />
              Ubah Status Pesanan
            </h3>
            <p className="text-xs text-[#D8CFBC] mb-4 font-mono">{statusActionTarget.order_code}</p>

            <form onSubmit={handleUpdateStatus} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-[#D8CFBC] block mb-1.5">Pilih Status Baru</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="w-full bg-[#11120D] border border-[#D8CFBC]/20 rounded-xl px-3.5 py-2.5 text-sm text-[#FFFBF4] focus:outline-none focus:border-[#D8CFBC]"
                >
                  <option value="submitted">Baru Masuk (submitted)</option>
                  <option value="assigned">Teknisi Ditugaskan (assigned)</option>
                  <option value="scheduled">Kunjungan Terjadwal (scheduled)</option>
                  <option value="in_diagnosis">Inspeksi / Diagnosis (in_diagnosis)</option>
                  <option value="estimated">Estimasi Biaya Diajukan (estimated)</option>
                  <option value="customer_approved">Disetujui Pelanggan (customer_approved)</option>
                  <option value="in_repair">Sedang Dikerjakan (in_repair)</option>
                  <option value="completed">Pekerjaan Selesai (completed)</option>
                  <option value="cancelled">Dibatalkan (cancelled)</option>
                  <option value="complained">Komplain / Kendala (complained)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-[#D8CFBC] block mb-1.5">
                  Catatan Alasan Perubahan <span className="text-[#D8CFBC]/60">(Wajib / Dianjurkan)</span>
                </label>
                <textarea
                  value={statusNote}
                  onChange={(e) => setStatusNote(e.target.value)}
                  rows={3}
                  placeholder="Contoh: Pelanggan meminta penjadwalan ulang atau pembatalan sepihak..."
                  className="w-full bg-[#11120D] border border-[#D8CFBC]/20 rounded-xl p-3 text-xs text-[#FFFBF4] placeholder-[#8B8878] focus:outline-none focus:border-[#D8CFBC]"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsStatusModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-[#1C1D17] hover:bg-[#252720] text-[#D8CFBC] hover:text-[#FFFBF4] text-xs font-medium transition border border-[#D8CFBC]/15"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isStatusSubmitting}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-[#11120D] text-xs font-bold transition flex items-center gap-1.5 shadow-md"
                >
                  {isStatusSubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                  Simpan Status
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Tugaskan Teknisi */}
      {isAssignModalOpen && assignTarget && (
        <div className="fixed inset-0 z-50 bg-[#11120D]/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#181913]/95 border border-[#D8CFBC]/25 rounded-3xl w-full max-w-md p-6 shadow-2xl backdrop-blur-2xl">
            <h3 className="text-lg font-bold text-[#FFFBF4] flex items-center gap-2 mb-2">
              <UserCheck className="w-5 h-5 text-[#D8CFBC]" />
              Tugaskan Teknisi Mitra
            </h3>
            <p className="text-xs text-[#D8CFBC] mb-4 font-mono">{assignTarget.order_code}</p>

            <form onSubmit={handleAssignTechnician} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-[#D8CFBC] block mb-1.5">Pilih Teknisi</label>
                <select
                  value={selectedTechId}
                  onChange={(e) => setSelectedTechId(e.target.value)}
                  className="w-full bg-[#11120D] border border-[#D8CFBC]/20 rounded-xl px-3.5 py-2.5 text-sm text-[#FFFBF4] focus:outline-none focus:border-[#D8CFBC]"
                >
                  <option value="">-- Pilih Teknisi Tersedia --</option>
                  {technicians.map((t) => (
                    <option key={t.user_id} value={t.user_id}>
                      {t.full_name} ({t.phone_number}) {t.is_available ? '• Siap Kerja' : '• Sibuk'} - Rating: {t.rating_average || 5.0}★
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-[#D8CFBC] block mb-1.5">Instruksi Khusus untuk Teknisi</label>
                <textarea
                  value={assignNote}
                  onChange={(e) => setAssignNote(e.target.value)}
                  rows={3}
                  placeholder="Contoh: Hubungi pelanggan 30 menit sebelum menuju lokasi..."
                  className="w-full bg-[#11120D] border border-[#D8CFBC]/20 rounded-xl p-3 text-xs text-[#FFFBF4] placeholder-[#8B8878] focus:outline-none focus:border-[#D8CFBC]"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAssignModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-[#1C1D17] hover:bg-[#252720] text-[#D8CFBC] hover:text-[#FFFBF4] text-xs font-medium transition border border-[#D8CFBC]/15"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isAssignSubmitting || !selectedTechId}
                  className="px-4 py-2 rounded-xl bg-[#FFFBF4] hover:bg-[#D8CFBC] text-[#11120D] text-xs font-bold transition flex items-center gap-1.5 shadow-md disabled:opacity-50"
                >
                  {isAssignSubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                  Tugaskan Sekarang
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
