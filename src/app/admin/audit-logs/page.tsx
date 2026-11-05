'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert,
  Search,
  Filter,
  RefreshCw,
  Eye,
  Clock,
  User,
  Activity,
  Layers,
  Globe,
  Database,
  Calendar,
  ChevronLeft,
  ChevronRight,
  X,
  Lock,
  ArrowRight,
} from 'lucide-react';

interface AuditLogItem {
  id: number;
  admin_user_id: number;
  action: string;
  entity_name: string;
  entity_id: number;
  old_values: Record<string, any> | null;
  new_values: Record<string, any> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  admin_email: string;
}

export default function AuditLogsAdminPage() {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [actionsList, setActionsList] = useState<string[]>([]);
  const [entitiesList, setEntitiesList] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filters & Pagination
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [entityFilter, setEntityFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [limit] = useState(15);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // Stats
  const [stats, setStats] = useState({
    total_logs: 0,
    today_logs: 0,
    total_admins: 0,
    unique_entities: 0,
  });

  // Modal Detail Diff
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Fetch Logs
  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        action: actionFilter,
        entity: entityFilter,
      });
      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(`/api/admin/audit-logs?${params.toString()}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Gagal memuat jejak rekam audit');
      }

      setLogs(json.data || []);
      setTotalPages(json.meta?.totalPages || 1);
      setTotalItems(json.meta?.total || 0);
      if (json.stats) setStats(json.stats);
      if (json.filters) {
        setActionsList(json.filters.actions || []);
        setEntitiesList(json.filters.entities || []);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Terjadi kesalahan sistem');
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, actionFilter, entityFilter, search]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Action Badge Color Helper
  const renderActionBadge = (action: string) => {
    const act = action.toUpperCase();
    if (act.includes('DELETE') || act.includes('CANCEL') || act.includes('REJECT')) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-bold bg-rose-500/10 text-rose-300 border border-rose-500/25 font-mono">
          {action}
        </span>
      );
    }
    if (act.includes('CREATE') || act.includes('ADD') || act.includes('SETTLEMENT')) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/25 font-mono">
          {action}
        </span>
      );
    }
    if (act.includes('ASSIGN') || act.includes('REASSIGN')) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-bold bg-[#D8CFBC]/15 text-[#FFFBF4] border border-[#D8CFBC]/30 font-mono">
          {action}
        </span>
      );
    }
    if (act.includes('UPDATE') || act.includes('OVERRIDE')) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/25 font-mono">
          {action}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-bold bg-[#D8CFBC]/10 text-[#D8CFBC] border border-[#D8CFBC]/20 font-mono">
        {action}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-[#D8CFBC]/15 pb-5">
        <div className="flex items-start gap-3.5">
          <div className="p-2.5 rounded-2xl bg-[#D8CFBC]/10 border border-[#D8CFBC]/20 text-[#D8CFBC] shadow-inner shrink-0">
            <Lock className="w-6 h-6 text-[#D8CFBC]" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#FFFBF4]">
              Jejak Rekam Audit Administrator
            </h1>
            <p className="text-xs sm:text-sm text-[#D8CFBC]/70 mt-1">
              Log audit permanen (immutable) untuk pelacakan kepatuhan, pengubahan status pesanan, penugasan teknisi, dan konfigurasi.
            </p>
          </div>
        </div>
        <button
          onClick={fetchLogs}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#11120D] hover:bg-[#1C1D17] text-[#D8CFBC] hover:text-[#FFFBF4] text-xs sm:text-sm font-semibold transition border border-[#D8CFBC]/20 shadow-sm"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Segarkan
        </button>
      </div>

      {/* Security Note Banner */}
      <div className="bg-[#181913]/90 border border-[#D8CFBC]/20 rounded-2xl p-4 flex items-center gap-3 backdrop-blur-xl shadow-sm">
        <div className="p-2 rounded-xl bg-[#D8CFBC]/10 text-[#D8CFBC] shrink-0 border border-[#D8CFBC]/20">
          <ShieldAlert className="w-5 h-5 text-[#D8CFBC]" />
        </div>
        <p className="text-xs text-[#D8CFBC]/90 leading-relaxed">
          <strong className="text-[#FFFBF4]">Kebijakan Integritas Audit:</strong> Seluruh mutasi data sensitif pada sistem BANTUIN dicatat ke dalam
          tabel log append-only dengan perlindungan FK restrict. Nilai sensitif seperti kata sandi dan token otomatis disaring.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div className="bg-[#181913]/90 border border-[#D8CFBC]/15 rounded-2xl p-4 shadow-sm backdrop-blur-xl hover:border-[#D8CFBC]/30 transition-all">
          <p className="text-[11px] font-bold text-[#D8CFBC]/70 uppercase tracking-wider">Total Jejak Audit</p>
          <p className="text-2xl font-bold text-[#FFFBF4] mt-1.5">{stats.total_logs}</p>
        </div>
        <div className="bg-[#181913]/90 border border-[#D8CFBC]/15 rounded-2xl p-4 shadow-sm backdrop-blur-xl hover:border-[#D8CFBC]/30 transition-all">
          <p className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">Aktivitas Hari Ini</p>
          <p className="text-2xl font-bold text-emerald-400 mt-1.5">{stats.today_logs}</p>
        </div>
        <div className="bg-[#181913]/90 border border-[#D8CFBC]/15 rounded-2xl p-4 shadow-sm backdrop-blur-xl hover:border-[#D8CFBC]/30 transition-all">
          <p className="text-[11px] font-bold text-[#D8CFBC] uppercase tracking-wider">Tabel Terpengaruh</p>
          <p className="text-2xl font-bold text-[#FFFBF4] mt-1.5">{stats.unique_entities}</p>
        </div>
        <div className="bg-[#181913]/90 border border-[#D8CFBC]/15 rounded-2xl p-4 shadow-sm backdrop-blur-xl hover:border-[#D8CFBC]/30 transition-all">
          <p className="text-[11px] font-bold text-[#D8CFBC] uppercase tracking-wider">Admin Aktif</p>
          <p className="text-2xl font-bold text-[#FFFBF4] mt-1.5">{stats.total_admins}</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-[#181913]/90 border border-[#D8CFBC]/15 rounded-2xl p-4 flex flex-col md:flex-row gap-3 shadow-sm backdrop-blur-xl">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8B8878]" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Cari kode aksi, nama entitas, email admin, atau alamat IP..."
            className="w-full bg-[#11120D] border border-[#D8CFBC]/20 rounded-xl pl-10 pr-4 py-2 text-xs sm:text-sm text-[#FFFBF4] placeholder-[#8B8878] focus:outline-none focus:border-[#D8CFBC] transition"
          />
        </div>
        <div className="flex gap-2.5">
          <select
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setPage(1);
            }}
            className="bg-[#11120D] border border-[#D8CFBC]/20 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-[#FFFBF4] focus:outline-none focus:border-[#D8CFBC] transition"
          >
            <option value="all" className="bg-[#11120D] text-[#FFFBF4]">Semua Tipe Aksi</option>
            {actionsList.map((a) => (
              <option key={a} value={a} className="bg-[#11120D] text-[#FFFBF4]">
                {a}
              </option>
            ))}
          </select>

          <select
            value={entityFilter}
            onChange={(e) => {
              setEntityFilter(e.target.value);
              setPage(1);
            }}
            className="bg-[#11120D] border border-[#D8CFBC]/20 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-[#FFFBF4] focus:outline-none focus:border-[#D8CFBC] transition"
          >
            <option value="all" className="bg-[#11120D] text-[#FFFBF4]">Semua Entitas</option>
            {entitiesList.map((ent) => (
              <option key={ent} value={ent} className="bg-[#11120D] text-[#FFFBF4]">
                {ent}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-[#181913]/90 border border-[#D8CFBC]/15 rounded-2xl overflow-hidden shadow-sm backdrop-blur-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-[#D8CFBC]/90">
            <thead className="bg-[#141510] text-[11px] font-bold uppercase tracking-wider text-[#D8CFBC] border-b border-[#D8CFBC]/15">
              <tr>
                <th className="px-5 py-3.5">Waktu Eksekusi</th>
                <th className="px-4 py-3.5">Administrator</th>
                <th className="px-4 py-3.5">Kode Aksi</th>
                <th className="px-4 py-3.5">Entitas Target & ID</th>
                <th className="px-4 py-3.5">IP & Perangkat</th>
                <th className="px-4 py-3.5">Ringkasan Mutasi</th>
                <th className="px-5 py-3.5 text-right">Snapshot Diff</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D8CFBC]/10">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[#D8CFBC]/60">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#D8CFBC] mb-2" />
                    Memuat rekaman log audit...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[#8B8878]">
                    <Lock className="w-10 h-10 mx-auto text-[#8B8878]/60 mb-2" />
                    Tidak ada rekaman audit yang sesuai filter.
                  </td>
                </tr>
              ) : (
                logs.map((item) => (
                  <tr key={item.id} className="hover:bg-[#1F2019]/60 transition-colors">
                    <td className="px-5 py-4 text-xs font-mono text-[#D8CFBC]">
                      <div>
                        {new Date(item.created_at).toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </div>
                      <div className="text-[11px] text-[#8B8878]">
                        {new Date(item.created_at).toLocaleTimeString('id-ID', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-xs">
                      <div className="font-semibold text-[#FFFBF4] flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-[#D8CFBC]" />
                        {item.admin_email}
                      </div>
                      <div className="text-[10px] text-[#8B8878] font-mono mt-0.5">UID: #{item.admin_user_id}</div>
                    </td>
                    <td className="px-4 py-4">{renderActionBadge(item.action)}</td>
                    <td className="px-4 py-4 text-xs">
                      <div className="font-mono text-[#FFFBF4] font-medium">{item.entity_name}</div>
                      <div className="text-[11px] text-[#D8CFBC]/70">ID: #{item.entity_id}</div>
                    </td>
                    <td className="px-4 py-4 text-xs text-[#D8CFBC]/80">
                      <div className="font-mono">{item.ip_address || '127.0.0.1'}</div>
                      <div className="text-[10px] text-[#8B8878] truncate max-w-[140px] mt-0.5" title={item.user_agent || ''}>
                        {item.user_agent || '-'}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-xs text-[#D8CFBC]/80 max-w-[200px]">
                      {item.new_values ? (
                        <span className="font-mono text-[11px] text-[#D8CFBC]/70 truncate block">
                          {JSON.stringify(item.new_values)}
                        </span>
                      ) : (
                        <span className="text-[#8B8878] italic">-</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={() => {
                          setSelectedLog(item);
                          setIsDetailOpen(true);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-[#D8CFBC]/10 hover:bg-[#D8CFBC]/20 text-[#FFFBF4] border border-[#D8CFBC]/25 text-xs font-medium transition flex items-center gap-1.5 ml-auto"
                      >
                        <Eye className="w-3.5 h-3.5 text-[#D8CFBC]" />
                        Inspeksi
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="p-4 border-t border-[#D8CFBC]/15 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-[#D8CFBC]/70">
          <div>
            Menampilkan <span className="text-[#FFFBF4] font-medium">{logs.length}</span> dari{' '}
            <span className="text-[#FFFBF4] font-medium">{totalItems}</span> rekaman
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1.5 rounded-lg bg-[#11120D] border border-[#D8CFBC]/20 hover:bg-[#1C1D17] text-[#D8CFBC] hover:text-[#FFFBF4] disabled:opacity-30 transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-[#FFFBF4] font-medium">
              Halaman {page} dari {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1.5 rounded-lg bg-[#11120D] border border-[#D8CFBC]/20 hover:bg-[#1C1D17] text-[#D8CFBC] hover:text-[#FFFBF4] disabled:opacity-30 transition"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* MODAL: Inspeksi Snapshot Diff */}
      {isDetailOpen && selectedLog && (
        <div className="fixed inset-0 z-50 bg-[#11120D]/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#141510]/95 border border-[#D8CFBC]/25 rounded-3xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl backdrop-blur-2xl text-[#FFFBF4]">
            <div className="sticky top-0 bg-[#141510]/95 border-b border-[#D8CFBC]/15 p-5 flex justify-between items-center z-10 backdrop-blur-md">
              <div>
                <h3 className="text-lg font-bold text-[#FFFBF4] flex items-center gap-2">
                  <Lock className="w-5 h-5 text-[#D8CFBC]" />
                  Inspeksi Jejak Audit #{selectedLog.id}
                </h3>
                <p className="text-xs text-[#D8CFBC]/70 mt-0.5">
                  Aksi: <span className="text-[#FFFBF4] font-mono font-bold">{selectedLog.action}</span> pada entitas{' '}
                  <span className="text-[#FFFBF4] font-mono">{selectedLog.entity_name}</span> (ID #{selectedLog.entity_id})
                </p>
              </div>
              <button
                onClick={() => setIsDetailOpen(false)}
                className="p-2 rounded-xl bg-[#11120D] hover:bg-[#1C1D17] border border-[#D8CFBC]/20 text-[#D8CFBC] hover:text-[#FFFBF4] transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Metadata Box */}
              <div className="bg-[#11120D] border border-[#D8CFBC]/15 rounded-2xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-[#8B8878] block mb-0.5">Admin:</span>
                  <span className="text-[#FFFBF4] font-medium">{selectedLog.admin_email}</span>
                </div>
                <div>
                  <span className="text-[#8B8878] block mb-0.5">IP Address:</span>
                  <span className="text-[#FFFBF4] font-mono">{selectedLog.ip_address || '127.0.0.1'}</span>
                </div>
                <div>
                  <span className="text-[#8B8878] block mb-0.5">Waktu Pencatatan:</span>
                  <span className="text-[#D8CFBC]">
                    {new Date(selectedLog.created_at).toLocaleString('id-ID')}
                  </span>
                </div>
                <div>
                  <span className="text-[#8B8878] block mb-0.5">Perangkat / Agent:</span>
                  <span className="text-[#D8CFBC]/80 truncate block" title={selectedLog.user_agent || ''}>
                    {selectedLog.user_agent || '-'}
                  </span>
                </div>
              </div>

              {/* Side-by-Side Diff Inspector */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Old Values */}
                <div className="bg-[#11120D] border border-rose-500/25 rounded-2xl p-4">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-300 uppercase tracking-wider mb-2">
                    <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                    Snapshot Sebelum Perubahan (old_values)
                  </div>
                  {selectedLog.old_values ? (
                    <pre className="text-xs font-mono text-rose-200 bg-[#161712] p-3 rounded-xl border border-[#D8CFBC]/10 overflow-x-auto whitespace-pre-wrap">
                      {JSON.stringify(selectedLog.old_values, null, 2)}
                    </pre>
                  ) : (
                    <div className="text-xs text-[#8B8878] italic bg-[#161712] p-3 rounded-xl border border-[#D8CFBC]/10">
                      (Tidak ada nilai lama / pembuatan data baru)
                    </div>
                  )}
                </div>

                {/* New Values */}
                <div className="bg-[#11120D] border border-emerald-500/25 rounded-2xl p-4">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300 uppercase tracking-wider mb-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    Snapshot Sesudah Perubahan (new_values)
                  </div>
                  {selectedLog.new_values ? (
                    <pre className="text-xs font-mono text-emerald-200 bg-[#161712] p-3 rounded-xl border border-[#D8CFBC]/10 overflow-x-auto whitespace-pre-wrap">
                      {JSON.stringify(selectedLog.new_values, null, 2)}
                    </pre>
                  ) : (
                    <div className="text-xs text-[#8B8878] italic bg-[#161712] p-3 rounded-xl border border-[#D8CFBC]/10">
                      (Tidak ada nilai baru / penghapusan data)
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-[#D8CFBC]/15 flex justify-end">
              <button
                onClick={() => setIsDetailOpen(false)}
                className="px-4 py-2 rounded-xl bg-[#11120D] hover:bg-[#1C1D17] border border-[#D8CFBC]/20 text-[#D8CFBC] hover:text-[#FFFBF4] text-xs font-semibold transition"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
