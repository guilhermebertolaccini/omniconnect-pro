import {
  Play,
  MessageSquare,
  GitBranch,
  Zap,
  Clock,
  Image,
  LayoutGrid,
  List,
  Bot,
} from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface NodePaletteProps {
  onDragStart: (event: React.DragEvent, nodeType: string) => void;
}

type PaletteItem = {
  type: string;
  label: string;
  icon: typeof Play;
  color: string;
  description: string;
  /** Se false, nó não é executado pelo microserviço Node (só UI / legado WP). */
  engineReady: boolean;
};

const basicNodes: PaletteItem[] = [
  {
    type: 'start',
    label: 'Início',
    icon: Play,
    color: 'bg-primary/10 text-primary border-primary/20',
    description: 'Ponto de entrada do fluxo',
    engineReady: true,
  },
  {
    type: 'message',
    label: 'Mensagem',
    icon: MessageSquare,
    color: 'bg-primary/10 text-primary border-primary/20',
    description: 'Enviar mensagem de texto',
    engineReady: true,
  },
  {
    type: 'media',
    label: 'Mídia',
    icon: Image,
    color: 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20',
    description: 'Imagem, documento ou vídeo',
    engineReady: false,
  },
  {
    type: 'buttons',
    label: 'Botões',
    icon: LayoutGrid,
    color: 'bg-rose-500/10 text-rose-600 border-rose-500/20',
    description: 'Botões interativos (até 3)',
    engineReady: false,
  },
  {
    type: 'list',
    label: 'Lista',
    icon: List,
    color: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
    description: 'Menu com lista de opções',
    engineReady: false,
  },
];

const logicNodes: PaletteItem[] = [
  {
    type: 'condition',
    label: 'Condição',
    icon: GitBranch,
    color: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    description: 'Ramificação sim/não (regex na mensagem)',
    engineReady: true,
  },
  {
    type: 'action',
    label: 'Ação',
    icon: Zap,
    color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    description: 'Transferência Omni e outras ações',
    engineReady: true,
  },
  {
    type: 'delay',
    label: 'Aguardar',
    icon: Clock,
    color: 'bg-violet-500/10 text-violet-600 border-violet-500/20',
    description: 'Pausar antes de continuar',
    engineReady: true,
  },
];

const aiNodes: PaletteItem[] = [
  {
    type: 'ai',
    label: 'IA',
    icon: Bot,
    color: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
    description: 'Interação com IA (histórico via WordPress)',
    engineReady: true,
  },
];

const NodeSection = ({
  title,
  nodes,
  onDragStart,
}: {
  title: string;
  nodes: PaletteItem[];
  onDragStart: (event: React.DragEvent, nodeType: string) => void;
}) => (
  <div className="space-y-2">
    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
      {title}
    </h4>
    {nodes.map((item) => (
      <div
        key={item.type}
        draggable={item.engineReady}
        onDragStart={(e) => {
          if (!item.engineReady) {
            e.preventDefault();
            return;
          }
          onDragStart(e, item.type);
        }}
        title={
          item.engineReady
            ? undefined
            : 'Este nó ainda não é executado pelo microserviço — ver docs/migration/sprint-6-botify-flow-engine-inventory.md'
        }
        className={cn(
          'flex items-center gap-3 p-3 rounded-lg border transition-all',
          item.engineReady
            ? 'cursor-grab hover:shadow-md active:cursor-grabbing'
            : 'opacity-65 cursor-not-allowed',
          item.color,
        )}
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-background/80">
          <item.icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">{item.label}</p>
            {!item.engineReady && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                Em breve
              </Badge>
            )}
          </div>
          <p className="text-xs opacity-70 truncate">{item.description}</p>
        </div>
      </div>
    ))}
  </div>
);

export function NodePalette({ onDragStart }: NodePaletteProps) {
  return (
    <div className="w-64 bg-card border-r border-border p-4 overflow-y-auto">
      <h3 className="text-sm font-semibold text-foreground mb-4">Componentes</h3>
      <p className="text-xs text-muted-foreground mb-4">
        Arraste para o canvas. Itens &quot;Em breve&quot; ainda não rodam no motor Node.
      </p>

      <div className="space-y-4">
        <NodeSection title="Básicos" nodes={basicNodes} onDragStart={onDragStart} />

        <Separator />

        <NodeSection title="Inteligência Artificial" nodes={aiNodes} onDragStart={onDragStart} />

        <Separator />

        <NodeSection title="Lógica" nodes={logicNodes} onDragStart={onDragStart} />
      </div>

      <div className="mt-6 pt-4 border-t border-border">
        <h4 className="text-xs font-medium text-muted-foreground mb-2">Dicas</h4>
        <ul className="text-xs text-muted-foreground space-y-1">
          <li>• Conecte os nós arrastando das alças; condição usa saídas Sim/Não</li>
          <li>• Clique duplo em um nó para editar</li>
          <li>• Delete para remover selecionados</li>
          <li>• Inventário motor vs UI: sprint-6-botify-flow-engine-inventory.md</li>
        </ul>
      </div>
    </div>
  );
}
