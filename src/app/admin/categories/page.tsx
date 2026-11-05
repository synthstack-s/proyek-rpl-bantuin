'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Layers,
  Plus,
  Search,
  Edit2,
  Trash2,
  Eye,
  Power,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  X,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Wrench,
  Users,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { createCategorySchema, generateSlug } from '@/lib/validations/category';

interface Category {
  id: number;
  name: string;
  slug: string;
  icon_url: string | null;
  description: string | null;
  is_active: boolean;
  service_count: number;
  technician_count: number;
  created_at: string;
  updated_at: string;
}

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function CategoriesAdminPage() {
  // State Data
  const [categories, setCategories] = useState<Category[]>([]);
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
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // State Toast Notifikasi
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // State Modals
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<Category | null>(null);

  // State Konfirmasi Hapus / Nonaktifkan
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    category: Category | null;
    inUse: boolean;
    warningMessage: string | null;
  }>({
    isOpen: false,
    category: null,
    inUse: false,
    warningMessage: null,
  });

  // State Form Input
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    icon_url: '',
    description: '',
    is_active: true,
  });
  const [autoSlug, setAutoSlug] = useState(true);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  // 1. Fetch Data Kategori dari API
  const fetchCategories = useCallback(async (page = 1) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '10',
      });
      if (searchTerm.trim()) params.append('search', searchTerm.trim());
      if (statusFilter !== 'all') params.append('status', statusFilter);

      const res = await fetch(`/api/admin/categories?${params.toString()}`);
      const result = await res.json();

      if (!res.ok || !result.success) {
        throw new Error(result.message || 'Gagal mengambil data kategori');
      }

      setCategories(result.data || []);
      setPagination(result.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 });
    } catch (err: any) {
      setErrorMsg(err.message || 'Terjadi kesalahan saat memuat data');
    } finally {
      setIsLoading(false);
    }
  }, [searchTerm, statusFilter]);

  useEffect(() => {
    fetchCategories(1);
  }, [fetchCategories]);

  // Handler nama kategori berubah (auto-generate slug jika diaktifkan)
  const handleNameChange = (val: string) => {
    setFormData((prev) => ({
      ...prev,
      name: val,
      slug: autoSlug ? generateSlug(val) : prev.slug,
    }));
    if (formErrors.name) {
      setFormErrors((prev) => ({ ...prev, name: '' }));
    }
  };

  // Reset form saat modal dibuka
  const openAddModal = () => {
    setFormData({
      name: '',
      slug: '',
      icon_url: '',
      description: '',
      is_active: true,
    });
    setAutoSlug(true);
    setFormErrors({});
    setIsAddOpen(true);
  };

  const openEditModal = (cat: Category) => {
    setActiveCategory(cat);
    setFormData({
      name: cat.name,
      slug: cat.slug,
      icon_url: cat.icon_url || '',
      description: cat.description || '',
      is_active: cat.is_active,
    });
    setAutoSlug(false);
    setFormErrors({});
    setIsEditOpen(true);
  };

  const openDetailModal = (cat: Category) => {
    setActiveCategory(cat);
    setIsDetailOpen(true);
  };

  // 2. Submit Tambah Kategori
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors({});

    const validation = createCategorySchema.safeParse(formData);
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
      const res = await fetch('/api/admin/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validation.data),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        showToast('error', data.message || 'Gagal menambahkan kategori');
        setIsSubmitting(false);
        return;
      }

      showToast('success', data.message || 'Kategori berhasil ditambahkan');
      setIsAddOpen(false);
      fetchCategories(pagination.page);
    } catch {
      showToast('error', 'Terjadi kesalahan jaringan saat menambahkan kategori');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 3. Submit Update Kategori
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCategory) return;
    setFormErrors({});

    const validation = createCategorySchema.safeParse(formData);
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
      const res = await fetch(`/api/admin/categories/${activeCategory.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validation.data),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        showToast('error', data.message || 'Gagal memperbarui kategori');
        setIsSubmitting(false);
        return;
      }

      showToast('success', data.message || 'Kategori berhasil diperbarui');
      setIsEditOpen(false);
      fetchCategories(pagination.page);
    } catch {
      showToast('error', 'Terjadi kesalahan jaringan saat memperbarui kategori');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 4. Toggle Status Aktif/Nonaktif Cepat
  const handleToggleActive = async (cat: Category) => {
    try {
      const newStatus = !cat.is_active;
      const res = await fetch(`/api/admin/categories/${cat.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: newStatus }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        showToast('error', data.message || 'Gagal mengubah status kategori');
        return;
      }

      showToast(
        'success',
        `Kategori "${cat.name}" berhasil ${newStatus ? 'diaktifkan' : 'dinonaktifkan'}`
      );
      // Optimistic update
      setCategories((prev) =>
        prev.map((item) => (item.id === cat.id ? { ...item, is_active: newStatus } : item))
      );
    } catch {
      showToast('error', 'Terjadi kegagalan saat mengubah status');
    }
  };

  // 5. Permintaan Hapus Kategori
  const initiateDelete = (cat: Category) => {
    const inUse = cat.service_count > 0 || cat.technician_count > 0;
    const warningMessage = inUse
      ? `Kategori "${cat.name}" terhubung dengan ${cat.service_count} layanan dan ${cat.technician_count} teknisi. Menghapus kategori ini akan merusak integritas relasi data.`
      : null;

    setDeleteConfirm({
      isOpen: true,
      category: cat,
      inUse,
      warningMessage,
    });
  };

  // Eksekusi Hapus atau Nonaktifkan
  const confirmDeleteOrDeactivate = async (mode?: 'deactivate') => {
    const cat = deleteConfirm.category;
    if (!cat) return;

    setIsSubmitting(true);
    try {
      const url = mode === 'deactivate'
        ? `/api/admin/categories/${cat.id}?mode=deactivate`
        : `/api/admin/categories/${cat.id}`;

      const res = await fetch(url, { method: 'DELETE' });
      const data = await res.json();

      if (!res.ok || !data.success) {
        showToast('error', data.message || 'Gagal menghapus kategori');
        setDeleteConfirm({
          isOpen: true,
          category: cat,
          inUse: data.inUse || false,
          warningMessage: data.message,
        });
        setIsSubmitting(false);
        return;
      }

      showToast('success', data.message);
      setDeleteConfirm({ isOpen: false, category: null, inUse: false, warningMessage: null });
      fetchCategories(pagination.page);
    } catch {
      showToast('error', 'Terjadi kegagalan jaringan saat menghapus kategori');
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
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-[#FFFBF4] tracking-tight">
                Katalog Kategori Peralatan
              </h1>
              <p className="text-xs sm:text-sm text-[#D8CFBC]/70 mt-0.5">
                Kelola kategori master peralatan rumah tangga yang terdaftar di database BANTUIN
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={openAddModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#FFFBF4] hover:bg-[#D8CFBC] text-[#11120D] font-bold text-xs sm:text-sm shadow-md transition-all hover:scale-105 active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Kategori Baru</span>
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-[#181913]/90 p-4 rounded-2xl border border-[#D8CFBC]/15 shadow-sm backdrop-blur-xl flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8B8878]" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cari nama, slug, atau deskripsi..."
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

        {/* Filter Status Tabs */}
        <div className="flex items-center gap-2 self-start md:self-auto">
          <div className="flex rounded-xl bg-[#11120D] border border-[#D8CFBC]/20 p-1 text-xs font-medium text-[#D8CFBC]/70">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                statusFilter === 'all'
                  ? 'bg-[#1C1D17] text-[#FFFBF4] border border-[#D8CFBC]/30 shadow-xs font-semibold'
                  : 'hover:text-[#FFFBF4]'
              }`}
            >
              Semua
            </button>
            <button
              onClick={() => setStatusFilter('active')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                statusFilter === 'active'
                  ? 'bg-[#1C1D17] text-emerald-400 border border-[#D8CFBC]/30 shadow-xs font-semibold'
                  : 'hover:text-[#FFFBF4]'
              }`}
            >
              Aktif
            </button>
            <button
              onClick={() => setStatusFilter('inactive')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                statusFilter === 'inactive'
                  ? 'bg-[#1C1D17] text-[#D8CFBC] border border-[#D8CFBC]/30 shadow-xs font-semibold'
                  : 'hover:text-[#FFFBF4]'
              }`}
            >
              Non-aktif
            </button>
          </div>

          <button
            onClick={() => fetchCategories(pagination.page)}
            disabled={isLoading}
            title="Muat ulang data"
            className="p-2 rounded-xl border border-[#D8CFBC]/20 bg-[#11120D] hover:bg-[#1C1D17] text-[#D8CFBC] hover:text-[#FFFBF4] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-[#D8CFBC]' : ''}`} />
          </button>
        </div>
      </div>

      {/* Error Alert State */}
      {errorMsg && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-3 text-xs sm:text-sm text-rose-300">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-white">Gagal memuat kategori</p>
            <p className="text-xs text-rose-300 mt-0.5">{errorMsg}</p>
          </div>
          <button
            onClick={() => fetchCategories(1)}
            className="px-3 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-xs font-medium transition-colors"
          >
            Coba Lagi
          </button>
        </div>
      )}

      {/* Categories Table View */}
      <div className="bg-[#181913]/90 rounded-2xl border border-[#D8CFBC]/15 shadow-sm backdrop-blur-xl overflow-hidden">
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center text-[#D8CFBC]/70 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-[#D8CFBC]" />
            <p className="text-xs sm:text-sm font-medium">Memuat data dari MySQL bantuin_db...</p>
          </div>
        ) : categories.length === 0 ? (
          <div className="py-16 px-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-[#141510] border border-[#D8CFBC]/20 flex items-center justify-center mx-auto text-[#D8CFBC] mb-3">
              <Layers className="w-6 h-6" />
            </div>
            <h3 className="text-sm sm:text-base font-semibold text-[#FFFBF4]">
              {searchTerm || statusFilter !== 'all'
                ? 'Tidak ada kategori yang cocok dengan filter'
                : 'Belum ada data kategori peralatan'}
            </h3>
            <p className="text-xs text-[#D8CFBC]/70 mt-1 max-w-sm mx-auto">
              {searchTerm || statusFilter !== 'all'
                ? 'Coba sesuaikan kata kunci pencarian atau filter status untuk menemukan kategori.'
                : 'Mulai dengan menambahkan kategori peralatan elektronik pertama Anda ke dalam sistem.'}
            </p>
            {(searchTerm || statusFilter !== 'all') && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setStatusFilter('all');
                }}
                className="mt-4 px-3.5 py-1.5 rounded-xl bg-[#11120D] hover:bg-[#1C1D17] border border-[#D8CFBC]/20 text-xs font-semibold text-[#FFFBF4] transition-colors"
              >
                Reset Filter
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-[#D8CFBC]/15 bg-[#141510] text-[#D8CFBC] font-bold text-[11px] uppercase tracking-wider">
                  <th className="py-3 px-4 w-12 text-center">ID</th>
                  <th className="py-3 px-4">Kategori Peralatan</th>
                  <th className="py-3 px-4 hidden md:table-cell">Slug / Identifier</th>
                  <th className="py-3 px-4 text-center">Terkait Layanan</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D8CFBC]/10">
                {categories.map((cat) => (
                  <tr
                    key={cat.id}
                    className="hover:bg-[#1F2019]/60 transition-colors group"
                  >
                    {/* ID */}
                    <td className="py-3.5 px-4 text-center font-mono text-[#8B8878] text-xs">
                      #{cat.id}
                    </td>

                    {/* Name & Description */}
                    <td className="py-3.5 px-4 max-w-xs sm:max-w-md">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-[#141510] border border-[#D8CFBC]/20 text-[#D8CFBC] flex items-center justify-center shrink-0 font-bold text-xs">
                          {cat.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="truncate">
                          <p className="font-semibold text-[#FFFBF4] group-hover:text-[#D8CFBC] transition-colors truncate">
                            {cat.name}
                          </p>
                          <p className="text-[11px] text-[#D8CFBC]/70 truncate max-w-xs">
                            {cat.description || 'Tidak ada deskripsi'}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Slug */}
                    <td className="py-3.5 px-4 hidden md:table-cell font-mono text-[11px] text-[#D8CFBC]">
                      <span className="px-2 py-0.5 rounded-md bg-[#11120D] border border-[#D8CFBC]/20">
                        {cat.slug}
                      </span>
                    </td>

                    {/* Relational Count */}
                    <td className="py-3.5 px-4 text-center">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#11120D] border border-[#D8CFBC]/20 text-[#D8CFBC]">
                        <Wrench className="w-3 h-3 text-[#8B8878]" />
                        <span>{cat.service_count} Layanan</span>
                      </div>
                    </td>

                    {/* Status Badge */}
                    <td className="py-3.5 px-4 text-center">
                      <button
                        onClick={() => handleToggleActive(cat)}
                        title="Klik untuk mengubah status aktif"
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold transition-all hover:scale-105 ${
                          cat.is_active
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : 'bg-[#11120D] text-[#8B8878] border border-[#D8CFBC]/20'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            cat.is_active ? 'bg-emerald-400' : 'bg-[#8B8878]'
                          }`}
                        />
                        <span>{cat.is_active ? 'Aktif' : 'Non-aktif'}</span>
                      </button>
                    </td>

                    {/* Action Buttons */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openDetailModal(cat)}
                          title="Lihat Detail"
                          className="p-1.5 rounded-lg text-[#D8CFBC]/70 hover:text-[#FFFBF4] hover:bg-[#1C1D17] transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openEditModal(cat)}
                          title="Edit Kategori"
                          className="p-1.5 rounded-lg text-[#D8CFBC]/70 hover:text-[#FFFBF4] hover:bg-[#1C1D17] transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => initiateDelete(cat)}
                          title="Hapus / Nonaktifkan"
                          className="p-1.5 rounded-lg text-rose-400/80 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
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
        {!isLoading && categories.length > 0 && (
          <div className="px-4 py-3 border-t border-[#D8CFBC]/15 bg-[#141510]/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#D8CFBC]/70">
            <div>
              Menampilkan{' '}
              <span className="font-semibold text-[#FFFBF4]">
                {(pagination.page - 1) * pagination.limit + 1}
              </span>{' '}
              -{' '}
              <span className="font-semibold text-[#FFFBF4]">
                {Math.min(pagination.page * pagination.limit, pagination.total)}
              </span>{' '}
              dari <span className="font-semibold text-[#FFFBF4]">{pagination.total}</span> kategori
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => fetchCategories(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#D8CFBC]/20 bg-[#11120D] hover:bg-[#1C1D17] text-[#D8CFBC] hover:text-[#FFFBF4] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Sebelumnya</span>
              </button>
              <span className="px-2 font-medium text-[#FFFBF4]">
                {pagination.page} / {pagination.totalPages}
              </span>
              <button
                onClick={() => fetchCategories(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#D8CFBC]/20 bg-[#11120D] hover:bg-[#1C1D17] text-[#D8CFBC] hover:text-[#FFFBF4] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <span>Berikutnya</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ====================================================================== */}
      {/* MODAL: TAMBAH KATEGORI BARU */}
      {/* ====================================================================== */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#11120D]/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-[#141510]/95 rounded-3xl border border-[#D8CFBC]/25 shadow-2xl max-w-lg w-full overflow-hidden backdrop-blur-2xl animate-in zoom-in-95 duration-200 text-[#FFFBF4]">
            <div className="px-6 py-4.5 border-b border-[#D8CFBC]/15 bg-[#181913]/60 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-[#D8CFBC]/10 border border-[#D8CFBC]/20 text-[#D8CFBC]">
                  <Plus className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-[#FFFBF4] text-base">Tambah Kategori Baru</h3>
              </div>
              <button
                onClick={() => setIsAddOpen(false)}
                className="p-1.5 rounded-xl text-[#8B8878] hover:text-[#FFFBF4] hover:bg-[#D8CFBC]/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="p-6 space-y-4">
              {/* Nama Kategori */}
              <div>
                <label className="block text-xs font-semibold text-[#D8CFBC] mb-1">
                  Nama Kategori Peralatan <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="Contoh: Kipas Angin & Exhaust"
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-sm text-[#FFFBF4] placeholder-[#8B8878] bg-[#11120D] focus:outline-none transition-all ${
                    formErrors.name
                      ? 'border-rose-500/50 focus:border-rose-500'
                      : 'border-[#D8CFBC]/20 focus:border-[#D8CFBC]'
                  }`}
                />
                {formErrors.name && (
                  <p className="text-xs text-rose-400 mt-1">{formErrors.name}</p>
                )}
              </div>

              {/* Slug Identifier */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-[#D8CFBC]">
                    Slug / URL Identifier
                  </label>
                  <label className="text-[11px] text-[#8B8878] flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoSlug}
                      onChange={(e) => {
                        setAutoSlug(e.target.checked);
                        if (e.target.checked) {
                          setFormData((prev) => ({ ...prev, slug: generateSlug(prev.name) }));
                        }
                      }}
                      className="rounded border-[#D8CFBC]/30 bg-[#11120D] text-[#D8CFBC] accent-[#D8CFBC] text-xs"
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
                  placeholder="kipas-angin-exhaust"
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-sm font-mono text-[#FFFBF4] placeholder-[#8B8878] focus:outline-none transition-all ${
                    autoSlug ? 'bg-[#181913] text-[#8B8878] cursor-not-allowed border-[#D8CFBC]/10' : 'bg-[#11120D] border-[#D8CFBC]/20 focus:border-[#D8CFBC]'
                  } ${
                    formErrors.slug
                      ? 'border-rose-500/50 focus:border-rose-500'
                      : ''
                  }`}
                />
                {formErrors.slug && (
                  <p className="text-xs text-rose-400 mt-1">{formErrors.slug}</p>
                )}
              </div>

              {/* Icon URL */}
              <div>
                <label className="block text-xs font-semibold text-[#D8CFBC] mb-1">
                  Icon URL / Path <span className="text-[#8B8878] font-normal">(Opsional)</span>
                </label>
                <input
                  type="text"
                  value={formData.icon_url}
                  onChange={(e) => setFormData((prev) => ({ ...prev, icon_url: e.target.value }))}
                  placeholder="/icons/categories/fan.svg"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#D8CFBC]/20 bg-[#11120D] text-sm text-[#FFFBF4] placeholder-[#8B8878] focus:outline-none focus:border-[#D8CFBC] transition-all"
                />
              </div>

              {/* Deskripsi */}
              <div>
                <label className="block text-xs font-semibold text-[#D8CFBC] mb-1">
                  Deskripsi Kategori <span className="text-[#8B8878] font-normal">(Opsional)</span>
                </label>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Tuliskan cakupan peralatan yang termasuk dalam kategori ini..."
                  className="w-full px-3.5 py-2 rounded-xl border border-[#D8CFBC]/20 bg-[#11120D] text-sm text-[#FFFBF4] placeholder-[#8B8878] focus:outline-none focus:border-[#D8CFBC] transition-all resize-none"
                />
              </div>

              {/* Status Aktif */}
              <div className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData((prev) => ({ ...prev, is_active: e.target.checked }))}
                    className="w-4 h-4 rounded border-[#D8CFBC]/30 bg-[#11120D] text-[#D8CFBC] accent-[#D8CFBC]"
                  />
                  <span className="text-xs font-medium text-[#D8CFBC] select-none">
                    Status Aktif (Tampilkan langsung di aplikasi pelanggan)
                  </span>
                </label>
              </div>

              {/* Modal Buttons */}
              <div className="pt-4 flex items-center justify-end gap-2.5 border-t border-[#D8CFBC]/15">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-[#D8CFBC]/20 bg-[#11120D] text-[#D8CFBC] hover:text-[#FFFBF4] hover:bg-[#1C1D17] text-xs sm:text-sm font-semibold transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#FFFBF4] hover:bg-[#D8CFBC] text-[#11120D] text-xs sm:text-sm font-bold shadow-md transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <span>Simpan Kategori</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ====================================================================== */}
      {/* MODAL: EDIT KATEGORI */}
      {/* ====================================================================== */}
      {isEditOpen && activeCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#11120D]/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-[#141510]/95 rounded-3xl border border-[#D8CFBC]/25 shadow-2xl max-w-lg w-full overflow-hidden backdrop-blur-2xl animate-in zoom-in-95 duration-200 text-[#FFFBF4]">
            <div className="px-6 py-4.5 border-b border-[#D8CFBC]/15 bg-[#181913]/60 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-[#FFFBF4] text-base">Edit Kategori Peralatan</h3>
                  <p className="text-[11px] text-[#8B8878]">ID #{activeCategory.id}</p>
                </div>
              </div>
              <button
                onClick={() => setIsEditOpen(false)}
                className="p-1.5 rounded-xl text-[#8B8878] hover:text-[#FFFBF4] hover:bg-[#D8CFBC]/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
              {/* Nama Kategori */}
              <div>
                <label className="block text-xs font-semibold text-[#D8CFBC] mb-1">
                  Nama Kategori Peralatan <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#D8CFBC]/20 bg-[#11120D] text-sm text-[#FFFBF4] focus:outline-none focus:border-[#D8CFBC] transition-all"
                />
                {formErrors.name && (
                  <p className="text-xs text-rose-400 mt-1">{formErrors.name}</p>
                )}
              </div>

              {/* Slug Identifier */}
              <div>
                <label className="block text-xs font-semibold text-[#D8CFBC] mb-1">
                  Slug / URL Identifier <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.slug}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, slug: e.target.value.toLowerCase().trim() }))
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#D8CFBC]/20 bg-[#11120D] font-mono text-sm text-[#FFFBF4] focus:outline-none focus:border-[#D8CFBC] transition-all"
                />
                {formErrors.slug && (
                  <p className="text-xs text-rose-400 mt-1">{formErrors.slug}</p>
                )}
              </div>

              {/* Icon URL */}
              <div>
                <label className="block text-xs font-semibold text-[#D8CFBC] mb-1">
                  Icon URL / Path
                </label>
                <input
                  type="text"
                  value={formData.icon_url}
                  onChange={(e) => setFormData((prev) => ({ ...prev, icon_url: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#D8CFBC]/20 bg-[#11120D] text-sm text-[#FFFBF4] focus:outline-none focus:border-[#D8CFBC] transition-all"
                />
              </div>

              {/* Deskripsi */}
              <div>
                <label className="block text-xs font-semibold text-[#D8CFBC] mb-1">
                  Deskripsi Kategori
                </label>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3.5 py-2 rounded-xl border border-[#D8CFBC]/20 bg-[#11120D] text-sm text-[#FFFBF4] focus:outline-none focus:border-[#D8CFBC] transition-all resize-none"
                />
              </div>

              {/* Status Aktif */}
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData((prev) => ({ ...prev, is_active: e.target.checked }))}
                    className="w-4 h-4 rounded border-[#D8CFBC]/30 bg-[#11120D] text-[#D8CFBC] accent-[#D8CFBC]"
                  />
                  <span className="text-xs font-medium text-[#D8CFBC] select-none">
                    Status Aktif (Tersedia untuk pesanan baru)
                  </span>
                </label>
              </div>

              {/* Modal Buttons */}
              <div className="pt-4 flex items-center justify-end gap-2.5 border-t border-[#D8CFBC]/15">
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-[#D8CFBC]/20 bg-[#11120D] text-[#D8CFBC] hover:text-[#FFFBF4] hover:bg-[#1C1D17] text-xs sm:text-sm font-semibold transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#FFFBF4] hover:bg-[#D8CFBC] text-[#11120D] text-xs sm:text-sm font-bold shadow-md transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <span>Perbarui Kategori</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ====================================================================== */}
      {/* MODAL: DETAIL KATEGORI */}
      {/* ====================================================================== */}
      {isDetailOpen && activeCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#11120D]/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-[#141510]/95 rounded-3xl border border-[#D8CFBC]/25 shadow-2xl max-w-md w-full overflow-hidden backdrop-blur-2xl animate-in zoom-in-95 duration-200 text-[#FFFBF4]">
            <div className="px-6 py-4.5 border-b border-[#D8CFBC]/15 bg-[#181913]/60 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-[#D8CFBC]/10 border border-[#D8CFBC]/20 text-[#D8CFBC]">
                  <Info className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-[#FFFBF4] text-base">Detail Kategori Peralatan</h3>
              </div>
              <button
                onClick={() => setIsDetailOpen(false)}
                className="p-1.5 rounded-xl text-[#8B8878] hover:text-[#FFFBF4] hover:bg-[#D8CFBC]/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs sm:text-sm">
              <div className="flex items-center justify-between pb-3 border-b border-[#D8CFBC]/15">
                <span className="text-[#D8CFBC]/70">ID Record</span>
                <span className="font-mono font-bold text-[#FFFBF4]">#{activeCategory.id}</span>
              </div>
              <div>
                <span className="text-[#D8CFBC]/70 block mb-0.5">Nama Kategori</span>
                <p className="font-bold text-[#FFFBF4] text-base">{activeCategory.name}</p>
              </div>
              <div>
                <span className="text-[#D8CFBC]/70 block mb-0.5">Slug URL</span>
                <span className="font-mono px-2 py-0.5 rounded bg-[#11120D] border border-[#D8CFBC]/20 text-[#D8CFBC] text-xs">
                  {activeCategory.slug}
                </span>
              </div>
              <div>
                <span className="text-[#D8CFBC]/70 block mb-0.5">Deskripsi</span>
                <p className="text-[#FFFBF4] leading-relaxed bg-[#11120D] p-3 rounded-xl border border-[#D8CFBC]/20">
                  {activeCategory.description || 'Tidak ada deskripsi'}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="p-3 rounded-xl bg-[#11120D] border border-[#D8CFBC]/20">
                  <span className="text-[#D8CFBC]/70 block text-xs">Layanan Terkait</span>
                  <p className="font-bold text-[#FFFBF4] text-base mt-0.5">
                    {activeCategory.service_count}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-[#11120D] border border-[#D8CFBC]/20">
                  <span className="text-[#D8CFBC]/70 block text-xs">Teknisi Terspesialisasi</span>
                  <p className="font-bold text-[#FFFBF4] text-base mt-0.5">
                    {activeCategory.technician_count}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between pt-2">
                <span className="text-[#D8CFBC]/70">Status Operasional</span>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    activeCategory.is_active
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : 'bg-[#11120D] text-[#8B8878] border border-[#D8CFBC]/20'
                  }`}
                >
                  {activeCategory.is_active ? 'Aktif' : 'Non-aktif'}
                </span>
              </div>
              <div className="pt-2 text-[11px] text-[#8B8878]">
                Dibuat pada: {new Date(activeCategory.created_at).toLocaleString('id-ID')}
              </div>
            </div>

            <div className="p-4 bg-[#181913]/60 border-t border-[#D8CFBC]/15 flex justify-end">
              <button
                onClick={() => setIsDetailOpen(false)}
                className="px-4 py-2 rounded-xl bg-[#11120D] border border-[#D8CFBC]/20 hover:bg-[#1C1D17] text-[#D8CFBC] hover:text-[#FFFBF4] font-semibold text-xs transition-colors"
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
      {deleteConfirm.isOpen && deleteConfirm.category && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#11120D]/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-[#141510]/95 rounded-3xl border border-[#D8CFBC]/25 shadow-2xl max-w-md w-full overflow-hidden backdrop-blur-2xl animate-in zoom-in-95 duration-200 text-[#FFFBF4]">
            <div className="p-6">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mb-4">
                <AlertTriangle className="w-6 h-6" />
              </div>

              <h3 className="font-bold text-[#FFFBF4] text-base sm:text-lg mb-1">
                {deleteConfirm.inUse
                  ? 'Kategori Masih Digunakan'
                  : 'Konfirmasi Hapus Kategori'}
              </h3>

              <p className="text-xs sm:text-sm text-[#D8CFBC]/70 mb-4 leading-relaxed">
                {deleteConfirm.inUse
                  ? deleteConfirm.warningMessage
                  : `Apakah Anda yakin ingin menghapus kategori "${deleteConfirm.category.name}" secara permanen dari basis data? Tindakan ini tidak dapat dibatalkan.`}
              </p>

              {deleteConfirm.inUse && (
                <div className="p-3 mb-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-start gap-2">
                  <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    Untuk menjaga konsistensi database relational (Foreign Key), kategori ini disarankan dinonaktifkan alih-alih dihapus.
                  </span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() =>
                    setDeleteConfirm({ isOpen: false, category: null, inUse: false, warningMessage: null })
                  }
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-[#D8CFBC]/20 bg-[#11120D] text-[#D8CFBC] hover:text-[#FFFBF4] hover:bg-[#1C1D17] text-xs sm:text-sm font-semibold transition-colors"
                >
                  Batal
                </button>

                {deleteConfirm.inUse ? (
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => confirmDeleteOrDeactivate('deactivate')}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm font-bold shadow-md transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Power className="w-4 h-4" />
                    )}
                    <span>Nonaktifkan Kategori</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => confirmDeleteOrDeactivate()}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs sm:text-sm font-bold shadow-md transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                    <span>Hapus Permanen</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
