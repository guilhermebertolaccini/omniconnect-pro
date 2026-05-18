import { AlertTriangle, CheckCircle, Lightbulb, XCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { AIInsight } from '@/types/campaign';
import { cn } from '@/lib/utils';

interface InsightCardProps {
  insight: AIInsight;
}

const typeConfig = {
  critical: {
    icon: XCircle,
    color: 'text-destructive',
    bg: 'bg-destructive/10',
    badge: 'bg-destructive/20 text-destructive border-destructive/30',
    label: 'Crítico',
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-warning',
    bg: 'bg-warning/10',
    badge: 'bg-warning/20 text-warning border-warning/30',
    label: 'Atenção',
  },
  opportunity: {
    icon: Lightbulb,
    color: 'text-primary',
    bg: 'bg-primary/10',
    badge: 'bg-primary/20 text-primary border-primary/30',
    label: 'Oportunidade',
  },
  success: {
    icon: CheckCircle,
    color: 'text-success',
    bg: 'bg-success/10',
    badge: 'bg-success/20 text-success border-success/30',
    label: 'Sucesso',
  },
};

export function InsightCard({ insight }: InsightCardProps) {
  const config = typeConfig[insight.type];
  const Icon = config.icon;

  return (
    <Card className="card-hover overflow-hidden">
      <CardContent className="p-0">
        <div className={cn('h-1', config.bg.replace('/10', ''))} />
        <div className="p-5">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                  config.bg
                )}
              >
                <Icon className={cn('h-5 w-5', config.color)} />
              </div>
              <div>
                <h4 className="font-semibold leading-tight">{insight.title}</h4>
                <p className="mt-1 text-sm text-muted-foreground">
                  {insight.description}
                </p>
              </div>
            </div>
            <Badge variant="outline" className={cn('shrink-0', config.badge)}>
              {config.label}
            </Badge>
          </div>

          <div className="mt-4 rounded-lg bg-muted/50 p-3">
            <p className="text-sm font-medium text-muted-foreground">
              💡 Recomendação
            </p>
            <p className="mt-1 text-sm">{insight.recommendation}</p>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Impacto: <span className="font-medium text-foreground">{insight.impact}</span>
            </span>
            <Button size="sm" variant="outline">
              Ver Campanha
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
