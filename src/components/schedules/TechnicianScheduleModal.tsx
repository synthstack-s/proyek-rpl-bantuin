'use client';

import { useState } from 'react';
import { Calendar, Clock, X, Loader2 } from 'lucide-react';

interface TechnicianScheduleModalProps {
  repairId: number;
  orderCode: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  isReschedule?: boolean;
}

export default function TechnicianScheduleModal({
  repairId,
  orderCode,
  isOpen,
  onClose,
  onSuccess,
  isReschedule = false,
}: TechnicianScheduleModalProps) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const defaultDate = tomorrow.toISOString().slice(0, 10);

  const [scheduledDate, setScheduledDate] = useState(defaultDate);
  const [timeSlotStart, setTimeSlotStart] = useState('09:00');
  const [timeSlotEnd, setTimeSlotEnd] = useState('11:00');
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (timeSlotEnd <= timeSlotStart) {
      setErrorMsg('Jam selesai kunjungan harus lebih besar dari jam mulai');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/repairs/${repairId}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduled_date: scheduledDate,
          time_slot_start: timeSlotStart,
          time_slot_end: timeSlotEnd,
          reschedule_reason: isReschedule ? rescheduleReason.trim() : null,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Gagal menyimpan jadwal kunjungan');
      }

      alert('Jadwal kunjungan fisik berhasil ditetapkan dan diberitahukan ke pelanggan.');
      onSuccess();
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

        <div className="p-4 sm:p-5 border-b border-[#D8CFBC]/15 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#D8CFBC]/10 border border-[#D8CFBC]/20 text-[#D8CFBC] flex items-center justify-center shadow-inner">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#FFFBF4]">
                {isReschedule ? 'Ubah Jadwal Kunjungan' : 'Atur Jadwal Kunjungan Fisik'}
              </h3>
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

        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs">
              {errorMsg}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[#D8CFBC] mb-1.5">Tanggal Kunjungan</label>
            <input
              type="date"
              value={scheduledDate}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setScheduledDate(e.target.value)}
              required
              className="w-full bg-[#11120D] border border-[#D8CFBC]/20 rounded-xl px-3.5 py-2.5 text-xs text-[#FFFBF4] focus:outline-none focus:border-[#D8CFBC] transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#D8CFBC] mb-1.5">Jam Mulai</label>
              <div className="relative">
                <input
                  type="time"
                  value={timeSlotStart}
                  onChange={(e) => setTimeSlotStart(e.target.value)}
                  required
                  className="w-full bg-[#11120D] border border-[#D8CFBC]/20 rounded-xl px-3.5 py-2.5 text-xs text-[#FFFBF4] focus:outline-none focus:border-[#D8CFBC] transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#D8CFBC] mb-1.5">Jam Selesai</label>
              <div className="relative">
                <input
                  type="time"
                  value={timeSlotEnd}
                  onChange={(e) => setTimeSlotEnd(e.target.value)}
                  required
                  className="w-full bg-[#11120D] border border-[#D8CFBC]/20 rounded-xl px-3.5 py-2.5 text-xs text-[#FFFBF4] focus:outline-none focus:border-[#D8CFBC] transition-colors"
                />
              </div>
            </div>
          </div>

          {isReschedule && (
            <div>
              <label className="block text-xs font-medium text-[#D8CFBC] mb-1.5">
                Alasan Penjadwalan Ulang (Opsional)
              </label>
              <textarea
                value={rescheduleReason}
                onChange={(e) => setRescheduleReason(e.target.value)}
                placeholder="Contoh: Menunggu suku cadang distributor / koordinasi waktu luang pelanggan..."
                rows={2}
                maxLength={500}
                className="w-full bg-[#11120D] border border-[#D8CFBC]/20 rounded-xl p-3 text-xs text-[#FFFBF4] placeholder-[#8B8878] focus:outline-none focus:border-[#D8CFBC] transition-colors"
              />
            </div>
          )}

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
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Tetapkan Jadwal</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
