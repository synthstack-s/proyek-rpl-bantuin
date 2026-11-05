'use client';

import { useState } from 'react';
import { LogOut, Loader2 } from 'lucide-react';

interface LogoutButtonProps {
  className?: string;
  showTextOnMobile?: boolean;
  label?: string;
}

export function LogoutButton({
  className = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#1C1D17]/90 hover:bg-[#252720] text-xs font-semibold text-rose-300 border border-[#D8CFBC]/15 transition-all shadow-xs',
  showTextOnMobile = false,
  label = 'Keluar',
}: LogoutButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleLogout = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);

    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      // Selalu arahkan pengguna kembali ke menu pengunjung (/)
      window.location.href = '/';
    }
  };

  return (
    <form action="/api/auth/logout" method="POST" className="inline">
      <button
        type="submit"
        onClick={handleLogout}
        disabled={loading}
        className={className}
        title="Keluar dan kembali ke menu pengunjung"
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin text-rose-400" />
        ) : (
          <LogOut className="w-4 h-4" />
        )}
        <span className={showTextOnMobile ? 'inline' : 'hidden sm:inline'}>
          {loading ? 'Keluar...' : label}
        </span>
      </button>
    </form>
  );
}
