'use client';

import { type LucideIcon } from 'lucide-react';

interface KpiCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: LucideIcon;
  trend?: { value: number; label: string };
  color?: 'green' | 'emerald' | 'blue' | 'amber';
}

const COLOR_MAP: Record<
  NonNullable<KpiCardProps['color']>,
  { bg: string; text: string }
> = {
  green:   { bg: 'bg-muted  dark:bg-[#25D366]/10', text: 'text-foreground dark:text-foreground' },
  emerald: { bg: 'bg-emerald-50  dark:bg-emerald-900/20', text: 'text-emerald-600 dark:text-emerald-400' },
  blue:    { bg: 'bg-blue-50     dark:bg-blue-900/20',    text: 'text-blue-600  dark:text-blue-400'  },
  amber:   { bg: 'bg-amber-50    dark:bg-amber-900/20',   text: 'text-amber-600 dark:text-amber-400' },
};

export function KpiCard({ label, value, sub, icon: Icon, trend, color = 'green' }: KpiCardProps) {
  const { bg, text } = COLOR_MAP[color];

  return (
    <div className="rounded-xl border border-border bg-white p-5 shadow-sm dark:border-border dark:bg-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground dark:text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-foreground dark:text-foreground">
            {value}
          </p>
          {sub && (
            <p className="mt-0.5 text-xs text-muted-foreground dark:text-muted-foreground">{sub}</p>
          )}
          {trend && (
            <p className={`mt-1.5 text-xs font-medium ${trend.value >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
              {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}% {trend.label}
            </p>
          )}
        </div>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${bg}`}>
          <Icon className={`size-5 ${text}`} />
        </div>
      </div>
    </div>
  );
}
