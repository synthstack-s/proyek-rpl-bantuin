'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/admin/Sidebar';
import { Header } from '@/components/admin/Header';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Jika halaman login, tampilkan layar penuh tanpa sidebar dan header
  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] dark:bg-[#11120D] text-[#09090B] dark:text-[#FFFBF4] flex selection:bg-[#D8CFBC]/25 selection:text-[#FFFBF4] admin-theme-scope">
      {/* Sidebar Navigation (Preserved 100% as required) */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main Content Viewport */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen bg-[#FAFAFA] dark:bg-[#11120D]">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full admin-theme-scope">
          {children}
        </main>
      </div>
    </div>
  );
}
