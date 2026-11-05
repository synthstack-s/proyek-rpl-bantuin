'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, Bell, RefreshCw, ExternalLink, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/theme/ThemeToggle';

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const pathname = usePathname();
  const [dbStatus, setDbStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const [latency, setLatency] = useState<number | null>(null);

  const checkDb = async () => {
    setDbStatus('checking');
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      if (data?.database?.status === 'connected') {
        setDbStatus('connected');
        setLatency(data.database.latencyMs ?? null);
      } else {
        setDbStatus('disconnected');
        setLatency(null);
      }
    } catch {
      setDbStatus('disconnected');
      setLatency(null);
    }
  };

  useEffect(() => {
    checkDb();
    const interval = setInterval(checkDb, 30000);
    return () => clearInterval(interval);
  }, []);

  const getPageTitle = () => {
    if (pathname === '/admin') return 'Dashboard';
    if (pathname.includes('/users')) return 'Manajemen Pengguna';
    if (pathname.includes('/technicians')) return 'Verifikasi Berkas Teknisi';
    if (pathname.includes('/categories')) return 'Katalog Kategori Peralatan';
    if (pathname.includes('/services')) return 'Daftar Layanan & Tarif';
    if (pathname.includes('/repairs')) return 'Permintaan Perbaikan';
    if (pathname.includes('/assignments')) return 'Penugasan Teknisi';
    if (pathname.includes('/payments')) return 'Transaksi & Pembayaran';
    if (pathname.includes('/complaints')) return 'Layanan Pengaduan';
    if (pathname.includes('/notifications')) return 'Pemberitahuan Sistem';
    if (pathname.includes('/settings')) return 'Konfigurasi Sistem';
    if (pathname.includes('/audit-logs')) return 'Jejak Audit Administrator';
    return 'Panel Kontrol Admin';
  };

  return (
    <header className="h-14 px-4 lg:px-8 bg-[#11120D]/85 border-b border-[#D8CFBC]/10 backdrop-blur-xl flex items-center justify-between sticky top-0 z-30 transition-all">
      {/* Left: Mobile hamburger & Page Title */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-1.5 rounded-xl text-[#ABA291] hover:text-[#FFFBF4] hover:bg-[#565449]/20 transition-colors"
          aria-label="Buka Menu Navigasi"
        >
          <Menu className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2">
          <h1 className="text-sm sm:text-base font-semibold text-[#FFFBF4] tracking-tight">
            {getPageTitle()}
          </h1>
          <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#565449]/20 text-[#D8CFBC] border border-[#D8CFBC]/15">
            Admin Console
          </span>
        </div>
      </div>

      {/* Right: DB Health Indicator & Quick Links */}
      <div className="flex items-center gap-2.5">
        {/* Live Database status pill */}
        <button
          onClick={checkDb}
          title="Klik untuk memuat ulang status koneksi database"
          className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#1A1C16]/80 border border-[#D8CFBC]/15 hover:border-[#D8CFBC]/30 text-xs transition-all shadow-xs"
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              dbStatus === 'connected'
                ? 'bg-emerald-400 animate-pulse'
                : dbStatus === 'disconnected'
                ? 'bg-rose-400'
                : 'bg-amber-400'
            }`}
          />
          <span className="text-[11px] font-medium text-[#D8CFBC]">
            {dbStatus === 'connected'
              ? `MySQL Live${latency ? ` (${latency}ms)` : ''}`
              : dbStatus === 'disconnected'
              ? 'DB Disconnected'
              : 'Checking...'}
          </span>
          <RefreshCw className="w-3 h-3 text-[#706E61]" />
        </button>

        {/* Link to Notifications */}
        <Link
          href="/admin/notifications"
          className="p-1.5 rounded-xl text-[#ABA291] hover:text-[#FFFBF4] hover:bg-[#565449]/20 border border-transparent hover:border-[#D8CFBC]/15 transition-all relative"
          title="Notifikasi Sistem"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[#D8CFBC] ring-2 ring-[#11120D]" />
        </Link>

        {/* Theme Switcher */}
        <ThemeToggle compact />

        {/* View Visitor Landing Page */}
        <Link
          href="/"
          target="_blank"
          className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#1A1C16]/80 border border-[#D8CFBC]/15 hover:border-[#D8CFBC]/35 text-xs text-[#D8CFBC] hover:text-[#FFFBF4] transition-all shadow-xs"
          title="Buka Menu Pengunjung di tab baru"
        >
          <span>Portal Pengunjung</span>
          <ExternalLink className="w-3 h-3 text-[#706E61]" />
        </Link>
      </div>
    </header>
  );
}
