import { useState } from 'react';
import { format, subDays, subMonths, startOfMonth, endOfMonth, startOfDay, isSameYear } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { DateRange } from 'react-day-picker';

const MAX_MONTHS = 37;

interface Preset {
  label: string;
  getRange: () => DateRange;
}

const buildPresets = (): Preset[] => {
  const today = new Date();
  const yesterday = subDays(today, 1);
  const minDate = subMonths(today, MAX_MONTHS);

  return [
    { label: 'Hoje', getRange: () => ({ from: startOfDay(today), to: today }) },
    { label: 'Ontem', getRange: () => ({ from: startOfDay(yesterday), to: startOfDay(yesterday) }) },
    { label: '7 dias', getRange: () => ({ from: subDays(today, 7), to: today }) },
    { label: '14 dias', getRange: () => ({ from: subDays(today, 14), to: today }) },
    { label: '30 dias', getRange: () => ({ from: subDays(today, 30), to: today }) },
    { label: 'Este mês', getRange: () => ({ from: startOfMonth(today), to: today }) },
    { label: 'Último mês', getRange: () => {
      const prev = subMonths(today, 1);
      return { from: startOfMonth(prev), to: endOfMonth(prev) };
    }},
    { label: 'Máximo', getRange: () => ({ from: minDate, to: today }) },
  ];
};

interface DateRangePickerProps {
  dateRange: DateRange | undefined;
  onDateRangeChange: (range: DateRange | undefined) => void;
}

export function DateRangePicker({ dateRange, onDateRangeChange }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const presets = buildPresets();
  const minDate = subMonths(new Date(), MAX_MONTHS);

  const handlePreset = (preset: Preset) => {
    onDateRangeChange(preset.getRange());
    setOpen(false);
  };

  const formatLabel = () => {
    if (!dateRange?.from || !dateRange?.to) return 'Selecionar período';
    const fmt = isSameYear(dateRange.from, dateRange.to) ? 'dd MMM' : 'dd MMM yyyy';
    return `${format(dateRange.from, fmt, { locale: ptBR })} — ${format(dateRange.to, fmt, { locale: ptBR })}`;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'justify-start text-left font-normal gap-2',
            !dateRange && 'text-muted-foreground',
          )}
        >
          <CalendarIcon className="h-4 w-4" />
          {formatLabel()}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <div className="flex flex-wrap gap-1 border-b border-border p-2">
          {presets.map((p) => (
            <Button
              key={p.label}
              variant={customMode ? 'ghost' : 'ghost'}
              size="sm"
              className="text-xs"
              onClick={() => { setCustomMode(false); handlePreset(p); }}
            >
              {p.label}
            </Button>
          ))}
          <Button
            variant={customMode ? 'secondary' : 'ghost'}
            size="sm"
            className="text-xs"
            onClick={() => setCustomMode(true)}
          >
            Personalizado
          </Button>
        </div>
        <Calendar
          mode="range"
          selected={dateRange}
          onSelect={(range) => {
            onDateRangeChange(range);
            if (range?.from && range?.to) setOpen(false);
          }}
          numberOfMonths={2}
          disabled={(date) => date > new Date() || date < minDate}
          locale={ptBR}
          initialFocus
          className={cn('p-3 pointer-events-auto')}
        />
      </PopoverContent>
    </Popover>
  );
}

/** Convert DateRange to Meta API time_range JSON string or date_preset */
export function dateRangeToPreset(range: DateRange | undefined): string {
  if (!range?.from || !range?.to) return 'last_7d';
  const since = format(range.from, 'yyyy-MM-dd');
  const until = format(range.to, 'yyyy-MM-dd');
  return JSON.stringify({ since, until });
}
