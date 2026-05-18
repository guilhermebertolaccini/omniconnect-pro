import { Play, Pause, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface StatusCardsProps {
  active: number;
  paused: number;
  issues: number;
}

export function StatusCards({ active, paused, issues }: StatusCardsProps) {
  const statuses = [
    {
      label: 'Ativas',
      count: active,
      icon: Play,
      color: 'text-success',
      bg: 'bg-success/10',
    },
    {
      label: 'Pausadas',
      count: paused,
      icon: Pause,
      color: 'text-warning',
      bg: 'bg-warning/10',
    },
    {
      label: 'Com Problemas',
      count: issues,
      icon: AlertTriangle,
      color: 'text-destructive',
      bg: 'bg-destructive/10',
    },
  ];

  return (
    <Card>
      <CardContent className="p-6">
        <h3 className="mb-4 text-sm font-medium text-muted-foreground">
          Status das Campanhas
        </h3>
        <div className="grid grid-cols-3 gap-4">
          {statuses.map((status) => (
            <div
              key={status.label}
              className="flex flex-col items-center gap-2 rounded-xl border border-border p-4 transition-colors hover:bg-muted/50"
            >
              <div
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-full',
                  status.bg
                )}
              >
                <status.icon className={cn('h-5 w-5', status.color)} />
              </div>
              <span className="text-2xl font-bold">{status.count}</span>
              <span className="text-xs text-muted-foreground">{status.label}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
