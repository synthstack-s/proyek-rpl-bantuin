'use client';

import { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  X,
  Send,
  Loader2,
  Paperclip,
  Phone,
  Image as ImageIcon,
  Check,
  CheckCheck,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';

interface ChatMessage {
  id: number;
  senderId: number;
  senderName: string;
  senderRole: string;
  messageType: 'text' | 'image' | 'location' | 'system';
  content: string;
  attachmentUrl: string | null;
  isRead: boolean;
  createdAt: string;
  isSelf: boolean;
}

interface OtherParty {
  role: 'customer' | 'technician';
  name: string;
  phone: string;
  id: number;
}

interface RepairChatDrawerProps {
  repairId?: number;
  repairRequestId?: number;
  orderCode: string;
  isOpen: boolean;
  onClose: () => void;
  currentUserRole?: 'customer' | 'technician' | 'admin';
  partnerName?: string;
  partnerRole?: string;
}

export default function RepairChatDrawer({
  repairId,
  repairRequestId,
  orderCode,
  isOpen,
  onClose,
  currentUserRole = 'customer',
  partnerName,
  partnerRole,
}: RepairChatDrawerProps) {
  const effectiveRepairId = repairId ?? repairRequestId ?? 0;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [otherParty, setOtherParty] = useState<OtherParty | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchChat = async (silent = false) => {
    if (!effectiveRepairId) return;
    if (!silent) setIsLoading(true);
    setErrorBanner(null);
    try {
      const res = await fetch(`/api/repairs/${effectiveRepairId}/chat`);
      const data = await res.json();
      if (res.ok && data.success && data.data) {
        setMessages(data.data.messages || []);
        setOtherParty(data.data.otherParty || null);
      } else if (!silent) {
        setErrorBanner(data.message || 'Gagal memuat pesan');
      }
    } catch {
      if (!silent) setErrorBanner('Gangguan jaringan saat memuat pesan');
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  // Polling saat drawer terbuka
  useEffect(() => {
    if (isOpen && effectiveRepairId) {
      fetchChat(false);
      const interval = setInterval(() => {
        fetchChat(true);
      }, 3500);
      return () => clearInterval(interval);
    }
  }, [isOpen, effectiveRepairId]);

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!inputMessage.trim() && !attachmentPreview) || isSending || !effectiveRepairId) return;

    const textToSend = inputMessage.trim();
    const photoToSend = attachmentPreview;
    setIsSending(true);

    try {
      const res = await fetch(`/api/repairs/${effectiveRepairId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: textToSend || 'Mengirim foto lampiran',
          message_type: photoToSend ? 'image' : 'text',
          attachment_url: photoToSend || null,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setInputMessage('');
        setAttachmentPreview(null);
        fetchChat(true);
      } else {
        alert(data.message || 'Gagal mengirim pesan');
      }
    } catch {
      alert('Terjadi kesalahan koneksi');
    } finally {
      setIsSending(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', 'chat');

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (res.ok && data.success && data.data?.url) {
        setAttachmentPreview(data.data.url);
      } else {
        alert(data.message || 'Gagal mengunggah foto');
      }
    } catch {
      alert('Gagal mengunggah berkas');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const openWhatsAppFallback = () => {
    if (!otherParty?.phone) return;
    const cleanPhone = otherParty.phone.replace(/[^0-9]/g, '').replace(/^0/, '62');
    const roleGreeting = otherParty.role === 'technician' ? 'Pak/Bu Teknisi BANTUIN' : 'Pelanggan BANTUIN';
    const text = encodeURIComponent(
      `Halo ${roleGreeting}, saya ingin berkoordinasi mengenai pesanan perbaikan #${orderCode}.`
    );
    window.open(`https://wa.me/${cleanPhone}?text=${text}`, '_blank');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-[#11120D]/80 backdrop-blur-md flex justify-end transition-opacity">
      <div className="w-full max-w-md bg-[#141510]/95 border-l border-[#D8CFBC]/20 h-full flex flex-col shadow-2xl backdrop-blur-2xl animate-in slide-in-from-right duration-250">
        {/* Header */}
        <div className="p-4 border-b border-[#D8CFBC]/15 bg-[#181913]/90 backdrop-blur-md flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-[#D8CFBC]/10 border border-[#D8CFBC]/20 text-[#D8CFBC] flex items-center justify-center shrink-0 shadow-inner">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-[#FFFBF4] truncate">
                {otherParty ? otherParty.name : 'Koordinasi Pesanan'}
              </h3>
              <p className="text-[11px] text-[#D8CFBC]/70 truncate flex items-center gap-1.5 font-mono">
                <span>#{orderCode}</span>
                <span>•</span>
                <span className="font-sans">{otherParty?.role === 'technician' ? 'Mitra Teknisi' : 'Pelanggan'}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {otherParty?.phone && (
              <button
                type="button"
                onClick={openWhatsAppFallback}
                title="Hubungi via WhatsApp"
                className="p-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 transition-all hover:scale-105"
              >
                <Phone className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-[#D8CFBC]/10 text-[#D8CFBC]/70 hover:text-[#FFFBF4] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Info Banner WhatsApp */}
        {otherParty?.phone && (
          <div className="px-4 py-2 bg-emerald-950/40 border-b border-emerald-500/20 flex items-center justify-between text-[11px] text-emerald-300">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              Komunikasi langsung aman & terdata resmi BANTUIN
            </span>
            <button onClick={openWhatsAppFallback} className="font-semibold underline hover:text-emerald-200 ml-2">
              WhatsApp
            </button>
          </div>
        )}

        {/* Message List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {isLoading && messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-2 text-[#D8CFBC]/60">
              <Loader2 className="w-6 h-6 animate-spin text-[#D8CFBC]" />
              <p className="text-xs">Memuat obrolan...</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-[#D8CFBC]/60">
              <div className="w-12 h-12 rounded-2xl bg-[#1C1D17] border border-[#D8CFBC]/15 flex items-center justify-center text-[#D8CFBC] mb-2 shadow-inner">
                <MessageSquare className="w-6 h-6" />
              </div>
              <p className="text-xs font-semibold text-[#FFFBF4]">Belum Ada Pesan</p>
              <p className="text-[11px] text-[#D8CFBC]/70 mt-1 max-w-[240px] leading-relaxed">
                Mulai percakapan untuk mengonfirmasi titik lokasi, waktu tiba, atau rincian kondisi perangkat.
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              const isMine = msg.isSelf;
              return (
                <div key={msg.id} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`max-w-[84%] rounded-2xl p-3 text-xs shadow-md transition-all ${
                      isMine
                        ? 'bg-[#FFFBF4] text-[#11120D] rounded-tr-xs font-medium'
                        : 'bg-[#1C1D17] text-[#FFFBF4] border border-[#D8CFBC]/15 rounded-tl-xs'
                    }`}
                  >
                    {!isMine && (
                      <p className="text-[10px] font-semibold text-[#D8CFBC] mb-1">{msg.senderName}</p>
                    )}

                    {msg.attachmentUrl && (
                      <div className="mb-2 rounded-xl overflow-hidden border border-black/20 bg-black/40 max-h-52">
                        <img
                          src={msg.attachmentUrl}
                          alt="Lampiran chat"
                          className="w-full h-auto object-cover cursor-pointer hover:opacity-95 transition-opacity"
                          onClick={() => window.open(msg.attachmentUrl || '', '_blank')}
                        />
                      </div>
                    )}

                    <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>

                    <div
                      className={`flex items-center justify-end gap-1 text-[10px] mt-1 ${
                        isMine ? 'text-[#565449]' : 'text-[#D8CFBC]/60'
                      }`}
                    >
                      <span>
                        {new Date(msg.createdAt).toLocaleTimeString('id-ID', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      {isMine && (
                        msg.isRead ? <CheckCheck className="w-3.5 h-3.5 text-blue-600" /> : <Check className="w-3.5 h-3.5 text-[#565449]" />
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Attachment Preview */}
        {attachmentPreview && (
          <div className="p-3 bg-[#1C1D17] border-t border-[#D8CFBC]/15 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl overflow-hidden border border-[#D8CFBC]/20 bg-[#11120D]">
                <img src={attachmentPreview} alt="Preview" className="w-full h-full object-cover" />
              </div>
              <span className="text-xs text-[#FFFBF4] font-medium">Foto siap dikirim</span>
            </div>
            <button
              type="button"
              onClick={() => setAttachmentPreview(null)}
              className="p-1 rounded-lg hover:bg-[#D8CFBC]/10 text-[#D8CFBC]/70 hover:text-[#FFFBF4]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Input Bar */}
        <form onSubmit={handleSendMessage} className="p-3 border-t border-[#D8CFBC]/15 bg-[#181913]/90 backdrop-blur-md flex items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || isSending}
            title="Kirim Foto Bukti"
            className="p-2.5 rounded-xl bg-[#1C1D17] hover:bg-[#252720] text-[#D8CFBC] border border-[#D8CFBC]/15 hover:border-[#D8CFBC]/30 transition-all disabled:opacity-50"
          >
            {isUploading ? <Loader2 className="w-4 h-4 animate-spin text-[#D8CFBC]" /> : <ImageIcon className="w-4 h-4" />}
          </button>
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder="Tulis pesan koordinasi..."
            disabled={isSending}
            className="flex-1 bg-[#11120D] border border-[#D8CFBC]/20 rounded-xl px-3.5 py-2.5 text-xs text-[#FFFBF4] placeholder-[#8B8878] focus:outline-none focus:border-[#D8CFBC] transition-colors"
          />
          <button
            type="submit"
            disabled={(!inputMessage.trim() && !attachmentPreview) || isSending}
            className="p-2.5 rounded-xl bg-[#FFFBF4] hover:bg-[#D8CFBC] text-[#11120D] font-bold transition-all shadow-md hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100 flex items-center justify-center shrink-0"
          >
            {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </form>
      </div>
    </div>
  );
}
