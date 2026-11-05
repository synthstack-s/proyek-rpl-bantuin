'use client';

import { useState } from 'react';
import { Star, X, Loader2, Image as ImageIcon, CheckCircle2, ShieldCheck } from 'lucide-react';

interface RepairReviewModalProps {
  repairId?: number;
  repairRequestId?: number;
  orderCode: string;
  technicianName: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  onReviewSubmitted?: () => void | Promise<void>;
}

const RATING_LABELS = ['', 'Sangat Buruk 😞', 'Kurang Memuaskan 🙁', 'Cukup Baik 😐', 'Memuaskan / Bagus 😊', 'Sangat Puas / Luar Biasa! 🌟'];

export default function RepairReviewModal({
  repairId,
  repairRequestId,
  orderCode,
  technicianName,
  isOpen,
  onClose,
  onSuccess,
  onReviewSubmitted,
}: RepairReviewModalProps) {
  const effectiveRepairId = repairId ?? repairRequestId ?? 0;
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [reviewText, setReviewText] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (photos.length >= 5) {
      alert('Maksimal melampirkan 5 foto ulasan');
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', 'reviews');

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (res.ok && data.success && data.data?.url) {
        setPhotos([...photos, data.data.url]);
      } else {
        alert(data.message || 'Gagal mengunggah foto');
      }
    } catch {
      alert('Terjadi kesalahan saat mengunggah foto');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating < 1 || rating > 5) {
      setErrorMsg('Silakan pilih rating bintang 1 sampai 5');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/customer/repairs/${effectiveRepairId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating,
          review_text: reviewText.trim() || null,
          photos,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Gagal menyimpan ulasan');
      }

      alert('Terima kasih! Ulasan dan apresiasi Anda berhasil disimpan.');
      if (onSuccess) onSuccess();
      if (onReviewSubmitted) await onReviewSubmitted();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Terjadi kesalahan sistem');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#11120D]/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#181913]/95 border border-[#D8CFBC]/25 rounded-3xl shadow-2xl backdrop-blur-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Top Rim Reflection */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-[#D8CFBC]/30 to-transparent" />

        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#D8CFBC]/15 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shadow-inner">
              <Star className="w-5 h-5 fill-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#FFFBF4]">Beri Ulasan & Rating</h3>
              <p className="text-[11px] text-[#D8CFBC]/70 font-mono">Pesanan #{orderCode}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-[#D8CFBC]/70 hover:text-[#FFFBF4] hover:bg-[#D8CFBC]/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs">
              {errorMsg}
            </div>
          )}

          <div className="text-center py-2">
            <p className="text-xs text-[#D8CFBC] mb-2 leading-relaxed">
              Bagaimana kualitas pelayanan teknisi <span className="font-semibold text-[#FFFBF4]">{technicianName}</span>?
            </p>

            {/* Stars */}
            <div className="flex items-center justify-center gap-2 my-2.5">
              {[1, 2, 3, 4, 5].map((star) => {
                const isFilled = (hoverRating || rating) >= star;
                return (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    className="p-1 transition-transform hover:scale-115 focus:outline-none"
                  >
                    <Star
                      className={`w-7 h-7 sm:w-8 sm:h-8 transition-colors ${
                        isFilled ? 'text-amber-400 fill-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.6)]' : 'text-[#565449]'
                      }`}
                    />
                  </button>
                );
              })}
            </div>
            <p className="text-xs font-semibold text-amber-300 min-h-[1.25rem]">
              {RATING_LABELS[hoverRating || rating]}
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#D8CFBC] mb-1.5">
              Ulasan & Testimoni Pelanggan (Opsional)
            </label>
            <textarea
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              placeholder="Ceritakan pengalaman Anda terkait ketepatan waktu, kerapian kerja, dan hasil servis..."
              rows={3}
              maxLength={1000}
              className="w-full bg-[#11120D] border border-[#D8CFBC]/20 rounded-2xl p-3 text-xs text-[#FFFBF4] placeholder-[#8B8878] focus:outline-none focus:border-[#D8CFBC] transition-colors"
            />
          </div>

          {/* Photo attachments */}
          <div>
            <label className="block text-xs font-medium text-[#D8CFBC] mb-1.5">
              Lampirkan Foto Hasil Servis (Opsional)
            </label>
            <div className="flex flex-wrap gap-2 items-center">
              {photos.map((url, idx) => (
                <div key={idx} className="relative w-14 h-14 rounded-xl overflow-hidden border border-[#D8CFBC]/25 group">
                  <img src={url} alt="Review attachment" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setPhotos(photos.filter((_, i) => i !== idx))}
                    className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-rose-400 transition-opacity"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}

              {photos.length < 5 && (
                <label className="w-14 h-14 rounded-xl border-2 border-dashed border-[#D8CFBC]/30 hover:border-[#D8CFBC] flex flex-col items-center justify-center cursor-pointer transition-all bg-[#11120D]/60 hover:bg-[#11120D]">
                  {isUploading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-[#D8CFBC]" />
                  ) : (
                    <>
                      <ImageIcon className="w-4 h-4 text-[#D8CFBC]" />
                      <span className="text-[9px] text-[#D8CFBC]/80 mt-0.5">+ Foto</span>
                    </>
                  )}
                  <input
                    type="file"
                    onChange={handleFileUpload}
                    accept="image/jpeg,image/png,image/webp"
                    disabled={isUploading}
                    className="hidden"
                  />
                </label>
              )}
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-[#D8CFBC] hover:text-[#FFFBF4] hover:bg-[#1C1D17] transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-[#FFFBF4] hover:bg-[#D8CFBC] text-[#11120D] font-bold text-xs shadow-lg transition-all flex items-center gap-1.5 disabled:opacity-50 hover:scale-105 active:scale-95"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <>
                  <Star className="w-3.5 h-3.5 fill-[#11120D]" />
                  <span>Kirim Ulasan</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
