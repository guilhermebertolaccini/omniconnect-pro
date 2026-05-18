import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Beaker, Trash2, ChevronRight } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import {
  useExperimentsList,
  useDeleteExperiment,
} from '@/hooks/useExperiments';
import {
  EXPERIMENT_STATUS_LABELS,
  WINNING_METRIC_LABELS,
  type ExperimentStatus,
} from '@/types/experiment';
import { CreateExperimentDialog } from './CreateExperimentDialog';
import { ExperimentDetail } from './ExperimentDetail';

const STATUS_VARIANT: Record<ExperimentStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  draft: 'outline',
  running: 'default',
  completed: 'secondary',
  cancelled: 'destructive',
};

export function ExperimentsPanel() {
  const { selectedCompanyId } = useCompany();
  const { data, isLoading } = useExperimentsList(selectedCompanyId);
  const deleteMut = useDeleteExperiment(selectedCompanyId);
  const [openCreate, setOpenCreate] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Testes A/B de posts orgânicos</h2>
          <p className="text-sm text-muted-foreground">Compare variações de conteúdo e descubra o que funciona.</p>
        </div>
        <Button onClick={() => setOpenCreate(true)}>
          <Beaker className="h-4 w-4 mr-2" /> Novo teste
        </Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      {!isLoading && (data?.length ?? 0) === 0 && (
        <Card>
          <CardContent className="py-10 text-center">
            <Beaker className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">Nenhum teste ainda. Clique em "Novo teste" para começar.</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {data?.map((exp) => (
          <Card key={exp.id} className="hover:border-primary/50 transition-colors">
            <CardContent className="p-4 flex items-center gap-4">
              <button
                onClick={() => setOpenId(exp.id)}
                className="flex-1 text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">{exp.name}</span>
                  <Badge variant={STATUS_VARIANT[exp.status]}>{EXPERIMENT_STATUS_LABELS[exp.status]}</Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground flex flex-wrap gap-3">
                  <span>Métrica: {WINNING_METRIC_LABELS[exp.winning_metric]}</span>
                  <span>Duração: {exp.duration_days}d</span>
                  {exp.started_at && <span>Iniciado: {new Date(exp.started_at).toLocaleDateString('pt-BR')}</span>}
                </div>
              </button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  if (confirm('Excluir este teste?')) deleteMut.mutate(exp.id);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>
        ))}
      </div>

      <CreateExperimentDialog
        open={openCreate}
        onOpenChange={setOpenCreate}
        onCreated={(id) => setOpenId(id)}
      />
      <ExperimentDetail experimentId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
