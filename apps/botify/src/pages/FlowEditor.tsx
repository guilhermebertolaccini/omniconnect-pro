import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { FlowEditor } from '@/components/flow-editor/FlowEditor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { ArrowLeft } from 'lucide-react';
import { wpApi } from '@/services/wordpress-api';
import type { ConversationFlow, Bot } from '@/types/bot';
import { toast } from 'sonner';
import { Node, Edge } from 'reactflow';
import type { BotifyFlowNode, BotifyFlowNodeType } from '@omniconnect/shared-types';
import { normalizeBotifyFlowConnections } from '@omniconnect/shared-types';

export default function FlowEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [flow, setFlow] = useState<ConversationFlow | null>(null);
  const isExistingFlow = !!id && id !== 'new';
  const [isLoading, setIsLoading] = useState(isExistingFlow);
  const [flowName, setFlowName] = useState('Novo Fluxo');
  const [bots, setBots] = useState<Bot[]>([]);
  const [showNewFlowDialog, setShowNewFlowDialog] = useState(!isExistingFlow);
  const [newFlowName, setNewFlowName] = useState('');
  const [newFlowTrigger, setNewFlowTrigger] = useState('oi|olá');
  const [newFlowBotId, setNewFlowBotId] = useState('');

  useEffect(() => {
    wpApi.getBots().then(setBots).catch(() => {});
  }, []);

  useEffect(() => {
    if (isExistingFlow) {
      loadFlow(id);
    }
  }, [id]);

  const loadFlow = async (flowId: string) => {
    try {
      const data = await wpApi.getFlow(flowId);
      if (data) {
        setFlow(data);
        setFlowName(data.name);
      }
    } catch {
      toast.error('Erro ao carregar fluxo');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateNewFlow = async () => {
    if (!newFlowName.trim()) {
      toast.error('Nome do fluxo é obrigatório');
      return;
    }
    if (!newFlowBotId) {
      toast.error('Selecione um bot');
      return;
    }
    setShowNewFlowDialog(false);
    setFlowName(newFlowName);
  };

  const handleSave = async (nodes: Node[], edges: Edge[]) => {
    try {
      const flowNodes: BotifyFlowNode[] = nodes.map((n) => ({
        id: n.id,
        type: (n.type || 'message') as BotifyFlowNodeType,
        position: n.position,
        data: (n.data ?? {}) as Record<string, unknown>,
        connections: edges
          .filter((e) => e.source === n.id)
          .map((e) =>
            e.sourceHandle ? { target: e.target, sourceHandle: e.sourceHandle } : e.target,
          ),
      }));

      if (flow) {
        await wpApi.updateFlow(flow.id, { nodes: flowNodes });
        toast.success('Fluxo atualizado!');
      } else {
        const created = await wpApi.createFlow({
          botId: newFlowBotId || bots[0]?.id || '1',
          name: flowName,
          triggerKeyword: newFlowTrigger,
          nodes: flowNodes,
          isActive: true,
        });
        setFlow(created);
        toast.success('Fluxo criado com sucesso!');
        navigate(`/flows/${created.id}`, { replace: true });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('Flow save error:', error);
      toast.error(`Erro ao salvar fluxo: ${msg}`);
    }
  };

  // Convert flow nodes to ReactFlow format
  const getInitialNodes = (): Node[] => {
    if (!flow?.nodes?.length) {
      return [
        {
          id: 'start-1',
          type: 'start',
          position: { x: 250, y: 50 },
          data: { triggerKeyword: flow?.triggerKeyword || 'oi|olá' },
        },
      ];
    }

    return flow.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: n.data as Record<string, unknown>,
    }));
  };

  const getInitialEdges = (): Edge[] => {
    if (!flow?.nodes?.length) return [];

    const edges: Edge[] = [];
    flow.nodes.forEach((node) => {
      const conns = normalizeBotifyFlowConnections(node.connections);
      conns.forEach((c, index) => {
        edges.push({
          id: `${node.id}-${c.target}-${c.sourceHandle ?? index}`,
          source: node.id,
          target: c.target,
          sourceHandle:
            c.sourceHandle ??
            (node.type === 'condition' ? (index === 0 ? 'yes' : 'no') : undefined),
          type: 'smoothstep',
          animated: true,
          style: { strokeWidth: 2, stroke: 'hsl(var(--primary))' },
        });
      });
    });

    return edges;
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-[calc(100vh-100px)]">
          <div className="animate-pulse text-muted-foreground">Carregando...</div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="h-[calc(100vh-48px)] flex flex-col -m-6">
        {/* Header */}
        <div className="h-14 border-b border-border bg-background flex items-center gap-4 px-6">
          <Button variant="ghost" size="sm" onClick={() => navigate('/flows')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
          <div className="h-6 w-px bg-border" />
          <h1 className="font-semibold text-foreground">{flowName}</h1>
        </div>

        {/* Editor */}
        <div className="flex-1">
          <FlowEditor
            flowId={flow?.id}
            flowName={flowName}
            initialNodes={getInitialNodes()}
            initialEdges={getInitialEdges()}
            onSave={handleSave}
          />
        </div>
      </div>

      <Dialog open={showNewFlowDialog} onOpenChange={(open) => {
        if (!open && !newFlowName.trim()) {
          navigate('/flows');
          return;
        }
        setShowNewFlowDialog(open);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Fluxo de Conversa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="flow-name">Nome do Fluxo</Label>
              <Input
                id="flow-name"
                placeholder="Ex: Atendimento Inicial"
                value={newFlowName}
                onChange={(e) => setNewFlowName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="flow-trigger">Palavras-chave de Gatilho</Label>
              <Input
                id="flow-trigger"
                placeholder="Ex: oi|olá|hello"
                value={newFlowTrigger}
                onChange={(e) => setNewFlowTrigger(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Separe com | para múltiplas palavras-chave
              </p>
            </div>
            <div className="space-y-2">
              <Label>Bot</Label>
              <Select value={newFlowBotId} onValueChange={setNewFlowBotId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um bot" />
                </SelectTrigger>
                <SelectContent>
                  {bots.map(bot => (
                    <SelectItem key={bot.id} value={bot.id}>
                      {bot.name} ({bot.phoneNumber})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => navigate('/flows')}>
              Cancelar
            </Button>
            <Button onClick={handleCreateNewFlow}>
              Criar Fluxo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
