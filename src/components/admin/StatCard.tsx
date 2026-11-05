import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Info } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ComponentType<{ className?: string }>;
  badge?: string;
  badgeType?: 'success' | 'warning' | 'info' | 'neutral';
  trendValue?: string;
  trendLabel?: string;
  isPositive?: boolean;
  className?: string;
}

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  badge,
  badgeType = 'neutral',
  trendValue,
  trendLabel,
  isPositive = true,
  className,
}: StatCardProps) {
  const isNegative = badgeType === 'warning' || isPositive === false;
  const displayBadge = badge || trendValue;

  return (
    <div
      className={cn(
        'p-5 rounded-2xl bg-[#181913]/75 backdrop-blur-md border border-[#D8CFBC]/15 shadow-xs hover:border-[#D8CFBC]/30 hover:shadow-md hover:shadow-black/25 transition-all duration-300 relative overflow-hidden group',
        className
      )}
    >
      {/* Subtle top light reflection */}
      <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-[#FFFBF4]/15 to-transparent pointer-events-none" />

      {/* Top Header: Metric Label + Info Icon + Pill Status Badge */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-1.5 text-xs text-[#ABA291] font-medium">
          <span>{title}</span>
          <Info className="w-3.5 h-3.5 text-[#706E61]" />
        </div>

        {displayBadge && (
          <div
            className={cn(
              'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border backdrop-blur-xs',
              isNegative
                ? 'bg-rose-500/10 text-rose-300 border-rose-500/20'
                : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
            )}
          >
            <span
              className={cn(
                'w-1.5 h-1.5 rounded-full',
                isNegative ? 'bg-rose-400' : 'bg-emerald-400'
              )}
            />
            <span>{displayBadge}</span>
          </div>
        )}
      </div>

      {/* Metric Main Value & Subtitle / Trend */}
      <div className="flex items-baseline gap-2.5">
        <span className="text-2xl sm:text-3xl font-bold text-[#FFFBF4] tracking-tight">
          {value}
        </span>
        {subtitle && (
          <span className="text-xs text-[#ABA291] truncate">
            {subtitle}
          </span>
        )}
      </div>

      {trendLabel && (
        <p className="text-[11px] text-[#8C8678] mt-1.5">
          {trendLabel}
        </p>
      )}
    </div>
  );
}
