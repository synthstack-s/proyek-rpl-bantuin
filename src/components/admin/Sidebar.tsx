'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  FileCheck2,
  Layers,
  Wrench,
  ClipboardList,
  UserCheck,
  CreditCard,
  AlertTriangle,
  Bell,
  Settings,
  History,
  X,
  LogOut,
  Loader2,
  Search,
  Sparkles,
  HelpCircle,
  BookOpen,
  ChevronRight,
  Shield,
  Sliders,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  section?: 'platform' | 'system';
}

export const navItems: NavItem[] = [
  // Platform Section
  { label: 'Dashboard', href: '/admin', icon: LayoutDashboard, section: 'platform' },
  { label: 'Permintaan Perbaikan', href: '/admin/repairs', icon: ClipboardList, section: 'platform' },
  { label: 'Penugasan Teknisi', href: '/admin/assignments', icon: UserCheck, section: 'platform' },
  { label: 'Transaksi & Tagihan', href: '/admin/payments', icon: CreditCard, section: 'platform' },
  { label: 'Verifikasi Teknisi', href: '/admin/technicians', icon: FileCheck2, section: 'platform' },
  { label: 'Katalog Layanan', href: '/admin/services', icon: Wrench, section: 'platform' },
  { label: 'Kategori Peralatan', href: '/admin/categories', icon: Layers, section: 'platform' },
  { label: 'Manajemen Pengguna', href: '/admin/users', icon: Users, section: 'platform' },

  // System Section
  { label: 'Konfigurasi Sistem', href: '/admin/settings', icon: Settings, section: 'system' },
  { label: 'Notifikasi', href: '/admin/notifications', icon: Bell, section: 'system' },
  { label: 'Audit Log', href: '/admin/audit-logs', icon: History, section: 'system' },
  { label: 'Pengaduan Layanan', href: '/admin/complaints', icon: AlertTriangle, section: 'system' },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [adminUser, setAdminUser] = useState<{ email: string; name?: string; phone?: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [editAdminName, setEditAdminName] = useState('');
  const [editAdminPhone, setEditAdminPhone] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchAdminUser = () => {
    fetch('/api/admin/auth/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success && data?.user) {
          setAdminUser(data.user);
          setEditAdminName(data.user.name || '');
          setEditAdminPhone(data.user.phone || '');
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchAdminUser();
  }, []);

  const handleSaveAdminProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editAdminName.trim()) return;
    setIsSavingProfile(true);
    setProfileMsg(null);
    try {
      const res = await fetch('/api/admin/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: editAdminName.trim(),
          phone_number: editAdminPhone.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setProfileMsg({ type: 'success', text: 'Profil administrator berhasil disimpan!' });
        fetchAdminUser();
        setTimeout(() => {
          setIsProfileModalOpen(false);
          setProfileMsg(null);
        }, 1500);
      } else {
        setProfileMsg({ type: 'error', text: data.message || 'Gagal menyimpan profil.' });
      }
    } catch (err: any) {
      setProfileMsg({ type: 'error', text: 'Koneksi gagal: ' + err.message });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await fetch('/api/admin/auth/logout', {
        method: 'POST',
      });
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      router.push('/admin/login');
      router.refresh();
      setIsLoggingOut(false);
    }
  };

  const filteredItems = navItems.filter((item) =>
    item.label.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const platformItems = filteredItems.filter((i) => i.section === 'platform');
  const systemItems = filteredItems.filter((i) => i.section === 'system');

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-[#11120D]/80 backdrop-blur-sm lg:hidden transition-opacity"
        />
      )}

      {/* Sidebar container - Smoky Black (#11120D) to match the rest of the app */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-[#11120D] text-[#D8CFBC] border-r border-[#D8CFBC]/15 flex flex-col transition-transform duration-200 ease-in-out lg:static lg:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Top Header & Logo */}
        <div className="h-14 px-4 flex items-center justify-between border-b border-[#D8CFBC]/10">
          <Link href="/admin" className="flex items-center gap-2.5 group">
            {/* Minimalist geometric logo icon */}
            <div className="w-7 h-7 rounded-lg bg-[#FFFBF4] flex items-center justify-center text-[#11120D] font-black text-xs shadow-sm">
              <span className="tracking-tighter font-mono">::</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold tracking-tight text-[#FFFBF4]">
                BANTUIN
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#181913] text-[#D8CFBC] font-mono border border-[#D8CFBC]/15">
                v2.0
              </span>
            </div>
          </Link>

          <button
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-lg text-[#D8CFBC]/60 hover:text-[#FFFBF4] hover:bg-[#181913]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Bar matching the rest of the app */}
        <div className="px-3 pt-3 pb-3">
          <div className="flex items-center justify-between w-full px-2.5 py-1.5 rounded-xl bg-[#181913] border border-[#D8CFBC]/15 text-xs text-[#D8CFBC] focus-within:border-[#D8CFBC]/40 transition-colors">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Search className="w-3.5 h-3.5 text-[#8B8878] shrink-0" />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent border-none outline-none text-xs text-[#FFFBF4] placeholder-[#8B8878] w-full"
              />
            </div>
            <kbd className="inline-flex items-center px-1.5 py-0.5 rounded bg-[#11120D] border border-[#D8CFBC]/20 text-[10px] font-mono text-[#D8CFBC]/70 shrink-0">
              ⌘ K
            </kbd>
          </div>
        </div>

        {/* Scrollable Navigation Sections */}
        <div className="flex-1 overflow-y-auto px-2 space-y-4 text-xs">
          {/* Section: Platform */}
          {platformItems.length > 0 && (
            <div className="space-y-1">
              <div className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[#D8CFBC]/50">
                Platform
              </div>
              {platformItems.map((item) => {
                const Icon = item.icon;
                const isActive =
                  item.href === '/admin'
                    ? pathname === '/admin'
                    : pathname.startsWith(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => {
                      if (window.innerWidth < 1024) onClose();
                    }}
                    className={cn(
                      'flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-xs transition-colors group',
                      isActive
                        ? 'bg-[#1C1D17] text-[#FFFBF4] font-medium border border-[#D8CFBC]/20 shadow-xs'
                        : 'text-[#D8CFBC]/70 hover:text-[#FFFBF4] hover:bg-[#181913]'
                    )}
                  >
                    <Icon
                      className={cn(
                        'w-4 h-4 shrink-0 transition-colors',
                        isActive ? 'text-[#FFFBF4]' : 'text-[#D8CFBC]/60 group-hover:text-[#FFFBF4]'
                      )}
                    />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.badge && (
                      <span className="px-1.5 py-0.2 text-[10px] font-medium rounded-full bg-[#D8CFBC]/15 text-[#FFFBF4] border border-[#D8CFBC]/20">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          )}

          {/* Section: System */}
          {systemItems.length > 0 && (
            <div className="space-y-1 pt-1">
              <div className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[#D8CFBC]/50">
                System
              </div>
              {systemItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname.startsWith(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => {
                      if (window.innerWidth < 1024) onClose();
                    }}
                    className={cn(
                      'flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-xs transition-colors group',
                      isActive
                        ? 'bg-[#1C1D17] text-[#FFFBF4] font-medium border border-[#D8CFBC]/20 shadow-xs'
                        : 'text-[#D8CFBC]/70 hover:text-[#FFFBF4] hover:bg-[#181913]'
                    )}
                  >
                    <Icon
                      className={cn(
                        'w-4 h-4 shrink-0 transition-colors',
                        isActive ? 'text-[#FFFBF4]' : 'text-[#D8CFBC]/60 group-hover:text-[#FFFBF4]'
                      )}
                    />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.href === '/admin/settings' ? (
                      <ChevronRight className="w-3.5 h-3.5 text-[#D8CFBC]/50" />
                    ) : null}
                  </Link>
                );
              })}
            </div>
          )}

          {/* Section: Help & Resources */}
          <div className="pt-2">
            {/* What's new card matching the app design */}
            <div className="p-3 rounded-xl bg-[#141510] border border-[#D8CFBC]/15 text-xs space-y-2 mb-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#FFFBF4]">
                <Sparkles className="w-3.5 h-3.5 text-[#D8CFBC]" />
                <span>What&apos;s new?</span>
              </div>
              <ul className="text-[11px] text-[#D8CFBC]/70 space-y-1 pl-1">
                <li className="flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-[#D8CFBC]/40" />
                  <span>In-App Real-time Chat</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-[#D8CFBC]/40" />
                  <span>Technician Visit Scheduling</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-[#D8CFBC]/40" />
                  <span>Automated Payment Webhook</span>
                </li>
              </ul>
            </div>

            <div className="space-y-0.5 text-xs">
              <Link
                href="/?chat=true"
                className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-[#D8CFBC]/70 hover:text-[#FFFBF4] hover:bg-[#181913] transition-colors group"
              >
                <HelpCircle className="w-4 h-4 text-[#D8CFBC]/60 group-hover:text-[#FFFBF4]" />
                <span>Help Center</span>
              </Link>
              <Link
                href="/"
                className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-[#D8CFBC]/70 hover:text-[#FFFBF4] hover:bg-[#181913] transition-colors group"
              >
                <BookOpen className="w-4 h-4 text-[#D8CFBC]/60 group-hover:text-[#FFFBF4]" />
                <span>Menu Pengunjung</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Bottom Profile / Customizer Card */}
        <div className="p-2.5 border-t border-[#D8CFBC]/15">
          <div className="p-2 rounded-xl bg-[#181913] border border-[#D8CFBC]/15 flex items-center justify-between gap-2 hover:border-[#D8CFBC]/30 transition-all">
            <button
              onClick={() => {
                setEditAdminName(adminUser?.name || '');
                setEditAdminPhone(adminUser?.phone || '');
                setProfileMsg(null);
                setIsProfileModalOpen(true);
              }}
              title="Klik untuk mengubah nama atau profil administrator"
              className="flex items-center gap-2 min-w-0 text-left flex-1 group"
            >
              <div className="w-7 h-7 rounded-lg bg-[#141510] border border-[#D8CFBC]/20 flex items-center justify-center text-xs text-[#FFFBF4] font-semibold shrink-0 group-hover:border-[#D8CFBC]/50 transition-colors">
                <Sliders className="w-3.5 h-3.5 text-[#D8CFBC]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-[#FFFBF4] truncate leading-tight group-hover:text-[#D8CFBC] transition-colors">
                  {adminUser?.name || (adminUser?.email ? adminUser.email.split('@')[0] : 'Admin Bantuin')}
                </p>
                <p className="text-[10px] text-[#D8CFBC]/60 truncate">
                  Edit Profil Admin
                </p>
              </div>
            </button>

            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              title="Keluar dari Admin Panel"
              className="p-1.5 rounded-lg text-[#D8CFBC]/60 hover:text-rose-400 hover:bg-rose-500/10 transition-colors shrink-0"
            >
              {isLoggingOut ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400" />
              ) : (
                <LogOut className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>
      </aside>

      {/* Modal Edit Profil Administrator */}
      {isProfileModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-[#141510] border border-[#D8CFBC]/20 text-[#FFFBF4] shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-[#D8CFBC]/15 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-500">
                  <Sliders className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#FFFBF4]">Ubah Profil Administrator</h3>
                  <p className="text-xs text-[#D8CFBC]/70">{adminUser?.email || 'admin@bantuin.id'}</p>
                </div>
              </div>
              <button
                onClick={() => setIsProfileModalOpen(false)}
                className="p-1.5 rounded-lg text-[#D8CFBC]/60 hover:text-[#FFFBF4] hover:bg-[#181913] transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {profileMsg && (
              <div
                className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${
                  profileMsg.type === 'success'
                    ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800'
                    : 'bg-rose-950/40 text-rose-300 border-rose-800'
                }`}
              >
                <span>{profileMsg.text}</span>
              </div>
            )}

            <form onSubmit={handleSaveAdminProfile} className="space-y-4 text-xs">
              <div>
                <label className="block text-[#D8CFBC] font-semibold mb-1">
                  Nama Lengkap Admin *
                </label>
                <input
                  type="text"
                  required
                  value={editAdminName}
                  onChange={(e) => setEditAdminName(e.target.value)}
                  placeholder="Contoh: Budi Santoso Admin"
                  className="w-full px-3 py-2 rounded-xl border border-[#D8CFBC]/20 bg-[#161712] text-[#FFFBF4] placeholder-[#8B8878] font-medium focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-[#D8CFBC] font-semibold mb-1">
                  Nomor Telepon Kontak
                </label>
                <input
                  type="text"
                  value={editAdminPhone}
                  onChange={(e) => setEditAdminPhone(e.target.value)}
                  placeholder="Contoh: +628110000001"
                  className="w-full px-3 py-2 rounded-xl border border-[#D8CFBC]/20 bg-[#161712] text-[#FFFBF4] placeholder-[#8B8878] font-medium focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-[#D8CFBC]/15">
                <button
                  type="button"
                  onClick={() => setIsProfileModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[#D8CFBC]/20 bg-[#181913] text-[#D8CFBC] hover:text-[#FFFBF4] font-medium transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingProfile || !editAdminName.trim()}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold shadow-md transition disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSavingProfile ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <span>Simpan Profil</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
