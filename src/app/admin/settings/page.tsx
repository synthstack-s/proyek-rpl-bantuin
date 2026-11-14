'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import AIProviderSettingsSection from '@/components/admin/AIProviderSettingsSection';
import AIIntelligenceSuiteSection from '@/components/admin/AIIntelligenceSuiteSection';
import {
  Settings,
  Save,
  RotateCcw,
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Layers,
  Sparkles,
  Shield,
  Clock,
  DollarSign,
  MapPin,
  Trash2,
  Loader2,
  ExternalLink,
  Cpu,
  FileText,
  Percent,
  Calendar,
} from 'lucide-react';

interface SystemSetting {
  id: number;
  setting_key: string;
  setting_value: string;
  value_type: 'string' | 'number' | 'boolean' | 'json';
  group_name: string;
  description: string | null;
  updated_by_admin_id: number | null;
  updated_at: string;
  admin_email?: string | null;
  isCore: boolean;
}

interface GroupSummary {
  group_name: string;
  count: number;
}

const GROUP_LABELS: Record<string, { label: string; icon: any; color: string; desc: string }> = {
  all: {
    label: 'Semua Parameter',
    icon: Layers,
    color: 'from-[#565449] to-[#11120D]',
    desc: 'Seluruh konfigurasi sistem aplikasi BANTUIN',
  },
  fee: {
    label: 'Biaya & Komisi',
    icon: DollarSign,
    color: 'from-emerald-600 to-teal-700',
    desc: 'Pengaturan biaya platform dan persentase komisi bagi hasil teknisi',
  },
  dispatch: {
    label: 'Penugasan & Radius',
    icon: MapPin,
    color: 'from-[#565449] to-[#1C1D17]',
    desc: 'Radius jangkauan pencarian dan batas waktu respons penugasan teknisi',
  },
  service: {
    label: 'Layanan & Garansi',
    icon: Shield,
    color: 'from-amber-600 to-amber-800',
    desc: 'Masa garansi resmi dan ketentuan standar pekerjaan servis',
  },
  ai: {
    label: 'Kecerdasan Buatan (AI)',
    icon: Cpu,
    color: 'from-purple-600 to-indigo-800',
    desc: 'Model LLM Google Gemini dan kuota konsultasi mandiri Chatbot+',
  },
  complaint: {
    label: 'Layanan Pengaduan',
    icon: Clock,
    color: 'from-rose-600 to-rose-800',
    desc: 'Waktu eskalasi otomatis komplain pelanggan',
  },
  general: {
    label: 'Pengaturan Umum',
    icon: Settings,
    color: 'from-slate-600 to-slate-700',
    desc: 'Parameter operasional tambahan aplikasi',
  },
};

export default function SettingsAdminPage() {
  const [settings, setSettings] = useState<SystemSetting[]>([]);
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [activeGroup, setActiveGroup] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modal Tambah Parameter Baru
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [newSetting, setNewSetting] = useState({
    setting_key: '',
    setting_value: '',
    value_type: 'string',
    group_name: 'general',
    description: '',
  });
  const [isAdding, setIsAdding] = useState<boolean>(false);

  // Modal Konfirmasi Hapus
  const [deleteTarget, setDeleteTarget] = useState<SystemSetting | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchSettings = useCallback(async () => {
    try {
      setIsLoading(true);
      const url = new URL('/api/admin/settings', window.location.origin);
      if (activeGroup !== 'all') url.searchParams.set('group', activeGroup);
      if (searchQuery.trim()) url.searchParams.set('search', searchQuery.trim());

      const res = await fetch(url.toString());
      const data = await res.json();

      if (data.success && data.data) {
        setSettings(data.data.settings);
        setGroups(data.data.groups);

        // Reset edited values to match fetched data
        const initialMap: Record<string, string> = {};
        data.data.settings.forEach((s: SystemSetting) => {
          initialMap[s.setting_key] = s.setting_value;
        });
        setEditedValues(initialMap);
      } else {
        showToast('error', data.message || 'Gagal memuat konfigurasi.');
      }
    } catch (err: any) {
      showToast('error', 'Terjadi kesalahan jaringan saat memuat konfigurasi: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  }, [activeGroup, searchQuery]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Cek apakah ada perubahan yang belum disimpan
  const hasUnsavedChanges = settings.some(
    (s) => editedValues[s.setting_key] !== undefined && editedValues[s.setting_key] !== s.setting_value
  );

  const handleInputChange = (key: string, value: string) => {
    setEditedValues((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleReset = () => {
    const resetMap: Record<string, string> = {};
    settings.forEach((s) => {
      resetMap[s.setting_key] = s.setting_value;
    });
    setEditedValues(resetMap);
    showToast('success', 'Semua perubahan yang belum disimpan telah dibatalkan.');
  };

  // Simpan Satu Parameter atau Seluruh Parameter yang Berubah
  const handleSaveSettings = async (specificKey?: string) => {
    try {
      setIsSaving(true);
      let payload: Array<{ key: string; value: string }> = [];

      if (specificKey) {
        payload = [{ key: specificKey, value: editedValues[specificKey] ?? '' }];
      } else {
        payload = settings
          .filter((s) => editedValues[s.setting_key] !== s.setting_value)
          .map((s) => ({ key: s.setting_key, value: editedValues[s.setting_key] ?? '' }));
      }

      if (payload.length === 0) {
        showToast('error', 'Tidak ada parameter yang mengalami perubahan.');
        setIsSaving(false);
        return;
      }

      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: payload }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToast('success', data.message || 'Konfigurasi berhasil disimpan!');
        await fetchSettings();
      } else {
        showToast('error', data.message || 'Gagal menyimpan konfigurasi.');
      }
    } catch (err: any) {
      showToast('error', 'Gagal menyimpan parameter: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Tambah Parameter Kustom Baru
  const handleCreateSetting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSetting.setting_key.trim()) {
      showToast('error', 'Nama parameter (setting_key) wajib diisi.');
      return;
    }

    try {
      setIsAdding(true);
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSetting),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToast('success', data.message);
        setIsAddModalOpen(false);
        setNewSetting({
          setting_key: '',
          setting_value: '',
          value_type: 'string',
          group_name: 'general',
          description: '',
        });
        await fetchSettings();
      } else {
        showToast('error', data.message || 'Gagal menambahkan parameter.');
      }
    } catch (err: any) {
      showToast('error', 'Terjadi kesalahan: ' + err.message);
    } finally {
      setIsAdding(false);
    }
  };

  // Hapus Parameter Kustom
  const handleDeleteSetting = async () => {
    if (!deleteTarget) return;

    try {
      setIsDeleting(true);
      const res = await fetch(`/api/admin/settings/${deleteTarget.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();

      if (res.ok && data.success) {
        showToast('success', data.message);
        setDeleteTarget(null);
        await fetchSettings();
      } else {
        showToast('error', data.message || 'Gagal menghapus parameter.');
      }
    } catch (err: any) {
      showToast('error', 'Terjadi kesalahan saat menghapus: ' + err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  // Format Helper untuk Judul Human-Readable
  const getSettingHumanLabel = (key: string) => {
    switch (key) {
      case 'platform_fee_fixed':
        return 'Biaya Admin Tetap Per Pesanan';
      case 'platform_fee_percent':
        return 'Komisi Bagi Hasil Platform';
      case 'max_search_radius_km':
        return 'Radius Maksimal Penugasan Teknisi';
      case 'technician_assignment_timeout_min':
        return 'Batas Waktu Respons Penugasan Teknisi';
      case 'warranty_period_days':
        return 'Masa Berlaku Garansi Servis Resmi';
      case 'ai_daily_free_quota':
        return 'Kuota Harian Chatbot AI Gratis';
      case 'ai_model_name':
        return 'Model Google Gemini AI Default';
      case 'complaint_auto_escalate_hours':
        return 'Batas Waktu Respons Aduan Pelanggan';
      default:
        return key
          .split('_')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium transition-all transform animate-in slide-in-from-bottom-5 ${toast.type === 'success'
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

      {/* ========================================================================= */}
      {/* 1. FITUR UTAMA PALING ATAS: KONFIGURASI AI PROVIDER (GEMINI & GROQ AI) */}
      {/* ========================================================================= */}
      <AIProviderSettingsSection />

      {/* ========================================================================= */}
      {/* 1.1 AI INTELLIGENCE SUITE: KNOWLEDGE BASE RAG, SCHEMA EXPLORER & EVAL */}
      {/* ========================================================================= */}
      <AIIntelligenceSuiteSection />

      {/* ========================================================================= */}
      {/* 2. BAGIAN BAWAH: PARAMETER OPERASIONAL GLOBAL SISTEM */}
      {/* ========================================================================= */}
      <div className="space-y-6 pt-4 border-t border-[#D8CFBC]/20">
        {/* Header Halaman & Quick Stats */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#D8CFBC]/15 pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 rounded-2xl bg-[#D8CFBC]/10 border border-[#D8CFBC]/20 text-[#D8CFBC] shadow-inner">
                <Settings className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-[#FFFBF4] tracking-tight">
                  Parameter Operasional Sistem
                </h2>
                <p className="text-xs sm:text-sm text-[#D8CFBC]/70 mt-0.5">
                  Kelola parameter platform, komisi mitra teknisi, masa garansi servis, dan radius penugasan.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {hasUnsavedChanges && (
              <button
                onClick={handleReset}
                disabled={isSaving}
                className="px-3.5 py-2.5 rounded-xl border border-[#D8CFBC]/20 bg-[#141510] text-[#D8CFBC] hover:text-[#FFFBF4] hover:bg-[#1C1D17] text-xs font-semibold flex items-center gap-2 transition disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Perubahan
              </button>
            )}

            <button
              onClick={() => handleSaveSettings()}
              disabled={!hasUnsavedChanges || isSaving}
              className="px-4 py-2.5 rounded-xl bg-[#FFFBF4] hover:bg-[#D8CFBC] text-[#11120D] text-xs font-bold shadow-md flex items-center gap-2 transition hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Simpan Perubahan
            </button>

            <button
              onClick={() => setIsAddModalOpen(true)}
              className="px-3.5 py-2.5 rounded-xl border border-[#D8CFBC]/20 bg-[#11120D] text-[#D8CFBC] hover:text-[#FFFBF4] hover:bg-[#1C1D17] text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <Plus className="w-4 h-4" />
              Tambah Parameter
            </button>
          </div>
        </div>

        {/* Group Tabs Navigasi */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-[#D8CFBC]/15 no-scrollbar">
          {['all', 'fee', 'dispatch', 'service', 'ai', 'complaint', 'general'].map((grp) => {
            const info = GROUP_LABELS[grp] || { label: grp, icon: Settings };
            const Icon = info.icon;
            const isActive = activeGroup === grp;
            const count =
              grp === 'all'
                ? settings.length
                : groups.find((g) => g.group_name === grp)?.count ??
                settings.filter((s) => s.group_name === grp).length;

            return (
              <button
                key={grp}
                onClick={() => setActiveGroup(grp)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${isActive
                  ? 'bg-[#1C1D17] text-[#FFFBF4] border border-[#D8CFBC]/30 shadow-xs font-semibold'
                  : 'text-[#D8CFBC]/70 hover:text-[#FFFBF4] hover:bg-[#181913]'
                  }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#D8CFBC]' : 'text-[#8B8878]'}`} />
                <span>{info.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${isActive ? 'bg-[#D8CFBC]/20 text-[#FFFBF4]' : 'bg-[#11120D] text-[#8B8878]'
                    }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search Input Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#181913]/90 p-3 rounded-2xl border border-[#D8CFBC]/15 shadow-sm backdrop-blur-xl">
          <div className="relative w-full sm:w-96">
            <Search className="w-4 h-4 text-[#8B8878] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama parameter, deskripsi, atau nilai..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#11120D] border border-[#D8CFBC]/20 rounded-xl text-[#FFFBF4] placeholder-[#8B8878] outline-none focus:border-[#D8CFBC] transition"
            />
          </div>

          <div className="text-xs text-[#D8CFBC]/70 flex items-center gap-2 self-end sm:self-auto">
            {hasUnsavedChanges && (
              <span className="flex items-center gap-1.5 text-amber-400 font-semibold bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                Ada perubahan belum disimpan
              </span>
            )}
            <span>Menampilkan <strong className="text-[#FFFBF4]">{settings.length}</strong> parameter</span>
          </div>
        </div>


        {/* Daftar Cards Parameter Konfigurasi */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 bg-[#181913]/90 rounded-2xl border border-[#D8CFBC]/15 backdrop-blur-xl">
            <Loader2 className="w-8 h-8 text-[#D8CFBC] animate-spin" />
            <p className="text-xs text-[#D8CFBC]/70 mt-2 font-medium">Memuat data konfigurasi sistem...</p>
          </div>
        ) : settings.length === 0 ? (
          <div className="text-center py-16 bg-[#181913]/90 rounded-2xl border border-[#D8CFBC]/15 backdrop-blur-xl">
            <Settings className="w-10 h-10 text-[#8B8878] mx-auto mb-2" />
            <h3 className="text-sm font-semibold text-[#FFFBF4]">Tidak ada parameter ditemukan</h3>
            <p className="text-xs text-[#D8CFBC]/70 mt-1">Coba gunakan kata kunci pencarian lain atau pilih kategori grup berbeda.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {settings.map((s) => {
              const currentValue = editedValues[s.setting_key] ?? s.setting_value;
              const isModified = currentValue !== s.setting_value;
              const grpInfo = GROUP_LABELS[s.group_name] || {
                label: s.group_name,
                icon: Settings,
                color: 'from-slate-600 to-slate-700',
              };
              const GrpIcon = grpInfo.icon;

              return (
                <div
                  key={s.id}
                  className={`bg-[#181913]/90 rounded-2xl border p-4 sm:p-5 transition-all shadow-sm backdrop-blur-xl flex flex-col justify-between ${isModified
                    ? 'border-[#D8CFBC] ring-2 ring-[#D8CFBC]/20'
                    : 'border-[#D8CFBC]/15 hover:border-[#D8CFBC]/30'
                    }`}
                >
                  <div>
                    {/* Top Bar: Group Badge & Core Indicator */}
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#D8CFBC] bg-[#11120D] border border-[#D8CFBC]/20 px-2 py-0.5 rounded-md">
                          <GrpIcon className="w-3 h-3 text-[#D8CFBC]" />
                          {grpInfo.label}
                        </span>
                        <span className="text-[10px] font-semibold text-[#FFFBF4] bg-[#D8CFBC]/15 border border-[#D8CFBC]/30 px-1.5 py-0.5 rounded">
                          {s.value_type}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {s.isCore ? (
                          <span
                            title="Parameter inti sistem yang dilindungi dari penghapusan"
                            className="text-[10px] font-semibold text-[#D8CFBC] bg-[#11120D] border border-[#D8CFBC]/20 px-1.5 py-0.5 rounded flex items-center gap-1"
                          >
                            <Shield className="w-2.5 h-2.5 text-[#D8CFBC]" />
                            Core System
                          </span>
                        ) : (
                          <button
                            onClick={() => setDeleteTarget(s)}
                            title="Hapus parameter kustom ini"
                            className="p-1 rounded-md text-[#8B8878] hover:text-rose-400 hover:bg-[#1C1D17] transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Title & Key */}
                    <h3 className="text-sm font-bold text-[#FFFBF4] leading-snug">
                      {getSettingHumanLabel(s.setting_key)}
                    </h3>
                    <code className="text-[11px] text-[#8B8878] font-mono block mt-0.5 select-all">
                      {s.setting_key}
                    </code>

                    {/* Description */}
                    {s.description && (
                      <p className="text-xs text-[#D8CFBC]/70 mt-2 leading-relaxed">
                        {s.description}
                      </p>
                    )}
                  </div>

                  {/* Input Control Tailored to Type */}
                  <div className="mt-4 pt-3 border-t border-[#D8CFBC]/15">
                    <div className="flex items-center gap-2">
                      {/* Specific AI Model selector */}
                      {s.setting_key === 'ai_model_name' ? (
                        <select
                          value={currentValue}
                          onChange={(e) => handleInputChange(s.setting_key, e.target.value)}
                          className="flex-1 text-xs bg-[#11120D] border border-[#D8CFBC]/20 rounded-xl px-3 py-2 text-[#FFFBF4] outline-none focus:border-[#D8CFBC] font-medium"
                        >
                          <option value="gemini-3.5-flash" className="bg-[#11120D] text-[#FFFBF4]">gemini-3.5-flash (Direkomendasikan - Cepat & Cerdas)</option>
                          <option value="gemini-3.5-flash-lite" className="bg-[#11120D] text-[#FFFBF4]">gemini-3.5-flash-lite (Hemat Kuota)</option>
                          <option value="gemini-2.5-flash" className="bg-[#11120D] text-[#FFFBF4]">gemini-2.5-flash</option>
                          <option value="gemini-flash-latest" className="bg-[#11120D] text-[#FFFBF4]">gemini-flash-latest</option>
                        </select>
                      ) : s.value_type === 'boolean' ? (
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() =>
                              handleInputChange(
                                s.setting_key,
                                currentValue === 'true' || currentValue === '1' ? 'false' : 'true'
                              )
                            }
                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${currentValue === 'true' || currentValue === '1' ? 'bg-[#D8CFBC]' : 'bg-[#11120D] border border-[#D8CFBC]/20'
                              }`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full shadow-md ring-0 transition duration-200 ease-in-out ${currentValue === 'true' || currentValue === '1' ? 'translate-x-5 bg-[#11120D]' : 'translate-x-0 bg-[#565449]'
                                }`}
                            />
                          </button>
                          <span className="text-xs font-semibold text-[#FFFBF4]">
                            {currentValue === 'true' || currentValue === '1' ? 'Aktif (TRUE)' : 'Nonaktif (FALSE)'}
                          </span>
                        </div>
                      ) : s.value_type === 'number' ? (
                        <div className="relative flex-1">
                          <input
                            type="number"
                            value={currentValue}
                            onChange={(e) => handleInputChange(s.setting_key, e.target.value)}
                            className="w-full text-xs font-semibold bg-[#11120D] border border-[#D8CFBC]/20 rounded-xl px-3 py-2 text-[#FFFBF4] outline-none focus:border-[#D8CFBC]"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-[#8B8878]">
                            {s.setting_key.includes('percent')
                              ? '%'
                              : s.setting_key.includes('fixed') || s.setting_key.includes('fee')
                                ? 'Rp'
                                : s.setting_key.includes('radius')
                                  ? 'Km'
                                  : s.setting_key.includes('min')
                                    ? 'Menit'
                                    : s.setting_key.includes('hours')
                                      ? 'Jam'
                                      : s.setting_key.includes('days')
                                        ? 'Hari'
                                        : ''}
                          </span>
                        </div>
                      ) : (
                        <input
                          type="text"
                          value={currentValue}
                          onChange={(e) => handleInputChange(s.setting_key, e.target.value)}
                          className="flex-1 text-xs bg-[#11120D] border border-[#D8CFBC]/20 rounded-xl px-3 py-2 text-[#FFFBF4] outline-none focus:border-[#D8CFBC] font-medium"
                        />
                      )}

                      {/* Single Save Action */}
                      {isModified && (
                        <button
                          onClick={() => handleSaveSettings(s.setting_key)}
                          disabled={isSaving}
                          title="Simpan parameter ini saja"
                          className="p-2 rounded-xl bg-[#FFFBF4] hover:bg-[#D8CFBC] text-[#11120D] text-xs font-bold shadow-sm transition hover:scale-105 active:scale-95"
                        >
                          {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>

                    {/* Metadata Terakhir Update */}
                    <div className="flex items-center justify-between text-[10px] text-[#8B8878] mt-2">
                      <span>
                        Diperbarui:{' '}
                        {new Date(s.updated_at).toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      {s.admin_email && (
                        <span className="truncate max-w-[150px]">Oleh: {s.admin_email}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal Tambah Parameter Baru */}
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#11120D]/80 backdrop-blur-md animate-in fade-in">
            <div className="bg-[#141510]/95 rounded-3xl border border-[#D8CFBC]/25 shadow-2xl max-w-md w-full p-6 space-y-4 backdrop-blur-2xl text-[#FFFBF4]">
              <div className="flex items-center justify-between border-b border-[#D8CFBC]/15 pb-3">
                <h3 className="text-base font-bold text-[#FFFBF4] flex items-center gap-2">
                  <Plus className="w-4 h-4 text-[#D8CFBC]" />
                  Tambah Parameter Konfigurasi
                </h3>
                <button
                  onClick={() => setIsAddModalOpen(false)}
                  className="p-1.5 rounded-xl text-[#8B8878] hover:text-[#FFFBF4] hover:bg-[#D8CFBC]/10 transition"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateSetting} className="space-y-3.5">
                <div>
                  <label className="text-xs font-semibold text-[#D8CFBC] block mb-1">
                    Nama Kunci Parameter (Snake Case) *
                  </label>
                  <input
                    type="text"
                    required
                    value={newSetting.setting_key}
                    onChange={(e) =>
                      setNewSetting({
                        ...newSetting,
                        setting_key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
                      })
                    }
                    placeholder="contoh: max_customer_discount_percent"
                    className="w-full text-xs font-mono bg-[#11120D] border border-[#D8CFBC]/20 rounded-xl px-3 py-2 text-[#FFFBF4] placeholder-[#8B8878] outline-none focus:border-[#D8CFBC]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-[#D8CFBC] block mb-1">
                      Tipe Nilai *
                    </label>
                    <select
                      value={newSetting.value_type}
                      onChange={(e) => setNewSetting({ ...newSetting, value_type: e.target.value as any })}
                      className="w-full text-xs bg-[#11120D] border border-[#D8CFBC]/20 rounded-xl px-3 py-2 text-[#FFFBF4] outline-none focus:border-[#D8CFBC]"
                    >
                      <option value="string" className="bg-[#11120D] text-[#FFFBF4]">String (Teks)</option>
                      <option value="number" className="bg-[#11120D] text-[#FFFBF4]">Number (Angka)</option>
                      <option value="boolean" className="bg-[#11120D] text-[#FFFBF4]">Boolean (True/False)</option>
                      <option value="json" className="bg-[#11120D] text-[#FFFBF4]">JSON (Data Objek)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-[#D8CFBC] block mb-1">
                      Kelompok Grup *
                    </label>
                    <select
                      value={newSetting.group_name}
                      onChange={(e) => setNewSetting({ ...newSetting, group_name: e.target.value })}
                      className="w-full text-xs bg-[#11120D] border border-[#D8CFBC]/20 rounded-xl px-3 py-2 text-[#FFFBF4] outline-none focus:border-[#D8CFBC]"
                    >
                      <option value="general" className="bg-[#11120D] text-[#FFFBF4]">Umum (general)</option>
                      <option value="fee" className="bg-[#11120D] text-[#FFFBF4]">Biaya (fee)</option>
                      <option value="dispatch" className="bg-[#11120D] text-[#FFFBF4]">Penugasan (dispatch)</option>
                      <option value="service" className="bg-[#11120D] text-[#FFFBF4]">Layanan (service)</option>
                      <option value="ai" className="bg-[#11120D] text-[#FFFBF4]">AI LLM (ai)</option>
                      <option value="complaint" className="bg-[#11120D] text-[#FFFBF4]">Pengaduan (complaint)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-[#D8CFBC] block mb-1">
                    Nilai Awal (Value) *
                  </label>
                  <input
                    type="text"
                    required
                    value={newSetting.setting_value}
                    onChange={(e) => setNewSetting({ ...newSetting, setting_value: e.target.value })}
                    placeholder="Masukkan nilai awal parameter"
                    className="w-full text-xs bg-[#11120D] border border-[#D8CFBC]/20 rounded-xl px-3 py-2 text-[#FFFBF4] placeholder-[#8B8878] outline-none focus:border-[#D8CFBC]"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-[#D8CFBC] block mb-1">
                    Keterangan / Deskripsi
                  </label>
                  <textarea
                    rows={2}
                    value={newSetting.description}
                    onChange={(e) => setNewSetting({ ...newSetting, description: e.target.value })}
                    placeholder="Penjelasan fungsi parameter ini untuk operasional sistem..."
                    className="w-full text-xs bg-[#11120D] border border-[#D8CFBC]/20 rounded-xl px-3 py-2 text-[#FFFBF4] placeholder-[#8B8878] outline-none focus:border-[#D8CFBC] resize-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#D8CFBC]/15">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="px-3.5 py-2 rounded-xl border border-[#D8CFBC]/20 text-[#D8CFBC] text-xs font-semibold hover:text-[#FFFBF4] hover:bg-[#1C1D17] transition"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isAdding}
                    className="px-4 py-2 rounded-xl bg-[#FFFBF4] hover:bg-[#D8CFBC] text-[#11120D] text-xs font-bold shadow-md flex items-center gap-1.5 transition hover:scale-105 active:scale-95 disabled:opacity-50"
                  >
                    {isAdding && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>Simpan Parameter</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal Konfirmasi Hapus Parameter Kustom */}
        {deleteTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#11120D]/80 backdrop-blur-md animate-in fade-in">
            <div className="bg-[#141510]/95 rounded-3xl border border-[#D8CFBC]/25 shadow-2xl max-w-sm w-full p-6 space-y-3 backdrop-blur-2xl text-[#FFFBF4]">
              <div className="flex items-center gap-3 text-rose-400">
                <AlertCircle className="w-6 h-6 shrink-0" />
                <h3 className="text-sm font-bold text-[#FFFBF4]">Konfirmasi Hapus Parameter</h3>
              </div>
              <p className="text-xs text-[#D8CFBC]/70">
                Apakah Anda yakin ingin menghapus parameter konfigurasi{' '}
                <strong className="text-[#FFFBF4]">{deleteTarget.setting_key}</strong>? Tindakan ini akan dicatat ke
                audit log dan tidak dapat dibatalkan.
              </p>
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#D8CFBC]/15">
                <button
                  onClick={() => setDeleteTarget(null)}
                  disabled={isDeleting}
                  className="px-3.5 py-1.5 rounded-xl border border-[#D8CFBC]/20 text-[#D8CFBC] text-xs font-semibold hover:text-[#FFFBF4] hover:bg-[#1C1D17] transition"
                >
                  Batal
                </button>
                <button
                  onClick={handleDeleteSetting}
                  disabled={isDeleting}
                  className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md flex items-center gap-1.5 transition hover:scale-105 active:scale-95 disabled:opacity-50"
                >
                  {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Ya, Hapus</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
