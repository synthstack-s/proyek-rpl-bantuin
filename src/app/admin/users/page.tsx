'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Search,
  Eye,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Shield,
  ShieldCheck,
  ShieldAlert,
  UserCheck,
  Wrench,
  User,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Building,
  RefreshCw,
  AlertCircle,
  X,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Edit2,
  Check,
  Ban,
  Activity,
  ShoppingBag,
  CreditCard,
  Lock,
} from 'lucide-react';

interface CustomerProfileData {
  id: number;
  full_name: string;
  default_address: string | null;
  city: string | null;
  postal_code: string | null;
  latitude?: number | null;
  longitude?: number | null;
  created_at?: string;
  updated_at?: string;
  orders_count?: number;
  stats?: {
    total_orders: number;
    completed_orders: number;
    active_orders: number;
    total_spent: number;
  } | null;
}

interface TechnicianProfileData {
  id: number;
  full_name: string;
  bio?: string | null;
  years_of_experience?: number;
  rating_avg?: number;
  rating_count?: number;
  is_available?: boolean;
  verified_status?: string | null;
  rejection_reason?: string | null;
  verified_at?: string | null;
  assignments_count?: number;
  stats?: {
    total_assignments: number;
    completed_assignments: number;
    active_assignments: number;
  } | null;
}

interface UserItem {
  id: number;
  uuid: string;
  email: string;
  phone_number: string;
  role: 'admin' | 'customer' | 'technician';
  status: 'active' | 'inactive' | 'suspended' | 'pending_verification';
  is_verified: boolean;
  created_at: string;
  updated_at: string;
  name: string;
  avatar_url: string | null;
  customer_profile: CustomerProfileData | null;
  technician_profile: TechnicianProfileData | null;
}

interface UserDetailData extends UserItem {
  is_current_admin: boolean;
  is_bootstrap_admin: boolean;
}

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function UsersAdminPage() {
  // State Utama Pengguna
  const [users, setUsers] = useState<UserItem[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // State Filter & Pencarian
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // State Toast
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // State Modal Detail
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserDetailData | null>(null);
  const [activeTab, setActiveTab] = useState<'account' | 'profile' | 'activity' | 'actions'>('account');

  // State Form Edit Profil
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editFormData, setEditFormData] = useState({
    full_name: '',
    phone_number: '',
    default_address: '',
    city: '',
    postal_code: '',
  });

  // State Konfirmasi Perubahan Status
  const [statusConfirmModal, setStatusConfirmModal] = useState<{
    isOpen: boolean;
    userId: number;
    userName: string;
    targetStatus: 'active' | 'suspended' | 'inactive' | 'pending_verification';
  }>({
    isOpen: false,
    userId: 0,
    userName: '',
    targetStatus: 'active',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  // 1. Fetch Daftar Pengguna dari Database MySQL
  const fetchUsers = useCallback(async (page = 1) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '10',
      });
      if (searchTerm.trim()) params.append('search', searchTerm.trim());
      if (roleFilter !== 'all') params.append('role', roleFilter);
      if (statusFilter !== 'all') params.append('status', statusFilter);

      const res = await fetch(`/api/admin/users?${params.toString()}`);
      const result = await res.json();

      if (!res.ok || !result.success) {
        throw new Error(result.message || 'Gagal memuat data daftar pengguna');
      }

      setUsers(result.data || []);
      setPagination(result.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 });
    } catch (err: any) {
      setErrorMsg(err.message || 'Terjadi kesalahan saat memuat data pengguna');
    } finally {
      setIsLoading(false);
    }
  }, [searchTerm, roleFilter, statusFilter]);

  useEffect(() => {
    fetchUsers(1);
  }, [fetchUsers]);

  // 2. Fetch Detail Pengguna
  const openDetailModal = async (userId: number, initialTab: 'account' | 'profile' | 'activity' | 'actions' = 'account') => {
    setIsDetailOpen(true);
    setDetailLoading(true);
    setActiveTab(initialTab);
    setIsEditingProfile(false);
    try {
      const res = await fetch(`/api/admin/users/${userId}`);
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.message || 'Gagal mengambil detail pengguna');
      }
      const data: UserDetailData = result.data;
      setSelectedUser(data);
      setEditFormData({
        full_name: data.name || '',
        phone_number: data.phone_number || '',
        default_address: data.customer_profile?.default_address || '',
        city: data.customer_profile?.city || '',
        postal_code: data.customer_profile?.postal_code || '',
      });
    } catch (err: any) {
      showToast('error', err.message || 'Gagal memuat detail pengguna');
      setIsDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  // 3. Eksekusi Perubahan Status Pengguna (Aktif / Suspend / Nonaktif)
  const handleUpdateStatus = async (
    userId: number,
    status: 'active' | 'suspended' | 'inactive' | 'pending_verification'
  ) => {
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.message || 'Gagal memperbarui status akun pengguna');
      }

      showToast('success', result.message || 'Status pengguna berhasil diperbarui');
      setStatusConfirmModal({ isOpen: false, userId: 0, userName: '', targetStatus: 'active' });
      fetchUsers(pagination.page);
      if (selectedUser && selectedUser.id === userId) {
        openDetailModal(userId, activeTab);
      }
    } catch (err: any) {
      showToast('error', err.message || 'Gagal memproses pembaruan status');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 4. Simpan Perubahan Profil Pengguna
  const handleSaveProfile = async () => {
    if (!selectedUser) return;
    setIsSubmitting(true);
    try {
      const payload: any = {
        full_name: editFormData.full_name.trim(),
        phone_number: editFormData.phone_number.trim(),
      };
      if (selectedUser.role === 'customer') {
        payload.default_address = editFormData.default_address.trim() || null;
        payload.city = editFormData.city.trim() || null;
        payload.postal_code = editFormData.postal_code.trim() || null;
      }

      const res = await fetch(`/api/admin/users/${selectedUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.message || 'Gagal menyimpan profil pengguna');
      }

      showToast('success', result.message || 'Profil pengguna berhasil diperbarui');
      setIsEditingProfile(false);
      fetchUsers(pagination.page);
      openDetailModal(selectedUser.id, 'profile');
    } catch (err: any) {
      showToast('error', err.message || 'Gagal menyimpan perubahan');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Metrik Cepat untuk KPI
  const totalCount = pagination.total;
  const customersCount = users.filter((u) => u.role === 'customer').length;
  const techniciansCount = users.filter((u) => u.role === 'technician').length;
  const activeCount = users.filter((u) => u.status === 'active').length;

  // Format Nilai Rupiah
  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(val);
  };

  // Helper Render Badge Role
  const renderRoleBadge = (role: string) => {
    switch (role) {
      case 'admin':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/15 text-purple-300 border border-purple-500/30">
            <Shield className="w-3 h-3 text-purple-300" />
            Administrator
          </span>
        );
      case 'technician':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#D8CFBC]/15 text-[#FFFBF4] border border-[#D8CFBC]/30">
            <Wrench className="w-3 h-3 text-[#D8CFBC]" />
            Mitra Teknisi
          </span>
        );
      case 'customer':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            <UserCheck className="w-3 h-3 text-emerald-400" />
            Pelanggan
          </span>
        );
    }
  };

  // Helper Render Badge Status Akun
  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Aktif
          </span>
        );
      case 'suspended':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30">
            <Ban className="w-3 h-3 text-rose-400" />
            Ditangguhkan
          </span>
        );
      case 'pending_verification':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
            <Clock className="w-3 h-3 text-amber-400" />
            Pending Aktivasi
          </span>
        );
      case 'inactive':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#11120D] text-[#8B8878] border border-[#D8CFBC]/20">
            <span className="w-1.5 h-1.5 rounded-full bg-[#8B8878]" />
            Nonaktif
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-20 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl text-sm font-medium transition-all animate-in slide-in-from-top-4 ${
            toast.type === 'success'
              ? 'bg-emerald-600 text-white shadow-emerald-500/25'
              : 'bg-rose-600 text-white shadow-rose-500/25'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header Halaman */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#D8CFBC]/15 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-2xl bg-[#D8CFBC]/10 text-[#D8CFBC] border border-[#D8CFBC]/20 shadow-inner">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold text-[#FFFBF4] tracking-tight">
                  Manajemen Pengguna & Pelanggan
                </h1>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#D8CFBC]/15 text-[#D8CFBC] border border-[#D8CFBC]/30">
                  Modul Identitas
                </span>
              </div>
              <p className="text-xs sm:text-sm text-[#D8CFBC]/70 mt-0.5">
                Kelola akun pengguna multi-peran (Pelanggan, Teknisi, Admin), kontrol status keaktifan akun, riwayat pesanan, dan data profil.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => fetchUsers(pagination.page)}
          className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-[#141510] hover:bg-[#1C1D17] text-[#D8CFBC] hover:text-[#FFFBF4] border border-[#D8CFBC]/20 font-semibold text-xs sm:text-sm shadow-sm transition-all hover:scale-105 active:scale-95"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-[#D8CFBC]' : 'text-[#D8CFBC]'}`} />
          <span>Segarkan Data</span>
        </button>
      </div>

      {/* Kartu Metrik KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#181913]/90 p-4.5 rounded-2xl border border-[#D8CFBC]/15 shadow-sm backdrop-blur-xl hover:border-[#D8CFBC]/30 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#D8CFBC]/70">Total Pengguna</span>
            <div className="p-2 rounded-xl bg-[#D8CFBC]/10 border border-[#D8CFBC]/20 text-[#D8CFBC]">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-[#FFFBF4]">{totalCount}</span>
            <span className="text-xs text-[#8B8878]">terdaftar</span>
          </div>
        </div>

        <div className="bg-[#181913]/90 p-4.5 rounded-2xl border border-[#D8CFBC]/15 shadow-sm backdrop-blur-xl hover:border-[#D8CFBC]/30 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-400">Pelanggan Aktif</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-400">{customersCount}</span>
            <span className="text-xs text-emerald-400/70">customer di halaman ini</span>
          </div>
        </div>

        <div className="bg-[#181913]/90 p-4.5 rounded-2xl border border-[#D8CFBC]/15 shadow-sm backdrop-blur-xl hover:border-[#D8CFBC]/30 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#D8CFBC]">Mitra Teknisi</span>
            <div className="p-2 rounded-xl bg-[#D8CFBC]/10 border border-[#D8CFBC]/20 text-[#D8CFBC]">
              <Wrench className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-[#FFFBF4]">{techniciansCount}</span>
            <span className="text-xs text-[#D8CFBC]/70">mitra kerja</span>
          </div>
        </div>

        <div className="bg-[#181913]/90 p-4.5 rounded-2xl border border-[#D8CFBC]/15 shadow-sm backdrop-blur-xl hover:border-[#D8CFBC]/30 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#D8CFBC]/90">Status Akun Aktif</span>
            <div className="p-2 rounded-xl bg-[#D8CFBC]/10 border border-[#D8CFBC]/20 text-[#D8CFBC]">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-[#FFFBF4]">{activeCount}</span>
            <span className="text-xs text-[#8B8878]">siap bertransaksi</span>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-[#181913]/90 p-4 rounded-2xl border border-[#D8CFBC]/15 shadow-sm backdrop-blur-xl flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8B8878]" />
          <input
            type="text"
            placeholder="Cari berdasarkan nama, email, atau no. telepon..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-[#D8CFBC]/20 bg-[#11120D] text-[#FFFBF4] text-xs sm:text-sm focus:outline-none focus:border-[#D8CFBC] placeholder:text-[#8B8878] transition-all"
          />
        </div>

        {/* Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Filter Role */}
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-[#D8CFBC]/20 text-xs sm:text-sm text-[#FFFBF4] bg-[#11120D] focus:outline-none focus:border-[#D8CFBC] font-medium transition-all"
          >
            <option value="all" className="bg-[#11120D] text-[#FFFBF4]">Semua Peran (Role)</option>
            <option value="customer" className="bg-[#11120D] text-[#FFFBF4]">Pelanggan</option>
            <option value="technician" className="bg-[#11120D] text-[#FFFBF4]">Mitra Teknisi</option>
            <option value="admin" className="bg-[#11120D] text-[#FFFBF4]">Administrator</option>
          </select>

          {/* Filter Status Akun */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-[#D8CFBC]/20 text-xs sm:text-sm text-[#FFFBF4] bg-[#11120D] focus:outline-none focus:border-[#D8CFBC] font-medium transition-all"
          >
            <option value="all" className="bg-[#11120D] text-[#FFFBF4]">Semua Status Akun</option>
            <option value="active" className="bg-[#11120D] text-[#FFFBF4]">Aktif</option>
            <option value="pending_verification" className="bg-[#11120D] text-[#FFFBF4]">Pending Aktivasi</option>
            <option value="suspended" className="bg-[#11120D] text-[#FFFBF4]">Ditangguhkan</option>
            <option value="inactive" className="bg-[#11120D] text-[#FFFBF4]">Nonaktif</option>
          </select>
        </div>
      </div>

      {/* Tabel Utama Pengguna */}
      <div className="bg-[#181913]/90 rounded-2xl border border-[#D8CFBC]/15 shadow-sm backdrop-blur-xl overflow-hidden">
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center text-[#D8CFBC]/70 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-[#D8CFBC]" />
            <p className="text-xs sm:text-sm">Memuat data pengguna...</p>
          </div>
        ) : errorMsg ? (
          <div className="py-16 px-4 flex flex-col items-center justify-center text-center gap-3">
            <div className="p-3 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Gagal Memuat Data</p>
              <p className="text-xs text-rose-300 mt-1 max-w-md">{errorMsg}</p>
            </div>
            <button
              onClick={() => fetchUsers(1)}
              className="mt-2 px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 transition"
            >
              Coba Lagi
            </button>
          </div>
        ) : users.length === 0 ? (
          <div className="py-16 px-4 flex flex-col items-center justify-center text-center gap-3">
            <div className="p-3 rounded-full bg-[#141510] text-[#D8CFBC] border border-[#D8CFBC]/20">
              <Users className="w-8 h-8" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#FFFBF4]">Belum Ada Pengguna</p>
              <p className="text-xs text-[#D8CFBC]/70 mt-1 max-w-md">
                Tidak ada data pengguna yang cocok dengan kriteria filter saat ini.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-[#141510] text-[#D8CFBC] text-[11px] font-bold uppercase tracking-wider border-b border-[#D8CFBC]/15">
                <tr>
                  <th className="py-3.5 px-4 font-bold">Identitas Pengguna</th>
                  <th className="py-3.5 px-4 font-bold">Peran (Role)</th>
                  <th className="py-3.5 px-4 font-bold">Status Akun</th>
                  <th className="py-3.5 px-4 font-bold">Alamat / Wilayah</th>
                  <th className="py-3.5 px-4 font-bold">Aktivitas</th>
                  <th className="py-3.5 px-4 font-bold">Terdaftar</th>
                  <th className="py-3.5 px-4 font-bold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D8CFBC]/10">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-[#1F2019]/60 transition-colors">
                    {/* Kolom 1: Identitas */}
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-10 h-10 rounded-full font-bold flex items-center justify-center text-sm border shrink-0 ${
                            user.role === 'admin'
                              ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                              : user.role === 'technician'
                              ? 'bg-[#D8CFBC]/15 text-[#FFFBF4] border border-[#D8CFBC]/30'
                              : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                          }`}
                        >
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-[#FFFBF4] truncate">{user.name}</p>
                          <div className="flex items-center gap-2 mt-0.5 text-xs text-[#D8CFBC]/70 truncate">
                            <span className="flex items-center gap-1">
                              <Mail className="w-3 h-3 text-[#8B8878]" />
                              {user.email}
                            </span>
                            <span>•</span>
                            <span className="flex items-center gap-1 font-mono text-[11px]">
                              <Phone className="w-3 h-3 text-[#8B8878]" />
                              {user.phone_number}
                            </span>
                          </div>
                          <span className="text-[10px] text-[#8B8878] font-mono mt-0.5 block truncate">
                            UUID: {user.uuid}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Kolom 2: Role */}
                    <td className="py-4 px-4">{renderRoleBadge(user.role)}</td>

                    {/* Kolom 3: Status */}
                    <td className="py-4 px-4">
                      <div className="space-y-1">
                        {renderStatusBadge(user.status)}
                        {user.is_verified ? (
                          <div className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                            <Check className="w-3 h-3" />
                            <span>Kontak Terverifikasi</span>
                          </div>
                        ) : (
                          <div className="text-[11px] text-[#8B8878]">Belum Verifikasi Kontak</div>
                        )}
                      </div>
                    </td>

                    {/* Kolom 4: Alamat / Wilayah */}
                    <td className="py-4 px-4">
                      {user.role === 'customer' && user.customer_profile?.city ? (
                        <div className="space-y-0.5 max-w-xs">
                          <div className="flex items-center gap-1 font-medium text-[#FFFBF4] text-xs">
                            <MapPin className="w-3.5 h-3.5 text-[#D8CFBC] shrink-0" />
                            <span className="truncate">{user.customer_profile.city}</span>
                          </div>
                          {user.customer_profile.default_address && (
                            <p className="text-[11px] text-[#D8CFBC]/70 line-clamp-1 truncate">
                              {user.customer_profile.default_address}
                            </p>
                          )}
                        </div>
                      ) : user.role === 'technician' ? (
                        <div className="text-xs text-[#D8CFBC] font-medium">
                          Status Profil: {user.technician_profile?.verified_status || 'Belum Dilengkapi'}
                        </div>
                      ) : (
                        <span className="text-xs text-[#8B8878] italic">Sistem Kantor Pusat</span>
                      )}
                    </td>

                    {/* Kolom 5: Aktivitas */}
                    <td className="py-4 px-4">
                      {user.role === 'customer' ? (
                        <div className="text-xs">
                          <span className="font-semibold text-[#FFFBF4]">
                            {user.customer_profile?.stats?.total_orders || 0} Pesanan
                          </span>
                          <span className="block text-[11px] text-[#8B8878]">servis elektronik</span>
                        </div>
                      ) : user.role === 'technician' ? (
                        <div className="text-xs">
                          <span className="font-semibold text-[#FFFBF4]">
                            {user.technician_profile?.assignments_count || 0} Penugasan
                          </span>
                          <span className="block text-[11px] text-[#8B8878]">order lapangan</span>
                        </div>
                      ) : (
                        <span className="text-xs text-[#8B8878] italic">Akses Administratif</span>
                      )}
                    </td>

                    {/* Kolom 6: Terdaftar */}
                    <td className="py-4 px-4 text-xs text-[#D8CFBC]/70 whitespace-nowrap">
                      {new Date(user.created_at).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>

                    {/* Kolom 7: Aksi */}
                    <td className="py-4 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => openDetailModal(user.id, 'account')}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#11120D] hover:bg-[#1C1D17] text-[#D8CFBC] hover:text-[#FFFBF4] border border-[#D8CFBC]/20 text-xs font-semibold transition"
                          title="Lihat Detail Pengguna"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Detail</span>
                        </button>

                        {/* Quick Status Action */}
                        {user.status === 'active' ? (
                          <button
                            onClick={() =>
                              setStatusConfirmModal({
                                isOpen: true,
                                userId: user.id,
                                userName: user.name,
                                targetStatus: 'suspended',
                              })
                            }
                            className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition"
                            title="Tangguhkan Akun (Suspend)"
                          >
                            <Ban className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() =>
                              setStatusConfirmModal({
                                isOpen: true,
                                userId: user.id,
                                userName: user.name,
                                targetStatus: 'active',
                              })
                            }
                            className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 transition"
                            title="Aktifkan Akun"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {users.length > 0 && (
          <div className="py-3 px-4 bg-[#141510]/60 border-t border-[#D8CFBC]/15 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#D8CFBC]/70">
            <div>
              Menampilkan data ke-{' '}
              <span className="font-semibold text-[#FFFBF4]">
                {(pagination.page - 1) * pagination.limit + 1}
              </span>{' '}
              sampai{' '}
              <span className="font-semibold text-[#FFFBF4]">
                {Math.min(pagination.page * pagination.limit, pagination.total)}
              </span>{' '}
              dari <span className="font-semibold text-[#FFFBF4]">{pagination.total}</span> pengguna
            </div>

            <div className="flex items-center gap-1">
              <button
                disabled={pagination.page <= 1}
                onClick={() => fetchUsers(pagination.page - 1)}
                className="p-1.5 rounded-lg border border-[#D8CFBC]/20 bg-[#11120D] text-[#D8CFBC] hover:text-[#FFFBF4] hover:bg-[#1C1D17] disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 font-medium text-[#FFFBF4]">
                Halaman {pagination.page} dari {pagination.totalPages}
              </span>
              <button
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => fetchUsers(pagination.page + 1)}
                className="p-1.5 rounded-lg border border-[#D8CFBC]/20 bg-[#11120D] text-[#D8CFBC] hover:text-[#FFFBF4] hover:bg-[#1C1D17] disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ============================================================== */}
      {/* MODAL DETAIL PENGGUNA LENGKAP & KONTROL ADMINISTRASI           */}
      {/* ============================================================== */}
      {isDetailOpen && (
        <div className="fixed inset-0 z-50 bg-[#11120D]/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#141510]/95 rounded-3xl border border-[#D8CFBC]/25 shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden backdrop-blur-2xl animate-in fade-in zoom-in-95 text-[#FFFBF4]">
            {/* Header Modal */}
            <div className="p-5 border-b border-[#D8CFBC]/15 flex items-center justify-between bg-[#181913]/60">
              <div className="flex items-center gap-3">
                <div
                  className={`w-12 h-12 rounded-2xl font-bold flex items-center justify-center text-lg border shrink-0 ${
                    selectedUser?.role === 'admin'
                      ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                      : selectedUser?.role === 'technician'
                      ? 'bg-[#D8CFBC]/15 text-[#FFFBF4] border border-[#D8CFBC]/30'
                      : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                  }`}
                >
                  {selectedUser?.name ? selectedUser.name.charAt(0).toUpperCase() : 'U'}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-[#FFFBF4]">
                      {detailLoading ? 'Memuat Data...' : selectedUser?.name}
                    </h2>
                    {selectedUser && renderRoleBadge(selectedUser.role)}
                    {selectedUser && renderStatusBadge(selectedUser.status)}
                    {selectedUser?.is_current_admin && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        <Lock className="w-2.5 h-2.5" />
                        Akun Anda Saat Ini
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#D8CFBC]/70 mt-0.5 flex items-center gap-2">
                    <span>{selectedUser?.email}</span>
                    <span>•</span>
                    <span className="font-mono">{selectedUser?.phone_number}</span>
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsDetailOpen(false)}
                className="p-2 rounded-xl text-[#8B8878] hover:text-[#FFFBF4] hover:bg-[#D8CFBC]/10 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Navigasi Tab */}
            <div className="px-5 border-b border-[#D8CFBC]/15 flex gap-6 text-xs sm:text-sm font-semibold text-[#D8CFBC]/70 bg-[#141510]/60">
              <button
                onClick={() => setActiveTab('account')}
                className={`py-3.5 border-b-2 flex items-center gap-1.5 transition ${
                  activeTab === 'account'
                    ? 'border-[#D8CFBC] text-[#FFFBF4]'
                    : 'border-transparent hover:text-[#FFFBF4]'
                }`}
              >
                <Shield className="w-4 h-4" />
                <span>Akun & Kredensial</span>
              </button>

              <button
                onClick={() => setActiveTab('profile')}
                className={`py-3.5 border-b-2 flex items-center gap-1.5 transition ${
                  activeTab === 'profile'
                    ? 'border-[#D8CFBC] text-[#FFFBF4]'
                    : 'border-transparent hover:text-[#FFFBF4]'
                }`}
              >
                <User className="w-4 h-4" />
                <span>Profil & Alamat</span>
              </button>

              <button
                onClick={() => setActiveTab('activity')}
                className={`py-3.5 border-b-2 flex items-center gap-1.5 transition ${
                  activeTab === 'activity'
                    ? 'border-[#D8CFBC] text-[#FFFBF4]'
                    : 'border-transparent hover:text-[#FFFBF4]'
                }`}
              >
                <ShoppingBag className="w-4 h-4" />
                <span>Ringkasan Aktivitas</span>
              </button>

              <button
                onClick={() => setActiveTab('actions')}
                className={`py-3.5 border-b-2 flex items-center gap-1.5 transition ${
                  activeTab === 'actions'
                    ? 'border-[#D8CFBC] text-[#FFFBF4]'
                    : 'border-transparent hover:text-[#FFFBF4]'
                }`}
              >
                <Activity className="w-4 h-4" />
                <span>Tindakan Administrator</span>
              </button>
            </div>

            {/* Isi Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {detailLoading || !selectedUser ? (
                <div className="py-20 flex flex-col items-center justify-center text-[#D8CFBC]/70 gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-[#D8CFBC]" />
                  <p className="text-sm">Mengambil detail data pengguna...</p>
                </div>
              ) : (
                <>
                  {/* TAB 1: INFORMASI AKUN */}
                  {activeTab === 'account' && (
                    <div className="space-y-6">
                      <div className="bg-[#181913]/80 p-5 rounded-2xl border border-[#D8CFBC]/15 space-y-3">
                        <h3 className="text-xs font-bold text-[#D8CFBC] uppercase tracking-wider">
                          Kredensial & Pengidentifikasi Akun
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs sm:text-sm">
                          <div className="space-y-1">
                            <span className="text-[#D8CFBC]/70">ID Pengguna (Database)</span>
                            <p className="font-mono font-bold text-[#FFFBF4]">#{selectedUser.id}</p>
                          </div>
                          <div className="space-y-1">
                            <span className="text-[#D8CFBC]/70">Public UUID (Anti-Enumeration)</span>
                            <p className="font-mono text-[#D8CFBC] text-xs truncate">{selectedUser.uuid}</p>
                          </div>
                          <div className="space-y-1">
                            <span className="text-[#D8CFBC]/70">Alamat Email Login</span>
                            <p className="font-semibold text-[#FFFBF4]">{selectedUser.email}</p>
                          </div>
                          <div className="space-y-1">
                            <span className="text-[#D8CFBC]/70">Nomor Telepon Kontak</span>
                            <p className="font-mono font-semibold text-[#FFFBF4]">{selectedUser.phone_number}</p>
                          </div>
                          <div className="space-y-1">
                            <span className="text-[#D8CFBC]/70">Hak Akses (Role)</span>
                            <div>{renderRoleBadge(selectedUser.role)}</div>
                          </div>
                          <div className="space-y-1">
                            <span className="text-[#D8CFBC]/70">Status Akun Login</span>
                            <div>{renderStatusBadge(selectedUser.status)}</div>
                          </div>
                          <div className="space-y-1">
                            <span className="text-[#D8CFBC]/70">Status Verifikasi Kontak</span>
                            <p className="font-medium text-[#FFFBF4]">
                              {selectedUser.is_verified ? (
                                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                                  <Check className="w-3.5 h-3.5" /> Terverifikasi (Email / SMS)
                                </span>
                              ) : (
                                <span className="text-amber-400">Belum Terverifikasi</span>
                              )}
                            </p>
                          </div>
                          <div className="space-y-1">
                            <span className="text-[#D8CFBC]/70">Waktu Registrasi Akun</span>
                            <p className="text-[#D8CFBC]">
                              {new Date(selectedUser.created_at).toLocaleString('id-ID', {
                                dateStyle: 'long',
                                timeStyle: 'short',
                              })}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB 2: PROFIL & ALAMAT */}
                  {activeTab === 'profile' && (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-bold text-[#FFFBF4]">
                            Data Profil & Kontak Pengiriman
                          </h3>
                          <p className="text-xs text-[#D8CFBC]/70">
                            Informasi identitas nama lengkap dan alamat kediaman pelanggan untuk kunjungan teknisi.
                          </p>
                        </div>
                        <button
                          onClick={() => setIsEditingProfile(!isEditingProfile)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#D8CFBC]/20 text-[#D8CFBC] hover:text-[#FFFBF4] text-xs font-semibold bg-[#11120D] hover:bg-[#1C1D17] transition"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>{isEditingProfile ? 'Batal Edit' : 'Edit Informasi'}</span>
                        </button>
                      </div>

                      {isEditingProfile ? (
                        /* Form Edit Profil */
                        <div className="p-5 rounded-2xl border border-[#D8CFBC]/25 bg-[#11120D] space-y-4 animate-in fade-in">
                          <h4 className="text-xs font-bold text-[#D8CFBC] uppercase tracking-wider">
                            Formulir Pembaruan Data Profil
                          </h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                            <div>
                              <label className="block text-[#D8CFBC] font-semibold mb-1">
                                Nama Lengkap *
                              </label>
                              <input
                                type="text"
                                value={editFormData.full_name}
                                onChange={(e) =>
                                  setEditFormData((prev) => ({ ...prev, full_name: e.target.value }))
                                }
                                className="w-full px-3 py-2 rounded-xl border border-[#D8CFBC]/20 bg-[#141510] text-[#FFFBF4] font-medium focus:outline-none focus:border-[#D8CFBC]"
                              />
                            </div>
                            <div>
                              <label className="block text-[#D8CFBC] font-semibold mb-1">
                                Nomor Telepon *
                              </label>
                              <input
                                type="text"
                                value={editFormData.phone_number}
                                onChange={(e) =>
                                  setEditFormData((prev) => ({ ...prev, phone_number: e.target.value }))
                                }
                                className="w-full px-3 py-2 rounded-xl border border-[#D8CFBC]/20 bg-[#141510] text-[#FFFBF4] font-medium focus:outline-none focus:border-[#D8CFBC]"
                              />
                            </div>
                            {selectedUser.role === 'customer' && (
                              <>
                                <div>
                                  <label className="block text-[#D8CFBC] font-semibold mb-1">
                                    Kota / Kabupaten
                                  </label>
                                  <input
                                    type="text"
                                    value={editFormData.city}
                                    onChange={(e) =>
                                      setEditFormData((prev) => ({ ...prev, city: e.target.value }))
                                    }
                                    className="w-full px-3 py-2 rounded-xl border border-[#D8CFBC]/20 bg-[#141510] text-[#FFFBF4] font-medium focus:outline-none focus:border-[#D8CFBC]"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[#D8CFBC] font-semibold mb-1">
                                    Kode Pos (5 Digit)
                                  </label>
                                  <input
                                    type="text"
                                    value={editFormData.postal_code}
                                    onChange={(e) =>
                                      setEditFormData((prev) => ({ ...prev, postal_code: e.target.value }))
                                    }
                                    placeholder="contoh: 12345"
                                    className="w-full px-3 py-2 rounded-xl border border-[#D8CFBC]/20 bg-[#141510] text-[#FFFBF4] placeholder-[#8B8878] font-medium focus:outline-none focus:border-[#D8CFBC]"
                                  />
                                </div>
                                <div className="sm:col-span-2">
                                  <label className="block text-[#D8CFBC] font-semibold mb-1">
                                    Alamat Pengiriman Default
                                  </label>
                                  <textarea
                                    rows={3}
                                    value={editFormData.default_address}
                                    onChange={(e) =>
                                      setEditFormData((prev) => ({ ...prev, default_address: e.target.value }))
                                    }
                                    className="w-full px-3 py-2 rounded-xl border border-[#D8CFBC]/20 bg-[#141510] text-[#FFFBF4] font-medium focus:outline-none focus:border-[#D8CFBC] resize-none"
                                  />
                                </div>
                              </>
                            )}
                          </div>
                          <div className="flex justify-end gap-2.5 pt-2">
                            <button
                              onClick={() => setIsEditingProfile(false)}
                              className="px-4 py-2 rounded-xl border border-[#D8CFBC]/20 bg-[#141510] text-[#D8CFBC] hover:text-[#FFFBF4] hover:bg-[#1C1D17] text-xs font-semibold transition"
                            >
                              Batal
                            </button>
                            <button
                              onClick={handleSaveProfile}
                              disabled={isSubmitting || !editFormData.full_name.trim()}
                              className="px-4 py-2 rounded-xl bg-[#FFFBF4] hover:bg-[#D8CFBC] text-[#11120D] text-xs font-bold shadow-md transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                            >
                              Simpan Perubahan
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* Tampilan Statis Profil */
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="bg-[#181913]/80 p-5 rounded-2xl border border-[#D8CFBC]/15 space-y-3">
                            <h4 className="text-xs font-bold text-[#D8CFBC] uppercase tracking-wider">
                              Data Identitas Profil
                            </h4>
                            <div className="space-y-2 text-xs sm:text-sm">
                              <div className="flex justify-between py-1 border-b border-[#D8CFBC]/15">
                                <span className="text-[#D8CFBC]/70">Nama Tampilan</span>
                                <span className="font-bold text-[#FFFBF4]">{selectedUser.name}</span>
                              </div>
                              <div className="flex justify-between py-1 border-b border-[#D8CFBC]/15">
                                <span className="text-[#D8CFBC]/70">Nomor Telepon</span>
                                <span className="font-mono text-[#D8CFBC]">{selectedUser.phone_number}</span>
                              </div>
                              <div className="flex justify-between py-1">
                                <span className="text-[#D8CFBC]/70">Terdaftar Sejak</span>
                                <span className="text-[#FFFBF4]">
                                  {new Date(selectedUser.created_at).toLocaleDateString('id-ID')}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="bg-[#181913]/80 p-5 rounded-2xl border border-[#D8CFBC]/15 space-y-3">
                            <h4 className="text-xs font-bold text-[#D8CFBC] uppercase tracking-wider">
                              Alamat & Domisili
                            </h4>
                            {selectedUser.role === 'customer' ? (
                              <div className="space-y-2 text-xs sm:text-sm">
                                <div className="flex justify-between py-1 border-b border-[#D8CFBC]/15">
                                  <span className="text-[#D8CFBC]/70">Kota / Wilayah</span>
                                  <span className="font-semibold text-[#FFFBF4]">
                                    {selectedUser.customer_profile?.city || '-'}
                                  </span>
                                </div>
                                <div className="flex justify-between py-1 border-b border-[#D8CFBC]/15">
                                  <span className="text-[#D8CFBC]/70">Kode Pos</span>
                                  <span className="font-mono text-[#D8CFBC]">
                                    {selectedUser.customer_profile?.postal_code || '-'}
                                  </span>
                                </div>
                                <div className="py-1">
                                  <span className="text-[#D8CFBC]/70 block mb-0.5">Alamat Lengkap</span>
                                  <p className="text-[#FFFBF4] font-medium">
                                    {selectedUser.customer_profile?.default_address ||
                                      'Pelanggan belum mengatur alamat pengiriman default.'}
                                  </p>
                                </div>
                              </div>
                            ) : (
                              <p className="text-xs text-[#8B8878] italic py-4">
                                Data alamat pelanggan khusus untuk pengguna ber-role customer.
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 3: RINGKASAN AKTIVITAS */}
                  {activeTab === 'activity' && (
                    <div className="space-y-6">
                      {selectedUser.role === 'customer' ? (
                        <div className="space-y-4">
                          <h3 className="text-xs font-bold text-[#D8CFBC] uppercase tracking-wider">
                            Metrik Transaksi Pelanggan
                          </h3>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="p-4 rounded-2xl bg-[#11120D] border border-[#D8CFBC]/15">
                              <span className="text-xs text-[#D8CFBC] font-semibold">Total Pesanan</span>
                              <p className="text-2xl font-bold text-[#FFFBF4] mt-1">
                                {selectedUser.customer_profile?.stats?.total_orders || 0}
                              </p>
                            </div>
                            <div className="p-4 rounded-2xl bg-[#11120D] border border-[#D8CFBC]/15">
                              <span className="text-xs text-emerald-400 font-semibold">Pesanan Selesai</span>
                              <p className="text-2xl font-bold text-emerald-400 mt-1">
                                {selectedUser.customer_profile?.stats?.completed_orders || 0}
                              </p>
                            </div>
                            <div className="p-4 rounded-2xl bg-[#11120D] border border-[#D8CFBC]/15">
                              <span className="text-xs text-amber-400 font-semibold">Pesanan Berjalan</span>
                              <p className="text-2xl font-bold text-amber-400 mt-1">
                                {selectedUser.customer_profile?.stats?.active_orders || 0}
                              </p>
                            </div>
                            <div className="p-4 rounded-2xl bg-[#11120D] border border-[#D8CFBC]/15">
                              <span className="text-xs text-purple-400 font-semibold">Total Pembayaran</span>
                              <p className="text-lg font-bold text-[#FFFBF4] mt-1 truncate">
                                {formatRupiah(selectedUser.customer_profile?.stats?.total_spent || 0)}
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : selectedUser.role === 'technician' ? (
                        <div className="space-y-4">
                          <h3 className="text-xs font-bold text-[#D8CFBC] uppercase tracking-wider">
                            Metrik Penugasan Teknisi
                          </h3>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="p-4 rounded-2xl bg-[#11120D] border border-[#D8CFBC]/15">
                              <span className="text-xs text-[#D8CFBC] font-semibold">Total Penugasan</span>
                              <p className="text-2xl font-bold text-[#FFFBF4] mt-1">
                                {selectedUser.technician_profile?.stats?.total_assignments || 0}
                              </p>
                            </div>
                            <div className="p-4 rounded-2xl bg-[#11120D] border border-[#D8CFBC]/15">
                              <span className="text-xs text-emerald-400 font-semibold">Penugasan Selesai</span>
                              <p className="text-2xl font-bold text-emerald-400 mt-1">
                                {selectedUser.technician_profile?.stats?.completed_assignments || 0}
                              </p>
                            </div>
                            <div className="p-4 rounded-2xl bg-[#11120D] border border-[#D8CFBC]/15">
                              <span className="text-xs text-amber-400 font-semibold">Penugasan Berjalan</span>
                              <p className="text-2xl font-bold text-amber-400 mt-1">
                                {selectedUser.technician_profile?.stats?.active_assignments || 0}
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="py-12 text-center text-[#D8CFBC]/70">
                          <Shield className="w-8 h-8 mx-auto text-[#D8CFBC]/40 mb-2" />
                          <p className="text-sm font-medium">Akun Administrator Sistem BANTUIN.</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 4: TINDAKAN ADMINISTRATOR */}
                  {activeTab === 'actions' && (
                    <div className="space-y-6">
                      {/* Peringatan Proteksi Akun Admin */}
                      {selectedUser.is_current_admin && (
                        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3">
                          <Lock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                          <div className="text-xs text-amber-300 leading-relaxed">
                            <p className="font-semibold">Proteksi Akun Administrator Aktif:</p>
                            <p className="mt-0.5 text-amber-300/80">
                              Anda sedang login menggunakan akun ini. Demi mencegah terkunci dari sistem (lockout),
                              tindakan penonaktifan atau penangguhan terhadap akun Anda sendiri dinonaktifkan secara otomatis.
                            </p>
                          </div>
                        </div>
                      )}

                      {selectedUser.is_bootstrap_admin && !selectedUser.is_current_admin && (
                        <div className="p-4 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-start gap-3">
                          <ShieldCheck className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
                          <div className="text-xs text-purple-300 leading-relaxed">
                            <p className="font-semibold">Akun Administrator Utama (Bootstrap):</p>
                            <p className="mt-0.5 text-purple-300/80">
                              Akun ini dikonfigurasi sebagai administrator inisial sistem. Status akun dilindungi
                              dari perubahan yang dapat menghentikan operasional aplikasi.
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="p-5 rounded-3xl border border-[#D8CFBC]/15 bg-[#181913]/80 space-y-4 shadow-sm">
                        <div>
                          <h4 className="text-sm font-bold text-[#FFFBF4]">
                            Kontrol Hak Akses & Keaktifan Akun
                          </h4>
                          <p className="text-xs text-[#D8CFBC]/70 mt-0.5">
                            Ubah status keaktifan akun pengguna sesuai hasil peninjauan kepatuhan layanan.
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-3">
                          {selectedUser.status !== 'active' && (
                            <button
                              onClick={() => handleUpdateStatus(selectedUser.id, 'active')}
                              disabled={isSubmitting}
                              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm shadow-md transition-all hover:scale-105 active:scale-95"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              <span>Aktifkan Akun</span>
                            </button>
                          )}

                          {selectedUser.status !== 'suspended' && (
                            <button
                              onClick={() =>
                                setStatusConfirmModal({
                                  isOpen: true,
                                  userId: selectedUser.id,
                                  userName: selectedUser.name,
                                  targetStatus: 'suspended',
                                })
                              }
                              disabled={
                                isSubmitting || selectedUser.is_current_admin || selectedUser.is_bootstrap_admin
                              }
                              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs sm:text-sm shadow-md transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <Ban className="w-4 h-4" />
                              <span>Tangguhkan Akun (Suspend)</span>
                            </button>
                          )}

                          {selectedUser.status !== 'inactive' && (
                            <button
                              onClick={() =>
                                setStatusConfirmModal({
                                  isOpen: true,
                                  userId: selectedUser.id,
                                  userName: selectedUser.name,
                                  targetStatus: 'inactive',
                                })
                              }
                              disabled={
                                isSubmitting || selectedUser.is_current_admin || selectedUser.is_bootstrap_admin
                              }
                              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-[#11120D] border border-[#D8CFBC]/20 hover:bg-[#1C1D17] text-[#D8CFBC] hover:text-[#FFFBF4] font-bold text-xs sm:text-sm transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <XCircle className="w-4 h-4" />
                              <span>Nonaktifkan Akun</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer Modal */}
            <div className="p-4 border-t border-[#D8CFBC]/15 bg-[#181913]/60 flex items-center justify-between text-xs text-[#D8CFBC]/70">
              <span>Sistem Manajemen Pengguna BANTUIN</span>
              <button
                onClick={() => setIsDetailOpen(false)}
                className="px-4 py-2 rounded-xl bg-[#11120D] border border-[#D8CFBC]/20 hover:bg-[#1C1D17] text-[#D8CFBC] hover:text-[#FFFBF4] font-semibold transition"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL KONFIRMASI PERUBAHAN STATUS PENGGUNA                     */}
      {/* ============================================================== */}
      {statusConfirmModal.isOpen && (
        <div className="fixed inset-0 z-60 bg-[#11120D]/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#141510]/95 rounded-3xl border border-[#D8CFBC]/25 shadow-2xl w-full max-w-md p-6 space-y-4 backdrop-blur-2xl animate-in fade-in zoom-in-95 text-[#FFFBF4]">
            <div className="flex items-center gap-3">
              <div
                className={`p-3 rounded-2xl ${
                  statusConfirmModal.targetStatus === 'suspended'
                    ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                    : statusConfirmModal.targetStatus === 'active'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-[#11120D] text-[#D8CFBC] border border-[#D8CFBC]/20'
                }`}
              >
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-[#FFFBF4] text-base">Konfirmasi Perubahan Status</h3>
                <p className="text-xs text-[#D8CFBC]/70 mt-0.5">
                  Pengguna: <strong className="text-[#FFFBF4]">{statusConfirmModal.userName}</strong>
                </p>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-[#D8CFBC]/70 leading-relaxed">
              {statusConfirmModal.targetStatus === 'suspended'
                ? 'Menangguhkan pengguna akan memblokir login sesi dan mencegah pengguna melakukan order atau menerima penugasan baru.'
                : statusConfirmModal.targetStatus === 'active'
                ? 'Mengaktifkan kembali akun pengguna sehingga dapat bertransaksi normal pada aplikasi.'
                : 'Menonaktifkan akun pengguna.'}
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() =>
                  setStatusConfirmModal({ isOpen: false, userId: 0, userName: '', targetStatus: 'active' })
                }
                className="px-4 py-2 rounded-xl border border-[#D8CFBC]/20 bg-[#11120D] text-[#D8CFBC] hover:text-[#FFFBF4] text-xs font-semibold hover:bg-[#1C1D17] transition"
              >
                Batal
              </button>
              <button
                onClick={() =>
                  handleUpdateStatus(statusConfirmModal.userId, statusConfirmModal.targetStatus)
                }
                disabled={isSubmitting}
                className={`px-4 py-2 rounded-xl text-white text-xs font-bold shadow-md transition ${
                  statusConfirmModal.targetStatus === 'suspended'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : statusConfirmModal.targetStatus === 'active'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-[#565449] hover:bg-[#565449]/80'
                }`}
              >
                {statusConfirmModal.targetStatus === 'suspended'
                  ? 'Ya, Tangguhkan Akun'
                  : statusConfirmModal.targetStatus === 'active'
                  ? 'Ya, Aktifkan Akun'
                  : 'Ya, Nonaktifkan Akun'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
