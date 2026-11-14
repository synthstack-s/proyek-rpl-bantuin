'use client';

import { useState, useEffect, useRef } from 'react';
import { Send, Loader2, Search, User, X } from 'lucide-react';

interface RecipientOption {
  id: number;
  name: string;
  email: string;
  phone_number: string | null;
  role: string;
  status: string;
}

interface WhatsAppSendModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Dipanggil setelah pengiriman berhasil agar riwayat dimuat ulang. */
  onSent: () => void;
  showToast: (type: 'success' | 'error', message: string) => void;
}

const MESSAGE_MAX_LENGTH = 1000;
const TITLE_MAX_LENGTH = 150;

/** Masking nomor (selaras dengan maskPhoneNumber di fonnte.ts: 5 digit awal + **** + 3 digit akhir). */
function maskPhone(phone: string | null): string {
  if (!phone) return 'Tanpa nomor';
  if (phone.length <= 6) return phone;
  return `${phone.slice(0, 5)}****${phone.slice(-3)}`;
}

/**
 * Modal kirim WhatsApp manual dari panel admin.
 * Penerima dipilih dari daftar pengguna (cari nama/email/nomor, atau
 * masukkan User ID langsung) — nomor tujuan selalu diambil server dari
 * database, tidak pernah dari input klien.
 */
export default function WhatsAppSendModal({ isOpen, onClose, onSent, showToast }: WhatsAppSendModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [options, setOptions] = useState<RecipientOption[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selected, setSelected] = useState<RecipientOption | null>(null);
  const [directUserId, setDirectUserId] = useState('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [orderId, setOrderId] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset form setiap modal dibuka.
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setOptions([]);
      setSelected(null);
      setDirectUserId('');
      setTitle('');
      setMessage('');
      setOrderId('');
      setSendError(null);
    }
  }, [isOpen]);

  // Pencarian penerima (debounce 300ms) via endpoint daftar pengguna admin.
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!isOpen || selected || searchQuery.trim().length < 2) {
      setOptions([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/admin/users?search=${encodeURIComponent(searchQuery.trim())}&limit=8`
        );
        const data = await res.json();
        setOptions(data.success ? data.data : []);
      } catch {
        setOptions([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [searchQuery, isOpen, selected]);

  if (!isOpen) return null;

  const numericQuery = searchQuery.trim().match(/^\d+$/) ? searchQuery.trim() : null;
  // Penerima: pengguna terpilih dari hasil cari, atau User ID yang diketik
  // langsung (dikonfirmasi lewat tombol, atau masih tertulis di kolom cari).
  const recipientUserId = selected
    ? selected.id
    : directUserId
      ? parseInt(directUserId, 10)
      : numericQuery
        ? parseInt(numericQuery, 10)
        : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSendError(null);

    if (!recipientUserId) {
      setSendError('Pilih penerima terlebih dahulu (cari nama/nomor, atau masukkan User ID).');
      return;
    }
    if (!message.trim()) {
      setSendError('Isi pesan WhatsApp wajib diisi.');
      return;
    }

    setIsSending(true);
    try {
      const res = await fetch('/api/admin/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: recipientUserId,
          message: message.trim(),
          title: title.trim() || undefined,
          repairRequestId: orderId.trim() ? parseInt(orderId.trim(), 10) : undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('success', data.message || 'Pesan WhatsApp berhasil dikirim.');
        onSent();
        onClose();
      } else {
        // Status jujur dari server: kegagalan Fonnte tampil apa adanya.
        const detail = data.message || 'Gagal mengirim pesan WhatsApp.';
        setSendError(detail);
        showToast('error', detail);
      }
    } catch {
      setSendError('Tidak dapat terhubung ke server. Coba lagi.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#11120D]/80 backdrop-blur-md animate-in fade-in">
      <div className="bg-[#141510]/95 rounded-3xl border border-[#D8CFBC]/25 shadow-2xl max-w-lg w-full p-6 space-y-4 backdrop-blur-2xl text-[#FFFBF4] max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-[#D8CFBC]/15 pb-3">
          <h3 className="text-base font-bold text-[#FFFBF4] flex items-center gap-2">
            <Send className="w-4 h-4 text-emerald-400" />
            Kirim WhatsApp Manual
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-[#8B8878] hover:text-[#FFFBF4] hover:bg-[#D8CFBC]/10 transition"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="text-xs font-semibold text-[#D8CFBC] block mb-1">
              Penerima *
            </label>
            {selected ? (
              <div className="flex items-center justify-between w-full text-xs bg-[#11120D] border border-emerald-500/30 rounded-xl px-3 py-2">
                <span className="text-[#FFFBF4] font-medium">
                  {selected.name} <span className="text-[#8B8878]">({selected.role} • {maskPhone(selected.phone_number)})</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(null);
                    setSearchQuery('');
                  }}
                  className="p-1 rounded-lg text-[#8B8878] hover:text-[#FFFBF4] transition"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search className="w-4 h-4 text-[#8B8878] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setDirectUserId('');
                  }}
                  placeholder="Cari nama, email, nomor WA, atau User ID..."
                  className="w-full pl-9 pr-3 py-2 text-xs bg-[#11120D] border border-[#D8CFBC]/20 rounded-xl text-[#FFFBF4] placeholder-[#8B8878] outline-none focus:border-[#D8CFBC] transition"
                />
                {(isSearching || options.length > 0 || numericQuery) && (
                  <div className="absolute z-10 mt-1 w-full bg-[#1C1D17] border border-[#D8CFBC]/20 rounded-xl shadow-xl overflow-hidden">
                    {isSearching && (
                      <div className="px-3 py-2 text-xs text-[#8B8878] flex items-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Mencari...
                      </div>
                    )}
                    {!isSearching &&
                      options.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setSelected(opt)}
                          className="w-full text-left px-3 py-2 hover:bg-[#D8CFBC]/10 transition flex items-center gap-2"
                        >
                          <User className="w-3.5 h-3.5 text-[#8B8878] shrink-0" />
                          <span className="text-xs text-[#FFFBF4] font-medium truncate">
                            {opt.name}
                            <span className="text-[#8B8878] font-normal">
                              {' '}({opt.role} • {maskPhone(opt.phone_number)})
                            </span>
                          </span>
                        </button>
                      ))}
                    {!isSearching && numericQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          setDirectUserId(numericQuery);
                          setSearchQuery('');
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-[#D8CFBC]/10 transition text-xs text-[#D8CFBC] font-medium border-t border-[#D8CFBC]/10"
                      >
                        Pakai User ID {numericQuery} langsung
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
            {directUserId && !selected && (
              <div className="flex items-center justify-between w-full text-xs bg-[#11120D] border border-emerald-500/30 rounded-xl px-3 py-2 mt-2">
                <span className="text-[#FFFBF4] font-medium">
                  User ID {directUserId}
                </span>
                <button
                  type="button"
                  onClick={() => setDirectUserId('')}
                  className="p-1 rounded-lg text-[#8B8878] hover:text-[#FFFBF4] transition"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <span className="text-[10px] text-[#8B8878] block mt-1">
              Nomor WhatsApp diambil dari data pengguna di database.
            </span>
          </div>

          <div>
            <label className="text-xs font-semibold text-[#D8CFBC] block mb-1">
              Judul Pesan (Opsional)
            </label>
            <input
              type="text"
              maxLength={TITLE_MAX_LENGTH}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Contoh: Pengingat Jadwal Perbaikan"
              className="w-full text-xs bg-[#11120D] border border-[#D8CFBC]/20 rounded-xl px-3 py-2 text-[#FFFBF4] placeholder-[#8B8878] outline-none focus:border-[#D8CFBC] font-medium"
            />
            <span className="text-[10px] text-[#8B8878] block text-right mt-0.5">
              {title.length}/{TITLE_MAX_LENGTH} karakter
            </span>
          </div>

          <div>
            <label className="text-xs font-semibold text-[#D8CFBC] block mb-1">
              Isi Pesan WhatsApp *
            </label>
            <textarea
              rows={4}
              required
              maxLength={MESSAGE_MAX_LENGTH}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tuliskan pesan yang akan dikirim lewat WhatsApp..."
              className="w-full text-xs bg-[#11120D] border border-[#D8CFBC]/20 rounded-xl px-3 py-2 text-[#FFFBF4] placeholder-[#8B8878] outline-none focus:border-[#D8CFBC] resize-none"
            />
            <span className="text-[10px] text-[#8B8878] block text-right mt-0.5">
              {message.length}/{MESSAGE_MAX_LENGTH} karakter
            </span>
          </div>

          <div>
            <label className="text-xs font-semibold text-[#D8CFBC] block mb-1">
              ID Pesanan Terkait (Opsional)
            </label>
            <input
              type="number"
              min={1}
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              placeholder="Contoh: 42 — untuk mencatat pesan ini pada pesanan"
              className="w-full text-xs bg-[#11120D] border border-[#D8CFBC]/20 rounded-xl px-3 py-2 text-[#FFFBF4] placeholder-[#8B8878] outline-none focus:border-[#D8CFBC]"
            />
          </div>

          {sendError && (
            <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 text-xs text-rose-300">
              {sendError}
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#D8CFBC]/15">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-xl border border-[#D8CFBC]/20 text-[#D8CFBC] text-xs font-semibold hover:text-[#FFFBF4] hover:bg-[#1C1D17] transition"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSending}
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#11120D] text-xs font-bold shadow-md flex items-center gap-1.5 transition hover:scale-105 active:scale-95 disabled:opacity-50"
            >
              {isSending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Kirim WhatsApp</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
