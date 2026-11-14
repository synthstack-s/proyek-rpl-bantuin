'use client';

import React from 'react';
import Link from 'next/link';
import {
  Wrench,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
  ShieldAlert,
  ArrowRight,
  Coins,
  Cpu,
} from 'lucide-react';
import { DiagnosisCard } from '@/lib/chatbot/types';

interface DiagnosisCardViewProps {
  card: DiagnosisCard;
  sessionId?: number;
  sessionUuid?: string;
  onConvertToOrder?: () => void;
}

export const DiagnosisCardView: React.FC<DiagnosisCardViewProps> = ({
  card,
  sessionId,
  sessionUuid,
  onConvertToOrder,
}) => {
  const getConfidenceBadge = (level: string) => {
    switch (level) {
      case 'Sangat Mungkin':
        return 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30';
      case 'Kemungkinan Besar':
        return 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-[#D8CFBC]/20 dark:text-[#FFFBF4] dark:border-[#D8CFBC]/30';
      default:
        return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30';
    }
  };

  const bookingHref = `/customer/repairs/new?${new URLSearchParams({
    category_id: String(card.categoryId || 1),
    symptoms: card.symptomsSummary || '',
    ...(sessionId ? { ai_session_id: String(sessionId) } : {}),
  }).toString()}`;

  return (
    <div className="chatbot-diagnosis-card mt-4 rounded-2xl border border-amber-200/90 bg-white text-slate-900 dark:border-[#D8CFBC]/25 dark:bg-[#181913]/95 dark:text-[#FFFBF4] p-5 shadow-xl backdrop-blur-md">
      {/* Header Kartu */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-[#D8CFBC]/15 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:bg-[#D8CFBC]/15 dark:border-[#D8CFBC]/25 dark:text-[#D8CFBC] shadow-inner">
            <Cpu className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-[#D8CFBC]">
              Hasil Diagnosis Awal AI
            </span>
            <h4 className="text-base font-bold text-slate-900 dark:text-[#FFFBF4]">{card.deviceCategory}</h4>
          </div>
        </div>

        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${getConfidenceBadge(
            card.confidenceLevel
          )}`}
        >
          <HelpCircle className="h-3 w-3" />
          {card.confidenceLevel}
        </span>
      </div>

      {/* Ringkasan Gejala */}
      <div className="mt-3 text-xs text-slate-600 dark:text-[#D8CFBC]">
        <span className="font-semibold text-slate-900 dark:text-[#FFFBF4]">Gejala Dilaporkan: </span>
        <span className="text-slate-700 dark:text-[#D8CFBC]/90">{card.symptomsSummary}</span>
      </div>

      {/* Peringatan Bahaya Darurat (Jika Ada) */}
      {card.safetyHazardWarning && (
        <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-500/30 dark:bg-rose-950/40 dark:text-rose-300">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
          <div>
            <strong className="block text-rose-900 dark:text-rose-200">Peringatan Keselamatan Penting:</strong>
            {card.safetyHazardWarning}
          </div>
        </div>
      )}

      {/* Dugaan Kemungkinan Penyebab */}
      {card.possibleCauses && card.possibleCauses.length > 0 && (
        <div className="mt-4">
          <h5 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5" />
            Kemungkinan Penyebab Kerusakan:
          </h5>
          <ul className="mt-1.5 space-y-1 text-xs text-slate-600 dark:text-[#D8CFBC]/90">
            {card.possibleCauses.map((cause, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-amber-500 dark:text-amber-400">•</span>
                <span>{cause}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Langkah Pemeriksaan Aman Mandiri */}
      {card.safeCheckSteps && card.safeCheckSteps.length > 0 && (
        <div className="mt-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 dark:bg-[#11120D] dark:border-[#D8CFBC]/15 dark:text-[#D8CFBC]/80 p-3">
          <h5 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
            <CheckCircle className="h-3.5 w-3.5" />
            Langkah Pemeriksaan Aman Mandiri:
          </h5>
          <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-xs text-slate-600 dark:text-[#D8CFBC]/80">
            {card.safeCheckSteps.map((step, idx) => (
              <li key={idx}>{step}</li>
            ))}
          </ol>
        </div>
      )}

      {/* Footer Kartu & Tombol Aksi */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 dark:border-[#D8CFBC]/15 pt-3">
        {card.estimatedLaborCostRange && (
          <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-[#D8CFBC]">
            <Coins className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <span>Estimasi Jasa: </span>
            <strong className="text-slate-900 dark:text-[#FFFBF4] font-mono">{card.estimatedLaborCostRange}</strong>
          </div>
        )}

        <div className="flex items-center gap-2 ml-auto">
          {onConvertToOrder ? (
            <button
              onClick={onConvertToOrder}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white dark:bg-[#FFFBF4] dark:hover:bg-[#D8CFBC] dark:text-[#11120D] px-4 py-2 text-xs font-bold shadow-md transition hover:scale-105 active:scale-95"
            >
              <Wrench className="h-3.5 w-3.5" />
              Pesan Teknisi Sekarang
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          ) : (
            <Link
              href={bookingHref}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white dark:bg-[#FFFBF4] dark:hover:bg-[#D8CFBC] dark:text-[#11120D] px-4 py-2 text-xs font-bold shadow-md transition hover:scale-105 active:scale-95"
            >
              <Wrench className="h-3.5 w-3.5" />
              Pesan Teknisi Sekarang
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
};
