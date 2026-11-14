'use client';

import { useState, useEffect, useCallback } from 'react';
import WhatsAppSendModal from '@/components/admin/WhatsAppSendModal';
import WhatsAppHistorySection from '@/components/admin/WhatsAppHistorySection';
import {
  Bell,
  Send,
  CheckCircle2,
  AlertCircle,
  Search,
  Filter,
  Check,
  Trash2,
  ExternalLink,
  Shield,
  Wrench,
  CreditCard,
  AlertTriangle,
  FileCheck,
  MessageSquare,
  Users,
  User,
  Loader2,
  RefreshCw,
  Mail,
  ChevronLeft,
  ChevronRight,
  Eye,
} from 'lucide-react';

interface NotificationItem {
  id: number;
  user_id: number;
  title: string;
  message: string;
  type: string;
  target_url: string | null;
  entity_type: string | null;
  entity_id: number | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
  recipient_email: string;
  recipient_role: string;
  recipient_name: string;
}

interface NotificationStats {
  totalAll: number;
  totalUnread: number;
  totalSystem: number;
  totalOrder: number;
  totalPayment: number;
  totalComplaint: number;
}

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const TYPE_CONFIG: Record<string, { label: string; icon: any; badgeClass: string }> = {
  system: {
    label: 'Sistem',
    icon: Shield,
    badgeClass: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
  },
  order_status: {
    label: 'Status Pesanan',
    icon: Wrench,
    badgeClass: 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20',
  },
  payment: {
    label: 'Pembayaran',
    icon: CreditCard,
    badgeClass: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
  },
  technician_assignment: {
    label: 'Penugasan',
    icon: User,
    badgeClass: 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20',
  },
  complaint: {
    label: 'Pengaduan',
    icon: AlertTriangle,
    badgeClass: 'bg-rose-500/10 text-rose-400 border border-rose-500/20',
  },
  document_verification: {
    label: 'Verifikasi Berkas',
    icon: FileCheck,
    badgeClass: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  },
  chat: {
    label: 'Pesan Chat',
    icon: MessageSquare,
    badgeClass: 'bg-purple-500/10 text-purple-400 border border-purple-500/20',
  },
};

export default function NotificationsAdminPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [stats, setStats] = useState<NotificationStats>({
    totalAll: 0,
    totalUnread: 0,
    totalSystem: 0,
    totalOrder: 0,
    totalPayment: 0,
    totalComplaint: 0,
  });
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 15,
    total: 0,
    totalPages: 1,
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Filter States
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Selection for bulk delete
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Modals
  const [isBroadcastModalOpen, setIsBroadcastModalOpen] = useState<boolean>(false);
  const [detailItem, setDetailItem] = useState<NotificationItem | null>(null);
  const [isSendingBroadcast, setIsSendingBroadcast] = useState<boolean>(false);

  // WhatsApp manual: modal kirim + kunci refresh riwayat
  const [isWaModalOpen, setIsWaModalOpen] = useState<boolean>(false);
  const [waHistoryRefreshKey, setWaHistoryRefreshKey] = useState<number>(0);

  // Broadcast Form State
  const [broadcastForm, setBroadcastForm] = useState({
    targetAudience: 'all',
    userId: '',
    title: '',
    message: '',
    type: 'system',
    targetUrl: '',
  });

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchNotifications = useCallback(async () => {
    try {
      setIsLoading(true);
      const url = new URL('/api/admin/notifications', window.location.origin);
      url.searchParams.set('page', String(pagination.page));
      url.searchParams.set('limit', String(pagination.limit));
      if (typeFilter !== 'all') url.searchParams.set('type', typeFilter);
      if (statusFilter !== 'all') url.searchParams.set('status', statusFilter);
      if (roleFilter !== 'all') url.searchParams.set('role', roleFilter);
      if (searchQuery.trim()) url.searchParams.set('search', searchQuery.trim());

      const res = await fetch(url.toString());
      const data = await res.json();

      if (data.success && data.data) {
        setNotifications(data.data.notifications);
        setPagination(data.data.pagination);
        setStats(data.data.stats);
      } else {
        showToast('error', data.message || 'Gagal memuat notifikasi.');
      }
    } catch (err: any) {
      showToast('error', 'Terjadi kesalahan jaringan: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  }, [pagination.page, pagination.limit, typeFilter, statusFilter, roleFilter, searchQuery]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Toggle Read Status
  const handleToggleRead = async (id: number, currentStatus: boolean) => {
    try {
      const res = await fetch(`/api/admin/notifications/${id}/read`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_read: !currentStatus }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, is_read: !currentStatus } : n))
        );
        setStats((prev) => ({
          ...prev,
          totalUnread: currentStatus ? prev.totalUnread + 1 : Math.max(0, prev.totalUnread - 1),
        }));
      } else {
        showToast('error', data.message);
      }
    } catch (err: any) {
      showToast('error', 'Gagal mengubah status: ' + err.message);
    }
  };

  // Tandai Semua Dibaca
  const handleMarkAllRead = async () => {
    try {
      const res = await fetch('/api/admin/notifications/read-all', { method: 'PATCH' });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('success', data.message);
        await fetchNotifications();
      } else {
        showToast('error', data.message);
      }
    } catch (err: any) {
      showToast('error', 'Gagal memproses permintaan: ' + err.message);
    }
  };

  // Hapus Satu Notifikasi
  const handleDeleteNotification = async (id: number) => {
    try {
      const res = await fetch(`/api/admin/notifications/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('success', data.message);
        setNotifications((prev) => prev.filter((n) => n.id !== id));
        setSelectedIds((prev) => prev.filter((item) => item !== id));
        if (detailItem?.id === id) setDetailItem(null);
      } else {
        showToast('error', data.message);
      }
    } catch (err: any) {
      showToast('error', 'Gagal menghapus notifikasi: ' + err.message);
    }
  };

  // Hapus Notifikasi Terpilih (Bulk)
  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Hapus ${selectedIds.length} notifikasi yang dipilih secara permanen?`)) return;

    try {
      const res = await fetch('/api/admin/notifications', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('success', data.message);
        setSelectedIds([]);
        await fetchNotifications();
      } else {
        showToast('error', data.message);
      }
    } catch (err: any) {
      showToast('error', 'Gagal menghapus: ' + err.message);
    }
  };

  // Kirim Notifikasi Siaran (Broadcast)
  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastForm.title.trim() || !broadcastForm.message.trim()) {
      showToast('error', 'Judul dan isi pesan notifikasi wajib diisi.');
      return;
    }

    try {
      setIsSendingBroadcast(true);
      const res = await fetch('/api/admin/notifications/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(broadcastForm),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToast('success', data.message);
        setIsBroadcastModalOpen(false);
        setBroadcastForm({
          targetAudience: 'all',
          userId: '',
          title: '',
          message: '',
          type: 'system',
          targetUrl: '',
        });
        await fetchNotifications();
      } else {
        showToast('error', data.message || 'Gagal mengirim notifikasi.');
      }
    } catch (err: any) {
      showToast('error', 'Terjadi kesalahan: ' + err.message);
    } finally {
      setIsSendingBroadcast(false);
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(notifications.map((n) => n.id));
    } else {
      setSelectedIds([]);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium transition-all transform animate-in slide-in-from-bottom-5 ${
            toast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header Halaman & Tombol Aksi */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#D8CFBC]/15 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-2xl bg-[#D8CFBC]/10 border border-[#D8CFBC]/20 text-[#D8CFBC] shadow-inner">
              <Bell className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-[#FFFBF4] tracking-tight">
                Manajemen Notifikasi & Pengumuman
              </h2>
              <p className="text-xs sm:text-sm text-[#D8CFBC]/70 mt-0.5">
                Pantau arus notifikasi in-app semua pengguna dan kirim pengumuman operasional massal.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {stats.totalUnread > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="px-3.5 py-2 rounded-xl border border-[#D8CFBC]/20 bg-[#141510] text-[#D8CFBC] hover:text-[#FFFBF4] hover:bg-[#1C1D17] text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              Tandai Semua Dibaca
            </button>
          )}

          {selectedIds.length > 0 && (
            <button
              onClick={handleBulkDelete}
              className="px-3.5 py-2 rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              Hapus ({selectedIds.length})
            </button>
          )}

          <button
            onClick={() => setIsBroadcastModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-[#FFFBF4] hover:bg-[#D8CFBC] text-[#11120D] text-xs font-bold shadow-md flex items-center gap-2 transition hover:scale-105 active:scale-95"
          >
            <Send className="w-3.5 h-3.5" />
            Kirim Pengumuman
          </button>

          <button
            onClick={() => setIsWaModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#11120D] text-xs font-bold shadow-md flex items-center gap-2 transition hover:scale-105 active:scale-95"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Kirim WhatsApp
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-[#181913]/90 rounded-2xl border border-[#D8CFBC]/15 p-4 shadow-sm backdrop-blur-xl hover:border-[#D8CFBC]/30 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#D8CFBC]/70">Total Notifikasi</span>
            <div className="w-7 h-7 rounded-lg bg-[#D8CFBC]/10 border border-[#D8CFBC]/20 text-[#D8CFBC] flex items-center justify-center">
              <Bell className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-[#FFFBF4] mt-2">{stats.totalAll}</p>
          <span className="text-[11px] text-[#8B8878]">Tersimpan dalam database</span>
        </div>

        <div className="bg-[#181913]/90 rounded-2xl border border-[#D8CFBC]/15 p-4 shadow-sm backdrop-blur-xl hover:border-[#D8CFBC]/30 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#D8CFBC]/70">Belum Dibaca</span>
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
              <Mail className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-amber-400 mt-2">{stats.totalUnread}</p>
          <span className="text-[11px] text-amber-400/80 font-medium">Menunggu dibaca penerima</span>
        </div>

        <div className="bg-[#181913]/90 rounded-2xl border border-[#D8CFBC]/15 p-4 shadow-sm backdrop-blur-xl hover:border-[#D8CFBC]/30 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#D8CFBC]/70">Notifikasi Sistem</span>
            <div className="w-7 h-7 rounded-lg bg-[#D8CFBC]/10 border border-[#D8CFBC]/20 text-[#D8CFBC] flex items-center justify-center">
              <Shield className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-[#FFFBF4] mt-2">{stats.totalSystem}</p>
          <span className="text-[11px] text-[#8B8878]">Pengumuman & broadcast</span>
        </div>

        <div className="bg-[#181913]/90 rounded-2xl border border-[#D8CFBC]/15 p-4 shadow-sm backdrop-blur-xl hover:border-[#D8CFBC]/30 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#D8CFBC]/70">Aktivitas Pesanan</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Wrench className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-white mt-2">
            {stats.totalOrder + stats.totalPayment}
          </p>
          <span className="text-[11px] text-[#8B8878]">Order & invoice transaksi</span>
        </div>
      </div>

      {/* Riwayat WhatsApp (manual & otomatis) */}
      <WhatsAppHistorySection refreshKey={waHistoryRefreshKey} />

      {/* Filter & Search Bar */}
      <div className="bg-[#181913]/90 p-4 rounded-2xl border border-[#D8CFBC]/15 shadow-sm backdrop-blur-xl space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {/* Search Box */}
          <div className="relative sm:col-span-1">
            <Search className="w-4 h-4 text-[#8B8878] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari judul, pesan, penerima..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#11120D] border border-[#D8CFBC]/20 rounded-xl text-[#FFFBF4] placeholder-[#8B8878] outline-none focus:border-[#D8CFBC] transition"
            />
          </div>

          {/* Type Filter */}
          <div>
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setPagination((prev) => ({ ...prev, page: 1 }));
              }}
              className="w-full text-xs bg-[#11120D] border border-[#D8CFBC]/20 rounded-xl px-3 py-1.5 text-[#FFFBF4] outline-none focus:border-[#D8CFBC] font-medium transition"
            >
              <option value="all" className="bg-[#11120D]">Semua Jenis Notifikasi</option>
              <option value="system" className="bg-[#11120D]">Sistem & Pengumuman</option>
              <option value="order_status" className="bg-[#11120D]">Status Pesanan Servis</option>
              <option value="payment" className="bg-[#11120D]">Tagihan & Pembayaran</option>
              <option value="technician_assignment" className="bg-[#11120D]">Penugasan Teknisi</option>
              <option value="complaint" className="bg-[#11120D]">Layanan Pengaduan</option>
              <option value="document_verification" className="bg-[#11120D]">Verifikasi Dokumen</option>
              <option value="chat" className="bg-[#11120D]">Pesan Chat</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPagination((prev) => ({ ...prev, page: 1 }));
              }}
              className="w-full text-xs bg-[#11120D] border border-[#D8CFBC]/20 rounded-xl px-3 py-1.5 text-[#FFFBF4] outline-none focus:border-[#D8CFBC] font-medium transition"
            >
              <option value="all" className="bg-[#11120D]">Semua Status Baca</option>
              <option value="unread" className="bg-[#11120D]">Hanya Belum Dibaca</option>
              <option value="read" className="bg-[#11120D]">Hanya Sudah Dibaca</option>
            </select>
          </div>

          {/* Role Filter */}
          <div>
            <select
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setPagination((prev) => ({ ...prev, page: 1 }));
              }}
              className="w-full text-xs bg-[#11120D] border border-[#D8CFBC]/20 rounded-xl px-3 py-1.5 text-[#FFFBF4] outline-none focus:border-[#D8CFBC] font-medium transition"
            >
              <option value="all" className="bg-[#11120D]">Semua Peran Penerima</option>
              <option value="customer" className="bg-[#11120D]">Pelanggan (Customer)</option>
              <option value="technician" className="bg-[#11120D]">Mitra Teknisi</option>
              <option value="admin" className="bg-[#11120D]">Administrator</option>
            </select>
          </div>
        </div>
      </div>

      {/* Notifications Table List */}
      <div className="bg-[#181913]/90 rounded-2xl border border-[#D8CFBC]/15 shadow-sm backdrop-blur-xl overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-[#D8CFBC] animate-spin" />
            <p className="text-xs text-[#D8CFBC]/70 mt-2 font-medium">Memuat daftar notifikasi...</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-16">
            <Bell className="w-10 h-10 text-[#8B8878] mx-auto mb-2" />
            <h3 className="text-sm font-semibold text-[#FFFBF4]">Tidak ada notifikasi</h3>
            <p className="text-xs text-[#D8CFBC]/70 mt-1">
              Tidak ada notifikasi yang cocok dengan filter atau kata kunci yang dipilih.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#D8CFBC]/15 bg-[#141510] text-[11px] font-bold text-[#D8CFBC] uppercase tracking-wider">
                  <th className="py-3 px-4 w-10">
                    <input
                      type="checkbox"
                      checked={
                        notifications.length > 0 && selectedIds.length === notifications.length
                      }
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="rounded border-[#D8CFBC]/30 bg-[#11120D] text-[#D8CFBC] accent-[#D8CFBC]"
                    />
                  </th>
                  <th className="py-3 px-4">Tipe & Status</th>
                  <th className="py-3 px-4">Penerima</th>
                  <th className="py-3 px-4">Judul & Pesan</th>
                  <th className="py-3 px-4">Waktu</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D8CFBC]/10 text-xs">
                {notifications.map((n) => {
                  const typeInfo = TYPE_CONFIG[n.type] || {
                    label: n.type,
                    icon: Bell,
                    badgeClass: 'bg-[#11120D] text-[#D8CFBC] border border-[#D8CFBC]/20',
                  };
                  const TypeIcon = typeInfo.icon;
                  const isSelected = selectedIds.includes(n.id);

                  return (
                    <tr
                      key={n.id}
                      className={`hover:bg-[#1F2019]/60 transition-colors ${
                        !n.is_read ? 'bg-[#D8CFBC]/[0.03] font-medium' : ''
                      }`}
                    >
                      <td className="py-3.5 px-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedIds((prev) => [...prev, n.id]);
                            } else {
                              setSelectedIds((prev) => prev.filter((id) => id !== n.id));
                            }
                          }}
                          className="rounded border-[#D8CFBC]/30 bg-[#11120D] text-[#D8CFBC] accent-[#D8CFBC]"
                        />
                      </td>

                      {/* Tipe & Status */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${typeInfo.badgeClass}`}
                          >
                            <TypeIcon className="w-3 h-3" />
                            {typeInfo.label}
                          </span>
                          {!n.is_read ? (
                            <span
                              title="Belum dibaca"
                              className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"
                            />
                          ) : (
                            <span
                              title="Sudah dibaca"
                              className="text-[10px] text-[#8B8878] flex items-center gap-0.5"
                            >
                              <Check className="w-3 h-3 text-emerald-400" />
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Penerima */}
                      <td className="py-3.5 px-4">
                        <div className="max-w-[160px]">
                          <span className="font-semibold text-[#FFFBF4] block truncate">
                            {n.recipient_name}
                          </span>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span
                              className={`text-[9px] font-bold uppercase px-1.5 py-0.2 rounded ${
                                n.recipient_role === 'admin'
                                  ? 'bg-purple-500/15 text-purple-300 border border-purple-500/20'
                                  : n.recipient_role === 'technician'
                                  ? 'bg-[#D8CFBC]/15 text-[#FFFBF4] border border-[#D8CFBC]/30'
                                  : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20'
                              }`}
                            >
                              {n.recipient_role === 'customer'
                                ? 'Pelanggan'
                                : n.recipient_role === 'technician'
                                ? 'Teknisi'
                                : 'Admin'}
                            </span>
                            <span className="text-[10px] text-[#D8CFBC]/70 truncate">
                              {n.recipient_email}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Judul & Pesan */}
                      <td className="py-3.5 px-4 max-w-sm">
                        <p className="text-[#FFFBF4] font-semibold truncate">{n.title}</p>
                        <p className="text-[#D8CFBC]/70 text-[11px] truncate mt-0.5">{n.message}</p>
                        {n.target_url && (
                          <span className="text-[10px] text-[#D8CFBC] hover:text-[#FFFBF4] hover:underline flex items-center gap-1 mt-1 font-mono">
                            <ExternalLink className="w-2.5 h-2.5" />
                            {n.target_url}
                          </span>
                        )}
                      </td>

                      {/* Waktu */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-[11px] text-[#8B8878]">
                        {new Date(n.created_at).toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>

                      {/* Aksi */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setDetailItem(n)}
                            title="Lihat Detail Pesan"
                            className="p-1.5 rounded-lg text-[#D8CFBC]/70 hover:text-[#FFFBF4] hover:bg-[#1C1D17] transition"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleToggleRead(n.id, n.is_read)}
                            title={n.is_read ? 'Tandai belum dibaca' : 'Tandai sudah dibaca'}
                            className="p-1.5 rounded-lg text-[#D8CFBC]/70 hover:text-emerald-400 hover:bg-[#1C1D17] transition"
                          >
                            <Check className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleDeleteNotification(n.id)}
                            title="Hapus Notifikasi"
                            className="p-1.5 rounded-lg text-rose-400/80 hover:text-rose-300 hover:bg-rose-500/10 transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 bg-[#141510]/60 border-t border-[#D8CFBC]/15 text-xs text-[#D8CFBC]/70">
            <span>
              Halaman <strong className="text-[#FFFBF4]">{pagination.page}</strong> dari{' '}
              <strong className="text-[#FFFBF4]">{pagination.totalPages}</strong> (Total {pagination.total}{' '}
              notifikasi)
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPagination((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                disabled={pagination.page <= 1}
                className="p-1.5 rounded-lg border border-[#D8CFBC]/20 bg-[#11120D] text-[#D8CFBC] hover:text-[#FFFBF4] hover:bg-[#1C1D17] disabled:opacity-40 transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() =>
                  setPagination((prev) => ({ ...prev, page: Math.min(prev.totalPages, prev.page + 1) }))
                }
                disabled={pagination.page >= pagination.totalPages}
                className="p-1.5 rounded-lg border border-[#D8CFBC]/20 bg-[#11120D] text-[#D8CFBC] hover:text-[#FFFBF4] hover:bg-[#1C1D17] disabled:opacity-40 transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal Broadcast / Kirim Pengumuman */}
      {isBroadcastModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#11120D]/80 backdrop-blur-md animate-in fade-in">
          <div className="bg-[#141510]/95 rounded-3xl border border-[#D8CFBC]/25 shadow-2xl max-w-lg w-full p-6 space-y-4 backdrop-blur-2xl text-[#FFFBF4]">
            <div className="flex items-center justify-between border-b border-[#D8CFBC]/15 pb-3">
              <h3 className="text-base font-bold text-[#FFFBF4] flex items-center gap-2">
                <Send className="w-4 h-4 text-[#D8CFBC]" />
                Kirim Pengumuman / Notifikasi Siaran
              </h3>
              <button
                onClick={() => setIsBroadcastModalOpen(false)}
                className="p-1.5 rounded-xl text-[#8B8878] hover:text-[#FFFBF4] hover:bg-[#D8CFBC]/10 transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSendBroadcast} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-[#D8CFBC] block mb-1">
                    Target Audiens Penerima *
                  </label>
                  <select
                    value={broadcastForm.targetAudience}
                    onChange={(e) =>
                      setBroadcastForm({ ...broadcastForm, targetAudience: e.target.value })
                    }
                    className="w-full text-xs bg-[#11120D] border border-[#D8CFBC]/20 rounded-xl px-3 py-2 text-[#FFFBF4] outline-none focus:border-[#D8CFBC] font-medium"
                  >
                    <option value="all" className="bg-[#11120D] text-[#FFFBF4]">Semua Pengguna Aktif</option>
                    <option value="customers" className="bg-[#11120D] text-[#FFFBF4]">Semua Pelanggan Saja</option>
                    <option value="technicians" className="bg-[#11120D] text-[#FFFBF4]">Semua Teknisi Saja</option>
                    <option value="admins" className="bg-[#11120D] text-[#FFFBF4]">Semua Administrator</option>
                    <option value="specific_user" className="bg-[#11120D] text-[#FFFBF4]">Pengguna Tertentu (User ID)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-[#D8CFBC] block mb-1">
                    Jenis Notifikasi *
                  </label>
                  <select
                    value={broadcastForm.type}
                    onChange={(e) => setBroadcastForm({ ...broadcastForm, type: e.target.value })}
                    className="w-full text-xs bg-[#11120D] border border-[#D8CFBC]/20 rounded-xl px-3 py-2 text-[#FFFBF4] outline-none focus:border-[#D8CFBC] font-medium"
                  >
                    <option value="system" className="bg-[#11120D] text-[#FFFBF4]">Sistem (Pengumuman / Info)</option>
                    <option value="order_status" className="bg-[#11120D] text-[#FFFBF4]">Status Pesanan</option>
                    <option value="payment" className="bg-[#11120D] text-[#FFFBF4]">Pembayaran / Promo</option>
                    <option value="complaint" className="bg-[#11120D] text-[#FFFBF4]">Pengaduan Layanan</option>
                  </select>
                </div>
              </div>

              {broadcastForm.targetAudience === 'specific_user' && (
                <div>
                  <label className="text-xs font-semibold text-[#D8CFBC] block mb-1">
                    User ID Penerima *
                  </label>
                  <input
                    type="number"
                    required
                    value={broadcastForm.userId}
                    onChange={(e) => setBroadcastForm({ ...broadcastForm, userId: e.target.value })}
                    placeholder="Masukkan ID pengguna (contoh: 24)"
                    className="w-full text-xs bg-[#11120D] border border-[#D8CFBC]/20 rounded-xl px-3 py-2 text-[#FFFBF4] placeholder-[#8B8878] outline-none focus:border-[#D8CFBC]"
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-[#D8CFBC] block mb-1">
                  Judul Notifikasi *
                </label>
                <input
                  type="text"
                  required
                  maxLength={150}
                  value={broadcastForm.title}
                  onChange={(e) => setBroadcastForm({ ...broadcastForm, title: e.target.value })}
                  placeholder="Contoh: Pembaruan Sistem Operasional BANTUIN"
                  className="w-full text-xs bg-[#11120D] border border-[#D8CFBC]/20 rounded-xl px-3 py-2 text-[#FFFBF4] placeholder-[#8B8878] outline-none focus:border-[#D8CFBC] font-medium"
                />
                <span className="text-[10px] text-[#8B8878] block text-right mt-0.5">
                  {broadcastForm.title.length}/150 karakter
                </span>
              </div>

              <div>
                <label className="text-xs font-semibold text-[#D8CFBC] block mb-1">
                  Isi Pesanan Notifikasi *
                </label>
                <textarea
                  rows={3}
                  required
                  value={broadcastForm.message}
                  onChange={(e) => setBroadcastForm({ ...broadcastForm, message: e.target.value })}
                  placeholder="Tuliskan isi pengumuman atau instruksi yang jelas bagi pengguna..."
                  className="w-full text-xs bg-[#11120D] border border-[#D8CFBC]/20 rounded-xl px-3 py-2 text-[#FFFBF4] placeholder-[#8B8878] outline-none focus:border-[#D8CFBC] resize-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[#D8CFBC] block mb-1">
                  Tautan Aksi (Target URL - Opsional)
                </label>
                <input
                  type="text"
                  value={broadcastForm.targetUrl}
                  onChange={(e) => setBroadcastForm({ ...broadcastForm, targetUrl: e.target.value })}
                  placeholder="Contoh: /customer/repairs atau /promos"
                  className="w-full text-xs font-mono bg-[#11120D] border border-[#D8CFBC]/20 rounded-xl px-3 py-2 text-[#FFFBF4] placeholder-[#8B8878] outline-none focus:border-[#D8CFBC]"
                />
              </div>

              {/* Preview Box */}
              <div className="bg-[#181913]/90 border border-[#D8CFBC]/15 rounded-xl p-3">
                <span className="text-[10px] font-bold text-[#D8CFBC] uppercase tracking-wider block mb-1.5">
                  Pratinjau Tampilan Notifikasi di Akun Pengguna:
                </span>
                <div className="bg-[#11120D] rounded-lg border border-[#D8CFBC]/20 p-2.5 shadow-xs">
                  <span className="text-xs font-bold text-[#FFFBF4] block">
                    {broadcastForm.title || 'Judul Notifikasi'}
                  </span>
                  <p className="text-[11px] text-[#D8CFBC]/70 mt-0.5">
                    {broadcastForm.message || 'Isi pesan pemberitahuan akan tampil di sini.'}
                  </p>
                  {broadcastForm.targetUrl && (
                    <span className="text-[10px] text-[#D8CFBC] font-mono block mt-1">
                      ➔ {broadcastForm.targetUrl}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#D8CFBC]/15">
                <button
                  type="button"
                  onClick={() => setIsBroadcastModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-xl border border-[#D8CFBC]/20 text-[#D8CFBC] text-xs font-semibold hover:text-[#FFFBF4] hover:bg-[#1C1D17] transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSendingBroadcast}
                  className="px-4 py-2 rounded-xl bg-[#FFFBF4] hover:bg-[#D8CFBC] text-[#11120D] text-xs font-bold shadow-md flex items-center gap-1.5 transition hover:scale-105 active:scale-95 disabled:opacity-50"
                >
                  {isSendingBroadcast && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Kirim Sekarang</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Kirim WhatsApp Manual */}
      <WhatsAppSendModal
        isOpen={isWaModalOpen}
        onClose={() => setIsWaModalOpen(false)}
        onSent={() => setWaHistoryRefreshKey((k) => k + 1)}
        showToast={showToast}
      />

      {/* Modal Detail Notifikasi */}
      {detailItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#11120D]/80 backdrop-blur-md animate-in fade-in">
          <div className="bg-[#141510]/95 rounded-3xl border border-[#D8CFBC]/25 shadow-2xl max-w-md w-full p-6 space-y-4 backdrop-blur-2xl text-[#FFFBF4]">
            <div className="flex items-center justify-between border-b border-[#D8CFBC]/15 pb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-[#D8CFBC]">
                Rincian Notifikasi #{detailItem.id}
              </span>
              <button
                onClick={() => setDetailItem(null)}
                className="p-1.5 rounded-xl text-[#8B8878] hover:text-[#FFFBF4] hover:bg-[#D8CFBC]/10 transition"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <span className="text-[11px] font-semibold text-[#D8CFBC]/70 block">Penerima</span>
                <p className="text-xs font-bold text-[#FFFBF4]">
                  {detailItem.recipient_name} ({detailItem.recipient_role})
                </p>
                <span className="text-[11px] text-[#8B8878]">{detailItem.recipient_email}</span>
              </div>

              <div>
                <span className="text-[11px] font-semibold text-[#D8CFBC]/70 block">Judul</span>
                <p className="text-sm font-bold text-[#FFFBF4]">{detailItem.title}</p>
              </div>

              <div>
                <span className="text-[11px] font-semibold text-[#D8CFBC]/70 block">Pesan Lengkap</span>
                <p className="text-xs text-[#FFFBF4] bg-[#11120D] p-3 rounded-xl border border-[#D8CFBC]/20 whitespace-pre-wrap leading-relaxed mt-1">
                  {detailItem.message}
                </p>
              </div>

              {detailItem.target_url && (
                <div>
                  <span className="text-[11px] font-semibold text-[#D8CFBC]/70 block">Tautan Aksi Target</span>
                  <a
                    href={detailItem.target_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-[#D8CFBC] hover:text-[#FFFBF4] hover:underline font-mono flex items-center gap-1 mt-0.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    {detailItem.target_url}
                  </a>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 text-[11px] text-[#D8CFBC]/70 bg-[#181913]/90 p-2.5 rounded-xl border border-[#D8CFBC]/15">
                <div>
                  <span className="block text-[#8B8878] font-medium">Status</span>
                  <span className="font-semibold text-[#FFFBF4]">
                    {detailItem.is_read ? 'Sudah Dibaca' : 'Belum Dibaca'}
                  </span>
                </div>
                <div>
                  <span className="block text-[#8B8878] font-medium">Waktu Dibuat</span>
                  <span className="font-semibold text-[#FFFBF4]">
                    {new Date(detailItem.created_at).toLocaleString('id-ID')}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-[#D8CFBC]/15">
              <button
                onClick={() => handleDeleteNotification(detailItem.id)}
                className="text-xs text-rose-400 hover:text-rose-300 font-semibold flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Hapus
              </button>

              <button
                onClick={() => setDetailItem(null)}
                className="px-4 py-1.5 rounded-xl bg-[#11120D] border border-[#D8CFBC]/20 text-[#D8CFBC] hover:text-[#FFFBF4] text-xs font-semibold hover:bg-[#1C1D17] transition"
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
