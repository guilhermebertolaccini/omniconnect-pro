import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ActionNodeData {
  actionType: string;
  label?: string;
  config?: Record<string, unknown>;
}

const actionLabels: Record<string, string> = {
  transfer: 'Transferir para atendente',
  tag: 'Adicionar tag',
  webhook: 'Chamar webhook',
  end: 'Encerrar conversa',
};

function ActionNode({ data, selected }: NodeProps<ActionNodeData>) {
  return (
    <div
      className={cn(
        'min-w-[200px] max-w-[280px] rounded-lg border-2 bg-card shadow-md transition-all',
        selected ? 'border-emerald-500 shadow-lg' : 'border-border'
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-3 !w-3 !border-2 !border-emerald-500 !bg-background"
      />
      
      <div className="flex items-center gap-2 border-b border-border bg-emerald-500/10 px-3 py-2 rounded-t-lg">
        <Zap className="h-4 w-4 text-emerald-600" />
        <span className="text-sm font-medium text-foreground">Ação</span>
      </div>
      
      <div className="p-3">
        <p className="text-sm text-foreground">
          {actionLabels[data.actionType] || data.actionType || 'Selecione uma ação'}
        </p>
      </div>
      
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-3 !w-3 !border-2 !border-emerald-500 !bg-background"
      />
    </div>
  );
}

export default memo(ActionNode);
