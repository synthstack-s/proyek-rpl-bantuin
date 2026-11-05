'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Wrench,
  Layers,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Coins,
  Clock,
  Camera,
  Plus,
  Trash2,
  Navigation,
  FileText,
  ShieldCheck,
  Image as ImageIcon,
} from 'lucide-react';
import InteractiveLocationPicker from '@/components/location/InteractiveLocationPicker';

interface ServiceItem {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  basePrice: number;
  estimatedDurationMin: number;
}

interface CategoryItem {
  id: number;
  name: string;
  slug: string;
  iconUrl: string | null;
  description: string | null;
  services: ServiceItem[];
}

export default function NewRepairOrderPage() {
  const router = useRouter();

  // State Data Master
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);

  // State Form Wizard (Step 1 -> Step 2 -> Step 3)
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [selectedCategory, setSelectedCategory] = useState<CategoryItem | null>(null);
  const [selectedService, setSelectedService] = useState<ServiceItem | null>(null);
  const [aiSessionId, setAiSessionId] = useState<number | null>(null);

  const [formData, setFormData] = useState({
    device_brand: '',
    device_model: '',
    problem_description: '',
    problem_photos: [] as string[],
    new_photo_url: '',
    address_text: '',
    latitude: -6.2088,
    longitude: 106.8456,
  });

  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [locationSuccess, setLocationSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (formData.problem_photos.length >= 5) {
      setErrorMsg('Maksimal 5 foto kerusakan yang dapat dilampirkan.');
      return;
    }

    setIsUploadingPhoto(true);
    setErrorMsg(null);
    try {
      const uploadData = new FormData();
      uploadData.append('file', file);
      uploadData.append('folder', 'repairs');

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: uploadData,
      });

      const data = await res.json();
      if (res.ok && data.success && data.data?.url) {
        setFormData((prev) => ({
          ...prev,
          problem_photos: [...prev.problem_photos, data.data.url],
        }));
      } else {
        setErrorMsg(data.message || 'Gagal mengunggah foto');
      }
    } catch {
      setErrorMsg('Terjadi kesalahan jaringan saat mengunggah foto');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  // 1. Fetch Katalog Kategori & Layanan
  useEffect(() => {
    async function loadCatalog() {
      setIsLoadingCatalog(true);
      try {
        const res = await fetch('/api/customer/catalog');
        const data = await res.json();
        if (data.success && data.data?.categories) {
          setCategories(data.data.categories);
        }
      } catch (err) {
        console.error('Gagal mengambil katalog:', err);
      } finally {
        setIsLoadingCatalog(false);
      }
    }
    loadCatalog();
  }, []);

  // Pre-fill dari URL Search Params (misal dialihkan dari Chatbot AI)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const preCategoryId = params.get('category_id');
      const preSymptoms = params.get('symptoms');
      const preAiSessionId = params.get('ai_session_id');

      if (preAiSessionId) {
        setAiSessionId(Number(preAiSessionId));
      }
      if (preSymptoms) {
        setFormData(prev => ({
          ...prev,
          problem_description: preSymptoms,
        }));
      }
      if (preCategoryId && categories.length > 0) {
        const found = categories.find(c => c.id === Number(preCategoryId));
        if (found) {
          setSelectedCategory(found);
        }
      }
    }
  }, [categories]);

  // Handler Pilih Kategori
  const handleSelectCategory = (cat: CategoryItem) => {
    setSelectedCategory(cat);
    setSelectedService(null);
  };

  // Handler Tambah URL Foto
  const handleAddPhoto = () => {
    if (!formData.new_photo_url.trim()) return;
    try {
      new URL(formData.new_photo_url);
      if (formData.problem_photos.length >= 5) {
        setErrorMsg('Maksimal 5 foto kerusakan yang dapat dilampirkan.');
        return;
      }
      setFormData((prev) => ({
        ...prev,
        problem_photos: [...prev.problem_photos, prev.new_photo_url.trim()],
        new_photo_url: '',
      }));
      setErrorMsg(null);
    } catch {
      setErrorMsg('Masukkan URL foto kerusakan yang valid (diawali https:// atau http://).');
    }
  };

  const handleRemovePhoto = (idx: number) => {
    setFormData((prev) => ({
      ...prev,
      problem_photos: prev.problem_photos.filter((_, i) => i !== idx),
    }));
  };

  // Deteksi Lokasi via Geolocation Browser
  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      setErrorMsg('Peramban Anda tidak mendukung deteksi lokasi otomatis.');
      return;
    }

    setIsDetectingLocation(true);
    setErrorMsg(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFormData((prev) => ({
          ...prev,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        }));
        setIsDetectingLocation(false);
        setLocationSuccess(true);
      },
      () => {
        setIsDetectingLocation(false);
        setErrorMsg('Gagal mendeteksi lokasi otomatis. Silakan ketikkan alamat lengkap pengerjaan.');
      },
      { timeout: 8000 }
    );
  };

  // Navigasi Langkah
  const handleNextStep = () => {
    setErrorMsg(null);
    if (step === 1) {
      if (!selectedCategory) {
        setErrorMsg('Silakan pilih salah satu kategori peralatan elektronik yang ingin diperbaiki.');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (formData.problem_description.trim().length < 10) {
        setErrorMsg('Deskripsi kendala kerusakan minimal 10 karakter agar teknisi memahami masalah.');
        return;
      }
      setStep(3);
    }
  };

  // Submit Buat Pesanan
  const handleSubmitOrder = async () => {
    if (!selectedCategory) return;
    if (formData.address_text.trim().length < 10) {
      setErrorMsg('Alamat lengkap pengerjaan servis minimal 10 karakter.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/customer/repairs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category_id: selectedCategory.id,
          service_id: selectedService?.id || null,
          ai_session_id: aiSessionId || undefined,
          device_brand: formData.device_brand.trim() || undefined,
          device_model: formData.device_model.trim() || undefined,
          problem_description: formData.problem_description.trim(),
          problem_photos: formData.problem_photos,
          address_text: formData.address_text.trim(),
          latitude: formData.latitude,
          longitude: formData.longitude,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMsg(data.message || 'Gagal mengajukan pesanan servis.');
        setIsSubmitting(false);
        return;
      }

      router.push(data.data?.redirectUrl || `/customer/repairs/${data.data?.id}`);
    } catch {
      setErrorMsg('Terjadi kesalahan jaringan saat mengajukan pesanan servis.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#11120D] text-[#FFFBF4] p-4 sm:p-8 lg:p-12 relative overflow-hidden selection:bg-[#D8CFBC]/25 selection:text-[#FFFBF4]">
      {/* Ambient background light */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[350px] bg-gradient-to-b from-[#565449]/20 via-[#D8CFBC]/10 to-transparent blur-[140px] pointer-events-none rounded-full" />
      <div className="absolute bottom-10 right-0 w-80 h-80 bg-[#565449]/15 rounded-full blur-[110px] pointer-events-none" />

      <div className="max-w-4xl mx-auto space-y-8 relative z-10">
        {/* Top Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#D8CFBC]/15">
          <Link
            href="/customer/dashboard"
            className="inline-flex items-center gap-2 text-xs font-semibold text-[#ABA291] hover:text-[#FFFBF4] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Kembali ke Dashboard</span>
          </Link>

          <span className="text-xs text-[#D8CFBC] font-mono font-semibold">
            LANGKAH {step} DARI 3
          </span>
        </div>

        {/* Step Progress Indicators */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <div
            className={`p-3 rounded-2xl border text-center transition-all ${
              step >= 1
                ? 'bg-[#181913]/90 border-[#D8CFBC]/30 text-[#FFFBF4] font-semibold shadow-xs'
                : 'bg-[#181913]/40 border-[#565449]/20 text-[#8C8678]'
            }`}
          >
            <span className="text-xs">1. Pilih Peralatan</span>
          </div>

          <div
            className={`p-3 rounded-2xl border text-center transition-all ${
              step >= 2
                ? 'bg-[#181913]/90 border-[#D8CFBC]/30 text-[#FFFBF4] font-semibold shadow-xs'
                : 'bg-[#181913]/40 border-[#565449]/20 text-[#8C8678]'
            }`}
          >
            <span className="text-xs">2. Gejala Kerusakan</span>
          </div>

          <div
            className={`p-3 rounded-2xl border text-center transition-all ${
              step >= 3
                ? 'bg-[#181913]/90 border-[#D8CFBC]/30 text-[#FFFBF4] font-semibold shadow-xs'
                : 'bg-[#181913]/40 border-[#565449]/20 text-[#8C8678]'
            }`}
          >
            <span className="text-xs">3. Alamat & Konfirmasi</span>
          </div>
        </div>

        {/* Error Alert Box */}
        {errorMsg && (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3 text-rose-300 text-xs sm:text-sm animate-in fade-in">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">{errorMsg}</div>
          </div>
        )}

        {/* STEP 1: PILIH KATEGORI & PAKET LAYANAN */}
        {step === 1 && (
          <div className="space-y-6 animate-in fade-in">
            <div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-[#FFFBF4] tracking-tight">
                Pilih Peralatan yang Perlu Diperbaiki
              </h2>
              <p className="text-xs sm:text-sm text-[#ABA291] mt-1">
                Pilih kategori perangkat rumah tangga Anda, lalu tentukan paket pengerjaan atau pilih opsi diagnosis umum.
              </p>
            </div>

            {isLoadingCatalog ? (
              <div className="py-16 text-center text-[#ABA291] flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-[#D8CFBC]" />
                <p className="text-xs">Memuat katalog kategori layanan...</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {categories.map((cat) => {
                  const isSelected = selectedCategory?.id === cat.id;
                  return (
                    <div
                      key={cat.id}
                      onClick={() => handleSelectCategory(cat)}
                      className={`p-5 rounded-2xl border cursor-pointer transition-all hover:scale-[1.01] relative overflow-hidden ${
                        isSelected
                          ? 'bg-[#181913]/95 border-[#D8CFBC] text-[#FFFBF4] shadow-xl ring-1 ring-[#D8CFBC]/50'
                          : 'bg-[#181913]/70 border-[#D8CFBC]/15 hover:border-[#D8CFBC]/30 text-[#D8CFBC]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs ${
                            isSelected
                              ? 'bg-[#FFFBF4] text-[#11120D]'
                              : 'bg-[#22241D] text-[#D8CFBC]'
                          }`}
                        >
                          <Wrench className="w-5 h-5" />
                        </div>
                        {isSelected && (
                          <CheckCircle2 className="w-5 h-5 text-[#FFFBF4]" />
                        )}
                      </div>

                      <h3 className="font-bold text-sm text-[#FFFBF4]">{cat.name}</h3>
                      <p className="text-[11px] text-[#ABA291] mt-1 line-clamp-2">
                        {cat.description || 'Layanan perbaikan dan servis berkala.'}
                      </p>
                      <span className="inline-block mt-3 text-[10px] font-semibold text-[#D8CFBC] bg-[#565449]/25 px-2 py-0.5 rounded-full border border-[#D8CFBC]/15">
                        {cat.services.length} Paket Layanan
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Opsi Paket Layanan Spesifik */}
            {selectedCategory && (
              <div className="mt-8 p-6 rounded-3xl bg-[#181913]/80 backdrop-blur-2xl border border-[#D8CFBC]/20 space-y-4 animate-in slide-in-from-top-4 relative overflow-hidden">
                <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-[#FFFBF4]/15 to-transparent pointer-events-none" />

                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-[#FFFBF4]">
                      Pilihan Paket Servis: {selectedCategory.name}
                    </h3>
                    <p className="text-xs text-[#ABA291]">
                      Pilih paket jika Anda sudah tahu tindakan yang dibutuhkan, atau biarkan kosong untuk diagnosis umum oleh teknisi.
                    </p>
                  </div>
                  {selectedService && (
                    <button
                      onClick={() => setSelectedService(null)}
                      className="text-xs text-rose-400 hover:underline"
                    >
                      Batalkan Pilihan Paket
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Default Option: Diagnosis Kerusakan */}
                  <div
                    onClick={() => setSelectedService(null)}
                    className={`p-4 rounded-xl border cursor-pointer transition-all ${
                      selectedService === null
                        ? 'bg-[#22241D]/90 border-[#D8CFBC] text-[#FFFBF4] ring-1 ring-[#D8CFBC]/40'
                        : 'bg-[#11120D]/60 border-[#565449]/30 text-[#D8CFBC] hover:bg-[#181913]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#FFFBF4]">
                        Inspeksi & Diagnosis Umum
                      </span>
                      {selectedService === null && (
                        <CheckCircle2 className="w-4 h-4 text-[#FFFBF4]" />
                      )}
                    </div>
                    <p className="text-[11px] text-[#ABA291] mt-1">
                      Teknisi akan memeriksa unit di lokasi dan memberikan estimasi rincian biaya setelah pembongkaran.
                    </p>
                  </div>

                  {/* Spesifik Services dari DB */}
                  {selectedCategory.services.map((svc) => {
                    const isSvcSelected = selectedService?.id === svc.id;
                    return (
                      <div
                        key={svc.id}
                        onClick={() => setSelectedService(svc)}
                        className={`p-4 rounded-xl border cursor-pointer transition-all ${
                          isSvcSelected
                            ? 'bg-[#22241D]/90 border-[#D8CFBC] text-[#FFFBF4] ring-1 ring-[#D8CFBC]/40'
                            : 'bg-[#11120D]/60 border-[#565449]/30 text-[#D8CFBC] hover:bg-[#181913]'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-[#FFFBF4]">
                            {svc.name}
                          </span>
                          {isSvcSelected && (
                            <CheckCircle2 className="w-4 h-4 text-[#FFFBF4]" />
                          )}
                        </div>
                        <p className="text-[11px] text-[#ABA291] mt-1 line-clamp-1">
                          {svc.description}
                        </p>
                        <div className="flex items-center justify-between mt-2 text-[11px]">
                          <span className="font-bold text-emerald-400 font-mono">
                            Rp {svc.basePrice.toLocaleString('id-ID')}
                          </span>
                          <span className="text-[#8C8678] flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>{svc.estimatedDurationMin} mnt</span>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="pt-4 flex justify-end">
              <button
                type="button"
                onClick={handleNextStep}
                disabled={!selectedCategory}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#FFFBF4] hover:bg-[#EAE3D5] text-[#11120D] font-bold text-xs sm:text-sm shadow-lg shadow-black/30 transition-all disabled:opacity-50"
              >
                <span>Lanjut ke Gejala Kerusakan</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: DETAIL PERANGKAT & DESKRIPSI KELUHAN */}
        {step === 2 && (
          <div className="space-y-6 animate-in fade-in">
            <div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-[#FFFBF4] tracking-tight">
                Jelaskan Kendala Perangkat Anda
              </h2>
              <p className="text-xs sm:text-sm text-[#ABA291] mt-1">
                Kategori: <strong className="text-[#D8CFBC]">{selectedCategory?.name}</strong>{' '}
                {selectedService ? `• Paket: ${selectedService.name}` : '• Inspeksi & Diagnosis Umum'}
              </p>
            </div>

            <div className="p-6 rounded-3xl bg-[#181913]/80 backdrop-blur-2xl border border-[#D8CFBC]/20 space-y-4 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-[#FFFBF4]/15 to-transparent pointer-events-none" />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Merek Perangkat */}
                <div>
                  <label className="block text-xs font-semibold text-[#D8CFBC] mb-1.5">
                    Merek Perangkat <span className="text-[#8C8678] font-normal">(Opsional)</span>
                  </label>
                  <input
                    type="text"
                    value={formData.device_brand}
                    onChange={(e) => setFormData({ ...formData, device_brand: e.target.value })}
                    placeholder="Contoh: Daikin, Samsung, Sharp, LG"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#565449]/40 bg-[#11120D]/70 text-sm text-[#FFFBF4] placeholder-[#706E61] focus:outline-none focus:border-[#D8CFBC] focus:ring-1 focus:ring-[#D8CFBC]/20 transition-all backdrop-blur-sm"
                  />
                </div>

                {/* Model / Tipe Perangkat */}
                <div>
                  <label className="block text-xs font-semibold text-[#D8CFBC] mb-1.5">
                    Tipe / Model <span className="text-[#8C8678] font-normal">(Opsional)</span>
                  </label>
                  <input
                    type="text"
                    value={formData.device_model}
                    onChange={(e) => setFormData({ ...formData, device_model: e.target.value })}
                    placeholder="Contoh: 1 PK Inverter, 2 Pintu, Top Loading"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#565449]/40 bg-[#11120D]/70 text-sm text-[#FFFBF4] placeholder-[#706E61] focus:outline-none focus:border-[#D8CFBC] focus:ring-1 focus:ring-[#D8CFBC]/20 transition-all backdrop-blur-sm"
                  />
                </div>
              </div>

              {/* Deskripsi Kerusakan */}
              <div>
                <label className="block text-xs font-semibold text-[#D8CFBC] mb-1.5">
                  Deskripsi Kerusakan / Gejala yang Terjadi <span className="text-rose-400">*</span>
                </label>
                <textarea
                  rows={4}
                  required
                  value={formData.problem_description}
                  onChange={(e) => setFormData({ ...formData, problem_description: e.target.value })}
                  placeholder="Ceritakan apa yang terjadi (misal: AC keluar angin saja tidak dingin, outdoor berbunyi keras, lampu indikator berkedip, air bocor menetes ke dalam kamar)..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#565449]/40 bg-[#11120D]/70 text-sm text-[#FFFBF4] placeholder-[#706E61] focus:outline-none focus:border-[#D8CFBC] focus:ring-1 focus:ring-[#D8CFBC]/20 transition-all resize-none backdrop-blur-sm"
                />
                <span className="text-[11px] text-[#8C8678]">
                  Minimal 10 karakter. Informasi lengkap memudahkan teknisi membawa peralatan dan suku cadang yang tepat.
                </span>
              </div>

              {/* Lampiran Foto Kerusakan */}
              <div className="pt-2 border-t border-[#565449]/30">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-[#D8CFBC]">
                    Foto Bukti Kerusakan <span className="text-[#8C8678] font-normal">(Maksimal 5 foto)</span>
                  </label>
                  <label className="cursor-pointer inline-flex items-center gap-1.5 text-xs text-[#FFFBF4] hover:text-[#D8CFBC] font-medium">
                    {isUploadingPhoto ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Mengunggah...</span>
                      </>
                    ) : (
                      <>
                        <Camera className="w-3.5 h-3.5" />
                        <span>Upload dari File / Galeri</span>
                      </>
                    )}
                    <input
                      type="file"
                      onChange={handleUploadFile}
                      accept="image/jpeg,image/png,image/webp"
                      disabled={isUploadingPhoto || formData.problem_photos.length >= 5}
                      className="hidden"
                    />
                  </label>
                </div>

                <div className="flex gap-2">
                  <input
                    type="url"
                    value={formData.new_photo_url}
                    onChange={(e) => setFormData({ ...formData, new_photo_url: e.target.value })}
                    placeholder="Atau tempel URL gambar (https://...)"
                    className="flex-1 px-3.5 py-2 rounded-xl border border-[#565449]/40 bg-[#11120D]/70 text-xs sm:text-sm text-[#FFFBF4] placeholder-[#706E61] focus:outline-none focus:border-[#D8CFBC]"
                  />
                  <button
                    type="button"
                    onClick={handleAddPhoto}
                    className="px-4 py-2 rounded-xl bg-[#565449]/30 hover:bg-[#565449]/50 text-xs font-semibold text-[#D8CFBC] hover:text-[#FFFBF4] border border-[#D8CFBC]/15 flex items-center gap-1.5 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tambah URL</span>
                  </button>
                </div>

                {/* List Foto Terlampir */}
                {formData.problem_photos.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {formData.problem_photos.map((url, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-2 rounded-lg bg-[#11120D]/80 border border-[#565449]/30 text-xs text-[#D8CFBC]"
                      >
                        <span className="truncate max-w-md">{url}</span>
                        <button
                          type="button"
                          onClick={() => handleRemovePhoto(i)}
                          className="text-rose-400 hover:text-rose-300 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between pt-4">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-[#D8CFBC]/15 bg-[#181913] text-[#D8CFBC] hover:text-[#FFFBF4] hover:bg-[#22241D] text-xs sm:text-sm font-semibold transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Sebelumnya</span>
              </button>

              <button
                type="button"
                onClick={handleNextStep}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#FFFBF4] hover:bg-[#EAE3D5] text-[#11120D] font-bold text-xs sm:text-sm shadow-lg shadow-black/30 transition-all"
              >
                <span>Lanjut ke Alamat Pengerjaan</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: ALAMAT & KONFIRMASI */}
        {step === 3 && (
          <div className="space-y-6 animate-in fade-in">
            <div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-[#FFFBF4] tracking-tight">
                Lokasi Pengerjaan & Konfirmasi
              </h2>
              <p className="text-xs sm:text-sm text-[#ABA291] mt-1">
                Tentukan alamat lengkap tempat unit peralatan berada agar teknisi dapat menjangkau lokasi Anda.
              </p>
            </div>

            <div className="p-6 rounded-3xl bg-[#181913]/80 backdrop-blur-2xl border border-[#D8CFBC]/20 space-y-4 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-[#FFFBF4]/15 to-transparent pointer-events-none" />

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-[#D8CFBC]">
                    Alamat Lengkap Rumah / Kantor <span className="text-rose-400">*</span>
                  </label>

                  <button
                    type="button"
                    onClick={handleGetLocation}
                    disabled={isDetectingLocation}
                    className="inline-flex items-center gap-1.5 text-xs text-[#D8CFBC] hover:text-[#FFFBF4] transition-colors disabled:opacity-50"
                  >
                    {isDetectingLocation ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Navigation className="w-3.5 h-3.5" />
                    )}
                    <span>Deteksi Lokasi GPS</span>
                  </button>
                </div>

                <textarea
                  rows={3}
                  required
                  value={formData.address_text}
                  onChange={(e) => setFormData({ ...formData, address_text: e.target.value })}
                  placeholder="Contoh: Jl. Sudirman No. 45, RT 02 / RW 05, Kel. Karet Tengsin, Tanah Abang, Jakarta Pusat (Patokan: Depan minimarket, pagar hitam)..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#565449]/40 bg-[#11120D]/70 text-sm text-[#FFFBF4] placeholder-[#706E61] focus:outline-none focus:border-[#D8CFBC] focus:ring-1 focus:ring-[#D8CFBC]/20 transition-all resize-none backdrop-blur-sm"
                />

                {locationSuccess && (
                  <p className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Koordinat GPS berhasil disinkronkan ({formData.latitude.toFixed(4)}, {formData.longitude.toFixed(4)})</span>
                  </p>
                )}

                {/* Interactive Location Picker */}
                <div className="mt-4">
                  <InteractiveLocationPicker
                    latitude={formData.latitude}
                    longitude={formData.longitude}
                    addressText={formData.address_text}
                    onChange={(coords) =>
                      setFormData((prev) => ({
                        ...prev,
                        latitude: coords.latitude,
                        longitude: coords.longitude,
                        address_text: coords.addressText !== undefined ? coords.addressText : prev.address_text,
                      }))
                    }
                  />
                </div>
              </div>

              {/* Rangkuman Pesanan */}
              <div className="mt-4 p-4 rounded-2xl bg-[#11120D]/80 border border-[#565449]/30 space-y-2 text-xs">
                <span className="font-bold text-[#D8CFBC] block uppercase tracking-wider text-[10px]">
                  Ringkasan Pesanan Servis
                </span>

                <div className="flex justify-between py-1 border-b border-[#565449]/20 text-[#ABA291]">
                  <span>Kategori Peralatan:</span>
                  <span className="font-bold text-[#FFFBF4]">{selectedCategory?.name}</span>
                </div>

                <div className="flex justify-between py-1 border-b border-[#565449]/20 text-[#ABA291]">
                  <span>Paket Servis:</span>
                  <span className="font-bold text-[#D8CFBC]">
                    {selectedService?.name || 'Inspeksi & Diagnosis Lapangan'}
                  </span>
                </div>

                {selectedService && (
                  <div className="flex justify-between py-1 border-b border-[#565449]/20 text-[#ABA291]">
                    <span>Estimasi Biaya Jasa Dasar:</span>
                    <span className="font-bold text-emerald-400 font-mono">
                      Rp {selectedService.basePrice.toLocaleString('id-ID')}
                    </span>
                  </div>
                )}

                <div className="flex justify-between py-1 text-[#ABA291]">
                  <span>Merek & Tipe:</span>
                  <span className="font-bold text-[#FFFBF4]">
                    {formData.device_brand || '-'} {formData.device_model}
                  </span>
                </div>
              </div>
            </div>

            {/* Proteksi Garansi */}
            <div className="p-4 rounded-2xl bg-[#181913]/70 border border-[#D8CFBC]/20 flex items-center gap-3 text-xs text-[#D8CFBC] backdrop-blur-md">
              <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
              <span>
                <strong className="text-[#FFFBF4]">Jaminan BANTUIN:</strong> Pengerjaan servis dilindungi garansi resmi hingga 30 hari. Biaya pengerjaan transparan tanpa tarif tersembunyi.
              </span>
            </div>

            <div className="flex items-center justify-between pt-4">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-[#D8CFBC]/15 bg-[#181913] text-[#D8CFBC] hover:text-[#FFFBF4] hover:bg-[#22241D] text-xs sm:text-sm font-semibold transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Sebelumnya</span>
              </button>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleSubmitOrder}
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-[#FFFBF4] hover:bg-[#EAE3D5] text-[#11120D] font-bold text-xs sm:text-sm shadow-lg shadow-black/30 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-[#11120D]" />
                    <span>Menerbitkan Kode Pesanan...</span>
                  </>
                ) : (
                  <>
                    <span>Ajukan Pesanan Sekarang</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
