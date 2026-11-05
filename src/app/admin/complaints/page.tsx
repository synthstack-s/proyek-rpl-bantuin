'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle,
  Search,
  Filter,
  RefreshCw,
  Eye,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Clock,
  ShieldAlert,
  User,
  Phone,
  Calendar,
  MessageSquare,
  Wrench,
  Check,
  ChevronLeft,
  ChevronRight,
  X,
  FileText,
} from 'lucide-react';

interface ComplaintItem {
  id: number;
  complaint_code: string;
  repair_request_id: number;
  complainant_user_id: number;
  category: string;
  description: string;
  evidence_photos: string[];
  status: string;
  resolution_summary: string | null;
  handled_by_admin_id: number | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  order_code: string;
  device_brand: string | null;
  device_model: string | null;
  repair_status: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  handler_admin_email: string | null;
}

interface ComplaintDetail extends ComplaintItem {
  address_text?: string;
  order_problem?: string;
  technician_name?: string | null;
  technician_phone?: string | null;
}

export default function ComplaintsAdminPage() {
  const [complaints, setComplaints] = useState<ComplaintItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filters & Pagination
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
    in_investigation: 0,
    resolved: 0,
    rejected: 0,
  });

  // Modals
  const [selectedComplaint, setSelectedComplaint] = useState<ComplaintDetail | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  const [resolveTarget, setResolveTarget] = useState<ComplaintItem | null>(null);
  const [isResolveOpen, setIsResolveOpen] = useState(false);
  const [newStatus, setNewStatus] = useState('in_investigation');
  const [resolutionSummary, setResolutionSummary] = useState('');
  const [isResolveSubmitting, setIsResolveSubmitting] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  // Fetch Complaints
  const fetchComplaints = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        status: statusFilter,
        category: categoryFilter,
      });
      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(`/api/admin/complaints?${params.toString()}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Gagal memuat daftar pengaduan');
      }

      setComplaints(json.data || []);
      setTotalPages(json.meta?.totalPages || 1);
      setTotalItems(json.meta?.total || 0);
      if (json.stats) setStats(json.stats);
    } catch (err: any) {
      setErrorMsg(err.message || 'Terjadi kesalahan sistem');
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, statusFilter, categoryFilter, search]);

  useEffect(() => {
    fetchComplaints();
  }, [fetchComplaints]);

  // Open Detail
  const openDetail = async (item: ComplaintItem) => {
    setIsDetailOpen(true);
    setIsDetailLoading(true);
    setSelectedComplaint(null);
    try {
      const res = await fetch(`/api/admin/complaints/${item.id}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Gagal mengambil detail');
      setSelectedComplaint(json.data);
    } catch (err: any) {
      showToast('error', err.message);
      setIsDetailOpen(false);
    } finally {
      setIsDetailLoading(false);
    }
  };

  // Handle Update / Resolve
  const handleUpdateComplaint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolveTarget) return;
    setIsResolveSubmitting(true);
    try {
      const res = await fetch(`/api/admin/complaints/${resolveTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          resolution_summary: resolutionSummary,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Gagal memperbarui pengaduan');
      showToast('success', json.message);
      setIsResolveOpen(false);
      fetchComplaints();
      if (isDetailOpen && selectedComplaint?.id === resolveTarget.id) {
        openDetail(resolveTarget);
      }
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setIsResolveSubmitting(false);
    }
  };

  // Category Label Helper
  const formatCategory = (cat: string) => {
    const map: Record<string, string> = {
      poor_workmanship: 'Pekerjaan Kurang Rapi / Cacat',
      tardiness: 'Keterlambatan Teknisi',
      overcharging: 'Kelebihan Biaya / Tarif Tidak Sesuai',
      technician_misbehavior: 'Sikap / Etika Teknisi',
      recurring_damage: 'Kerusakan Muncul Kembali',
      other: 'Lainnya',
    };
    return map[cat] || cat;
  };

  // Status Badge Helper
  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'submitted':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30">
            <Clock className="w-3 h-3" /> Baru Masuk
          </span>
        );
      case 'in_investigation':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
            <ShieldAlert className="w-3 h-3" /> Dalam Investigasi
          </span>
        );
      case 'waiting_customer':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/15 text-purple-300 border border-purple-500/30">
            <User className="w-3 h-3" /> Menunggu Respon Pelanggan
          </span>
        );
      case 'resolved':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" /> Terselesaikan
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#11120D] text-[#8B8878] border border-[#D8CFBC]/20">
            <XCircle className="w-3 h-3" /> Ditolak
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#11120D] text-[#D8CFBC] border border-[#D8CFBC]/20">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-20 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl text-sm font-medium transition-all animate-in slide-in-from-top-4 ${
            toast.type === 'success'
              ? 'bg-emerald-600 text-white shadow-emerald-500/25'
              : 'bg-rose-600 text-white shadow-rose-500/25'
          }`}
        >
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-white" /> : <AlertCircle className="w-4 h-4 text-white" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-[#D8CFBC]/15 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-2xl bg-[#D8CFBC]/10 border border-[#D8CFBC]/20 text-[#D8CFBC] shadow-inner">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#FFFBF4]">
                Pengaduan Layanan
              </h1>
              <p className="text-xs sm:text-sm text-[#D8CFBC]/70 mt-0.5">
                Pusat resolusi konflik, investigasi keluhan kualitas servis teknisi, dan tindak lanjut garansi pelanggan.
              </p>
            </div>
          </div>
        </div>
        <button
          onClick={fetchComplaints}
          disabled={isLoading}
          className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-[#141510] hover:bg-[#1C1D17] text-[#D8CFBC] hover:text-[#FFFBF4] text-xs sm:text-sm font-semibold transition border border-[#D8CFBC]/20 shadow-sm"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-[#D8CFBC]' : 'text-[#D8CFBC]'}`} />
          <span>Segarkan</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
        <div className="bg-[#181913]/90 border border-[#D8CFBC]/15 rounded-2xl p-4 shadow-sm backdrop-blur-xl hover:border-[#D8CFBC]/30 transition-all">
          <p className="text-xs font-semibold text-[#D8CFBC]/70 uppercase tracking-wider">Total Aduan</p>
          <p className="text-2xl font-bold text-[#FFFBF4] mt-1.5">{stats.total}</p>
        </div>
        <div className="bg-[#181913]/90 border border-[#D8CFBC]/15 rounded-2xl p-4 shadow-sm backdrop-blur-xl hover:border-[#D8CFBC]/30 transition-all">
          <p className="text-xs font-semibold text-rose-400 uppercase tracking-wider">Baru Masuk</p>
          <p className="text-2xl font-bold text-rose-400 mt-1.5">{stats.submitted}</p>
        </div>
        <div className="bg-[#181913]/90 border border-[#D8CFBC]/15 rounded-2xl p-4 shadow-sm backdrop-blur-xl hover:border-[#D8CFBC]/30 transition-all">
          <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Investigasi Aktif</p>
          <p className="text-2xl font-bold text-amber-400 mt-1.5">{stats.in_investigation}</p>
        </div>
        <div className="bg-[#181913]/90 border border-[#D8CFBC]/15 rounded-2xl p-4 shadow-sm backdrop-blur-xl hover:border-[#D8CFBC]/30 transition-all">
          <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Terselesaikan</p>
          <p className="text-2xl font-bold text-emerald-400 mt-1.5">{stats.resolved}</p>
        </div>
        <div className="bg-[#181913]/90 border border-[#D8CFBC]/15 rounded-2xl p-4 shadow-sm backdrop-blur-xl hover:border-[#D8CFBC]/30 transition-all">
          <p className="text-xs font-semibold text-[#8B8878] uppercase tracking-wider">Ditolak</p>
          <p className="text-2xl font-bold text-[#D8CFBC] mt-1.5">{stats.rejected}</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-[#181913]/90 border border-[#D8CFBC]/15 rounded-2xl p-4 shadow-sm backdrop-blur-xl flex flex-col md:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8B8878]" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Cari kode aduan, kode pesanan, nama pelapor, atau kronologi..."
            className="w-full bg-[#11120D] border border-[#D8CFBC]/20 rounded-xl pl-10 pr-4 py-2 text-xs sm:text-sm text-[#FFFBF4] placeholder-[#8B8878] focus:outline-none focus:border-[#D8CFBC] transition"
          />
        </div>
        <div className="flex flex-wrap gap-2.5">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="bg-[#11120D] border border-[#D8CFBC]/20 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-[#FFFBF4] focus:outline-none focus:border-[#D8CFBC] transition"
          >
            <option value="all" className="bg-[#11120D]">Semua Status Penanganan</option>
            <option value="submitted" className="bg-[#11120D]">Baru Masuk (submitted)</option>
            <option value="in_investigation" className="bg-[#11120D]">Dalam Investigasi</option>
            <option value="waiting_customer" className="bg-[#11120D]">Menunggu Respon Pelanggan</option>
            <option value="resolved" className="bg-[#11120D]">Terselesaikan (resolved)</option>
            <option value="rejected" className="bg-[#11120D]">Ditolak (rejected)</option>
          </select>

          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(1);
            }}
            className="bg-[#11120D] border border-[#D8CFBC]/20 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-[#FFFBF4] focus:outline-none focus:border-[#D8CFBC] transition"
          >
            <option value="all" className="bg-[#11120D]">Semua Kategori</option>
            <option value="poor_workmanship" className="bg-[#11120D]">Pekerjaan Kurang Rapi / Cacat</option>
            <option value="tardiness" className="bg-[#11120D]">Keterlambatan Teknisi</option>
            <option value="overcharging" className="bg-[#11120D]">Kelebihan Biaya</option>
            <option value="technician_misbehavior" className="bg-[#11120D]">Sikap / Etika Teknisi</option>
            <option value="recurring_damage" className="bg-[#11120D]">Kerusakan Muncul Kembali</option>
            <option value="other" className="bg-[#11120D]">Lainnya</option>
          </select>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-[#181913]/90 border border-[#D8CFBC]/15 rounded-2xl overflow-hidden shadow-sm backdrop-blur-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm text-[#FFFBF4]">
            <thead className="bg-[#141510] text-[11px] font-bold uppercase tracking-wider text-[#D8CFBC] border-b border-[#D8CFBC]/15">
              <tr>
                <th className="px-5 py-3.5">Kode Aduan</th>
                <th className="px-4 py-3.5">Pesanan Terkait</th>
                <th className="px-4 py-3.5">Pelapor</th>
                <th className="px-4 py-3.5">Kategori Masalah</th>
                <th className="px-4 py-3.5">Status Penanganan</th>
                <th className="px-4 py-3.5">Ditangani Oleh</th>
                <th className="px-4 py-3.5">Tanggal Masuk</th>
                <th className="px-5 py-3.5 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D8CFBC]/10">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-[#D8CFBC]/70">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#D8CFBC] mb-2" />
                    Memuat data pengaduan...
                  </td>
                </tr>
              ) : complaints.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-[#D8CFBC]/70">
                    <AlertTriangle className="w-10 h-10 mx-auto text-[#8B8878] mb-2" />
                    Tidak ada pengaduan layanan yang sesuai kriteria.
                  </td>
                </tr>
              ) : (
                complaints.map((item) => (
                  <tr key={item.id} className="hover:bg-[#1F2019]/60 transition">
                    <td className="px-5 py-4 font-mono font-semibold text-[#FFFBF4]">
                      <span className="text-rose-400 hover:underline cursor-pointer" onClick={() => openDetail(item)}>
                        {item.complaint_code}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-semibold text-[#FFFBF4]">{item.order_code}</div>
                      <div className="text-xs text-[#D8CFBC]/70">
                        {item.device_brand || 'Alat'} {item.device_model || ''}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-medium text-[#FFFBF4]">{item.customer_name}</div>
                      <div className="text-xs text-[#D8CFBC]/70">{item.customer_phone || item.customer_email || '-'}</div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-xs px-2.5 py-1 rounded-lg bg-[#11120D] text-[#D8CFBC] font-medium border border-[#D8CFBC]/20">
                        {formatCategory(item.category)}
                      </span>
                    </td>
                    <td className="px-4 py-4">{renderStatusBadge(item.status)}</td>
                    <td className="px-4 py-4 text-xs text-[#D8CFBC]/70">
                      {item.handler_admin_email ? (
                        <span className="text-[#FFFBF4] font-medium">{item.handler_admin_email}</span>
                      ) : (
                        <span className="text-[#8B8878] italic">Belum ditangani</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-xs text-[#D8CFBC]/70">
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
                          title="Lihat Kronologi Lengkap & Bukti"
                          className="p-1.5 rounded-lg bg-[#11120D] hover:bg-[#1C1D17] text-[#D8CFBC] hover:text-[#FFFBF4] transition border border-[#D8CFBC]/20"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setResolveTarget(item);
                            setNewStatus(item.status);
                            setResolutionSummary(item.resolution_summary || '');
                            setIsResolveOpen(true);
                          }}
                          title="Tindak Lanjut & Selesaikan Aduan"
                          className="p-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 transition border border-rose-500/30"
                        >
                          <MessageSquare className="w-4 h-4" />
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
            Menampilkan <span className="text-[#FFFBF4] font-semibold">{complaints.length}</span> dari{' '}
            <span className="text-[#FFFBF4] font-semibold">{totalItems}</span> pengaduan
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1.5 rounded-lg bg-[#11120D] hover:bg-[#1C1D17] text-[#D8CFBC] hover:text-[#FFFBF4] border border-[#D8CFBC]/20 disabled:opacity-40 transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-[#FFFBF4] font-medium">
              Halaman {page} dari {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1.5 rounded-lg bg-[#11120D] hover:bg-[#1C1D17] text-[#D8CFBC] hover:text-[#FFFBF4] border border-[#D8CFBC]/20 disabled:opacity-40 transition"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* MODAL 1: Detail Aduan & Bukti Foto */}
      {isDetailOpen && (
        <div className="fixed inset-0 z-50 bg-[#11120D]/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#141510]/95 border border-[#D8CFBC]/25 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl backdrop-blur-2xl text-[#FFFBF4]">
            <div className="sticky top-0 bg-[#181913]/90 backdrop-blur-xl border-b border-[#D8CFBC]/15 p-5 flex justify-between items-center z-10">
              <div>
                <h3 className="text-lg font-bold text-[#FFFBF4] flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-rose-400" />
                  Detail Pengaduan Layanan
                </h3>
                <p className="text-xs font-mono text-rose-400 mt-0.5">{selectedComplaint?.complaint_code}</p>
              </div>
              <button
                onClick={() => setIsDetailOpen(false)}
                className="p-1.5 rounded-xl text-[#8B8878] hover:text-[#FFFBF4] hover:bg-[#D8CFBC]/10 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {isDetailLoading ? (
                <div className="py-16 text-center text-[#D8CFBC]/70">
                  <RefreshCw className="w-8 h-8 animate-spin mx-auto text-[#D8CFBC] mb-2" />
                  Mengambil data aduan...
                </div>
              ) : selectedComplaint ? (
                <>
                  <div className="bg-[#181913]/80 border border-[#D8CFBC]/15 rounded-2xl p-4 flex flex-wrap justify-between items-center gap-3">
                    <div>
                      <span className="text-xs text-[#D8CFBC]/70 block mb-1">Status Penanganan:</span>
                      {renderStatusBadge(selectedComplaint.status)}
                    </div>
                    <div>
                      <span className="text-xs text-[#D8CFBC]/70 block mb-1">Kategori:</span>
                      <span className="text-xs font-semibold text-[#FFFBF4]">
                        {formatCategory(selectedComplaint.category)}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        setResolveTarget(selectedComplaint);
                        setNewStatus(selectedComplaint.status);
                        setResolutionSummary(selectedComplaint.resolution_summary || '');
                        setIsResolveOpen(true);
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-[#FFFBF4] hover:bg-[#D8CFBC] text-[#11120D] text-xs font-bold transition shadow-sm"
                    >
                      Tindak Lanjut / Resolusi
                    </button>
                  </div>

                  {/* Complainant & Technician Info */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div className="bg-[#181913]/80 p-4 rounded-2xl border border-[#D8CFBC]/15">
                      <h4 className="font-semibold text-[#D8CFBC] uppercase tracking-wider mb-2">Pelapor</h4>
                      <p className="font-bold text-[#FFFBF4] text-sm">{selectedComplaint.customer_name}</p>
                      <p className="text-[#D8CFBC]/70 mt-1">{selectedComplaint.customer_phone || '-'}</p>
                      <p className="text-[#8B8878]">{selectedComplaint.customer_email || '-'}</p>
                    </div>

                    <div className="bg-[#181913]/80 p-4 rounded-2xl border border-[#D8CFBC]/15">
                      <h4 className="font-semibold text-[#D8CFBC] uppercase tracking-wider mb-2">Teknisi Bertugas</h4>
                      <p className="font-bold text-[#FFFBF4] text-sm">
                        {selectedComplaint.technician_name || 'Tidak ada teknisi aktif'}
                      </p>
                      <p className="text-[#D8CFBC]/70 mt-1">{selectedComplaint.technician_phone || '-'}</p>
                      <p className="text-[#8B8878] font-mono mt-0.5">Order: {selectedComplaint.order_code}</p>
                    </div>
                  </div>

                  {/* Complaint Description */}
                  <div className="bg-[#181913]/80 p-4 rounded-2xl border border-[#D8CFBC]/15">
                    <h4 className="font-semibold text-[#D8CFBC] uppercase tracking-wider mb-2 text-xs">
                      Kronologi & Isi Pengaduan
                    </h4>
                    <p className="text-xs text-[#FFFBF4] leading-relaxed bg-[#11120D] p-3 rounded-xl border border-[#D8CFBC]/20">
                      {selectedComplaint.description}
                    </p>

                    {selectedComplaint.evidence_photos && selectedComplaint.evidence_photos.length > 0 && (
                      <div className="mt-4">
                        <span className="text-xs text-[#D8CFBC]/70 block mb-2 font-medium">Foto / Bukti Kerusakan:</span>
                        <div className="flex gap-2 overflow-x-auto pb-1">
                          {selectedComplaint.evidence_photos.map((url, i) => (
                            <a key={i} href={url} target="_blank" rel="noreferrer" className="block shrink-0">
                              <img
                                src={url}
                                alt={`Bukti ${i + 1}`}
                                className="w-24 h-24 object-cover rounded-xl border border-[#D8CFBC]/30 hover:opacity-80 transition"
                              />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Resolution Summary if any */}
                  {selectedComplaint.resolution_summary && (
                    <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-2xl p-4 text-xs">
                      <h4 className="font-semibold text-emerald-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Hasil Resolusi & Solusi
                      </h4>
                      <p className="text-[#FFFBF4] leading-relaxed">{selectedComplaint.resolution_summary}</p>
                      {selectedComplaint.resolved_at && (
                        <p className="text-[11px] text-emerald-400/80 mt-2">
                          Diselesaikan pada: {new Date(selectedComplaint.resolved_at).toLocaleString('id-ID')}
                        </p>
                      )}
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Tindak Lanjut & Resolusi */}
      {isResolveOpen && resolveTarget && (
        <div className="fixed inset-0 z-50 bg-[#11120D]/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#141510]/95 border border-[#D8CFBC]/25 rounded-3xl w-full max-w-md p-6 shadow-2xl backdrop-blur-2xl text-[#FFFBF4]">
            <h3 className="text-lg font-bold text-[#FFFBF4] flex items-center gap-2 mb-2">
              <MessageSquare className="w-5 h-5 text-rose-400" />
              Tindak Lanjut Pengaduan
            </h3>
            <p className="text-xs text-[#D8CFBC]/70 mb-4 font-mono">
              Kode: {resolveTarget.complaint_code} • Pesanan: {resolveTarget.order_code}
            </p>

            <form onSubmit={handleUpdateComplaint} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-[#D8CFBC] block mb-1.5">Status Penanganan</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="w-full bg-[#11120D] border border-[#D8CFBC]/20 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-[#FFFBF4] focus:outline-none focus:border-[#D8CFBC] transition"
                >
                  <option value="submitted" className="bg-[#11120D]">Baru Masuk (submitted)</option>
                  <option value="in_investigation" className="bg-[#11120D]">Dalam Investigasi Tim Admin</option>
                  <option value="waiting_customer" className="bg-[#11120D]">Menunggu Konfirmasi Pelanggan</option>
                  <option value="resolved" className="bg-[#11120D]">Selesai & Diberikan Solusi (resolved)</option>
                  <option value="rejected" className="bg-[#11120D]">Ditolak (Klaim tidak valid)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-[#D8CFBC] block mb-1.5">
                  Ringkasan Resolusi / Solusi untuk Pelanggan
                </label>
                <textarea
                  value={resolutionSummary}
                  onChange={(e) => setResolutionSummary(e.target.value)}
                  rows={4}
                  placeholder="Jelaskan langkah penyelesaian, garansi kunjungan ulang tanpa biaya, atau penjelasan penolakan..."
                  className="w-full bg-[#11120D] border border-[#D8CFBC]/20 rounded-xl p-3 text-xs text-[#FFFBF4] placeholder-[#8B8878] focus:outline-none focus:border-[#D8CFBC] transition resize-none"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsResolveOpen(false)}
                  className="px-4 py-2 rounded-xl bg-[#11120D] border border-[#D8CFBC]/20 hover:bg-[#1C1D17] text-[#D8CFBC] hover:text-[#FFFBF4] text-xs font-semibold transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isResolveSubmitting}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-md"
                >
                  {isResolveSubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                  <span>Simpan Tindak Lanjut</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
