'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  FileCheck2,
  Search,
  Eye,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  ShieldCheck,
  ShieldAlert,
  Shield,
  Layers,
  Award,
  Calendar,
  Building2,
  Phone,
  Mail,
  User,
  Star,
  RefreshCw,
  AlertCircle,
  X,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Trash2,
  FileText,
  Check,
  Ban,
  Activity,
  Info,
} from 'lucide-react';

interface SpecializationItem {
  id?: number;
  category_id: number;
  category_name: string;
  category_slug?: string;
  category_icon_url?: string | null;
  supporting_document_id?: number | null;
  supporting_document_title?: string | null;
  created_at?: string;
}

interface DocumentItem {
  id: number;
  technician_profile_id: number;
  document_type: string;
  document_title: string;
  file_name: string;
  file_path: string;
  file_size_bytes: number | null;
  file_mime_type: string | null;
  issuing_organization: string | null;
  document_number: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  verification_status: 'pending' | 'approved' | 'rejected' | 'revision_required';
  admin_notes: string | null;
  verified_by_admin_id: number | null;
  verified_at: string | null;
  verifier_email?: string | null;
  created_at: string;
}

interface TechnicianItem {
  id: number; // technician_profile_id
  user_id: number;
  user_uuid: string;
  email: string;
  phone_number: string;
  account_status: 'active' | 'inactive' | 'suspended' | 'pending_verification';
  is_verified: boolean;
  full_name: string;
  avatar_url: string | null;
  bio: string | null;
  years_of_experience: number;
  rating_avg: number;
  rating_count: number;
  is_available: boolean;
  verified_status: 'pending' | 'verified' | 'rejected' | 'suspended';
  rejection_reason: string | null;
  verified_by_admin_id: number | null;
  verified_at: string | null;
  current_latitude: number | null;
  current_longitude: number | null;
  created_at: string;
  updated_at: string;
  total_documents: number;
  approved_documents: number;
  pending_documents: number;
  specializations: SpecializationItem[];
  total_assignments: number;
}

interface TechnicianDetailData extends TechnicianItem {
  user_created_at: string;
  verifier_email: string | null;
  documents: DocumentItem[];
  stats: {
    total_assignments: number;
    completed_assignments: number;
    active_assignments: number;
    rejected_assignments: number;
  };
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

export default function TechniciansAdminPage() {
  // State Utama Data Teknisi
  const [technicians, setTechnicians] = useState<TechnicianItem[]>([]);
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
  const [verifiedStatusFilter, setVerifiedStatusFilter] = useState<string>('all');
  const [accountStatusFilter, setAccountStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // State Toast Notifikasi
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // State Modal Detail
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedTech, setSelectedTech] = useState<TechnicianDetailData | null>(null);
  const [activeTab, setActiveTab] = useState<'profile' | 'documents' | 'specializations' | 'actions'>('profile');

  // State Aksi Modal Penolakan / Catatan
  const [rejectionModal, setRejectionModal] = useState<{
    isOpen: boolean;
    type: 'technician' | 'document';
    targetId: number;
    targetTitle: string;
    action: 'reject' | 'revision';
    reason: string;
  }>({
    isOpen: false,
    type: 'technician',
    targetId: 0,
    targetTitle: '',
    action: 'reject',
    reason: '',
  });

  // State Modal Tambah Spesialisasi
  const [isAddSpecOpen, setIsAddSpecOpen] = useState(false);
  const [newSpecCategoryId, setNewSpecCategoryId] = useState<number>(0);
  const [newSpecDocId, setNewSpecDocId] = useState<number | null>(null);

  // State Submitting
  const [isSubmitting, setIsSubmitting] = useState(false);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  // 1. Fetch Opsi Kategori untuk Filter & Tambah Spesialisasi
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
      // Abaikan bila gagal mengambil opsi kategori
    }
  }, []);

  // 2. Fetch Daftar Teknisi dengan Filter & Pagination
  const fetchTechnicians = useCallback(async (page = 1) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '10',
      });
      if (searchTerm.trim()) params.append('search', searchTerm.trim());
      if (verifiedStatusFilter !== 'all') params.append('verified_status', verifiedStatusFilter);
      if (accountStatusFilter !== 'all') params.append('status', accountStatusFilter);
      if (categoryFilter !== 'all') params.append('category_id', categoryFilter);

      const res = await fetch(`/api/admin/technicians?${params.toString()}`);
      const result = await res.json();

      if (!res.ok || !result.success) {
        throw new Error(result.message || 'Gagal memuat data daftar teknisi');
      }

      setTechnicians(result.data || []);
      setPagination(result.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 });
    } catch (err: any) {
      setErrorMsg(err.message || 'Terjadi kesalahan saat memuat data teknisi');
    } finally {
      setIsLoading(false);
    }
  }, [searchTerm, verifiedStatusFilter, accountStatusFilter, categoryFilter]);

  useEffect(() => {
    fetchCategoryOptions();
  }, [fetchCategoryOptions]);

  useEffect(() => {
    fetchTechnicians(1);
  }, [fetchTechnicians]);

  // 3. Fetch Detail Lengkap Satu Teknisi
  const openDetailModal = async (techId: number, initialTab: 'profile' | 'documents' | 'specializations' | 'actions' = 'profile') => {
    setIsDetailOpen(true);
    setDetailLoading(true);
    setActiveTab(initialTab);
    try {
      const res = await fetch(`/api/admin/technicians/${techId}`);
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.message || 'Gagal mengambil detail teknisi');
      }
      setSelectedTech(result.data);
    } catch (err: any) {
      showToast('error', err.message || 'Gagal memuat detail teknisi');
      setIsDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  // 4. Update Status Verifikasi Teknisi (Setujui / Tolak / Suspend)
  const handleUpdateTechnicianStatus = async (
    techId: number,
    verifiedStatus: 'verified' | 'rejected' | 'suspended' | 'pending',
    rejectionReason?: string
  ) => {
    setIsSubmitting(true);
    try {
      const payload: any = { verified_status: verifiedStatus };
      if (rejectionReason) {
        payload.rejection_reason = rejectionReason;
      }

      const res = await fetch(`/api/admin/technicians/${techId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.message || 'Gagal memperbarui status verifikasi teknisi');
      }

      showToast('success', result.message || 'Status teknisi berhasil diperbarui');
      // Refresh data
      fetchTechnicians(pagination.page);
      if (selectedTech && selectedTech.id === techId) {
        openDetailModal(techId, activeTab);
      }
      setRejectionModal({ isOpen: false, type: 'technician', targetId: 0, targetTitle: '', action: 'reject', reason: '' });
    } catch (err: any) {
      showToast('error', err.message || 'Gagal memproses pembaruan teknisi');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 5. Update Status Akun Pengguna (Aktif / Suspend / Nonaktif)
  const handleUpdateAccountStatus = async (
    techId: number,
    accountStatus: 'active' | 'suspended' | 'inactive' | 'pending_verification'
  ) => {
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/admin/technicians/${techId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_status: accountStatus }),
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.message || 'Gagal mengubah status akun');
      }

      showToast('success', 'Status akun pengguna berhasil diperbarui');
      fetchTechnicians(pagination.page);
      if (selectedTech && selectedTech.id === techId) {
        openDetailModal(techId, activeTab);
      }
    } catch (err: any) {
      showToast('error', err.message || 'Gagal mengubah status akun');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 6. Update Status Verifikasi Dokumen
  const handleVerifyDocument = async (
    techId: number,
    docId: number,
    status: 'approved' | 'rejected' | 'revision_required' | 'pending',
    adminNotes?: string
  ) => {
    setIsSubmitting(true);
    try {
      const payload: any = { verification_status: status };
      if (adminNotes) {
        payload.admin_notes = adminNotes;
      }

      const res = await fetch(`/api/admin/technicians/${techId}/documents/${docId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.message || 'Gagal memverifikasi dokumen');
      }

      showToast('success', result.message || 'Status dokumen berhasil diperbarui');
      fetchTechnicians(pagination.page);
      if (selectedTech) {
        openDetailModal(techId, 'documents');
      }
      setRejectionModal({ isOpen: false, type: 'document', targetId: 0, targetTitle: '', action: 'reject', reason: '' });
    } catch (err: any) {
      showToast('error', err.message || 'Gagal memverifikasi dokumen');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 7. Tambah Spesialisasi Kategori
  const handleAddSpecialization = async () => {
    if (!selectedTech || !newSpecCategoryId) {
      showToast('error', 'Silakan pilih kategori peralatan');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/admin/technicians/${selectedTech.id}/specializations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category_id: newSpecCategoryId,
          supporting_document_id: newSpecDocId || null,
        }),
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.message || 'Gagal menambahkan spesialisasi');
      }

      showToast('success', result.message || 'Spesialisasi berhasil ditambahkan');
      setIsAddSpecOpen(false);
      setNewSpecCategoryId(0);
      setNewSpecDocId(null);
      fetchTechnicians(pagination.page);
      openDetailModal(selectedTech.id, 'specializations');
    } catch (err: any) {
      showToast('error', err.message || 'Gagal menambahkan spesialisasi');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 8. Hapus Spesialisasi
  const handleRemoveSpecialization = async (specId: number, specName: string) => {
    if (!selectedTech) return;
    if (!confirm(`Apakah Anda yakin ingin mencabut spesialisasi "${specName}" dari teknisi ini?`)) {
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/admin/technicians/${selectedTech.id}/specializations/${specId}`, {
        method: 'DELETE',
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.message || 'Gagal menghapus spesialisasi');
      }

      showToast('success', result.message || 'Spesialisasi berhasil dihapus');
      fetchTechnicians(pagination.page);
      openDetailModal(selectedTech.id, 'specializations');
    } catch (err: any) {
      showToast('error', err.message || 'Gagal menghapus spesialisasi');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Hitung Metrik Cepat dari Data Terambil
  const totalCount = pagination.total;
  const pendingVerificationCount = technicians.filter((t) => t.verified_status === 'pending').length;
  const verifiedCount = technicians.filter((t) => t.verified_status === 'verified').length;
  const pendingDocsCount = technicians.reduce((acc, t) => acc + (t.pending_documents || 0), 0);

  // Helper Badge Render
  const renderVerifiedBadge = (status: string) => {
    switch (status) {
      case 'verified':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Terverifikasi
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock className="w-3.5 h-3.5" />
            Menunggu Review
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <XCircle className="w-3.5 h-3.5" />
            Ditolak
          </span>
        );
      case 'suspended':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <Ban className="w-3.5 h-3.5" />
            Ditangguhkan
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-[#1a1b1e] text-[#8b8f97] border border-[#26282e]">
            {status}
          </span>
        );
    }
  };

  const renderAccountStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Akun Aktif
          </span>
        );
      case 'suspended':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            Akun Ditangguhkan
          </span>
        );
      case 'pending_verification':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            Belum Aktivasi
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-[#1a1b1e] text-[#8b8f97] border border-[#26282e]">
            {status}
          </span>
        );
    }
  };

  const renderDocStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Check className="w-3 h-3" />
            Disetujui
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <X className="w-3 h-3" />
            Ditolak
          </span>
        );
      case 'revision_required':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <AlertTriangle className="w-3 h-3" />
            Perlu Revisi
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Clock className="w-3 h-3" />
            Menunggu Verifikasi
          </span>
        );
    }
  };

  const getDocTypeLabel = (type: string) => {
    switch (type) {
      case 'competency_certificate':
        return 'Sertifikat Kompetensi (BNSP/BLK)';
      case 'training_certificate':
        return 'Sertifikat Pelatihan Pabrikan';
      case 'portfolio':
        return 'Portofolio Bukti Pengerjaan';
      case 'business_license':
        return 'Surat Izin Usaha / NIB';
      default:
        return 'Dokumen Pendukung Lainnya';
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

      {/* Page Title & Overview */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#D8CFBC]/15 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-2xl bg-[#D8CFBC]/10 text-[#D8CFBC] border border-[#D8CFBC]/20 shadow-inner">
              <FileCheck2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold text-[#FFFBF4] tracking-tight">
                  Manajemen & Verifikasi Teknisi
                </h1>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  Zero-NIK Security
                </span>
              </div>
              <p className="text-xs sm:text-sm text-[#D8CFBC]/70 mt-0.5">
                Kelola data mitra teknisi, verifikasi berkas kompetensi BNSP/BLK, status keaktifan akun, dan kualifikasi spesialisasi peralatan.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => fetchTechnicians(pagination.page)}
          className="inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-[#1C1D17] hover:bg-[#252720] text-[#D8CFBC] hover:text-[#FFFBF4] border border-[#D8CFBC]/20 font-medium text-xs sm:text-sm shadow-xs transition-all hover:scale-[1.01]"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-[#D8CFBC]' : 'text-[#D8CFBC]'}`} />
          <span>Segarkan Data</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#181913]/90 p-4 rounded-2xl border border-[#D8CFBC]/20 shadow-sm relative overflow-hidden backdrop-blur-xl">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-[#D8CFBC]/30 to-transparent absolute top-0 left-0" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#D8CFBC]/70">Total Teknisi</span>
            <div className="p-2 rounded-xl bg-[#1C1D17] text-[#D8CFBC] border border-[#D8CFBC]/20">
              <User className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-[#FFFBF4] font-mono">{totalCount}</span>
            <span className="text-xs text-[#8B8878]">terdaftar</span>
          </div>
        </div>

        <div className="bg-[#181913]/90 p-4 rounded-2xl border border-amber-500/25 shadow-sm relative overflow-hidden backdrop-blur-xl">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-amber-500/30 to-transparent absolute top-0 left-0" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-300">Menunggu Verifikasi</span>
            <div className="p-2 rounded-xl bg-amber-500/15 text-amber-300 border border-amber-500/30">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-amber-400 font-mono">{pendingVerificationCount}</span>
            <span className="text-xs text-amber-400/70">butuh tinjauan profil</span>
          </div>
        </div>

        <div className="bg-[#181913]/90 p-4 rounded-2xl border border-emerald-500/25 shadow-sm relative overflow-hidden backdrop-blur-xl">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent absolute top-0 left-0" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-300">Teknisi Terverifikasi</span>
            <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-400 font-mono">{verifiedCount}</span>
            <span className="text-xs text-emerald-400/70">lolos kurasi berkas</span>
          </div>
        </div>

        <div className="bg-[#181913]/90 p-4 rounded-2xl border border-[#D8CFBC]/25 shadow-sm relative overflow-hidden backdrop-blur-xl">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-[#D8CFBC]/30 to-transparent absolute top-0 left-0" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#D8CFBC]">Dokumen Pending</span>
            <div className="p-2 rounded-xl bg-[#1C1D17] text-[#D8CFBC] border border-[#D8CFBC]/20">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-[#D8CFBC] font-mono">{pendingDocsCount}</span>
            <span className="text-xs text-[#D8CFBC]/60">sertifikat menanti review</span>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-[#181913]/80 p-4 rounded-2xl border border-[#D8CFBC]/15 shadow-sm backdrop-blur-xl flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8B8878]" />
          <input
            type="text"
            placeholder="Cari berdasarkan nama, email, atau no. telepon..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-[#D8CFBC]/20 bg-[#11120D] text-[#FFFBF4] text-xs sm:text-sm focus:outline-none focus:border-[#D8CFBC] placeholder-[#8B8878]"
          />
        </div>

        {/* Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Filter Status Verifikasi Profil */}
          <select
            value={verifiedStatusFilter}
            onChange={(e) => setVerifiedStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-[#D8CFBC]/20 text-xs sm:text-sm text-[#FFFBF4] bg-[#11120D] focus:outline-none focus:border-[#D8CFBC] font-medium"
          >
            <option value="all">Semua Status Verifikasi</option>
            <option value="pending">Menunggu Review</option>
            <option value="verified">Terverifikasi</option>
            <option value="rejected">Ditolak</option>
            <option value="suspended">Ditangguhkan</option>
          </select>

          {/* Filter Status Akun Pengguna */}
          <select
            value={accountStatusFilter}
            onChange={(e) => setAccountStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-[#D8CFBC]/20 text-xs sm:text-sm text-[#FFFBF4] bg-[#11120D] focus:outline-none focus:border-[#D8CFBC] font-medium"
          >
            <option value="all">Semua Status Akun</option>
            <option value="active">Akun Aktif</option>
            <option value="pending_verification">Pending Aktivasi</option>
            <option value="suspended">Akun Ditangguhkan</option>
            <option value="inactive">Akun Nonaktif</option>
          </select>

          {/* Filter Kategori Spesialisasi */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-[#D8CFBC]/20 text-xs sm:text-sm text-[#FFFBF4] bg-[#11120D] focus:outline-none focus:border-[#D8CFBC] font-medium"
          >
            <option value="all">Semua Spesialisasi</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id.toString()}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-[#181913]/90 rounded-3xl border border-[#D8CFBC]/20 shadow-lg backdrop-blur-xl overflow-hidden">
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center text-[#D8CFBC]/60 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-[#D8CFBC]" />
            <p className="text-xs sm:text-sm">Memuat data teknisi...</p>
          </div>
        ) : errorMsg ? (
          <div className="py-16 px-4 flex flex-col items-center justify-center text-center gap-3">
            <div className="p-3 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Gagal Memuat Data</p>
              <p className="text-xs text-[#D8CFBC]/70 mt-1 max-w-md">{errorMsg}</p>
            </div>
            <button
              onClick={() => fetchTechnicians(1)}
              className="mt-2 px-4 py-2 rounded-xl bg-[#FFFBF4] text-[#11120D] text-xs font-bold hover:bg-[#D8CFBC] transition shadow-md"
            >
              Coba Lagi
            </button>
          </div>
        ) : technicians.length === 0 ? (
          <div className="py-16 px-4 flex flex-col items-center justify-center text-center gap-3">
            <div className="p-3 rounded-2xl bg-[#1C1D17] text-[#D8CFBC] border border-[#D8CFBC]/20">
              <User className="w-8 h-8" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Belum Ada Teknisi Terdaftar</p>
              <p className="text-xs text-[#D8CFBC]/70 mt-1 max-w-md">
                Tidak ada data teknisi yang cocok dengan kriteria pencarian dan filter saat ini.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm text-[#FFFBF4]">
              <thead className="bg-[#141510]/95 text-[#D8CFBC] text-[11px] uppercase tracking-wider border-b border-[#D8CFBC]/15 font-semibold">
                <tr>
                  <th className="py-3.5 px-4">Mitra Teknisi</th>
                  <th className="py-3.5 px-4">Pengalaman & Status Kerja</th>
                  <th className="py-3.5 px-4">Spesialisasi Kategori</th>
                  <th className="py-3.5 px-4">Berkas Dokumen</th>
                  <th className="py-3.5 px-4">Status Verifikasi</th>
                  <th className="py-3.5 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D8CFBC]/10">
                {technicians.map((tech) => (
                  <tr key={tech.id} className="hover:bg-[#1C1D17]/60 transition-colors">
                    {/* Kolom 1: Profil Teknisi */}
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-[#D8CFBC]/15 text-[#FFFBF4] font-bold flex items-center justify-center text-sm border border-[#D8CFBC]/25 shrink-0 shadow-inner">
                          {tech.full_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-[#FFFBF4] truncate">{tech.full_name}</p>
                          <div className="flex items-center gap-2 mt-0.5 text-xs text-[#D8CFBC]/70 truncate">
                            <span className="flex items-center gap-1">
                              <Mail className="w-3 h-3 text-[#565449]" />
                              {tech.email}
                            </span>
                            <span>•</span>
                            <span className="flex items-center gap-1 font-mono text-[11px]">
                              <Phone className="w-3 h-3 text-[#565449]" />
                              {tech.phone_number}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center gap-1.5">
                            {renderAccountStatusBadge(tech.account_status)}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Kolom 2: Pengalaman & Ketersediaan */}
                    <td className="py-4 px-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-[#FFFBF4] font-medium">
                          <Award className="w-3.5 h-3.5 text-[#D8CFBC]" />
                          <span>{tech.years_of_experience} Tahun Pengalaman</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs">
                          {tech.is_available ? (
                            <span className="text-emerald-400 font-medium flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                              Siap Terima Order
                            </span>
                          ) : (
                            <span className="text-[#8B8878] font-medium flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#8B8878]" />
                              Tidak Tersedia
                            </span>
                          )}
                          <span className="text-[#565449]">•</span>
                          <span className="flex items-center gap-0.5 text-amber-300 font-medium">
                            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                            {tech.rating_avg.toFixed(1)} ({tech.rating_count})
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Kolom 3: Spesialisasi */}
                    <td className="py-4 px-4">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {tech.specializations && tech.specializations.length > 0 ? (
                          tech.specializations.map((spec) => (
                            <span
                              key={spec.category_id}
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#1C1D17] text-[#D8CFBC] border border-[#D8CFBC]/20"
                            >
                              <Layers className="w-2.5 h-2.5 text-[#D8CFBC]" />
                              {spec.category_name}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-[#8B8878] italic">Belum disetel</span>
                        )}
                      </div>
                    </td>

                    {/* Kolom 4: Dokumen */}
                    <td className="py-4 px-4">
                      <div className="space-y-1">
                        <span className="font-semibold text-[#FFFBF4] text-xs">
                          {tech.total_documents} Berkas
                        </span>
                        <div className="flex items-center gap-1.5 text-[11px]">
                          <span className="text-emerald-400 font-medium">
                            {tech.approved_documents} Disetujui
                          </span>
                          {tech.pending_documents > 0 && (
                            <>
                              <span className="text-[#565449]">•</span>
                              <span className="text-amber-400 font-medium">
                                {tech.pending_documents} Pending
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Kolom 5: Status Verifikasi */}
                    <td className="py-4 px-4">
                      <div className="space-y-1">
                        {renderVerifiedBadge(tech.verified_status)}
                        {tech.verified_status === 'rejected' && tech.rejection_reason && (
                          <p className="text-[11px] text-rose-300 line-clamp-1 max-w-[180px]" title={tech.rejection_reason}>
                            Alasan: {tech.rejection_reason}
                          </p>
                        )}
                      </div>
                    </td>

                    {/* Kolom 6: Aksi */}
                    <td className="py-4 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => openDetailModal(tech.id, 'profile')}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#1C1D17] hover:bg-[#252720] text-[#D8CFBC] hover:text-[#FFFBF4] border border-[#D8CFBC]/20 text-xs font-semibold transition"
                          title="Lihat Detail Profil & Dokumen"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Periksa</span>
                        </button>

                        {tech.verified_status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleUpdateTechnicianStatus(tech.id, 'verified')}
                              className="p-1.5 rounded-xl bg-[#1C1D17] hover:bg-[#252720] text-emerald-400 border border-emerald-500/30 transition"
                              title="Setujui Verifikasi Teknisi"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() =>
                                setRejectionModal({
                                  isOpen: true,
                                  type: 'technician',
                                  targetId: tech.id,
                                  targetTitle: tech.full_name,
                                  action: 'reject',
                                  reason: '',
                                })
                              }
                              className="p-1.5 rounded-xl bg-[#1C1D17] hover:bg-[#252720] text-rose-400 border border-rose-500/30 transition"
                              title="Tolak Verifikasi Teknisi"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </>
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
        {technicians.length > 0 && (
          <div className="py-3 px-4 bg-[#141510]/60 border-t border-[#D8CFBC]/15 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#D8CFBC]/70">
            <div>
              Menampilkan data ke-{' '}
              <span className="font-semibold text-[#FFFBF4] font-mono">
                {(pagination.page - 1) * pagination.limit + 1}
              </span>{' '}
              sampai{' '}
              <span className="font-semibold text-[#FFFBF4] font-mono">
                {Math.min(pagination.page * pagination.limit, pagination.total)}
              </span>{' '}
              dari <span className="font-semibold text-[#FFFBF4] font-mono">{pagination.total}</span> teknisi
            </div>

            <div className="flex items-center gap-1 font-mono">
              <button
                disabled={pagination.page <= 1}
                onClick={() => fetchTechnicians(pagination.page - 1)}
                className="p-1.5 rounded-xl border border-[#D8CFBC]/20 bg-[#1C1D17] text-[#D8CFBC] hover:text-[#FFFBF4] hover:bg-[#252720] disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 font-medium text-[#FFFBF4]">
                Halaman {pagination.page} dari {pagination.totalPages}
              </span>
              <button
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => fetchTechnicians(pagination.page + 1)}
                className="p-1.5 rounded-xl border border-[#D8CFBC]/20 bg-[#1C1D17] text-[#D8CFBC] hover:text-[#FFFBF4] hover:bg-[#252720] disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ============================================================== */}
      {/* MODAL DETAIL TEKNISI LENGKAP & VERIFIKASI BERKAS              */}
      {/* ============================================================== */}
      {isDetailOpen && (
        <div className="fixed inset-0 z-50 bg-[#11120D]/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#181913]/95 rounded-3xl border border-[#D8CFBC]/25 shadow-2xl backdrop-blur-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 text-[#FFFBF4]">
            {/* Modal Header */}
            <div className="p-5 border-b border-[#D8CFBC]/15 flex items-center justify-between bg-[#141510]/95 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-[#D8CFBC]/15 text-[#FFFBF4] font-bold flex items-center justify-center text-lg border border-[#D8CFBC]/25 shadow-inner">
                  {selectedTech?.full_name ? selectedTech.full_name.charAt(0).toUpperCase() : 'T'}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-[#FFFBF4]">
                      {detailLoading ? 'Memuat Profil...' : selectedTech?.full_name}
                    </h2>
                    {selectedTech && renderVerifiedBadge(selectedTech.verified_status)}
                  </div>
                  <p className="text-xs text-[#D8CFBC]/70 mt-0.5 flex items-center gap-2">
                    <span>{selectedTech?.email}</span>
                    <span>•</span>
                    <span className="font-mono text-[#FFFBF4]">{selectedTech?.phone_number}</span>
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsDetailOpen(false)}
                className="p-2 rounded-xl text-[#D8CFBC]/70 hover:text-[#FFFBF4] hover:bg-[#1C1D17] transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Tabs Navigation */}
            <div className="px-5 border-b border-[#D8CFBC]/15 flex gap-6 text-xs sm:text-sm font-semibold text-[#D8CFBC]/70 bg-[#141510]/95 backdrop-blur-md">
              <button
                onClick={() => setActiveTab('profile')}
                className={`py-3.5 border-b-2 flex items-center gap-1.5 transition ${
                  activeTab === 'profile'
                    ? 'border-[#D8CFBC] text-[#FFFBF4]'
                    : 'border-transparent hover:text-[#FFFBF4]'
                }`}
              >
                <User className="w-4 h-4" />
                <span>Profil & Akun</span>
              </button>

              <button
                onClick={() => setActiveTab('documents')}
                className={`py-3.5 border-b-2 flex items-center gap-1.5 transition ${
                  activeTab === 'documents'
                    ? 'border-[#D8CFBC] text-[#FFFBF4]'
                    : 'border-transparent hover:text-[#FFFBF4]'
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>Dokumen & Portofolio ({selectedTech?.documents.length || 0})</span>
              </button>

              <button
                onClick={() => setActiveTab('specializations')}
                className={`py-3.5 border-b-2 flex items-center gap-1.5 transition ${
                  activeTab === 'specializations'
                    ? 'border-[#D8CFBC] text-[#FFFBF4]'
                    : 'border-transparent hover:text-[#FFFBF4]'
                }`}
              >
                <Layers className="w-4 h-4" />
                <span>Kualifikasi Spesialisasi ({selectedTech?.specializations.length || 0})</span>
              </button>

              <button
                onClick={() => setActiveTab('actions')}
                className={`py-3.5 border-b-2 flex items-center gap-1.5 transition ${
                  activeTab === 'actions'
                    ? 'border-[#D8CFBC] text-[#FFFBF4]'
                    : 'border-transparent hover:text-[#FFFBF4]'
                }`}
              >
                <Shield className="w-4 h-4" />
                <span>Tindakan Verifikasi</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {detailLoading || !selectedTech ? (
                <div className="py-20 flex flex-col items-center justify-center text-[#8b8f97] gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                  <p className="text-sm">Mengambil detail data...</p>
                </div>
              ) : (
                <>
                  {/* TAB 1: PROFIL & AKUN */}
                  {activeTab === 'profile' && (
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-[#16171a] p-4 rounded-2xl border border-[#1f2125] space-y-3">
                          <h3 className="text-xs font-bold text-[#8b8f97] uppercase tracking-wider">
                            Informasi Akun Kredensial
                          </h3>
                          <div className="space-y-2 text-xs sm:text-sm">
                            <div className="flex justify-between py-1 border-b border-[#1f2125]">
                              <span className="text-[#8b8f97]">Public User UUID</span>
                              <span className="font-mono text-slate-300 text-xs">{selectedTech.user_uuid}</span>
                            </div>
                            <div className="flex justify-between py-1 border-b border-[#1f2125]">
                              <span className="text-[#8b8f97]">Email Utama</span>
                              <span className="font-semibold text-white">{selectedTech.email}</span>
                            </div>
                            <div className="flex justify-between py-1 border-b border-[#1f2125]">
                              <span className="text-[#8b8f97]">Nomor Telepon</span>
                              <span className="font-mono text-slate-300">{selectedTech.phone_number}</span>
                            </div>
                            <div className="flex justify-between py-1 border-b border-[#1f2125]">
                              <span className="text-[#8b8f97]">Status Akun Login</span>
                              <span>{renderAccountStatusBadge(selectedTech.account_status)}</span>
                            </div>
                            <div className="flex justify-between py-1">
                              <span className="text-[#8b8f97]">Terdaftar Sejak</span>
                              <span className="text-white">
                                {new Date(selectedTech.user_created_at).toLocaleDateString('id-ID', {
                                  day: 'numeric',
                                  month: 'long',
                                  year: 'numeric',
                                })}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="bg-[#16171a] p-4 rounded-2xl border border-[#1f2125] space-y-3">
                          <h3 className="text-xs font-bold text-[#8b8f97] uppercase tracking-wider">
                            Performa & Kesiapan Kerja
                          </h3>
                          <div className="space-y-2 text-xs sm:text-sm">
                            <div className="flex justify-between py-1 border-b border-[#1f2125]">
                              <span className="text-[#8b8f97]">Tahun Pengalaman</span>
                              <span className="font-bold text-white">{selectedTech.years_of_experience} Tahun</span>
                            </div>
                            <div className="flex justify-between py-1 border-b border-[#1f2125]">
                              <span className="text-[#8b8f97]">Rating Rata-rata</span>
                              <span className="font-bold text-amber-400 flex items-center gap-1">
                                <Star className="w-3.5 h-3.5 fill-amber-400" />
                                {selectedTech.rating_avg.toFixed(2)} ({selectedTech.rating_count} ulasan)
                              </span>
                            </div>
                            <div className="flex justify-between py-1 border-b border-[#1f2125]">
                              <span className="text-[#8b8f97]">Kesiapan Menerima Order</span>
                              <span className="font-semibold">
                                {selectedTech.is_available ? (
                                  <span className="text-emerald-400">Aktif Menerima</span>
                                ) : (
                                  <span className="text-[#525660]">Sedang Istirahat</span>
                                )}
                              </span>
                            </div>
                            <div className="flex justify-between py-1 border-b border-[#1f2125]">
                              <span className="text-[#8b8f97]">Total Penugasan Order</span>
                              <span className="font-bold text-blue-400">{selectedTech.stats.total_assignments} Order</span>
                            </div>
                            <div className="flex justify-between py-1">
                              <span className="text-[#8b8f97]">Order Berhasil Selesai</span>
                              <span className="font-bold text-emerald-400">{selectedTech.stats.completed_assignments} Order</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Bio Teknisi */}
                      <div className="bg-[#16171a] p-4 rounded-2xl border border-[#1f2125] space-y-2">
                        <h3 className="text-xs font-bold text-[#8b8f97] uppercase tracking-wider">
                          Deskripsi Profil & Pengalaman
                        </h3>
                        <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                          {selectedTech.bio || 'Teknisi belum menambahkan ringkasan bio keahlian.'}
                        </p>
                      </div>

                      {/* Quick Account Controls */}
                      <div className="p-4 rounded-2xl border border-blue-500/20 bg-blue-500/5 space-y-3">
                        <div className="flex items-center gap-2">
                          <Activity className="w-4 h-4 text-blue-400" />
                          <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                            Aksi Cepat Status Akun
                          </h4>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {selectedTech.account_status !== 'active' && (
                            <button
                              onClick={() => handleUpdateAccountStatus(selectedTech.id, 'active')}
                              disabled={isSubmitting}
                              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition"
                            >
                              Aktifkan Akun Pengguna
                            </button>
                          )}
                          {selectedTech.account_status !== 'suspended' && (
                            <button
                              onClick={() => handleUpdateAccountStatus(selectedTech.id, 'suspended')}
                              disabled={isSubmitting}
                              className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-xs transition"
                            >
                              Tangguhkan Akun (Suspend)
                            </button>
                          )}
                          {selectedTech.account_status !== 'inactive' && (
                            <button
                              onClick={() => handleUpdateAccountStatus(selectedTech.id, 'inactive')}
                              disabled={isSubmitting}
                              className="px-3 py-1.5 rounded-xl bg-[#26282e] hover:bg-[#32363e] text-white text-xs font-semibold shadow-xs transition"
                            >
                              Nonaktifkan Akun
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB 2: DOKUMEN & PORTOFOLIO */}
                  {activeTab === 'documents' && (
                    <div className="space-y-4">
                      {/* Notice Zero-NIK & Privacy Storage */}
                      <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3">
                        <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                        <div className="text-xs text-amber-300 leading-relaxed">
                          <p className="font-semibold">Prinsip Zero-NIK & Kerahasiaan Berkas:</p>
                          <p className="mt-0.5 text-amber-300/80">
                            BANTUIN tidak mengoleksi nomor KTP/NIK demi privasi dan kepatuhan perlindungan data pribadi.
                            Verifikasi kelayakan murni didasarkan pada sertifikat kompetensi keahlian (BNSP/BLK/Pabrikan) dan lisensi teknis. Berkas fisik disimpan di secure object storage yang terisolasi.
                          </p>
                        </div>
                      </div>

                      {selectedTech.documents.length === 0 ? (
                        <div className="py-12 text-center text-[#8b8f97] space-y-2">
                          <FileText className="w-8 h-8 mx-auto text-[#525660]" />
                          <p className="text-sm font-medium">Belum ada dokumen sertifikasi yang diunggah.</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {selectedTech.documents.map((doc) => (
                            <div
                              key={doc.id}
                              className="p-4 rounded-2xl border border-[#1f2125] bg-[#16171a] hover:border-[#2a2d34] transition-all space-y-3"
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <h4 className="font-bold text-white text-sm">
                                      {doc.document_title}
                                    </h4>
                                    {renderDocStatusBadge(doc.verification_status)}
                                  </div>
                                  <p className="text-xs text-blue-400 font-medium mt-0.5">
                                    {getDocTypeLabel(doc.document_type)}
                                  </p>
                                </div>

                                <div className="flex items-center gap-2">
                                  {doc.verification_status !== 'approved' && (
                                    <button
                                      onClick={() => handleVerifyDocument(selectedTech.id, doc.id, 'approved')}
                                      disabled={isSubmitting}
                                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                      <span>Setujui</span>
                                    </button>
                                  )}
                                  {doc.verification_status !== 'rejected' && (
                                    <button
                                      onClick={() =>
                                        setRejectionModal({
                                          isOpen: true,
                                          type: 'document',
                                          targetId: doc.id,
                                          targetTitle: doc.document_title,
                                          action: 'reject',
                                          reason: '',
                                        })
                                      }
                                      disabled={isSubmitting}
                                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                      <span>Tolak</span>
                                    </button>
                                  )}
                                  {doc.verification_status !== 'revision_required' && (
                                    <button
                                      onClick={() =>
                                        setRejectionModal({
                                          isOpen: true,
                                          type: 'document',
                                          targetId: doc.id,
                                          targetTitle: doc.document_title,
                                          action: 'revision',
                                          reason: '',
                                        })
                                      }
                                      disabled={isSubmitting}
                                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold transition"
                                    >
                                      <AlertTriangle className="w-3.5 h-3.5" />
                                      <span>Minta Revisi</span>
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Informasi Metadata Dokumen */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 py-2 px-3 rounded-xl bg-[#131416] text-xs text-[#8b8f97] border border-[#1f2125]">
                                <div className="flex items-center gap-1.5">
                                  <Building2 className="w-3.5 h-3.5 text-[#525660]" />
                                  <span className="truncate">
                                    Penerbit: <strong className="text-white">{doc.issuing_organization || '-'}</strong>
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <Award className="w-3.5 h-3.5 text-[#525660]" />
                                  <span className="truncate">
                                    No. Seri: <strong className="text-white">{doc.document_number || '-'}</strong>
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <Calendar className="w-3.5 h-3.5 text-[#525660]" />
                                  <span>
                                    Masa Berlaku:{' '}
                                    <strong className="text-white">
                                      {doc.expiry_date
                                        ? new Date(doc.expiry_date).toLocaleDateString('id-ID')
                                        : 'Seumur Hidup'}
                                    </strong>
                                  </span>
                                </div>
                              </div>

                              {/* Catatan Admin jika ditolak / minta revisi */}
                              {doc.admin_notes && (
                                <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">
                                  <strong className="text-rose-200">Catatan Pemeriksaan Admin:</strong> {doc.admin_notes}
                                </div>
                              )}

                              {/* File object info */}
                              <div className="flex items-center justify-between text-[11px] text-[#525660]">
                                <span>Berkas Asli: {doc.file_name} ({doc.file_mime_type || 'application/pdf'})</span>
                                <span>Path Penyimpanan: {doc.file_path}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 3: SPESIALISASI KATEGORI */}
                  {activeTab === 'specializations' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-bold text-white">
                            Katalog Spesialisasi Perbaikan
                          </h3>
                          <p className="text-xs text-[#8b8f97]">
                            Kategori peralatan elektronik yang diizinkan untuk dikerjakan oleh teknisi bersangkutan.
                          </p>
                        </div>
                        <button
                          onClick={() => setIsAddSpecOpen(true)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Tambah Spesialisasi</span>
                        </button>
                      </div>

                      {/* Modal Dialog Tambah Spesialisasi */}
                      {isAddSpecOpen && (
                        <div className="p-4 rounded-2xl border border-blue-500/30 bg-[#16171a] space-y-3 animate-in fade-in">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-bold text-blue-400 uppercase tracking-wider">
                              Pilih Kategori Peralatan Baru
                            </h4>
                            <button
                              onClick={() => setIsAddSpecOpen(false)}
                              className="text-[#8b8f97] hover:text-white"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                            <div>
                              <label className="block text-[#8b8f97] font-semibold mb-1">
                                Kategori Peralatan *
                              </label>
                              <select
                                value={newSpecCategoryId}
                                onChange={(e) => setNewSpecCategoryId(Number(e.target.value))}
                                className="w-full px-3 py-2 rounded-xl border border-[#222428] bg-[#131416] text-white font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                              >
                                <option value={0}>Pilih Kategori...</option>
                                {categories
                                  .filter(
                                    (cat) =>
                                      !selectedTech.specializations.some((s) => s.category_id === cat.id)
                                  )
                                  .map((cat) => (
                                    <option key={cat.id} value={cat.id}>
                                      {cat.name}
                                    </option>
                                  ))}
                              </select>
                            </div>

                            <div>
                              <label className="block text-[#8b8f97] font-semibold mb-1">
                                Dokumen Sertifikasi Pendukung (Opsional)
                              </label>
                              <select
                                value={newSpecDocId || ''}
                                onChange={(e) =>
                                  setNewSpecDocId(e.target.value ? Number(e.target.value) : null)
                                }
                                className="w-full px-3 py-2 rounded-xl border border-[#222428] bg-[#131416] text-white font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                              >
                                <option value="">Tanpa Lampiran Dokumen Spesifik</option>
                                {selectedTech.documents.map((d) => (
                                  <option key={d.id} value={d.id}>
                                    {d.document_title} ({d.verification_status})
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div className="flex justify-end gap-2 pt-2">
                            <button
                              onClick={() => setIsAddSpecOpen(false)}
                              className="px-3 py-1.5 rounded-xl border border-[#26282e] text-[#8b8f97] hover:text-white text-xs font-semibold hover:bg-[#1f2125]"
                            >
                              Batal
                            </button>
                            <button
                              onClick={handleAddSpecialization}
                              disabled={isSubmitting || !newSpecCategoryId}
                              className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50"
                            >
                              Simpan Spesialisasi
                            </button>
                          </div>
                        </div>
                      )}

                      {/* List of Specializations */}
                      {selectedTech.specializations.length === 0 ? (
                        <div className="py-10 text-center text-[#8b8f97] space-y-2">
                          <Layers className="w-8 h-8 mx-auto text-[#525660]" />
                          <p className="text-sm font-medium">Teknisi belum memiliki pemetaan spesialisasi perbaikan.</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {selectedTech.specializations.map((spec) => (
                            <div
                              key={spec.id || spec.category_id}
                              className="p-3.5 rounded-2xl border border-[#1f2125] bg-[#16171a] flex items-center justify-between gap-3 shadow-2xs"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0">
                                  <Layers className="w-4 h-4" />
                                </div>
                                <div className="min-w-0">
                                  <p className="font-semibold text-white text-xs sm:text-sm truncate">
                                    {spec.category_name}
                                  </p>
                                  {spec.supporting_document_title ? (
                                    <p className="text-[11px] text-emerald-400 font-medium truncate">
                                      Terikat: {spec.supporting_document_title}
                                    </p>
                                  ) : (
                                    <p className="text-[11px] text-[#525660] italic">
                                      Berdasarkan kurasi profil mandiri
                                    </p>
                                  )}
                                </div>
                              </div>

                              {spec.id && (
                                <button
                                  onClick={() => handleRemoveSpecialization(spec.id!, spec.category_name)}
                                  className="p-1.5 rounded-lg text-[#8b8f97] hover:text-rose-400 hover:bg-rose-500/10 transition"
                                  title="Cabut Spesialisasi"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 4: TINDAKAN VERIFIKASI AKHIR */}
                  {activeTab === 'actions' && (
                    <div className="space-y-6">
                      <div className="p-4 rounded-2xl border border-[#1f2125] bg-[#16171a] space-y-3">
                        <h3 className="text-xs font-bold text-[#8b8f97] uppercase tracking-wider">
                          Ringkasan Status Kelayakan Saat Ini
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                          <div className="p-3 rounded-xl bg-[#131416] border border-[#1f2125]">
                            <span className="text-[#8b8f97]">Status Profil Teknisi</span>
                            <div className="mt-1">{renderVerifiedBadge(selectedTech.verified_status)}</div>
                          </div>
                          <div className="p-3 rounded-xl bg-[#131416] border border-[#1f2125]">
                            <span className="text-[#8b8f97]">Status Akun Login</span>
                            <div className="mt-1">{renderAccountStatusBadge(selectedTech.account_status)}</div>
                          </div>
                          <div className="p-3 rounded-xl bg-[#131416] border border-[#1f2125]">
                            <span className="text-[#8b8f97]">Kelengkapan Berkas</span>
                            <div className="mt-1 font-semibold text-white">
                              {selectedTech.approved_documents} Disetujui dari {selectedTech.total_documents} Dokumen
                            </div>
                          </div>
                        </div>

                        {selectedTech.verified_by_admin_id && (
                          <p className="text-xs text-[#8b8f97]">
                            Terakhir diverifikasi oleh Admin ID #{selectedTech.verified_by_admin_id}
                            {selectedTech.verifier_email ? ` (${selectedTech.verifier_email})` : ''} pada{' '}
                            {selectedTech.verified_at
                              ? new Date(selectedTech.verified_at).toLocaleString('id-ID')
                              : '-'}
                          </p>
                        )}
                      </div>

                      {/* Aksi Persetujuan / Penolakan Final */}
                      <div className="p-5 rounded-3xl border border-[#1f2125] bg-[#16171a] space-y-4 shadow-xs">
                        <div>
                          <h4 className="text-sm font-bold text-white">
                            Keputusan Verifikasi Kualifikasi Mitra Teknisi
                          </h4>
                          <p className="text-xs text-[#8b8f97] mt-0.5">
                            Menyetujui teknisi akan mengaktifkan hak akses menerima pesanan servis pelanggan di area terdekat.
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-3">
                          {selectedTech.verified_status !== 'verified' && (
                            <button
                              onClick={() => handleUpdateTechnicianStatus(selectedTech.id, 'verified')}
                              disabled={isSubmitting}
                              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs sm:text-sm shadow-md shadow-emerald-600/20 transition-all hover:scale-[1.01]"
                            >
                              <ShieldCheck className="w-4 h-4" />
                              <span>Setujui & Verifikasi Penuh</span>
                            </button>
                          )}

                          {selectedTech.verified_status !== 'rejected' && (
                            <button
                              onClick={() =>
                                setRejectionModal({
                                  isOpen: true,
                                  type: 'technician',
                                  targetId: selectedTech.id,
                                  targetTitle: selectedTech.full_name,
                                  action: 'reject',
                                  reason: '',
                                })
                              }
                              disabled={isSubmitting}
                              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs sm:text-sm shadow-md shadow-rose-600/20 transition-all hover:scale-[1.01]"
                            >
                              <ShieldAlert className="w-4 h-4" />
                              <span>Tolak Pengajuan Teknisi</span>
                            </button>
                          )}

                          {selectedTech.verified_status !== 'suspended' && (
                            <button
                              onClick={() => handleUpdateTechnicianStatus(selectedTech.id, 'suspended')}
                              disabled={isSubmitting}
                              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs sm:text-sm shadow-md shadow-purple-600/20 transition-all hover:scale-[1.01]"
                            >
                              <Ban className="w-4 h-4" />
                              <span>Tangguhkan Mitra (Suspend)</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-[#1f2125] bg-[#16171a] flex items-center justify-between text-xs text-[#8b8f97]">
              <span>Sistem Manajemen Teknisi Terpadu BANTUIN</span>
              <button
                onClick={() => setIsDetailOpen(false)}
                className="px-4 py-2 rounded-xl bg-[#1f2125] hover:bg-[#282a30] text-white border border-[#2d3037] font-semibold transition"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL INPUT ALASAN PENOLAKAN / CATATAN REVISI                 */}
      {/* ============================================================== */}
      {rejectionModal.isOpen && (
        <div className="fixed inset-0 z-60 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#131416] rounded-3xl border border-[#1f2125] shadow-2xl w-full max-w-md p-6 space-y-4 animate-in fade-in zoom-in-95 text-white">
            <div className="flex items-center gap-3">
              <div
                className={`p-3 rounded-2xl ${
                  rejectionModal.action === 'reject'
                    ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                }`}
              >
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-white text-base">
                  {rejectionModal.action === 'reject' ? 'Konfirmasi Penolakan' : 'Permintaan Revisi Dokumen'}
                </h3>
                <p className="text-xs text-[#8b8f97] mt-0.5">
                  Target: <strong className="text-white">{rejectionModal.targetTitle}</strong>
                </p>
              </div>
            </div>

            <div className="space-y-1.5 text-xs">
              <label className="block font-semibold text-[#8b8f97]">
                {rejectionModal.action === 'reject'
                  ? 'Alasan Penolakan Wajib Diisi *'
                  : 'Catatan Revisi untuk Teknisi *'}
              </label>
              <textarea
                rows={4}
                value={rejectionModal.reason}
                onChange={(e) => setRejectionModal((prev) => ({ ...prev, reason: e.target.value }))}
                placeholder={
                  rejectionModal.action === 'reject'
                    ? 'Jelaskan mengapa berkas atau profil teknisi ini ditolak...'
                    : 'Tuliskan bagian dokumen yang buram, kedaluwarsa, atau perlu diunggah ulang...'
                }
                className="w-full p-3 rounded-xl border border-[#222428] bg-[#16171a] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-white placeholder-[#525660]"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() =>
                  setRejectionModal({
                    isOpen: false,
                    type: 'technician',
                    targetId: 0,
                    targetTitle: '',
                    action: 'reject',
                    reason: '',
                  })
                }
                className="px-4 py-2 rounded-xl border border-[#26282e] text-[#8b8f97] hover:text-white text-xs font-semibold hover:bg-[#1f2125]"
              >
                Batal
              </button>
              <button
                onClick={() => {
                  if (!rejectionModal.reason.trim()) {
                    showToast('error', 'Catatan alasan wajib diisi!');
                    return;
                  }
                  if (rejectionModal.type === 'technician') {
                    handleUpdateTechnicianStatus(
                      rejectionModal.targetId,
                      'rejected',
                      rejectionModal.reason.trim()
                    );
                  } else {
                    const status =
                      rejectionModal.action === 'reject' ? 'rejected' : 'revision_required';
                    if (selectedTech) {
                      handleVerifyDocument(
                        selectedTech.id,
                        rejectionModal.targetId,
                        status,
                        rejectionModal.reason.trim()
                      );
                    }
                  }
                }}
                disabled={isSubmitting || !rejectionModal.reason.trim()}
                className={`px-4 py-2 rounded-xl text-white text-xs font-semibold shadow-xs transition disabled:opacity-50 ${
                  rejectionModal.action === 'reject'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-amber-600 hover:bg-amber-700'
                }`}
              >
                {rejectionModal.action === 'reject' ? 'Tolak Sekarang' : 'Kirim Catatan Revisi'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
