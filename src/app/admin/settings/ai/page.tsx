'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import AIProviderSettingsSection from '@/components/admin/AIProviderSettingsSection';

export default function AIProviderManagementDedicatedPage() {
  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Top Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-[#8B8878]">
        <Link href="/admin/settings" className="hover:text-[#FFFBF4] flex items-center gap-1 transition">
          <ArrowLeft className="w-3.5 h-3.5" />
          Pengaturan Sistem
        </Link>
        <span>/</span>
        <span className="text-[#D8CFBC] font-medium">AI Configuration</span>
      </div>

      {/* Main AI Section */}
      <AIProviderSettingsSection />
    </div>
  );
}
