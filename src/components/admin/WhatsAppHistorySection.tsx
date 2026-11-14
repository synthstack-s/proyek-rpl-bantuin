'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare,
  Loader2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Clock,
} from 'lucide-react';

interface WaHistoryItem {
  id: number;
  user_id: number;
  source: 'manual' | 'auto';
  event: string;
  template_key: string | null;
  title: string | null;
  message: string;
  entity_type: string | null;
  entity_id: number | null;
  status: 'pending' | 'sent' | 'failed';
  fonnte_message_id: string | null;
  error_message: string | null;
  sent_by_admin_id: number | null;
  created_at: string;
  masked_phone: string;
  recipient_email: string;
  recipient_role: string;
  recipient_name: string | null;
  order_code: string | null;
  sent_by_admin_email: string | null;
}

interface WaHistorySectionProps {
  /** Naikkan nilainya untuk memuat ulang riwayat (mis. setelah kirim manual). */
  refreshKey: number;
}

const EVENT_LABELS: Record<string, string> = {
  order_status: 'Status Pesanan',
  assignment_offered: 'Tawaran Tugas',
  assignment_cancelled: 'Pembatalan Tugas',
  schedule_set: 'Jadwal Kunjungan',
  order_created: 'Pesanan Baru',
  manual: 'Manual (Admin)',
};

const STATUS_CONFIG: Record<string, { label: string; icon: any; badgeClass: string }> = {
  sent: {
    label: 'Terkirim',
    icon: CheckCircle2,
    badgeClass: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
  },
  failed: {
    label: 'Gagal',
    icon: AlertCircle,
    badgeClass: 'bg-rose-500/10 text-rose-400 border border-rose-500/20',
  },
  pending: {
    label: 'Menunggu',
    icon: Clock,
    badgeClass: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  },
};

/**
 * Riwayat pengiriman WhatsApp (manual & otomatis) di halaman notifikasi admin.
 * Nomor tujuan tampil tersensor; kegagalan tampil beserta alasannya.
 */
export default function WhatsAppHistorySection({ refreshKey }: WaHistorySectionProps) {
  const [items, setItems] = useState<WaHistoryItem[]>([]);
  const [stats, setStats] = useState({ total: 0, sent: 0, failed: 0, pending: 0 });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '10',
        status: statusFilter,
      });
      const res = await fetch(`/api/admin/whatsapp/history?${params.toString()}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setItems(data.data);
        setStats(data.stats);
        setTotalPages(data.meta.totalPages || 1);
      } else {
        setLoadError(data.message || 'Gagal memuat riwayat WhatsApp.');
      }
    } catch {
      setLoadError('Tidak dapat terhubung ke server.');
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory, refreshKey]);

  return (
    <div className="bg-[#181913]/90 rounded-2xl border border-[#D8CFBC]/15 shadow-sm backdrop-blur-xl overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-b border-[#D8CFBC]/15">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#FFFBF4]">Riwayat WhatsApp</h3>
            <p className="text-[11px] text-[#8B8878]">
              {stats.total} pengiriman • {stats.sent} terkirim • {stats.failed} gagal
              {stats.pending > 0 && ` • ${stats.pending} menunggu`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="text-xs bg-[#11120D] border border-[#D8CFBC]/20 rounded-xl px-3 py-1.5 text-[#FFFBF4] outline-none focus:border-[#D8CFBC] font-medium transition"
          >
            <option value="all" className="bg-[#11120D]">Semua Status</option>
            <option value="sent" className="bg-[#11120D]">Terkirim</option>
            <option value="failed" className="bg-[#11120D]">Gagal</option>
            <option value="pending" className="bg-[#11120D]">Menunggu</option>
          </select>
          <button
            onClick={loadHistory}
            disabled={isLoading}
            className="p-1.5 rounded-xl border border-[#D8CFBC]/20 bg-[#11120D] text-[#D8CFBC] hover:text-[#FFFBF4] hover:bg-[#1C1D17] disabled:opacity-40 transition"
            title="Muat ulang"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="p-6 flex items-center justify-center gap-2 text-xs text-[#8B8878]">
          <Loader2 className="w-4 h-4 animate-spin" /> Memuat riwayat...
        </div>
      ) : loadError ? (
        <div className="p-4 text-xs text-rose-300 bg-rose-500/10 border-t border-rose-500/20">
          {loadError}
        </div>
      ) : items.length === 0 ? (
        <div className="p-6 text-center text-xs text-[#8B8878]">
          Belum ada pengiriman WhatsApp yang tercatat.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#D8CFBC]/10">
                  <th className="px-4 py-2.5 text-[11px] font-bold text-[#D8CFBC] uppercase tracking-wider">Waktu</th>
                  <th className="px-4 py-2.5 text-[11px] font-bold text-[#D8CFBC] uppercase tracking-wider">Penerima</th>
                  <th className="px-4 py-2.5 text-[11px] font-bold text-[#D8CFBC] uppercase tracking-wider">Peristiwa</th>
                  <th className="px-4 py-2.5 text-[11px] font-bold text-[#D8CFBC] uppercase tracking-wider">Pesan</th>
                  <th className="px-4 py-2.5 text-[11px] font-bold text-[#D8CFBC] uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const statusCfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;
                  const StatusIcon = statusCfg.icon;
                  return (
                    <tr key={item.id} className="border-b border-[#D8CFBC]/5 hover:bg-[#D8CFBC]/5 transition">
                      <td className="px-4 py-2.5 text-[11px] text-[#D8CFBC]/70 whitespace-nowrap">
                        {new Date(item.created_at).toLocaleString('id-ID')}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs font-semibold text-[#FFFBF4] block">
                          {item.recipient_name || 'Pengguna'} ({item.recipient_role})
                        </span>
                        <span className="text-[11px] text-[#8B8878]">{item.masked_phone}</span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-[#D8CFBC]">
                        {EVENT_LABELS[item.event] || item.event}
                        {item.order_code && (
                          <span className="block text-[11px] text-[#8B8878] font-mono">{item.order_code}</span>
                        )}
                        {item.source === 'manual' && item.sent_by_admin_email && (
                          <span className="block text-[11px] text-[#8B8878]">oleh {item.sent_by_admin_email}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-[#FFFBF4] max-w-[280px]">
                        <span className="block truncate" title={item.message}>
                          {item.title ? `${item.title} — ` : ''}
                          {item.message.replace(/\*/g, '').replace(/\n/g, ' ')}
                        </span>
                        {item.status === 'failed' && item.error_message && (
                          <span className="block text-[11px] text-rose-300 mt-0.5 truncate" title={item.error_message}>
                            {item.error_message}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold ${statusCfg.badgeClass}`}>
                          <StatusIcon className="w-3 h-3" />
                          {statusCfg.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-[#D8CFBC]/10">
              <span className="text-[11px] text-[#8B8878]">
                Halaman {page} dari {totalPages}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-1.5 rounded-lg border border-[#D8CFBC]/20 bg-[#11120D] text-[#D8CFBC] hover:text-[#FFFBF4] hover:bg-[#1C1D17] disabled:opacity-40 transition"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-1.5 rounded-lg border border-[#D8CFBC]/20 bg-[#11120D] text-[#D8CFBC] hover:text-[#FFFBF4] hover:bg-[#1C1D17] disabled:opacity-40 transition"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
