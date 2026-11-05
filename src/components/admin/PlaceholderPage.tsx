'use client';

import Link from 'next/link';
import {
  Search,
  Filter,
  Plus,
  ArrowRight,
  Database,
  Construction,
  Layers,
} from 'lucide-react';

interface PlaceholderPageProps {
  title: string;
  description: string;
  targetTable: string;
  icon: React.ComponentType<{ className?: string }>;
  actionLabel?: string;
  badge?: string;
}

export function PlaceholderPage({
  title,
  description,
  targetTable,
  icon: Icon,
  actionLabel = 'Tambah Data',
  badge = 'Fondasi Siap',
}: PlaceholderPageProps) {
  return (
    <div className="space-y-6 text-[#FFFBF4]">
      {/* Top Banner & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#D8CFBC]/15">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-[#1C1D17] text-[#D8CFBC] border border-[#D8CFBC]/20">
              {badge}
            </span>
            <span className="text-xs text-[#D8CFBC]/70 flex items-center gap-1 font-mono">
              <Database className="w-3.5 h-3.5 text-[#D8CFBC]" />
              Tabel: <code className="text-[#FFFBF4] font-medium">{targetTable}</code>
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#FFFBF4]">{title}</h2>
          <p className="text-xs sm:text-sm text-[#D8CFBC]/70 mt-0.5">{description}</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#FFFBF4] hover:bg-[#D8CFBC] text-[#11120D] text-xs font-semibold shadow-md transition-all hover:scale-105 active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{actionLabel}</span>
          </button>
        </div>
      </div>

      {/* Mock Filter Controls */}
      <div className="p-4 rounded-2xl bg-[#181913]/90 border border-[#D8CFBC]/15 shadow-sm backdrop-blur-md flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8B8878]" />
          <input
            type="text"
            placeholder={`Cari dalam ${targetTable}...`}
            disabled
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-[#D8CFBC]/15 bg-[#11120D] text-xs text-[#D8CFBC] placeholder-[#8B8878] cursor-not-allowed"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            disabled
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#D8CFBC]/15 text-xs font-medium text-[#8B8878] bg-[#11120D] cursor-not-allowed"
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Filter</span>
          </button>
          <span className="text-xs text-[#D8CFBC]/60 font-mono">Total: 0 Data Aktif</span>
        </div>
      </div>

      {/* Main Empty State Container */}
      <div className="p-8 sm:p-12 rounded-3xl bg-[#181913]/90 border border-[#D8CFBC]/20 text-center shadow-lg backdrop-blur-xl relative overflow-hidden">
        {/* Top Rim Reflection */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-[#D8CFBC]/25 to-transparent absolute top-0 left-0" />

        <div className="w-14 h-14 rounded-2xl bg-[#1C1D17] border border-[#D8CFBC]/20 flex items-center justify-center text-[#D8CFBC] mx-auto mb-4 shadow-inner">
          <Icon className="w-7 h-7 text-[#D8CFBC]" />
        </div>

        <h3 className="text-base sm:text-lg font-bold text-[#FFFBF4] mb-1">
          Halaman {title} Siap Dihubungkan
        </h3>
        <p className="text-xs sm:text-sm text-[#D8CFBC]/80 max-w-md mx-auto mb-6 leading-relaxed">
          Struktur tabel <code className="text-[#FFFBF4] bg-[#11120D] border border-[#D8CFBC]/20 px-1.5 py-0.5 rounded font-mono font-medium">{targetTable}</code> telah tersedia pada database <code className="font-mono">bantuin_db</code>. Antarmuka CRUD dan validasi form aktif.
        </p>

        <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-[#1C1D17] border border-[#D8CFBC]/20 text-xs text-[#D8CFBC]">
          <Construction className="w-4 h-4 text-amber-400 animate-pulse" />
          <span>Status: Terhubung dengan Database</span>
        </div>
      </div>
    </div>
  );
}
