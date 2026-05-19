import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { wpApi } from '@/services/wordpress-api';
import type { ConversationFlow, Bot } from '@/types/bot';
import { 
  GitBranch, 
  Plus, 
  Play, 
  Pause, 
  Edit, 
  Trash2,
  MessageSquare,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function Flows() {
  const navigate = useNavigate();
  const [flows, setFlows] = useState<ConversationFlow[]>([]);
  const [bots, setBots] = useState<Bot[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [flowsData, botsData] = await Promise.all([
          wpApi.getFlows(),
          wpApi.getBots(),
        ]);
        setFlows(flowsData);
        setBots(botsData);
      } catch {
        toast.error('Erro ao carregar fluxos');
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  const getBotName = (botId: string) => {
    const bot = bots.find(b => b.id === botId);
    return bot?.name || 'Bot desconhecido';
  };

  const toggleFlowStatus = async (flow: ConversationFlow) => {
    try {
      await wpApi.updateFlow(flow.id, { isActive: !flow.isActive });
      setFlows(flows.map(f => 
        f.id === flow.id ? { ...f, isActive: !f.isActive } : f
      ));
      toast.success(flow.isActive ? 'Fluxo pausado' : 'Fluxo ativado');
    } catch {
      toast.error('Erro ao atualizar fluxo');
    }
  };

  const getNodeTypeIcon = (type: string) => {
    switch (type) {
      case 'message':
        return <MessageSquare className="h-4 w-4" />;
      case 'condition':
        return <GitBranch className="h-4 w-4" />;
      case 'action':
        return <Zap className="h-4 w-4" />;
      default:
        return <GitBranch className="h-4 w-4" />;
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Fluxos de Conversa</h1>
            <p className="text-muted-foreground">
              Configure automações e respostas automáticas
            </p>
          </div>
          <Button onClick={() => navigate('/flows/new')}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Fluxo
          </Button>
        </div>

        {/* Flows Grid */}
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 rounded-lg bg-card animate-pulse" />
            ))}
          </div>
        ) : flows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 border border-dashed border-border rounded-lg">
            <GitBranch className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              Nenhum fluxo criado
            </h3>
            <p className="text-muted-foreground text-center mb-4">
              Crie fluxos de conversa para automatizar o atendimento.
            </p>
            <Button onClick={() => navigate('/flows/new')}>
              <Plus className="mr-2 h-4 w-4" />
              Criar Primeiro Fluxo
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {flows.map((flow) => (
              <Card key={flow.id} className="group hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        <GitBranch className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{flow.name}</CardTitle>
                        <p className="text-sm text-muted-foreground">
                          {getBotName(flow.botId)}
                        </p>
                      </div>
                    </div>
                    <Badge 
                      variant={flow.isActive ? 'default' : 'secondary'}
                      className={flow.isActive ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : ''}
                    >
                      {flow.isActive ? 'Ativo' : 'Pausado'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="mb-4">
                    <p className="text-sm text-muted-foreground mb-2">Gatilho:</p>
                    <code className="text-xs bg-muted px-2 py-1 rounded">
                      {flow.triggerKeyword}
                    </code>
                  </div>

                  <div className="flex items-center gap-2 mb-4">
                    {flow.nodes.slice(0, 3).map((node) => (
                      <div
                        key={node.id}
                        className="flex items-center justify-center h-8 w-8 rounded bg-muted"
                        title={node.type}
                      >
                        {getNodeTypeIcon(node.type)}
                      </div>
                    ))}
                    {flow.nodes.length > 3 && (
                      <span className="text-sm text-muted-foreground">
                        +{flow.nodes.length - 3}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-border">
                    <span className="text-xs text-muted-foreground">
                      {flow.updatedAt && !isNaN(new Date(flow.updatedAt).getTime())
                        ? `Atualizado ${formatDistanceToNow(new Date(flow.updatedAt), { locale: ptBR, addSuffix: true })}`
                        : ''}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => toggleFlowStatus(flow)}
                      >
                        {flow.isActive ? (
                          <Pause className="h-4 w-4" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8"
                        onClick={() => navigate(`/flows/${flow.id}`)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
