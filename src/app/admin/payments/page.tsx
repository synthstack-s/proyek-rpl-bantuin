'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  CreditCard,
  Search,
  Filter,
  RefreshCw,
  Eye,
  CheckCircle2,
  AlertCircle,
  XCircle,
  DollarSign,
  TrendingUp,
  Receipt,
  Clock,
  User,
  Phone,
  Calendar,
  ChevronLeft,
  ChevronRight,
  X,
  ShieldCheck,
  Check,
} from 'lucide-react';

interface InvoiceItem {
  id: number;
  invoice_number: string;
  repair_request_id: number;
  customer_id: number;
  subtotal_labor: number;
  subtotal_parts: number;
  service_fee: number;
  discount_amount: number;
  total_amount: number;
  invoice_status: string;
  due_date: string;
  paid_at: string | null;
  created_at: string;
  order_code: string;
  device_brand: string | null;
  device_model: string | null;
  repair_status: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  payment_id: number | null;
  payment_reference: string | null;
  payment_method: string | null;
  gateway_provider: string | null;
  payment_status: string | null;
  settled_at: string | null;
}

interface InvoiceDetail extends InvoiceItem {
  address_text?: string;
  payments: Array<{
    id: number;
    payment_reference: string;
    payment_method: string;
    gateway_provider: string | null;
    gateway_transaction_id: string | null;
    amount: number;
    payment_status: string;
    settled_at: string | null;
    created_at: string;
  }>;
}

export default function PaymentsAdminPage() {
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filters & Pagination
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [methodFilter, setMethodFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // KPI Stats
  const [stats, setStats] = useState({
    total_invoices: 0,
    total_revenue: 0,
    pending_amount: 0,
    platform_fees_collected: 0,
    cancelled_invoices: 0,
  });

  // Modals
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceDetail | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  const [verifyTarget, setVerifyTarget] = useState<InvoiceItem | null>(null);
  const [isVerifyOpen, setIsVerifyOpen] = useState(false);
  const [verifyMethod, setVerifyMethod] = useState('cash_on_delivery');
  const [verifyNotes, setVerifyNotes] = useState('');
  const [isVerifySubmitting, setIsVerifySubmitting] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  // Fetch Invoices
  const fetchInvoices = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        status: statusFilter,
        method: methodFilter,
      });
      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(`/api/admin/payments?${params.toString()}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Gagal memuat data pembayaran');
      }

      setInvoices(json.data || []);
      setTotalPages(json.meta?.totalPages || 1);
      setTotalItems(json.meta?.total || 0);
      if (json.stats) setStats(json.stats);
    } catch (err: any) {
      setErrorMsg(err.message || 'Terjadi kesalahan sistem');
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, statusFilter, methodFilter, search]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  // Open Detail
  const openDetail = async (item: InvoiceItem) => {
    setIsDetailOpen(true);
    setIsDetailLoading(true);
    setSelectedInvoice(null);
    try {
      const res = await fetch(`/api/admin/payments/${item.id}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Gagal memuat detail tagihan');
      setSelectedInvoice(json.data);
    } catch (err: any) {
      showToast('error', err.message);
      setIsDetailOpen(false);
    } finally {
      setIsDetailLoading(false);
    }
  };

  // Confirm Manual Settlement
  const handleConfirmSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyTarget) return;
    setIsVerifySubmitting(true);
    try {
      const res = await fetch(`/api/admin/payments/${verifyTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'manual_settlement',
          payment_method: verifyMethod,
          notes: verifyNotes,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Gagal memverifikasi pembayaran');
      showToast('success', json.message);
      setIsVerifyOpen(false);
      fetchInvoices();
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setIsVerifySubmitting(false);
    }
  };

  // Status Badge Helper
  const renderInvoiceBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" /> LUNAS
          </span>
        );
      case 'unpaid':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock className="w-3 h-3" /> BELUM DIBAYAR
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <XCircle className="w-3 h-3" /> DIBATALKAN
          </span>
        );
      case 'refunded':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <RefreshCw className="w-3 h-3" /> DI-REFUND
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-300">
            {status}
          </span>
        );
    }
  };

  // Payment Method Label Helper
  const formatPaymentMethod = (method: string | null) => {
    if (!method) return 'Belum dipilih';
    const map: Record<string, string> = {
      qris: 'QRIS Dinamis',
      va_bca: 'BCA Virtual Account',
      va_mandiri: 'Mandiri VA',
      va_bni: 'BNI Virtual Account',
      va_bri: 'BRI Virtual Account',
      ewallet_gopay: 'GoPay',
      ewallet_ovo: 'OVO',
      ewallet_dana: 'DANA',
      cash_on_delivery: 'Tunai di Tempat (COD)',
    };
    return map[method] || method;
  };

  return (
    <div className="space-y-6 text-[#FFFBF4]">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl shadow-xl border backdrop-blur-xl transition-all text-sm font-medium ${
            toast.type === 'success'
              ? 'bg-[#181913]/95 border-emerald-500/40 text-emerald-300'
              : 'bg-[#181913]/95 border-rose-500/40 text-rose-300'
          }`}
        >
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4 text-rose-400" />}
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-[#D8CFBC]/15 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#FFFBF4] flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#D8CFBC]/10 border border-[#D8CFBC]/20 flex items-center justify-center text-[#D8CFBC]">
              <CreditCard className="w-5 h-5 text-emerald-400" />
            </div>
            Pembayaran & Transaksi
          </h1>
          <p className="text-sm text-[#D8CFBC]/70 mt-1">
            Rekonsiliasi invoice resmi, pantau settlement payment gateway, dan verifikasi pembayaran tunai/manual.
          </p>
        </div>
        <button
          onClick={fetchInvoices}
          disabled={isLoading}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#1C1D17] hover:bg-[#252720] text-[#D8CFBC] hover:text-[#FFFBF4] text-xs font-medium transition border border-[#D8CFBC]/20 shadow-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Segarkan
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div className="bg-[#181913]/90 border border-emerald-500/25 rounded-2xl p-4 shadow-sm relative overflow-hidden backdrop-blur-xl">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent absolute top-0 left-0" />
          <p className="text-[11px] font-medium text-emerald-300 uppercase tracking-wider">Total Omset Lunas</p>
          <p className="text-2xl font-bold text-white mt-1.5 font-mono">
            Rp {Number(stats.total_revenue).toLocaleString('id-ID')}
          </p>
        </div>
        <div className="bg-[#181913]/90 border border-amber-500/25 rounded-2xl p-4 shadow-sm relative overflow-hidden backdrop-blur-xl">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-amber-500/30 to-transparent absolute top-0 left-0" />
          <p className="text-[11px] font-medium text-amber-300 uppercase tracking-wider">Menunggu Pembayaran</p>
          <p className="text-2xl font-bold text-amber-400 mt-1.5 font-mono">
            Rp {Number(stats.pending_amount).toLocaleString('id-ID')}
          </p>
        </div>
        <div className="bg-[#181913]/90 border border-[#D8CFBC]/25 rounded-2xl p-4 shadow-sm relative overflow-hidden backdrop-blur-xl">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-[#D8CFBC]/30 to-transparent absolute top-0 left-0" />
          <p className="text-[11px] font-medium text-[#D8CFBC] uppercase tracking-wider">Biaya Platform Terkumpul</p>
          <p className="text-2xl font-bold text-[#D8CFBC] mt-1.5 font-mono">
            Rp {Number(stats.platform_fees_collected).toLocaleString('id-ID')}
          </p>
        </div>
        <div className="bg-[#181913]/90 border border-rose-500/25 rounded-2xl p-4 shadow-sm relative overflow-hidden backdrop-blur-xl">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-rose-500/30 to-transparent absolute top-0 left-0" />
          <p className="text-[11px] font-medium text-rose-300 uppercase tracking-wider">Invoice Batal / Refund</p>
          <p className="text-2xl font-bold text-rose-400 mt-1.5 font-mono">{stats.cancelled_invoices}</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-[#181913]/80 border border-[#D8CFBC]/15 rounded-2xl p-4 flex flex-col md:flex-row gap-3 shadow-sm backdrop-blur-xl">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8B8878]" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Cari nomor invoice, kode pesanan, nama pelanggan, atau referensi pembayaran..."
            className="w-full bg-[#11120D] border border-[#D8CFBC]/20 rounded-xl pl-10 pr-4 py-2 text-xs sm:text-sm text-[#FFFBF4] placeholder-[#8B8878] focus:outline-none focus:border-[#D8CFBC] transition"
          />
        </div>
        <div className="flex gap-2.5">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="bg-[#11120D] border border-[#D8CFBC]/20 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-[#FFFBF4] focus:outline-none focus:border-[#D8CFBC]"
          >
            <option value="all">Semua Status Invoice</option>
            <option value="paid">Lunas (Paid)</option>
            <option value="unpaid">Belum Dibayar (Unpaid)</option>
            <option value="cancelled">Dibatalkan</option>
            <option value="refunded">Refunded</option>
          </select>

          <select
            value={methodFilter}
            onChange={(e) => {
              setMethodFilter(e.target.value);
              setPage(1);
            }}
            className="bg-[#11120D] border border-[#D8CFBC]/20 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-[#FFFBF4] focus:outline-none focus:border-[#D8CFBC]"
          >
            <option value="all">Semua Metode</option>
            <option value="qris">QRIS Dinamis</option>
            <option value="va_bca">BCA Virtual Account</option>
            <option value="va_mandiri">Mandiri VA</option>
            <option value="va_bni">BNI VA</option>
            <option value="va_bri">BRI VA</option>
            <option value="ewallet_gopay">GoPay</option>
            <option value="cash_on_delivery">Tunai (COD)</option>
          </select>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-[#181913]/90 border border-[#D8CFBC]/20 rounded-3xl overflow-hidden shadow-lg backdrop-blur-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-[#FFFBF4]">
            <thead className="bg-[#141510]/95 text-[11px] font-semibold uppercase tracking-wider text-[#D8CFBC] border-b border-[#D8CFBC]/15">
              <tr>
                <th className="px-5 py-3.5">Nomor Invoice</th>
                <th className="px-4 py-3.5">Pesanan & Pelanggan</th>
                <th className="px-4 py-3.5">Rincian Tagihan</th>
                <th className="px-4 py-3.5">Total (Rp)</th>
                <th className="px-4 py-3.5">Status Tagihan</th>
                <th className="px-4 py-3.5">Metode & Gateway</th>
                <th className="px-4 py-3.5">Tanggal</th>
                <th className="px-5 py-3.5 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D8CFBC]/10">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-[#D8CFBC]/60">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#D8CFBC] mb-2" />
                    Memuat data invoice dan pembayaran...
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-[#D8CFBC]/60">
                    <Receipt className="w-10 h-10 mx-auto text-[#565449] mb-2" />
                    Tidak ada transaksi invoice yang sesuai kriteria.
                  </td>
                </tr>
              ) : (
                invoices.map((item) => (
                  <tr key={item.id} className="hover:bg-[#1C1D17]/60 transition">
                    <td className="px-5 py-4 font-mono font-semibold text-[#FFFBF4]">
                      <span className="text-[#D8CFBC] hover:text-[#FFFBF4] hover:underline cursor-pointer" onClick={() => openDetail(item)}>
                        {item.invoice_number}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-semibold text-[#FFFBF4] font-mono">{item.order_code}</div>
                      <div className="text-xs text-[#D8CFBC]/70">{item.customer_name}</div>
                      <div className="text-[11px] text-[#D8CFBC]/50 font-mono">{item.customer_phone || '-'}</div>
                    </td>
                    <td className="px-4 py-4 text-xs font-mono">
                      <div>Jasa: Rp {Number(item.subtotal_labor).toLocaleString('id-ID')}</div>
                      <div>Part: Rp {Number(item.subtotal_parts).toLocaleString('id-ID')}</div>
                      <div className="text-[#D8CFBC]/60">Platform: Rp {Number(item.service_fee).toLocaleString('id-ID')}</div>
                    </td>
                    <td className="px-4 py-4 font-bold text-[#FFFBF4] text-base font-mono">
                      Rp {Number(item.total_amount).toLocaleString('id-ID')}
                    </td>
                    <td className="px-4 py-4">{renderInvoiceBadge(item.invoice_status)}</td>
                    <td className="px-4 py-4 text-xs">
                      <div className="font-medium text-[#FFFBF4]">{formatPaymentMethod(item.payment_method)}</div>
                      {item.payment_reference && (
                        <div className="text-[10px] text-[#D8CFBC]/70 font-mono mt-0.5">{item.payment_reference}</div>
                      )}
                      {item.payment_status && (
                        <span
                          className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-semibold mt-1 ${
                            item.payment_status === 'settlement'
                              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                              : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                          }`}
                        >
                          {item.payment_status.toUpperCase()}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-xs text-[#D8CFBC]/70 font-mono">
                      <div>
                        {new Date(item.created_at).toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </div>
                      {item.paid_at && (
                        <div className="text-[11px] text-emerald-400 font-medium font-sans">
                          Lunas: {new Date(item.paid_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => openDetail(item)}
                          title="Lihat Detail Rincian Tagihan"
                          className="p-1.5 rounded-xl bg-[#1C1D17] hover:bg-[#252720] text-[#D8CFBC] hover:text-[#FFFBF4] transition border border-[#D8CFBC]/20"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {item.invoice_status === 'unpaid' && (
                          <button
                            onClick={() => {
                              setVerifyTarget(item);
                              setVerifyMethod(item.payment_method || 'cash_on_delivery');
                              setVerifyNotes('');
                              setIsVerifyOpen(true);
                            }}
                            title="Konfirmasi Pelunasan Manual (COD / Transfer)"
                            className="p-1.5 rounded-xl bg-[#1C1D17] hover:bg-[#252720] text-emerald-400 hover:text-emerald-300 transition border border-emerald-500/30"
                          >
                            <ShieldCheck className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="p-4 border-t border-[#D8CFBC]/15 bg-[#141510]/60 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-[#D8CFBC]/70">
          <div>
            Menampilkan <span className="text-[#FFFBF4] font-medium font-mono">{invoices.length}</span> dari{' '}
            <span className="text-[#FFFBF4] font-medium font-mono">{totalItems}</span> invoice
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1.5 rounded-xl bg-[#1C1D17] hover:bg-[#252720] text-[#D8CFBC] hover:text-[#FFFBF4] disabled:opacity-40 transition border border-[#D8CFBC]/15"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-[#FFFBF4] font-medium font-mono">
              Halaman {page} dari {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1.5 rounded-xl bg-[#1C1D17] hover:bg-[#252720] text-[#D8CFBC] hover:text-[#FFFBF4] disabled:opacity-40 transition border border-[#D8CFBC]/15"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* MODAL 1: Detail Invoice & Payment Log */}
      {isDetailOpen && (
        <div className="fixed inset-0 z-50 bg-[#11120D]/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#181913]/95 border border-[#D8CFBC]/25 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl backdrop-blur-2xl">
            <div className="sticky top-0 bg-[#181913]/95 border-b border-[#D8CFBC]/15 p-5 flex justify-between items-center z-10 backdrop-blur-md">
              <div>
                <h3 className="text-lg font-bold text-[#FFFBF4] flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-emerald-400" />
                  Rincian Invoice & Transaksi
                </h3>
                <p className="text-xs font-mono text-[#D8CFBC] mt-0.5">{selectedInvoice?.invoice_number}</p>
              </div>
              <button
                onClick={() => setIsDetailOpen(false)}
                className="p-1.5 rounded-xl bg-[#1C1D17] hover:bg-[#252720] text-[#D8CFBC] hover:text-[#FFFBF4] transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {isDetailLoading ? (
                <div className="py-16 text-center text-[#D8CFBC]/60">
                  <RefreshCw className="w-8 h-8 animate-spin mx-auto text-emerald-500 mb-2" />
                  Mengambil data invoice...
                </div>
              ) : selectedInvoice ? (
                <>
                  <div className="bg-[#11120D] border border-[#D8CFBC]/20 rounded-2xl p-4 flex justify-between items-center">
                    <div>
                      <span className="text-xs text-[#D8CFBC]/70 block mb-1">Status Invoice:</span>
                      {renderInvoiceBadge(selectedInvoice.invoice_status)}
                    </div>
                    <div>
                      <span className="text-xs text-[#D8CFBC]/70 block mb-1">Total Tagihan:</span>
                      <span className="text-xl font-bold text-white font-mono">
                        Rp {Number(selectedInvoice.total_amount).toLocaleString('id-ID')}
                      </span>
                    </div>
                  </div>

                  {/* Customer & Order */}
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div className="bg-[#11120D] p-4 rounded-2xl border border-[#D8CFBC]/15">
                      <h4 className="font-semibold text-[#D8CFBC] uppercase tracking-wider mb-2">Pelanggan</h4>
                      <p className="font-bold text-white text-sm">{selectedInvoice.customer_name}</p>
                      <p className="text-[#D8CFBC]/70 mt-1 font-mono">{selectedInvoice.customer_phone || '-'}</p>
                      <p className="text-[#D8CFBC]/50">{selectedInvoice.customer_email || '-'}</p>
                    </div>

                    <div className="bg-[#11120D] p-4 rounded-2xl border border-[#D8CFBC]/15">
                      <h4 className="font-semibold text-[#D8CFBC] uppercase tracking-wider mb-2">Pesanan Terkait</h4>
                      <p className="font-mono text-[#D8CFBC] font-bold">{selectedInvoice.order_code}</p>
                      <p className="text-white mt-1">
                        {selectedInvoice.device_brand || 'Perangkat'} {selectedInvoice.device_model || ''}
                      </p>
                      <p className="text-[#D8CFBC]/70 mt-1">Status Pesanan: {selectedInvoice.repair_status}</p>
                    </div>
                  </div>

                  {/* Breakdown Table */}
                  <div className="bg-[#11120D] p-4 rounded-2xl border border-[#D8CFBC]/15">
                    <h4 className="font-semibold text-[#D8CFBC] uppercase tracking-wider mb-3 text-xs">Komponen Biaya</h4>
                    <div className="space-y-2 text-xs font-mono">
                      <div className="flex justify-between py-1 border-b border-[#D8CFBC]/10">
                        <span className="text-[#D8CFBC]/70 font-sans">Jasa Teknisi (Labor):</span>
                        <span className="text-white font-medium">
                          Rp {Number(selectedInvoice.subtotal_labor).toLocaleString('id-ID')}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-[#D8CFBC]/10">
                        <span className="text-[#D8CFBC]/70 font-sans">Suku Cadang / Sparepart:</span>
                        <span className="text-white font-medium">
                          Rp {Number(selectedInvoice.subtotal_parts).toLocaleString('id-ID')}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-[#D8CFBC]/10">
                        <span className="text-[#D8CFBC]/70 font-sans">Biaya Platform BANTUIN:</span>
                        <span className="text-white font-medium">
                          Rp {Number(selectedInvoice.service_fee).toLocaleString('id-ID')}
                        </span>
                      </div>
                      {Number(selectedInvoice.discount_amount) > 0 && (
                        <div className="flex justify-between py-1 border-b border-[#D8CFBC]/10 text-emerald-400">
                          <span className="font-sans">Potongan / Diskon:</span>
                          <span>- Rp {Number(selectedInvoice.discount_amount).toLocaleString('id-ID')}</span>
                        </div>
                      )}
                      <div className="flex justify-between pt-2 text-sm font-bold">
                        <span className="text-white font-sans">Total Tagihan Bersih:</span>
                        <span className="text-emerald-400">
                          Rp {Number(selectedInvoice.total_amount).toLocaleString('id-ID')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Payment Attempts */}
                  <div className="bg-[#11120D] p-4 rounded-2xl border border-[#D8CFBC]/15">
                    <h4 className="font-semibold text-[#D8CFBC] uppercase tracking-wider mb-3 text-xs">
                      Riwayat Transaksi Pembayaran ({selectedInvoice.payments?.length || 0})
                    </h4>
                    {selectedInvoice.payments && selectedInvoice.payments.length > 0 ? (
                      <div className="space-y-2.5">
                        {selectedInvoice.payments.map((p) => (
                          <div key={p.id} className="bg-[#181913] p-3 rounded-xl border border-[#D8CFBC]/15 text-xs flex justify-between items-center">
                            <div>
                              <div className="font-mono font-medium text-emerald-400">{p.payment_reference}</div>
                              <div className="text-[#D8CFBC]/70 mt-0.5">
                                {formatPaymentMethod(p.payment_method)} ({p.gateway_provider || 'Direct'})
                              </div>
                              <div className="text-[10px] text-[#D8CFBC]/50 mt-0.5 font-mono">
                                Waktu: {new Date(p.created_at).toLocaleString('id-ID')}
                              </div>
                            </div>
                            <div className="text-right">
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                                  p.payment_status === 'settlement'
                                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                    : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                }`}
                              >
                                {p.payment_status}
                              </span>
                              <div className="font-bold text-white mt-1 font-mono">
                                Rp {Number(p.amount).toLocaleString('id-ID')}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-[#D8CFBC]/50">Belum ada riwayat transaksi pembayaran.</p>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Konfirmasi Pelunasan Manual */}
      {isVerifyOpen && verifyTarget && (
        <div className="fixed inset-0 z-50 bg-[#11120D]/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#181913]/95 border border-[#D8CFBC]/25 rounded-3xl w-full max-w-md p-6 shadow-2xl backdrop-blur-2xl">
            <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              Verifikasi Pelunasan Manual
            </h3>
            <p className="text-xs text-[#D8CFBC] mb-4 font-mono">
              Invoice #{verifyTarget.invoice_number} • Total: Rp{' '}
              {Number(verifyTarget.total_amount).toLocaleString('id-ID')}
            </p>

            <form onSubmit={handleConfirmSettlement} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-[#D8CFBC] block mb-1.5">Metode Pelunasan</label>
                <select
                  value={verifyMethod}
                  onChange={(e) => setVerifyMethod(e.target.value)}
                  className="w-full bg-[#11120D] border border-[#D8CFBC]/20 rounded-xl px-3.5 py-2.5 text-sm text-[#FFFBF4] focus:outline-none focus:border-[#D8CFBC]"
                >
                  <option value="cash_on_delivery">Tunai di Tempat (Cash On Delivery)</option>
                  <option value="va_bca">Transfer Langsung Bank BCA</option>
                  <option value="va_mandiri">Transfer Langsung Mandiri</option>
                  <option value="qris">QRIS Manual Lapangan</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-[#D8CFBC] block mb-1.5">Catatan Verifikasi Admin</label>
                <textarea
                  value={verifyNotes}
                  onChange={(e) => setVerifyNotes(e.target.value)}
                  rows={3}
                  placeholder="Contoh: Uang tunai telah diterima teknisi di lokasi dan disetorkan ke kantor..."
                  className="w-full bg-[#11120D] border border-[#D8CFBC]/20 rounded-xl p-3 text-xs text-[#FFFBF4] placeholder-[#8B8878] focus:outline-none focus:border-[#D8CFBC]"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsVerifyOpen(false)}
                  className="px-4 py-2 rounded-xl bg-[#1C1D17] hover:bg-[#252720] text-[#D8CFBC] hover:text-[#FFFBF4] text-xs font-medium transition border border-[#D8CFBC]/15"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isVerifySubmitting}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-[#11120D] font-bold text-xs transition flex items-center gap-1.5 shadow-md"
                >
                  {isVerifySubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                  Konfirmasi Lunas
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
