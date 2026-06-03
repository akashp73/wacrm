'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export type DateRange = '7d' | '30d' | '90d';

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

const OPTIONS: { label: string; value: DateRange }[] = [
  { label: 'Last 7 days', value: '7d' },
  { label: 'Last 30 days', value: '30d' },
  { label: 'Last 90 days', value: '90d' },
];

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as DateRange)}>
      <SelectTrigger className="h-8 w-36 bg-muted border-border text-foreground text-sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="bg-muted border-border">
        {OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value} className="text-foreground focus:bg-accent focus:text-foreground">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function dateRangeToISO(range: DateRange): string {
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}
