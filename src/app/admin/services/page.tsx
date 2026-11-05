'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Wrench,
  Plus,
  Search,
  Edit2,
  Trash2,
  Eye,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  X,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Layers,
  Clock,
  Coins,
  AlertTriangle,
  Info,
  Tag,
} from 'lucide-react';
import { createServiceSchema, generateServiceSlug } from '@/lib/validations/service';

interface ServiceItem {
  id: number;
  category_id: number;
  category_name?: string;
  category_slug?: string;
  name: string;
  slug: string;
  description: string | null;
  base_price: number;
  estimated_duration_min: number;
  is_active: boolean;
  repair_count: number;
  created_at: string;
  updated_at: string;
}

interface CategoryOption {
  id: number;
  name: string;
  slug: string;
  is_active: boolean;
}

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const formatRupiah = (val: number) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val);
};

export default function ServicesAdminPage() {
  // State Data Layanan
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
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
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // State Toast Notifikasi
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // State Modals
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [activeService, setActiveService] = useState<ServiceItem | null>(null);

  // State Konfirmasi Hapus / Nonaktifkan
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    service: ServiceItem | null;
    inUse: boolean;
    warningMessage: string | null;
  }>({
    isOpen: false,
    service: null,
    inUse: false,
    warningMessage: null,
  });

  // State Form Input
  const [formData, setFormData] = useState({
    category_id: 0,
    name: '',
    slug: '',
    description: '',
    base_price: 50000,
    estimated_duration_min: 60,
    is_active: true,
  });
  const [autoSlug, setAutoSlug] = useState(true);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  // 1. Fetch Daftar Kategori untuk Opsi Dropdown
  const fetchCategoryOptions = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/categories?limit=100');
      const result = await res.json();
      if (res.ok && result.success && Array.isArray(result.data)) {
        setCategories(
          result.data.map((c: any) => ({
            id: c.id,
            name: c.name,
            slug: c.slug,
            is_active: Boolean(c.is_active),
          }))
        );
      }
    } catch {
      // Abaikan bila gagal memuat opsi, akan ditangani saat submit
    }
  }, []);

  // 2. Fetch Data Layanan dari API
  const fetchServices = useCallback(async (page = 1) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '10',
      });
      if (searchTerm.trim()) params.append('search', searchTerm.trim());
      if (categoryFilter !== 'all') params.append('category_id', categoryFilter);
      if (statusFilter !== 'all') params.append('status', statusFilter);

      const res = await fetch(`/api/admin/services?${params.toString()}`);
      const result = await res.json();

      if (!res.ok || !result.success) {
        throw new Error(result.message || 'Gagal mengambil data katalog layanan');
      }

      setServices(result.data || []);
      setPagination(result.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 });
    } catch (err: any) {
      setErrorMsg(err.message || 'Terjadi kesalahan saat memuat data layanan');
    } finally {
      setIsLoading(false);
    }
  }, [searchTerm, categoryFilter, statusFilter]);

  useEffect(() => {
    fetchCategoryOptions();
  }, [fetchCategoryOptions]);

  useEffect(() => {
    fetchServices(1);
  }, [fetchServices]);

  // Handler nama layanan berubah (auto-generate slug jika diaktifkan)
  const handleNameChange = (val: string) => {
    setFormData((prev) => ({
      ...prev,
      name: val,
      slug: autoSlug ? generateServiceSlug(val) : prev.slug,
    }));
    if (formErrors.name) {
      setFormErrors((prev) => ({ ...prev, name: '' }));
    }
  };

  // Buka Modal Tambah
  const openAddModal = () => {
    const defaultCatId = categories.length > 0 ? categories[0].id : 1;
    setFormData({
      category_id: defaultCatId,
      name: '',
      slug: '',
      description: '',
      base_price: 75000,
      estimated_duration_min: 60,
      is_active: true,
    });
    setAutoSlug(true);
    setFormErrors({});
    setIsAddOpen(true);
  };

  // Buka Modal Edit
  const openEditModal = (service: ServiceItem) => {
    setActiveService(service);
    setFormData({
      category_id: service.category_id,
      name: service.name,
      slug: service.slug,
      description: service.description || '',
      base_price: service.base_price,
      estimated_duration_min: service.estimated_duration_min,
      is_active: service.is_active,
    });
    setAutoSlug(false);
    setFormErrors({});
    setIsEditOpen(true);
  };

  // Buka Modal Detail
  const openDetailModal = (service: ServiceItem) => {
    setActiveService(service);
    setIsDetailOpen(true);
  };

  // 3. Submit Tambah Layanan
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors({});

    const validation = createServiceSchema.safeParse(formData);
    if (!validation.success) {
      const errors: Record<string, string> = {};
      validation.error.issues.forEach((issue) => {
        const path = issue.path[0]?.toString() || 'general';
        errors[path] = issue.message;
      });
      setFormErrors(errors);
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/admin/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validation.data),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        showToast('error', data.message || 'Gagal menambahkan layanan');
        setIsSubmitting(false);
        return;
      }

      showToast('success', data.message || 'Layanan baru berhasil ditambahkan');
      setIsAddOpen(false);
      fetchServices(pagination.page);
    } catch {
      showToast('error', 'Terjadi kesalahan jaringan saat menambahkan layanan');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 4. Submit Update Layanan
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeService) return;
    setFormErrors({});

    const validation = createServiceSchema.safeParse(formData);
    if (!validation.success) {
      const errors: Record<string, string> = {};
      validation.error.issues.forEach((issue) => {
        const path = issue.path[0]?.toString() || 'general';
        errors[path] = issue.message;
      });
      setFormErrors(errors);
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/admin/services/${activeService.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validation.data),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        showToast('error', data.message || 'Gagal memperbarui layanan');
        setIsSubmitting(false);
        return;
      }

      showToast('success', data.message || 'Layanan berhasil diperbarui');
      setIsEditOpen(false);
      fetchServices(pagination.page);
    } catch {
      showToast('error', 'Terjadi kesalahan jaringan saat memperbarui layanan');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 5. Toggle Status Aktif/Nonaktif Cepat
  const handleToggleActive = async (service: ServiceItem) => {
    try {
      const newStatus = !service.is_active;
      const res = await fetch(`/api/admin/services/${service.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: newStatus }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        showToast('error', data.message || 'Gagal mengubah status layanan');
        return;
      }

      showToast(
        'success',
        `Layanan "${service.name}" berhasil ${newStatus ? 'diaktifkan' : 'dinonaktifkan'}`
      );
      // Optimistic update
      setServices((prev) =>
        prev.map((item) => (item.id === service.id ? { ...item, is_active: newStatus } : item))
      );
    } catch {
      showToast('error', 'Terjadi kegagalan saat mengubah status layanan');
    }
  };

  // 6. Inisiasi Hapus / Nonaktifkan Layanan
  const initiateDelete = (service: ServiceItem) => {
    const inUse = service.repair_count > 0;
    const warningMessage = inUse
      ? `Layanan "${service.name}" terhubung dengan ${service.repair_count} transaksi permintaan perbaikan. Menghapus fisik layanan ini akan merusak integritas relasi data riwayat transaksi.`
      : null;

    setDeleteConfirm({
      isOpen: true,
      service,
      inUse,
      warningMessage,
    });
  };

  // Eksekusi Hapus atau Nonaktifkan
  const confirmDeleteOrDeactivate = async (mode?: 'deactivate') => {
    const service = deleteConfirm.service;
    if (!service) return;

    setIsSubmitting(true);
    try {
      const url =
        mode === 'deactivate'
          ? `/api/admin/services/${service.id}?mode=deactivate`
          : `/api/admin/services/${service.id}`;

      const res = await fetch(url, { method: 'DELETE' });
      const data = await res.json();

      if (!res.ok || !data.success) {
        showToast('error', data.message || 'Gagal memproses penghapusan layanan');
        setDeleteConfirm({
          isOpen: true,
          service,
          inUse: data.inUse || false,
          warningMessage: data.message,
        });
        setIsSubmitting(false);
        return;
      }

      showToast('success', data.message);
      setDeleteConfirm({ isOpen: false, service: null, inUse: false, warningMessage: null });
      fetchServices(pagination.page);
    } catch {
      showToast('error', 'Terjadi kegagalan jaringan saat menghapus layanan');
    } finally {
      setIsSubmitting(false);
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

      {/* Page Title & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#D8CFBC]/15 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-2xl bg-[#D8CFBC]/10 border border-[#D8CFBC]/20 text-[#D8CFBC] shadow-inner">
              <Wrench className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-[#FFFBF4] tracking-tight">
                Manajemen Layanan & Tarif
              </h1>
              <p className="text-xs sm:text-sm text-[#D8CFBC]/70 mt-0.5">
                Kelola katalog jenis pengerjaan perbaikan, tarif dasar (base price), dan estimasi durasi pengerjaan.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={openAddModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#FFFBF4] hover:bg-[#D8CFBC] text-[#11120D] font-bold text-xs sm:text-sm shadow-md transition-all hover:scale-105 active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Layanan Baru</span>
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-[#181913]/80 p-4 rounded-2xl border border-[#D8CFBC]/15 shadow-sm backdrop-blur-xl flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8B8878]" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cari nama layanan, kategori, atau slug..."
            className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm rounded-xl border border-[#D8CFBC]/20 bg-[#11120D] text-[#FFFBF4] placeholder-[#8B8878] focus:outline-none focus:border-[#D8CFBC] transition-all"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8B8878] hover:text-[#FFFBF4]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Category Dropdown Filter */}
          <div className="flex items-center gap-1.5">
            <Tag className="w-4 h-4 text-[#D8CFBC] shrink-0" />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-1.5 text-xs font-medium rounded-xl border border-[#D8CFBC]/20 bg-[#11120D] text-[#FFFBF4] focus:outline-none focus:border-[#D8CFBC] transition-all"
            >
              <option value="all">Semua Kategori</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id.toString()}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Filter Status Tabs */}
          <div className="flex rounded-xl bg-[#11120D] border border-[#D8CFBC]/20 p-1 text-xs font-medium text-[#D8CFBC]/70">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1 rounded-lg transition-all ${
                statusFilter === 'all'
                  ? 'bg-[#1C1D17] text-[#FFFBF4] border border-[#D8CFBC]/30 shadow-xs font-semibold'
                  : 'hover:text-[#FFFBF4]'
              }`}
            >
              Semua
            </button>
            <button
              onClick={() => setStatusFilter('active')}
              className={`px-3 py-1 rounded-lg transition-all ${
                statusFilter === 'active'
                  ? 'bg-[#1C1D17] text-emerald-400 border border-emerald-500/30 shadow-xs font-semibold'
                  : 'hover:text-[#FFFBF4]'
              }`}
            >
              Aktif
            </button>
            <button
              onClick={() => setStatusFilter('inactive')}
              className={`px-3 py-1 rounded-lg transition-all ${
                statusFilter === 'inactive'
                  ? 'bg-[#1C1D17] text-[#D8CFBC] border border-[#D8CFBC]/30 shadow-xs font-semibold'
                  : 'hover:text-[#FFFBF4]'
              }`}
            >
              Non-aktif
            </button>
          </div>

          {/* Refresh Button */}
          <button
            onClick={() => fetchServices(pagination.page)}
            disabled={isLoading}
            title="Muat ulang data"
            className="p-2 rounded-xl border border-[#D8CFBC]/20 bg-[#1C1D17] hover:bg-[#252720] text-[#D8CFBC] hover:text-[#FFFBF4] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Error Alert State */}
      {errorMsg && (
        <div className="p-4 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-start gap-3 text-xs sm:text-sm text-rose-300">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-white">Gagal memuat katalog layanan</p>
            <p className="text-xs text-rose-300 mt-0.5">{errorMsg}</p>
          </div>
          <button
            onClick={() => fetchServices(1)}
            className="px-3 py-1 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-xs font-medium transition-colors"
          >
            Coba Lagi
          </button>
        </div>
      )}

      {/* Services Table View */}
      <div className="bg-[#181913]/90 rounded-3xl border border-[#D8CFBC]/20 shadow-lg backdrop-blur-xl overflow-hidden">
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center text-[#D8CFBC]/60 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-[#D8CFBC]" />
            <p className="text-xs sm:text-sm font-medium">Memuat katalog layanan dari MySQL bantuin_db...</p>
          </div>
        ) : services.length === 0 ? (
          <div className="py-16 px-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-[#1C1D17] border border-[#D8CFBC]/20 flex items-center justify-center mx-auto text-[#D8CFBC] mb-3 shadow-inner">
              <Wrench className="w-6 h-6" />
            </div>
            <h3 className="text-sm sm:text-base font-semibold text-white">
              {searchTerm || categoryFilter !== 'all' || statusFilter !== 'all'
                ? 'Tidak ada layanan yang cocok dengan filter'
                : 'Belum ada data layanan perbaikan'}
            </h3>
            <p className="text-xs text-[#D8CFBC]/70 mt-1 max-w-sm mx-auto">
              {searchTerm || categoryFilter !== 'all' || statusFilter !== 'all'
                ? 'Coba sesuaikan kata kunci pencarian, filter kategori, atau filter status.'
                : 'Mulai dengan menambahkan paket layanan perbaikan pertama ke dalam sistem.'}
            </p>
            {(searchTerm || categoryFilter !== 'all' || statusFilter !== 'all') && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setCategoryFilter('all');
                  setStatusFilter('all');
                }}
                className="mt-4 px-3.5 py-1.5 rounded-xl bg-[#1C1D17] hover:bg-[#252720] border border-[#D8CFBC]/20 text-xs font-semibold text-[#FFFBF4] transition-colors"
              >
                Reset Filter
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm text-[#FFFBF4]">
              <thead>
                <tr className="border-b border-[#D8CFBC]/15 bg-[#141510]/95 text-[#D8CFBC] font-semibold text-[11px] uppercase tracking-wider">
                  <th className="py-3 px-4 w-12 text-center">ID</th>
                  <th className="py-3 px-4">Layanan Perbaikan</th>
                  <th className="py-3 px-4">Kategori Peralatan</th>
                  <th className="py-3 px-4 text-right">Tarif Dasar</th>
                  <th className="py-3 px-4 text-center">Durasi</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D8CFBC]/10">
                {services.map((srv) => (
                  <tr
                    key={srv.id}
                    className="hover:bg-[#1C1D17]/60 transition-colors group"
                  >
                    {/* ID */}
                    <td className="py-3.5 px-4 text-center font-mono text-[#D8CFBC]/60 text-xs">
                      #{srv.id}
                    </td>

                    {/* Name & Description */}
                    <td className="py-3.5 px-4 max-w-xs sm:max-w-md">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-2xl bg-[#1C1D17] border border-[#D8CFBC]/20 text-[#D8CFBC] flex items-center justify-center shrink-0 shadow-inner">
                          <Wrench className="w-4 h-4" />
                        </div>
                        <div className="truncate">
                          <p className="font-semibold text-white group-hover:text-[#D8CFBC] transition-colors truncate">
                            {srv.name}
                          </p>
                          <p className="text-[11px] text-[#D8CFBC]/70 truncate max-w-xs">
                            {srv.description || 'Tidak ada deskripsi'}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Kategori */}
                    <td className="py-3.5 px-4">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#1C1D17] text-[#D8CFBC] border border-[#D8CFBC]/20">
                        <Layers className="w-3 h-3 text-[#D8CFBC]" />
                        <span className="truncate max-w-[140px]">
                          {srv.category_name || `Kategori #${srv.category_id}`}
                        </span>
                      </div>
                    </td>

                    {/* Base Price (Tarif Dasar) */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="font-semibold text-[#FFFBF4] font-mono text-xs sm:text-sm">
                        {formatRupiah(srv.base_price)}
                      </div>
                    </td>

                    {/* Estimated Duration */}
                    <td className="py-3.5 px-4 text-center">
                      <div className="inline-flex items-center gap-1 text-xs text-[#D8CFBC] font-medium bg-[#1C1D17] px-2 py-0.5 rounded-full border border-[#D8CFBC]/20 font-mono">
                        <Clock className="w-3 h-3 text-[#565449]" />
                        <span>{srv.estimated_duration_min} mnt</span>
                      </div>
                    </td>

                    {/* Status Badge */}
                    <td className="py-3.5 px-4 text-center">
                      <button
                        onClick={() => handleToggleActive(srv)}
                        title="Klik untuk mengubah status aktif"
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold transition-all hover:scale-105 ${
                          srv.is_active
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                            : 'bg-slate-500/15 text-slate-400 border border-slate-500/30'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            srv.is_active ? 'bg-emerald-400' : 'bg-slate-500'
                          }`}
                        />
                        <span>{srv.is_active ? 'Aktif' : 'Non-aktif'}</span>
                      </button>
                    </td>

                    {/* Action Buttons */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openDetailModal(srv)}
                          title="Lihat Detail"
                          className="p-1.5 rounded-xl bg-[#1C1D17] hover:bg-[#252720] text-[#D8CFBC] hover:text-[#FFFBF4] border border-[#D8CFBC]/20 transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openEditModal(srv)}
                          title="Edit Layanan"
                          className="p-1.5 rounded-xl bg-[#1C1D17] hover:bg-[#252720] text-[#D8CFBC] hover:text-[#FFFBF4] border border-[#D8CFBC]/20 transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => initiateDelete(srv)}
                          title="Hapus / Nonaktifkan"
                          className="p-1.5 rounded-xl bg-[#1C1D17] hover:bg-[#252720] text-rose-400 hover:text-rose-300 border border-rose-500/30 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {!isLoading && services.length > 0 && (
          <div className="px-4 py-3 border-t border-[#D8CFBC]/15 bg-[#141510]/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#D8CFBC]/70">
            <div>
              Menampilkan{' '}
              <span className="font-semibold text-white font-mono">
                {(pagination.page - 1) * pagination.limit + 1}
              </span>{' '}
              -{' '}
              <span className="font-semibold text-white font-mono">
                {Math.min(pagination.page * pagination.limit, pagination.total)}
              </span>{' '}
              dari <span className="font-semibold text-white font-mono">{pagination.total}</span> layanan
            </div>

            <div className="flex items-center gap-1.5 font-mono">
              <button
                onClick={() => fetchServices(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-[#D8CFBC]/20 bg-[#1C1D17] hover:bg-[#252720] text-[#D8CFBC] hover:text-[#FFFBF4] disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-sans"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Sebelumnya</span>
              </button>
              <span className="px-2 font-medium text-white">
                {pagination.page} / {pagination.totalPages}
              </span>
              <button
                onClick={() => fetchServices(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-[#D8CFBC]/20 bg-[#1C1D17] hover:bg-[#252720] text-[#D8CFBC] hover:text-[#FFFBF4] disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-sans"
              >
                <span>Berikutnya</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ====================================================================== */}
      {/* MODAL: TAMBAH LAYANAN BARU */}
      {/* ====================================================================== */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-[#131416] rounded-3xl border border-[#1f2125] shadow-2xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-200 text-white">
            <div className="px-6 py-4 border-b border-[#1f2125] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
                  <Plus className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-white text-base">Tambah Layanan Baru</h3>
              </div>
              <button
                onClick={() => setIsAddOpen(false)}
                className="p-1 rounded-lg text-[#8b8f97] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="p-6 space-y-4 max-h-[85vh] overflow-y-auto">
              {/* Kategori Peralatan */}
              <div>
                <label className="block text-xs font-semibold text-[#8b8f97] mb-1">
                  Kategori Peralatan <span className="text-rose-400">*</span>
                </label>
                <select
                  required
                  value={formData.category_id}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, category_id: parseInt(e.target.value, 10) }))
                  }
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-sm text-white bg-[#16171a] focus:outline-none focus:ring-2 transition-all ${
                    formErrors.category_id
                      ? 'border-rose-500/50 focus:ring-rose-500/20 focus:border-rose-500'
                      : 'border-[#222428] focus:ring-blue-500/20 focus:border-blue-500/60'
                  }`}
                >
                  <option value={0} disabled className="bg-[#16171a] text-white">
                    Pilih Kategori Peralatan
                  </option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id} className="bg-[#16171a] text-white">
                      {c.name}
                    </option>
                  ))}
                </select>
                {formErrors.category_id && (
                  <p className="text-xs text-rose-400 mt-1">{formErrors.category_id}</p>
                )}
              </div>

              {/* Nama Layanan */}
              <div>
                <label className="block text-xs font-semibold text-[#8b8f97] mb-1">
                  Nama Layanan Perbaikan <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="Contoh: Cuci AC Inverter + Pembersihan Outdoor"
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-sm text-white placeholder-[#6c727e] bg-[#16171a] focus:outline-none focus:ring-2 transition-all ${
                    formErrors.name
                      ? 'border-rose-500/50 focus:ring-rose-500/20 focus:border-rose-500'
                      : 'border-[#222428] focus:ring-blue-500/20 focus:border-blue-500/60'
                  }`}
                />
                {formErrors.name && (
                  <p className="text-xs text-rose-400 mt-1">{formErrors.name}</p>
                )}
              </div>

              {/* Slug Identifier */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-[#8b8f97]">
                    Slug / URL Identifier
                  </label>
                  <label className="text-[11px] text-[#6c727e] flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoSlug}
                      onChange={(e) => {
                        setAutoSlug(e.target.checked);
                        if (e.target.checked) {
                          setFormData((prev) => ({
                            ...prev,
                            slug: generateServiceSlug(prev.name),
                          }));
                        }
                      }}
                      className="rounded border-[#2f333a] bg-[#1c1d22] text-blue-600 text-xs"
                    />
                    <span>Otomatis dari nama</span>
                  </label>
                </div>
                <input
                  type="text"
                  value={formData.slug}
                  disabled={autoSlug}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, slug: e.target.value.toLowerCase().trim() }))
                  }
                  placeholder="cuci-ac-inverter-outdoor"
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-sm font-mono text-white placeholder-[#6c727e] focus:outline-none focus:ring-2 transition-all ${
                    autoSlug ? 'bg-[#18191d] text-[#6c727e] cursor-not-allowed border-[#1f2125]' : 'bg-[#16171a] border-[#222428]'
                  } ${
                    formErrors.slug
                      ? 'border-rose-500/50 focus:ring-rose-500/20 focus:border-rose-500'
                      : 'focus:ring-blue-500/20 focus:border-blue-500/60'
                  }`}
                />
                {formErrors.slug && (
                  <p className="text-xs text-rose-400 mt-1">{formErrors.slug}</p>
                )}
              </div>

              {/* Tarif Dasar & Durasi (Grid 2 Kolom) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Tarif Dasar */}
                <div>
                  <label className="block text-xs font-semibold text-[#8b8f97] mb-1">
                    Tarif Dasar (Rp) <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[#6c727e]">
                      Rp
                    </span>
                    <input
                      type="number"
                      required
                      min={0}
                      step={5000}
                      value={formData.base_price}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          base_price: parseFloat(e.target.value) || 0,
                        }))
                      }
                      className={`w-full pl-10 pr-3.5 py-2.5 rounded-xl border bg-[#16171a] text-sm font-mono text-white focus:outline-none focus:ring-2 transition-all ${
                        formErrors.base_price
                          ? 'border-rose-500/50 focus:ring-rose-500/20 focus:border-rose-500'
                          : 'border-[#222428] focus:ring-blue-500/20 focus:border-blue-500/60'
                      }`}
                    />
                  </div>
                  {formErrors.base_price && (
                    <p className="text-xs text-rose-400 mt-1">{formErrors.base_price}</p>
                  )}
                </div>

                {/* Estimasi Durasi */}
                <div>
                  <label className="block text-xs font-semibold text-[#8b8f97] mb-1">
                    Estimasi Durasi (Menit) <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <Clock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#6c727e]" />
                    <input
                      type="number"
                      required
                      min={1}
                      max={1440}
                      step={5}
                      value={formData.estimated_duration_min}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          estimated_duration_min: parseInt(e.target.value, 10) || 60,
                        }))
                      }
                      className={`w-full pl-9 pr-3.5 py-2.5 rounded-xl border bg-[#16171a] text-sm font-mono text-white focus:outline-none focus:ring-2 transition-all ${
                        formErrors.estimated_duration_min
                          ? 'border-rose-500/50 focus:ring-rose-500/20 focus:border-rose-500'
                          : 'border-[#222428] focus:ring-blue-500/20 focus:border-blue-500/60'
                      }`}
                    />
                  </div>
                  {formErrors.estimated_duration_min && (
                    <p className="text-xs text-rose-400 mt-1">
                      {formErrors.estimated_duration_min}
                    </p>
                  )}
                </div>
              </div>

              {/* Deskripsi */}
              <div>
                <label className="block text-xs font-semibold text-[#8b8f97] mb-1">
                  Deskripsi Layanan <span className="text-[#6c727e] font-normal">(Opsional)</span>
                </label>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, description: e.target.value }))
                  }
                  placeholder="Rincian lingkup pengerjaan yang termasuk dalam tarif dasar ini..."
                  className="w-full px-3.5 py-2 rounded-xl border border-[#222428] bg-[#16171a] text-sm text-white placeholder-[#6c727e] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/60 transition-all resize-none"
                />
              </div>

              {/* Status Aktif */}
              <div className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, is_active: e.target.checked }))
                    }
                    className="w-4 h-4 rounded border-[#2f333a] bg-[#1c1d22] text-blue-600 focus:ring-blue-500/20"
                  />
                  <span className="text-xs font-medium text-slate-300 select-none">
                    Status Aktif (Tersedia untuk dipesan pelanggan di aplikasi)
                  </span>
                </label>
              </div>

              {/* Modal Buttons */}
              <div className="pt-4 flex items-center justify-end gap-2 border-t border-[#1f2125]">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-[#222428] text-[#8b8f97] hover:text-white hover:bg-[#1c1d22] text-xs sm:text-sm font-semibold transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold shadow-md shadow-blue-600/20 transition-all disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <span>Simpan Layanan</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ====================================================================== */}
      {/* MODAL: EDIT LAYANAN */}
      {/* ====================================================================== */}
      {isEditOpen && activeService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-[#131416] rounded-3xl border border-[#1f2125] shadow-2xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-200 text-white">
            <div className="px-6 py-4 border-b border-[#1f2125] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Edit Layanan Perbaikan</h3>
                  <p className="text-[11px] text-[#6c727e]">ID #{activeService.id}</p>
                </div>
              </div>
              <button
                onClick={() => setIsEditOpen(false)}
                className="p-1 rounded-lg text-[#8b8f97] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-6 space-y-4 max-h-[85vh] overflow-y-auto">
              {/* Kategori Peralatan */}
              <div>
                <label className="block text-xs font-semibold text-[#8b8f97] mb-1">
                  Kategori Peralatan <span className="text-rose-400">*</span>
                </label>
                <select
                  required
                  value={formData.category_id}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, category_id: parseInt(e.target.value, 10) }))
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#222428] bg-[#16171a] text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/60 transition-all"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id} className="bg-[#16171a] text-white">
                      {c.name}
                    </option>
                  ))}
                </select>
                {formErrors.category_id && (
                  <p className="text-xs text-rose-400 mt-1">{formErrors.category_id}</p>
                )}
              </div>

              {/* Nama Layanan */}
              <div>
                <label className="block text-xs font-semibold text-[#8b8f97] mb-1">
                  Nama Layanan Perbaikan <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#222428] bg-[#16171a] text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/60 transition-all"
                />
                {formErrors.name && (
                  <p className="text-xs text-rose-400 mt-1">{formErrors.name}</p>
                )}
              </div>

              {/* Slug Identifier */}
              <div>
                <label className="block text-xs font-semibold text-[#8b8f97] mb-1">
                  Slug / URL Identifier <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.slug}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, slug: e.target.value.toLowerCase().trim() }))
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#222428] bg-[#16171a] font-mono text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/60 transition-all"
                />
                {formErrors.slug && (
                  <p className="text-xs text-rose-400 mt-1">{formErrors.slug}</p>
                )}
              </div>

              {/* Tarif Dasar & Durasi */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Tarif Dasar */}
                <div>
                  <label className="block text-xs font-semibold text-[#8b8f97] mb-1">
                    Tarif Dasar (Rp) <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[#6c727e]">
                      Rp
                    </span>
                    <input
                      type="number"
                      required
                      min={0}
                      step={5000}
                      value={formData.base_price}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          base_price: parseFloat(e.target.value) || 0,
                        }))
                      }
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-[#222428] bg-[#16171a] text-sm font-mono text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/60 transition-all"
                    />
                  </div>
                  {formErrors.base_price && (
                    <p className="text-xs text-rose-400 mt-1">{formErrors.base_price}</p>
                  )}
                </div>

                {/* Estimasi Durasi */}
                <div>
                  <label className="block text-xs font-semibold text-[#8b8f97] mb-1">
                    Estimasi Durasi (Menit) <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <Clock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#6c727e]" />
                    <input
                      type="number"
                      required
                      min={1}
                      max={1440}
                      step={5}
                      value={formData.estimated_duration_min}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          estimated_duration_min: parseInt(e.target.value, 10) || 60,
                        }))
                      }
                      className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-[#222428] bg-[#16171a] text-sm font-mono text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/60 transition-all"
                    />
                  </div>
                  {formErrors.estimated_duration_min && (
                    <p className="text-xs text-rose-400 mt-1">
                      {formErrors.estimated_duration_min}
                    </p>
                  )}
                </div>
              </div>

              {/* Deskripsi */}
              <div>
                <label className="block text-xs font-semibold text-[#8b8f97] mb-1">
                  Deskripsi Layanan
                </label>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, description: e.target.value }))
                  }
                  className="w-full px-3.5 py-2 rounded-xl border border-[#222428] bg-[#16171a] text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/60 transition-all resize-none"
                />
              </div>

              {/* Status Aktif */}
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, is_active: e.target.checked }))
                    }
                    className="w-4 h-4 rounded border-[#2f333a] bg-[#1c1d22] text-blue-600 focus:ring-blue-500/20"
                  />
                  <span className="text-xs font-medium text-slate-300 select-none">
                    Status Aktif (Tersedia untuk pesanan baru)
                  </span>
                </label>
              </div>

              {/* Modal Buttons */}
              <div className="pt-4 flex items-center justify-end gap-2 border-t border-[#1f2125]">
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-[#222428] text-[#8b8f97] hover:text-white hover:bg-[#1c1d22] text-xs sm:text-sm font-semibold transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold shadow-md shadow-blue-600/20 transition-all disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <span>Perbarui Layanan</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ====================================================================== */}
      {/* MODAL: DETAIL LAYANAN */}
      {/* ====================================================================== */}
      {isDetailOpen && activeService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-[#131416] rounded-3xl border border-[#1f2125] shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200 text-white">
            <div className="px-6 py-4 border-b border-[#1f2125] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
                  <Info className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-white text-base">Detail Layanan Perbaikan</h3>
              </div>
              <button
                onClick={() => setIsDetailOpen(false)}
                className="p-1 rounded-lg text-[#8b8f97] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs sm:text-sm">
              <div className="flex items-center justify-between pb-3 border-b border-[#1f2125]">
                <span className="text-[#8b8f97]">ID Layanan</span>
                <span className="font-mono font-bold text-white">#{activeService.id}</span>
              </div>
              <div>
                <span className="text-[#8b8f97] block mb-0.5">Nama Layanan</span>
                <p className="font-bold text-white text-base">{activeService.name}</p>
              </div>
              <div>
                <span className="text-[#8b8f97] block mb-0.5">Kategori Peralatan</span>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-semibold">
                  <Layers className="w-3.5 h-3.5" />
                  <span>{activeService.category_name}</span>
                </div>
              </div>
              <div>
                <span className="text-[#8b8f97] block mb-0.5">Slug URL</span>
                <span className="font-mono px-2 py-0.5 rounded bg-[#16171a] border border-[#222428] text-slate-300 text-xs">
                  {activeService.slug}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="p-3 rounded-xl bg-[#16171a] border border-[#222428]">
                  <div className="flex items-center gap-1.5 text-[#8b8f97] text-xs mb-0.5">
                    <Coins className="w-3.5 h-3.5 text-blue-400" />
                    <span>Tarif Dasar</span>
                  </div>
                  <p className="font-bold text-white text-base font-mono">
                    {formatRupiah(activeService.base_price)}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-[#16171a] border border-[#222428]">
                  <div className="flex items-center gap-1.5 text-[#8b8f97] text-xs mb-0.5">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    <span>Estimasi Durasi</span>
                  </div>
                  <p className="font-bold text-white text-base">
                    {activeService.estimated_duration_min} Menit
                  </p>
                </div>
              </div>
              <div>
                <span className="text-[#8b8f97] block mb-0.5">Deskripsi</span>
                <p className="text-slate-200 leading-relaxed bg-[#16171a] p-3 rounded-xl border border-[#222428]">
                  {activeService.description || 'Tidak ada deskripsi'}
                </p>
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-[#8b8f97]">Pesanan Terkait</span>
                <span className="font-bold text-white">
                  {activeService.repair_count} transaksi
                </span>
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-[#8b8f97]">Status Operasional</span>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    activeService.is_active
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                  }`}
                >
                  {activeService.is_active ? 'Aktif' : 'Non-aktif'}
                </span>
              </div>
              <div className="pt-2 text-[11px] text-[#6c727e]">
                Dibuat pada: {new Date(activeService.created_at).toLocaleString('id-ID')}
              </div>
            </div>

            <div className="p-4 bg-[#16171a] border-t border-[#1f2125] flex justify-end">
              <button
                onClick={() => setIsDetailOpen(false)}
                className="px-4 py-2 rounded-xl bg-[#1c1d22] border border-[#27292f] hover:bg-[#252830] text-white font-medium text-xs transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================== */}
      {/* MODAL: KONFIRMASI HAPUS / NONAKTIFKAN */}
      {/* ====================================================================== */}
      {deleteConfirm.isOpen && deleteConfirm.service && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-[#131416] rounded-3xl border border-[#1f2125] shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200 text-white">
            <div className="p-6">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mb-4">
                <AlertTriangle className="w-6 h-6" />
              </div>

              <h3 className="font-bold text-white text-base sm:text-lg mb-1">
                {deleteConfirm.inUse
                  ? 'Layanan Masih Digunakan'
                  : 'Konfirmasi Hapus Layanan'}
              </h3>

              <p className="text-xs sm:text-sm text-[#8b8f97] mb-4 leading-relaxed">
                {deleteConfirm.inUse
                  ? deleteConfirm.warningMessage
                  : `Apakah Anda yakin ingin menghapus layanan "${deleteConfirm.service.name}" secara permanen dari basis data? Tindakan ini tidak dapat dibatalkan.`}
              </p>

              {deleteConfirm.inUse ? (
                <div className="space-y-2">
                  <button
                    onClick={() => confirmDeleteOrDeactivate('deactivate')}
                    disabled={isSubmitting}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm font-semibold shadow-md shadow-amber-600/20 transition-all disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <span>Nonaktifkan Layanan Saja (Direkomendasikan)</span>
                    )}
                  </button>
                  <button
                    onClick={() =>
                      setDeleteConfirm({
                        isOpen: false,
                        service: null,
                        inUse: false,
                        warningMessage: null,
                      })
                    }
                    className="w-full px-4 py-2.5 rounded-xl border border-[#222428] text-[#8b8f97] hover:text-white hover:bg-[#1c1d22] text-xs sm:text-sm font-semibold transition-colors"
                  >
                    Batal
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() =>
                      setDeleteConfirm({
                        isOpen: false,
                        service: null,
                        inUse: false,
                        warningMessage: null,
                      })
                    }
                    className="px-4 py-2.5 rounded-xl border border-[#222428] text-[#8b8f97] hover:text-white hover:bg-[#1c1d22] text-xs sm:text-sm font-semibold transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    onClick={() => confirmDeleteOrDeactivate()}
                    disabled={isSubmitting}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs sm:text-sm font-semibold shadow-md shadow-rose-600/20 transition-all disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <span>Hapus Permanen</span>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
