import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageCircle, UserCheck, Briefcase, ShoppingBag, MousePointerClick } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FunnelStep {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
  bgColor: string;
}

interface ConversionFunnelProps {
  clicks: number;
  whatsappConversations: number;
  mqls: number;
  sqls: number;
  salesClosed: number;
}

export function ConversionFunnel({
  clicks,
  whatsappConversations,
  mqls,
  sqls,
  salesClosed,
}: ConversionFunnelProps) {
  const steps: FunnelStep[] = [
    { label: 'Cliques', value: clicks, icon: MousePointerClick, color: 'text-primary', bgColor: 'bg-primary/15' },
    { label: 'Conversas WhatsApp', value: whatsappConversations, icon: MessageCircle, color: 'text-success', bgColor: 'bg-success/15' },
    { label: 'MQL', value: mqls, icon: UserCheck, color: 'text-accent', bgColor: 'bg-accent/15' },
    { label: 'SQL', value: sqls, icon: Briefcase, color: 'text-warning', bgColor: 'bg-warning/15' },
    { label: 'Vendas', value: salesClosed, icon: ShoppingBag, color: 'text-success', bgColor: 'bg-success/15' },
  ];

  const maxValue = Math.max(...steps.map((s) => s.value), 1);

  const fmtNum = (n: number) => new Intl.NumberFormat('pt-BR').format(n);

  const conversionRate = (from: number, to: number) => {
    if (from === 0) return '0%';
    return `${((to / from) * 100).toFixed(1)}%`;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Funil de Conversão</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {steps.map((step, i) => {
          const barWidth = Math.max((step.value / maxValue) * 100, 4);
          const Icon = step.icon;
          return (
            <div key={step.label}>
              <div className="flex items-center gap-3">
                <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', step.bgColor)}>
                  <Icon className={cn('h-4 w-4', step.color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted-foreground">{step.label}</span>
                    <span className="text-sm font-semibold">{fmtNum(step.value)}</span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-muted">
                    <div
                      className={cn('h-full rounded-full transition-all duration-500', step.bgColor.replace('/15', ''))}
                      style={{ width: `${barWidth}%`, backgroundColor: `hsl(var(--${step.color.replace('text-', '')}))` }}
                    />
                  </div>
                </div>
              </div>
              {i < steps.length - 1 && (
                <div className="ml-4 flex items-center gap-1 py-1">
                  <div className="h-3 border-l border-dashed border-muted-foreground/30" />
                  <span className="ml-6 text-[10px] text-muted-foreground">
                    {conversionRate(step.value, steps[i + 1].value)} taxa de conversão
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
