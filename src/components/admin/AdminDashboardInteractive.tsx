'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import {
  TrendingUp,
  TrendingDown,
  Info,
  Calendar,
  Layers,
  Wrench,
  Clock,
  ArrowRight,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  CreditCard,
  UserCheck,
  Star,
  Users,
  ChevronRight,
  Sparkles,
  DollarSign,
  Activity,
  Filter,
} from 'lucide-react';
import { StatCard } from './StatCard';
// Bentuk data dasbor dipakai BERSAMA dengan sumber data server
// (src/lib/admin-dashboard.ts) — satu definisi, tidak ada salinan ketiga
// yang bisa berbeda diam-diam. Import ini hanya tipe (dihapus saat
// kompilasi), jadi tidak menarik dependensi server ke bundle klien.
import type { AdminDashboardData as DashboardData } from '@/lib/admin-dashboard';

interface AdminDashboardInteractiveProps {
  initialData: DashboardData;
}

export function AdminDashboardInteractive({ initialData }: AdminDashboardInteractiveProps) {
  const [data, setData] = useState<DashboardData>(initialData);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | 'month' | 'year'>('30d');
  const [chartMetric, setChartMetric] = useState<'revenue' | 'orders'>('revenue');
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Pesan error pemuatan ulang — ditampilkan sebagai spanduk, sementara
  // data terakhir tetap tampil (diberi label jelas bahwa itu data lama).
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>('');
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'status' | 'category' | 'payment'>('status');
  const [orderStatusFilter, setOrderStatusFilter] = useState<'all' | 'open' | 'progress' | 'completed'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const chartContainerRef = useRef<HTMLDivElement>(null);

  // Set initial formatted time
  useEffect(() => {
    setLastRefreshedAt(
      new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    );
  }, []);

  // Fetch real data when timeRange changes. Bila gagal (API 500 atau
  // jaringan), data terakhir tetap tampil DENGAN spanduk error — jangan
  // pernah diam-diam menampilkan data basi seolah-olah baru.
  const fetchDashboardData = async (selectedRange: string) => {
    setIsRefreshing(true);
    try {
      const res = await fetch(`/api/admin/dashboard?timeRange=${selectedRange}`);
      const json = await res.json();
      if (json.success && json.data) {
        setData(json.data);
        setRefreshError(null);
        setLastRefreshedAt(
          new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        );
      } else {
        setRefreshError(
          json.message || 'Gagal memuat ulang data dashboard — menampilkan data terakhir.'
        );
      }
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
      setRefreshError('Gagal memuat ulang data dashboard — menampilkan data terakhir.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleRangeChange = (range: '7d' | '30d' | 'month' | 'year') => {
    setTimeRange(range);
    fetchDashboardData(range);
  };

  const handleManualRefresh = () => {
    fetchDashboardData(timeRange);
  };

  // Timeline points & SVG curve computation
  const timeline = data.timeline || [];
  const maxMetricValue = useMemo(() => {
    if (timeline.length === 0) return 100;
    const values = timeline.map((p) => (chartMetric === 'revenue' ? p.revenue : p.orders));
    const max = Math.max(...values);
    return max > 0 ? max * 1.15 : 100;
  }, [timeline, chartMetric]);

  // SVG coordinate calculations for dynamic line chart
  const svgWidth = 700;
  const svgHeight = 220;
  const paddingX = 20;
  const paddingY = 25;

  const points = useMemo(() => {
    if (timeline.length === 0) return [];
    const count = timeline.length;
    const effectiveWidth = svgWidth - paddingX * 2;
    const effectiveHeight = svgHeight - paddingY * 2;

    return timeline.map((pt, idx) => {
      const val = chartMetric === 'revenue' ? pt.revenue : pt.orders;
      const x = paddingX + (count > 1 ? (idx / (count - 1)) * effectiveWidth : effectiveWidth / 2);
      const y = svgHeight - paddingY - (val / (maxMetricValue || 1)) * effectiveHeight;
      return { x, y, data: pt };
    });
  }, [timeline, chartMetric, maxMetricValue, svgWidth, svgHeight]);

  // Construct smooth bezier curve path
  const linePathD = useMemo(() => {
    if (points.length === 0) return '';
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const current = points[i];
      const next = points[i + 1];
      const controlX1 = current.x + (next.x - current.x) * 0.45;
      const controlY1 = current.y;
      const controlX2 = current.x + (next.x - current.x) * 0.55;
      const controlY2 = next.y;
      path += ` C ${controlX1} ${controlY1}, ${controlX2} ${controlY2}, ${next.x} ${next.y}`;
    }
    return path;
  }, [points]);

  const areaPathD = useMemo(() => {
    if (points.length < 2) return '';
    const first = points[0];
    const last = points[points.length - 1];
    return `${linePathD} L ${last.x} ${svgHeight} L ${first.x} ${svgHeight} Z`;
  }, [linePathD, points, svgHeight]);

  // Active hover point (or last point by default)
  const activeHoverIndex = hoveredIndex !== null && hoveredIndex < points.length ? hoveredIndex : points.length - 1;
  const activeHoverPoint = points[activeHoverIndex] || points[0] || null;

  // Format currency
  const formatRupiah = (val: number) => {
    return `Rp ${val.toLocaleString('id-ID')}`;
  };

  const formatShortRupiah = (val: number) => {
    if (val >= 1000000) {
      return `Rp ${(val / 1000000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`;
    }
    return `Rp ${val.toLocaleString('id-ID')}`;
  };

  // Filter recent orders
  const filteredRecentOrders = useMemo(() => {
    return (data.recentOrders || []).filter((o) => {
      const matchSearch =
        searchQuery === '' ||
        o.orderCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.categoryName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (o.deviceBrand && o.deviceBrand.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchSearch) return false;

      if (orderStatusFilter === 'open') {
        return ['submitted', 'assigned', 'scheduled'].includes(o.currentStatus);
      }
      if (orderStatusFilter === 'progress') {
        return ['in_diagnosis', 'estimated', 'customer_approved', 'in_repair'].includes(o.currentStatus);
      }
      if (orderStatusFilter === 'completed') {
        return o.currentStatus === 'completed';
      }
      return true;
    });
  }, [data.recentOrders, searchQuery, orderStatusFilter]);

  // Status mapping badge helper
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return { label: 'Selesai', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' };
      case 'in_repair':
        return { label: 'Sedang Diperbaiki', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' };
      case 'in_diagnosis':
      case 'estimated':
        return { label: 'Diagnosa Unit', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' };
      case 'assigned':
      case 'scheduled':
        return { label: 'Teknisi Ditugaskan', color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' };
      case 'submitted':
        return { label: 'Menunggu Teknisi', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' };
      case 'complained':
        return { label: 'Pengaduan', color: 'bg-rose-500/10 text-rose-400 border-rose-500/20' };
      case 'cancelled':
        return { label: 'Dibatalkan', color: 'bg-rose-500/10 text-rose-400 border-rose-500/20' };
      default:
        return { label: status, color: 'bg-[#565449]/20 text-[#D8CFBC] border-[#D8CFBC]/20' };
    }
  };

  // Penyebut = SELURUH tiket (termasuk draf & komplain) agar label
  // "Total Tiket" benar-benar total. Bila belum ada tiket, semua
  // persentase 0 — bukan 25/35/40 seperti sebelumnya.
  const totalTickets = data.overview.totalOrders;

  const openPercent = totalTickets > 0 ? Math.round((data.overview.openOrders / totalTickets) * 100) : 0;
  const inProgPercent = totalTickets > 0 ? Math.round((data.overview.inProgressOrders / totalTickets) * 100) : 0;
  const compPercent = totalTickets > 0 ? Math.round((data.overview.completedOrders / totalTickets) * 100) : 0;

  const loadError = data.error || refreshError;

  return (
    <div className="space-y-6 text-[#FFFBF4] transition-all duration-300">
      {loadError && (
        <div className="flex items-start gap-2.5 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-200">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{loadError}</span>
        </div>
      )}
      {/* 1. Header Toolbar with Live Status & Time-Range Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-3xl bg-[#181913]/80 backdrop-blur-xl border border-[#D8CFBC]/15 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[#FFFBF4]">
              Ringkasan Operasional Real-Time
            </h1>
          </div>
          <p className="text-xs text-[#ABA291] mt-1 flex items-center gap-2">
            <span>Data live dari sistem transaksi dan pesanan aplikasi BANTUIN</span>
            {lastRefreshedAt && (
              <span className="text-[11px] text-[#706E61]">
                • Diperbarui: <strong className="text-[#D8CFBC] font-mono">{lastRefreshedAt}</strong>
              </span>
            )}
          </p>
        </div>

        {/* Interactive Controls: Refresh & Time Range */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Refresh Button */}
          <button
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            title="Segarkan data terbaru dari database"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#22241D] hover:bg-[#2B2D24] border border-[#D8CFBC]/15 text-[#D8CFBC] hover:text-[#FFFBF4] text-xs font-semibold transition-all shadow-xs disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
            <span className="hidden sm:inline">Refresh Data</span>
          </button>

          {/* Time Range Pills */}
          <div className="inline-flex items-center p-1 rounded-xl bg-[#11120D] border border-[#D8CFBC]/15 text-xs font-medium">
            {(['7d', '30d', 'month', 'year'] as const).map((range) => {
              const labelMap: Record<string, string> = {
                '7d': '7 Hari',
                '30d': '30 Hari',
                month: 'Bulan Ini',
                year: 'Tahun Ini',
              };
              const isSelected = timeRange === range;
              return (
                <button
                  key={range}
                  onClick={() => handleRangeChange(range)}
                  disabled={isRefreshing}
                  className={`px-3 py-1.5 rounded-lg transition-all text-xs font-semibold ${
                    isSelected
                      ? 'bg-[#FFFBF4] text-[#11120D] shadow-sm font-bold'
                      : 'text-[#ABA291] hover:text-[#FFFBF4]'
                  }`}
                >
                  {labelMap[range]}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 2. Top Metric Stat Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Real Revenue */}
        <StatCard
          title="Total Pendapatan Terbayar"
          value={formatShortRupiah(data.overview.totalRevenue)}
          subtitle={`${data.overview.completedOrders} order selesai`}
          trendValue={data.overview.revenueGrowthPercent}
          trendLabel="Pembayaran settlement dikurangi refund, vs bulan lalu"
          isPositive={!data.overview.revenueGrowthPercent.startsWith('-')}
        />

        {/* Card 2: Total Active & Open Repairs */}
        <StatCard
          title="Tiket Pesanan Aktif"
          value={data.overview.openOrders + data.overview.inProgressOrders}
          subtitle={`${data.overview.openOrders} antrean • ${data.overview.inProgressOrders} proses`}
          trendValue={`${data.overview.completionRate}% selesai`}
          trendLabel="Tiket berjalan yang ditangani teknisi"
          isPositive={true}
        />

        {/* Card 3: Total Pelanggan Terdaftar */}
        <StatCard
          title="Pelanggan Terdaftar"
          value={data.overview.totalCustomers}
          subtitle={`Rerata Tiket: ${formatShortRupiah(data.overview.avgOrderValue)}`}
          trendValue={`${data.overview.newCustomersThisMonth} baru bulan ini`}
          trendLabel="Pertumbuhan pengguna customer"
          isPositive={true}
        />

        {/* Card 4: Kesiapan Teknisi & Kepuasan */}
        <StatCard
          title="Teknisi Terverifikasi"
          value={data.overview.verifiedTechnicians}
          subtitle={`${data.overview.pendingTechnicians} antrean verifikasi`}
          trendValue={
            data.overview.reviewCount > 0
              ? `${data.overview.satisfactionRate}% puas`
              : 'Belum ada ulasan'
          }
          trendLabel="Berdasarkan rating pelanggan"
          isPositive={true}
        />
      </div>

      {/* 3. Main Chart: Interactive Revenue & Orders Over Time */}
      <div className="p-6 rounded-3xl bg-[#181913]/85 backdrop-blur-2xl border border-[#D8CFBC]/20 shadow-xl space-y-5 relative overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-[#FFFBF4]/15 to-transparent pointer-events-none" />

        {/* Chart Header Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-[#ABA291]">
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              <span>Grafik Dinamis Aktivitas Platform</span>
            </div>

            <div className="flex items-baseline gap-3 mt-1">
              <span className="text-2xl sm:text-3xl font-black text-[#FFFBF4] tracking-tight font-mono">
                {chartMetric === 'revenue'
                  ? formatRupiah(activeHoverPoint?.data.revenue ?? data.overview.totalRevenue)
                  : `${activeHoverPoint?.data.orders ?? data.overview.totalOrders} Tiket`}
              </span>

              <span className="text-xs text-[#D8CFBC] font-medium">
                pada {activeHoverPoint?.data.date ?? 'Periode Ini'}
              </span>
            </div>
          </div>

          {/* Metric Selector Toggle (Pendapatan vs Order Count) */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#ABA291] font-medium hidden md:inline">Tampilkan:</span>
            <div className="inline-flex p-1 rounded-xl bg-[#11120D] border border-[#D8CFBC]/15 text-xs font-semibold">
              <button
                onClick={() => setChartMetric('revenue')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                  chartMetric === 'revenue'
                    ? 'bg-[#FFFBF4] text-[#11120D] font-bold shadow-sm'
                    : 'text-[#ABA291] hover:text-[#FFFBF4]'
                }`}
              >
                <DollarSign className="w-3.5 h-3.5" />
                <span>Pendapatan</span>
              </button>
              <button
                onClick={() => setChartMetric('orders')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                  chartMetric === 'orders'
                    ? 'bg-[#FFFBF4] text-[#11120D] font-bold shadow-sm'
                    : 'text-[#ABA291] hover:text-[#FFFBF4]'
                }`}
              >
                <Wrench className="w-3.5 h-3.5" />
                <span>Volume Tiket</span>
              </button>
            </div>
          </div>
        </div>

        {/* Dynamic Interactive SVG Canvas Chart */}
        <div
          ref={chartContainerRef}
          className="relative w-full pt-4 pb-2 select-none"
          onMouseLeave={() => setHoveredIndex(null)}
        >
          <div className="h-64 w-full relative">
            {/* Horizontal Gridlines */}
            <div className="absolute inset-0 flex flex-col justify-between text-[11px] font-mono text-[#706E61] pointer-events-none">
              <div className="flex items-center gap-3">
                <span className="w-14 text-right">
                  {chartMetric === 'revenue' ? formatShortRupiah(maxMetricValue) : Math.round(maxMetricValue)}
                </span>
                <div className="flex-1 border-b border-[#565449]/20 border-dashed" />
              </div>
              <div className="flex items-center gap-3">
                <span className="w-14 text-right">
                  {chartMetric === 'revenue' ? formatShortRupiah(maxMetricValue * 0.75) : Math.round(maxMetricValue * 0.75)}
                </span>
                <div className="flex-1 border-b border-[#565449]/20 border-dashed" />
              </div>
              <div className="flex items-center gap-3">
                <span className="w-14 text-right">
                  {chartMetric === 'revenue' ? formatShortRupiah(maxMetricValue * 0.5) : Math.round(maxMetricValue * 0.5)}
                </span>
                <div className="flex-1 border-b border-[#565449]/20 border-dashed" />
              </div>
              <div className="flex items-center gap-3">
                <span className="w-14 text-right">
                  {chartMetric === 'revenue' ? formatShortRupiah(maxMetricValue * 0.25) : Math.round(maxMetricValue * 0.25)}
                </span>
                <div className="flex-1 border-b border-[#565449]/20 border-dashed" />
              </div>
              <div className="flex items-center gap-3">
                <span className="w-14 text-right">0</span>
                <div className="flex-1 border-b border-[#565449]/30" />
              </div>
            </div>

            {/* SVG Chart Surface */}
            <svg
              className="absolute inset-0 w-full h-full pl-16 cursor-crosshair"
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="interactiveChartGlow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#D8CFBC" stopOpacity="0.25" />
                  <stop offset="60%" stopColor="#565449" stopOpacity="0.08" />
                  <stop offset="100%" stopColor="#11120D" stopOpacity="0" />
                </linearGradient>
              </defs>

              {/* Area Gradient Fill */}
              {areaPathD && <path d={areaPathD} fill="url(#interactiveChartGlow)" />}

              {/* Stroke Curve */}
              {linePathD && (
                <path
                  d={linePathD}
                  fill="none"
                  stroke="#D8CFBC"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Interactive Vertical Guideline */}
              {activeHoverPoint && (
                <line
                  x1={activeHoverPoint.x}
                  y1={0}
                  x2={activeHoverPoint.x}
                  y2={svgHeight}
                  stroke="#D8CFBC"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                  className="opacity-70 transition-all duration-75"
                />
              )}

              {/* Interactive Point Indicator */}
              {activeHoverPoint && (
                <g className="transition-all duration-75">
                  <circle
                    cx={activeHoverPoint.x}
                    cy={activeHoverPoint.y}
                    r="8"
                    fill="#D8CFBC"
                    fillOpacity="0.3"
                  />
                  <circle
                    cx={activeHoverPoint.x}
                    cy={activeHoverPoint.y}
                    r="4.5"
                    fill="#FFFBF4"
                    stroke="#11120D"
                    strokeWidth="2.5"
                  />
                </g>
              )}

              {/* Invisible Overlay Hit Rectangles for smooth mouse hover */}
              {points.map((pt, idx) => {
                const prevX = idx > 0 ? (pt.x + points[idx - 1].x) / 2 : 0;
                const nextX = idx < points.length - 1 ? (pt.x + points[idx + 1].x) / 2 : svgWidth;
                const rectWidth = Math.max(10, nextX - prevX);

                return (
                  <rect
                    key={idx}
                    x={prevX}
                    y={0}
                    width={rectWidth}
                    height={svgHeight}
                    fill="transparent"
                    onMouseEnter={() => setHoveredIndex(idx)}
                    onClick={() => setHoveredIndex(idx)}
                  />
                );
              })}
            </svg>

            {/* Dynamic Liquid Glass Floating Tooltip */}
            {activeHoverPoint && (
              <div
                className="absolute z-20 pointer-events-none transition-all duration-100 transform -translate-x-1/2 -translate-y-full"
                style={{
                  left: `calc(4rem + ${(activeHoverPoint.x / svgWidth) * (100 - 8)}%)`,
                  top: `calc(${Math.max(10, activeHoverPoint.y - 12)}px)`,
                }}
              >
                <div className="p-3 rounded-2xl bg-[#1C1D17]/95 border border-[#D8CFBC]/30 shadow-2xl backdrop-blur-xl text-left space-y-1 min-w-[140px]">
                  <span className="text-[11px] text-[#ABA291] block font-semibold">
                    {activeHoverPoint.data.date}
                  </span>
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span className="text-[#D8CFBC]">Omset:</span>
                    <strong className="text-[#FFFBF4] font-mono ml-auto">
                      {formatRupiah(activeHoverPoint.data.revenue)}
                    </strong>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    <span className="text-[#D8CFBC]">Tiket:</span>
                    <strong className="text-[#FFFBF4] font-mono ml-auto">
                      {activeHoverPoint.data.orders} unit
                    </strong>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* X-Axis Date Intervals */}
          <div className="flex items-center justify-between pl-16 pt-3 text-[11px] text-[#8C8678] font-medium font-mono">
            {timeline.length > 0 && (
              <>
                <span>{timeline[0]?.date}</span>
                {timeline.length > 4 && <span>{timeline[Math.floor(timeline.length / 4)]?.date}</span>}
                {timeline.length > 2 && <span>{timeline[Math.floor(timeline.length / 2)]?.date}</span>}
                {timeline.length > 4 && <span>{timeline[Math.floor((timeline.length * 3) / 4)]?.date}</span>}
                <span className="px-2.5 py-0.5 rounded-full bg-[#FFFBF4] text-[#11120D] font-bold text-[10px] shadow-sm">
                  {timeline[timeline.length - 1]?.date}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 4. Interactive Breakdown Panels: Tabs for Status, Categories & Payments */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Interactive Breakdown Tabs */}
        <div className="lg:col-span-2 p-6 rounded-3xl bg-[#181913]/85 backdrop-blur-2xl border border-[#D8CFBC]/20 shadow-xl space-y-5 relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-[#FFFBF4]/15 to-transparent pointer-events-none" />

          {/* Tab Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#565449]/25 pb-3">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#D8CFBC]" />
              <h3 className="text-sm font-bold text-[#FFFBF4]">Distribusi & Komposisi Bisnis</h3>
            </div>

            <div className="inline-flex p-1 rounded-xl bg-[#11120D] border border-[#D8CFBC]/15 text-xs font-semibold">
              <button
                onClick={() => setActiveTab('status')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  activeTab === 'status'
                    ? 'bg-[#FFFBF4] text-[#11120D] font-bold shadow-sm'
                    : 'text-[#ABA291] hover:text-[#FFFBF4]'
                }`}
              >
                Status Tiket
              </button>
              <button
                onClick={() => setActiveTab('category')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  activeTab === 'category'
                    ? 'bg-[#FFFBF4] text-[#11120D] font-bold shadow-sm'
                    : 'text-[#ABA291] hover:text-[#FFFBF4]'
                }`}
              >
                Kategori Peralatan
              </button>
              <button
                onClick={() => setActiveTab('payment')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  activeTab === 'payment'
                    ? 'bg-[#FFFBF4] text-[#11120D] font-bold shadow-sm'
                    : 'text-[#ABA291] hover:text-[#FFFBF4]'
                }`}
              >
                Metode Pembayaran
              </button>
            </div>
          </div>

          {/* TAB 1: STATUS PESANAN */}
          {activeTab === 'status' && (
            <div className="space-y-5 animate-in fade-in duration-200">
              {/* Segmented Progress Bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#ABA291]">Kapasitas Pemenuhan Tiket</span>
                  <span className="font-bold text-[#FFFBF4]">{totalTickets} Total Tiket</span>
                </div>

                <div className="h-3 w-full rounded-full bg-[#11120D] border border-[#565449]/30 overflow-hidden flex">
                  <div
                    className="h-full bg-amber-400 transition-all duration-500"
                    style={{ width: `${openPercent}%` }}
                    title={`Antrean: ${data.overview.openOrders} (${openPercent}%)`}
                  />
                  <div
                    className="h-full bg-blue-500 transition-all duration-500"
                    style={{ width: `${inProgPercent}%` }}
                    title={`Pengerjaan: ${data.overview.inProgressOrders} (${inProgPercent}%)`}
                  />
                  <div
                    className="h-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${compPercent}%` }}
                    title={`Selesai: ${data.overview.completedOrders} (${compPercent}%)`}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] text-[#ABA291] pt-1">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    <span>Antrean ({openPercent}%)</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    <span>Sedang Dikerjakan ({inProgPercent}%)</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>Selesai ({compPercent}%)</span>
                  </span>
                </div>
              </div>

              {/* Status Breakdown Grid Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-4 rounded-2xl bg-[#1C1D17]/80 border border-[#D8CFBC]/15 space-y-1">
                  <span className="text-xs text-[#ABA291] block">Menunggu Teknisi</span>
                  <p className="text-xl font-black text-[#FFFBF4] font-mono">{data.overview.openOrders}</p>
                  <span className="text-[10px] text-amber-400 font-semibold block">Tahap Awal</span>
                </div>

                <div className="p-4 rounded-2xl bg-[#1C1D17]/80 border border-[#D8CFBC]/15 space-y-1">
                  <span className="text-xs text-[#ABA291] block">Sedang Diperbaiki</span>
                  <p className="text-xl font-black text-[#FFFBF4] font-mono">{data.overview.inProgressOrders}</p>
                  <span className="text-[10px] text-blue-400 font-semibold block">Dalam Tindakan</span>
                </div>

                <div className="p-4 rounded-2xl bg-[#1C1D17]/80 border border-[#D8CFBC]/15 space-y-1">
                  <span className="text-xs text-[#ABA291] block">Perbaikan Selesai</span>
                  <p className="text-xl font-black text-[#FFFBF4] font-mono">{data.overview.completedOrders}</p>
                  <span className="text-[10px] text-emerald-400 font-semibold block">Tuntas Bergaransi</span>
                </div>

                <div className="p-4 rounded-2xl bg-[#1C1D17]/80 border border-[#D8CFBC]/15 space-y-1">
                  <span className="text-xs text-[#ABA291] block">Dibatalkan / Komplain</span>
                  <p className="text-xl font-black text-[#FFFBF4] font-mono">
                    {data.overview.cancelledOrders + data.overview.complainedOrders}
                  </p>
                  <span className="text-[10px] text-rose-400 font-semibold block">Eskalasi Khusus</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: KATEGORI PERALATAN */}
          {activeTab === 'category' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              {data.categoryBreakdown.length === 0 ? (
                <div className="text-center py-8 text-xs text-[#ABA291]">
                  Belum ada kategori aktif dengan pesanan.
                </div>
              ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {data.categoryBreakdown.map((cat) => (
                  <div
                    key={cat.id}
                    className="p-4 rounded-2xl bg-[#1C1D17]/80 border border-[#D8CFBC]/15 space-y-2 hover:border-[#D8CFBC]/35 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#FFFBF4]">{cat.name}</span>
                      <span className="text-xs font-mono font-bold text-emerald-400">
                        {formatShortRupiah(cat.totalRevenue)}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] text-[#ABA291]">
                        <span>{cat.orderCount} pesanan</span>
                        <span>{cat.percentage}% dari total</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-[#11120D] overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(100, Math.max(5, cat.percentage))}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              )}
            </div>
          )}

          {/* TAB 3: METODE PEMBAYARAN */}
          {activeTab === 'payment' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              {data.paymentBreakdown.length === 0 ? (
                <div className="text-center py-8 text-xs text-[#ABA291]">
                  Belum ada pembayaran settlement.
                </div>
              ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {data.paymentBreakdown.map((p, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-2xl bg-[#1C1D17]/80 border border-[#D8CFBC]/15 space-y-2"
                  >
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-[#D8CFBC]" />
                      <span className="text-xs font-bold text-[#FFFBF4]">{p.label}</span>
                    </div>

                    <p className="text-lg font-black text-emerald-400 font-mono">
                      {formatRupiah(p.amount)}
                    </p>

                    <div className="flex justify-between text-[11px] text-[#ABA291] pt-1 border-t border-[#565449]/20">
                      <span>{p.count} transaksi</span>
                      <span className="font-bold text-[#FFFBF4]">{p.percentage}%</span>
                    </div>
                  </div>
                ))}
              </div>
              )}
            </div>
          )}
        </div>

        {/* Right 1 Col: Top Technicians Leaderboard */}
        <div className="p-6 rounded-3xl bg-[#181913]/85 backdrop-blur-2xl border border-[#D8CFBC]/20 shadow-xl space-y-4 relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-[#FFFBF4]/15 to-transparent pointer-events-none" />

          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-[#FFFBF4]">Teknisi Terbaik BANTUIN</h3>
              </div>
              <Link
                href="/admin/technicians"
                className="text-[11px] text-[#D8CFBC] hover:text-[#FFFBF4] transition-colors"
              >
                Lihat Semua
              </Link>
            </div>

            <div className="space-y-3">
              {data.topTechnicians.length > 0 ? (
                data.topTechnicians.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between p-3 rounded-2xl bg-[#1C1D17]/80 border border-[#D8CFBC]/15 hover:border-[#D8CFBC]/30 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-[#22241D] border border-[#D8CFBC]/25 flex items-center justify-center font-bold text-xs text-[#FFFBF4] shrink-0">
                        {t.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <span className="text-xs font-bold text-[#FFFBF4] block">{t.name}</span>
                        <div className="flex items-center gap-1.5 text-[11px] text-[#ABA291]">
                          {t.ratingCount > 0 ? (
                            <span className="flex items-center gap-0.5 text-amber-400">
                              <Star className="w-3 h-3 fill-amber-400" />
                              <strong>{t.ratingAvg.toFixed(1)}</strong>
                            </span>
                          ) : (
                            <span className="text-[#706E61]">Belum ada ulasan</span>
                          )}
                          <span>• {t.completedJobs} servis selesai</span>
                        </div>
                      </div>
                    </div>

                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        t.isAvailable ? 'bg-emerald-400' : 'bg-[#706E61]'
                      }`}
                      title={t.isAvailable ? 'Siap Menerima Order' : 'Sedang Bertugas'}
                    />
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-xs text-[#ABA291]">
                  Belum ada data teknisi terverifikasi.
                </div>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-[#565449]/20">
            <Link
              href="/admin/assignments"
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#22241D] hover:bg-[#2B2D24] border border-[#D8CFBC]/15 text-[#D8CFBC] hover:text-[#FFFBF4] text-xs font-semibold transition-all shadow-xs"
            >
              <span>Buka Penugasan Tiket</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* 5. Recent Real Orders Table with Live Search & Filter */}
      <div className="p-6 rounded-3xl bg-[#181913]/85 backdrop-blur-2xl border border-[#D8CFBC]/20 shadow-xl space-y-4 relative overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-[#FFFBF4]/15 to-transparent pointer-events-none" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-[#FFFBF4] flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-400" />
              <span>Tiket Permintaan Servis Terbaru</span>
            </h3>
            <p className="text-xs text-[#ABA291] mt-0.5">
              Daftar pesanan masuk yang diproses secara langsung oleh pelanggan
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search Box */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#ABA291] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari kode/pelanggan..."
                className="pl-8 pr-3 py-1.5 rounded-xl bg-[#11120D] border border-[#D8CFBC]/15 text-xs text-[#FFFBF4] placeholder-[#706E61] focus:outline-none focus:border-[#D8CFBC] transition-all"
              />
            </div>

            {/* Quick Status Filter Tabs */}
            <div className="inline-flex p-1 rounded-xl bg-[#11120D] border border-[#D8CFBC]/15 text-xs font-semibold">
              {(['all', 'open', 'progress', 'completed'] as const).map((filterKey) => {
                const labelMap: Record<string, string> = {
                  all: 'Semua',
                  open: 'Antrean',
                  progress: 'Proses',
                  completed: 'Selesai',
                };
                const isSelected = orderStatusFilter === filterKey;
                return (
                  <button
                    key={filterKey}
                    onClick={() => setOrderStatusFilter(filterKey)}
                    className={`px-2.5 py-1 rounded-lg transition-all ${
                      isSelected
                        ? 'bg-[#FFFBF4] text-[#11120D] font-bold shadow-sm'
                        : 'text-[#ABA291] hover:text-[#FFFBF4]'
                    }`}
                  >
                    {labelMap[filterKey]}
                  </button>
                );
              })}
            </div>

            <Link
              href="/admin/repairs"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#22241D] hover:bg-[#2B2D24] border border-[#D8CFBC]/15 text-xs font-bold text-[#D8CFBC] hover:text-[#FFFBF4] transition-all"
            >
              <span>Semua Tiket</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto rounded-2xl border border-[#D8CFBC]/15">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#D8CFBC]/15 bg-[#141510]/90 text-[#ABA291]">
                <th className="px-4 py-3 font-semibold">Kode Pesanan</th>
                <th className="px-4 py-3 font-semibold">Pelanggan</th>
                <th className="px-4 py-3 font-semibold">Kategori & Alat</th>
                <th className="px-4 py-3 font-semibold">Teknisi Bertugas</th>
                <th className="px-4 py-3 font-semibold">Biaya Tagihan</th>
                <th className="px-4 py-3 font-semibold">Status Pengerjaan</th>
                <th className="px-4 py-3 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D8CFBC]/10">
              {filteredRecentOrders.length > 0 ? (
                filteredRecentOrders.map((order) => {
                  const badge = getStatusBadge(order.currentStatus);
                  return (
                    <tr key={order.id} className="hover:bg-[#FFFBF4]/5 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-[#FFFBF4]">
                        {order.orderCode}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-bold text-[#FFFBF4] block">{order.customerName}</span>
                        <span className="text-[11px] text-[#ABA291]">
                          {new Date(order.createdAt).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[#FFFBF4] font-medium block">{order.categoryName}</span>
                        <span className="text-[11px] text-[#ABA291]">
                          {order.deviceBrand || '-'} {order.deviceModel}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {order.technicianName ? (
                          <span className="font-medium text-[#D8CFBC]">{order.technicianName}</span>
                        ) : (
                          <span className="text-[#706E61] italic">Belum Ditugaskan</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-emerald-400">
                        {order.totalAmount > 0 ? formatRupiah(order.totalAmount) : 'Estimasi Lapangan'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${badge.color}`}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/admin/repairs?search=${order.orderCode}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#22241D] hover:bg-[#2B2D24] text-[#D8CFBC] hover:text-[#FFFBF4] border border-[#D8CFBC]/15 text-xs font-semibold transition-all"
                        >
                          <span>Detail</span>
                          <ArrowRight className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-[#ABA291]">
                    Tidak ditemukan tiket pesanan yang sesuai dengan filter pencarian.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

