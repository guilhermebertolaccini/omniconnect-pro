import { useCallback, useRef, useState, useMemo, useEffect } from 'react';
import ReactFlow, {
  Node,
  Edge,
  addEdge,
  Connection,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlowProvider,
  ReactFlowInstance,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { nodeTypes } from './nodes';
import { NodePalette } from './NodePalette';
import { NodeEditor } from './NodeEditor';
import { Button } from '@/components/ui/button';
import { Save, Undo, Redo, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useUpdateFlow, useFlow, useSaveAIConfig } from '@/hooks/use-wordpress-api';
import type { AIProvider } from '@/types/api';
import type { BotifyFlowNode, BotifyFlowNodeType } from '@omniconnect/shared-types';

interface FlowEditorCanvasProps {
  flowId?: string;
  flowName: string;
  initialNodes?: Node[];
  initialEdges?: Edge[];
  onSave?: (nodes: Node[], edges: Edge[]) => void | Promise<void>;
}

const defaultNodes: Node[] = [
  {
    id: 'start-1',
    type: 'start',
    position: { x: 250, y: 50 },
    data: { triggerKeyword: 'oi|olá|hello' },
  },
];

const defaultEdges: Edge[] = [];

export function FlowEditorCanvas({
  flowId,
  flowName,
  initialNodes = defaultNodes,
  initialEdges = defaultEdges,
  onSave,
}: FlowEditorCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  // Memoize nodeTypes to prevent ReactFlow warnings
  const memoizedNodeTypes = useMemo(() => nodeTypes, []);

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            type: 'smoothstep',
            animated: true,
            style: { strokeWidth: 2, stroke: 'hsl(var(--primary))' },
          },
          eds
        )
      );
    },
    [setEdges]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      if (!reactFlowWrapper.current || !reactFlowInstance) return;

      const type = event.dataTransfer.getData('application/reactflow');
      if (!type) return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: Node = {
        id: `${type}-${Date.now()}`,
        type,
        position,
        data: getDefaultNodeData(type),
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [reactFlowInstance, setNodes]
  );

  const getDefaultNodeData = (type: string): Record<string, unknown> => {
    switch (type) {
      case 'start':
        return { triggerKeyword: 'oi|olá' };
      case 'message':
        return { content: 'Olá! Como posso ajudar?' };
      case 'media':
        return { mediaType: 'image', url: '', caption: '' };
      case 'buttons':
        return { bodyText: 'Escolha uma opção:', buttons: [{ id: 'btn-1', text: 'Opção 1' }] };
      case 'list':
        return { bodyText: 'Veja nossas opções:', buttonText: 'Ver opções', sections: [] };
      case 'condition':
        return { condition: 'sim|confirmo' };
      case 'action':
        return {
          actionType: 'transfer',
          message: 'Handoff solicitado pelo Botify',
        };
      case 'delay':
        return { delayMs: 2000 };
      case 'ai':
        return {
          provider: 'lovable' as AIProvider,
          model: 'google/gemini-3-flash-preview',
          systemPrompt: 'Você é um assistente virtual prestativo e amigável.',
          userPromptTemplate: '{{user_message}}',
          temperature: 0.7,
          maxTokens: 500,
          label: 'Processamento IA',
        };
      default:
        return {};
    }
  };

  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  const onNodeDoubleClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
    setEditorOpen(true);
  }, []);

  const handleNodeUpdate = useCallback(
    (nodeId: string, data: Record<string, unknown>) => {
      setNodes((nds) =>
        nds.map((node) => (node.id === nodeId ? { ...node, data: { ...node.data, ...data } } : node))
      );
      toast.success('Nó atualizado');
    },
    [setNodes]
  );

  const handleNodeDelete = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((node) => node.id !== nodeId));
      setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
      toast.success('Nó removido');
    },
    [setNodes, setEdges]
  );

  // Mutations for saving
  const updateFlowMutation = useUpdateFlow();
  const saveAIConfigMutation = useSaveAIConfig();

  const handleSave = async () => {
    if (onSave) {
      try {
        await onSave(nodes, edges);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('Error in onSave:', error);
        toast.error(`Erro ao salvar: ${msg}`);
      }
      return;
    }

    if (!flowId) {
      toast.error('ID do fluxo não encontrado');
      return;
    }

    try {
      // Convert React Flow nodes to storage format (contract: @omniconnect/shared-types BotifyFlowNode)
      const flowNodes: BotifyFlowNode[] = nodes.map((node) => ({
        id: node.id,
        type: (node.type || 'message') as BotifyFlowNodeType,
        position: node.position,
        data: (node.data ?? {}) as Record<string, unknown>,
        connections: edges
          .filter((e) => e.source === node.id)
          .map((e) =>
            e.sourceHandle ? { target: e.target, sourceHandle: e.sourceHandle } : e.target,
          ),
      }));

      // Save flow
      await updateFlowMutation.mutateAsync({
        id: flowId,
        updates: { nodes: flowNodes },
      });

      // Save AI node configurations
      const aiNodes = nodes.filter((n) => n.type === 'ai');
      for (const aiNode of aiNodes) {
        await saveAIConfigMutation.mutateAsync({
          flowId,
          nodeId: aiNode.id,
          config: {
            provider: aiNode.data.provider || 'lovable',
            model: aiNode.data.model || 'google/gemini-3-flash-preview',
            systemPrompt: aiNode.data.systemPrompt,
            userPromptTemplate: aiNode.data.userPromptTemplate,
            temperature: aiNode.data.temperature,
            maxTokens: aiNode.data.maxTokens,
          },
        });
      }

      toast.success('Fluxo salvo com sucesso!');
    } catch (error) {
      console.error('Error saving flow:', error);
      // Error toast is handled by the mutation
    }
  };

  const isSaving = updateFlowMutation.isPending || saveAIConfigMutation.isPending;

  const handleDeleteSelected = () => {
    const selectedNodes = nodes.filter((n) => n.selected);
    const selectedEdges = edges.filter((e) => e.selected);
    
    if (selectedNodes.length === 0 && selectedEdges.length === 0) {
      toast.error('Nenhum elemento selecionado');
      return;
    }

    const nodeIds = selectedNodes.map((n) => n.id);
    setNodes((nds) => nds.filter((n) => !n.selected));
    setEdges((eds) => eds.filter((e) => !e.selected && !nodeIds.includes(e.source) && !nodeIds.includes(e.target)));
    toast.success('Elementos removidos');
  };

  return (
    <div className="flex h-full w-full">
      <NodePalette onDragStart={onDragStart} />
      
      <div className="flex-1 flex flex-col">
        {/* Toolbar */}
        <div className="h-14 border-b border-border bg-card flex items-center justify-between px-4">
          <h2 className="font-semibold text-foreground">{flowName}</h2>
          
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled>
              <Undo className="h-4 w-4 mr-1" />
              Desfazer
            </Button>
            <Button variant="outline" size="sm" disabled>
              <Redo className="h-4 w-4 mr-1" />
              Refazer
            </Button>
            <div className="w-px h-6 bg-border mx-2" />
            <Button variant="outline" size="sm" onClick={handleDeleteSelected}>
              <Trash2 className="h-4 w-4 mr-1" />
              Excluir
            </Button>
            <Button size="sm" onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-1" />
              )}
              {isSaving ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>
        
        {/* Canvas */}
        <div ref={reactFlowWrapper} className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={setReactFlowInstance}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeDoubleClick={onNodeDoubleClick}
            nodeTypes={memoizedNodeTypes}
            fitView
            snapToGrid
            snapGrid={[15, 15]}
            defaultEdgeOptions={{
              type: 'smoothstep',
              animated: true,
              style: { strokeWidth: 2, stroke: 'hsl(var(--primary))' },
            }}
          >
            <Controls className="!bg-card !border-border !shadow-md" />
            <MiniMap 
              className="!bg-card !border-border"
              nodeColor={(node) => {
                switch (node.type) {
                  case 'start':
                    return 'hsl(var(--primary))';
                  case 'message':
                    return 'hsl(var(--primary))';
                  case 'media':
                    return '#06b6d4';
                  case 'buttons':
                    return '#f43f5e';
                  case 'list':
                    return '#f97316';
                  case 'condition':
                    return '#f59e0b';
                  case 'action':
                    return '#10b981';
                  case 'delay':
                    return '#8b5cf6';
                  default:
                    return 'hsl(var(--muted))';
                }
              }}
            />
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
          </ReactFlow>
        </div>
      </div>

      <NodeEditor
        node={selectedNode}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        onUpdate={handleNodeUpdate}
        onDelete={handleNodeDelete}
      />
    </div>
  );
}

export function FlowEditor(props: FlowEditorCanvasProps) {
  return (
    <ReactFlowProvider>
      <FlowEditorCanvas {...props} />
    </ReactFlowProvider>
  );
}
