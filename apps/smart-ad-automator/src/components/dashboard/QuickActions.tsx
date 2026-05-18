import { Plus, Sparkles, FileText, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function QuickActions() {
  const actions = [
    {
      icon: Plus,
      label: 'Nova Campanha',
      description: 'Criar campanha com IA',
      variant: 'default' as const,
    },
    {
      icon: Sparkles,
      label: 'Analisar Tudo',
      description: 'Análise completa',
      variant: 'outline' as const,
    },
    {
      icon: FileText,
      label: 'Gerar Relatório',
      description: 'Exportar PDF',
      variant: 'outline' as const,
    },
    {
      icon: RefreshCw,
      label: 'Sincronizar',
      description: 'Atualizar dados',
      variant: 'outline' as const,
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium">Ações Rápidas</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3">
        {actions.map((action) => (
          <Button
            key={action.label}
            variant={action.variant}
            className="h-auto flex-col items-start gap-1 p-4 text-left"
          >
            <action.icon className="h-5 w-5" />
            <span className="font-medium">{action.label}</span>
            <span className="text-xs text-muted-foreground">
              {action.description}
            </span>
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}
