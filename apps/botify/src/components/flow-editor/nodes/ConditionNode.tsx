import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { GitBranch } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ConditionNodeData {
  condition: string;
  label?: string;
}

function ConditionNode({ data, selected }: NodeProps<ConditionNodeData>) {
  return (
    <div
      className={cn(
        'min-w-[200px] max-w-[280px] rounded-lg border-2 bg-card shadow-md transition-all',
        selected ? 'border-amber-500 shadow-lg' : 'border-border'
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-3 !w-3 !border-2 !border-amber-500 !bg-background"
      />
      
      <div className="flex items-center gap-2 border-b border-border bg-amber-500/10 px-3 py-2 rounded-t-lg">
        <GitBranch className="h-4 w-4 text-amber-600" />
        <span className="text-sm font-medium text-foreground">Condição</span>
      </div>
      
      <div className="p-3">
        <p className="text-sm text-muted-foreground mb-1">Se a mensagem contém:</p>
        <code className="text-xs bg-muted px-2 py-1 rounded block">
          {data.condition || 'palavra1|palavra2'}
        </code>
      </div>
      
      <div className="flex border-t border-border">
        <div className="flex-1 text-center py-2 text-xs text-emerald-600 border-r border-border">
          ✓ Sim
        </div>
        <div className="flex-1 text-center py-2 text-xs text-destructive">
          ✗ Não
        </div>
      </div>
      
      <Handle
        type="source"
        position={Position.Bottom}
        id="yes"
        className="!h-3 !w-3 !border-2 !border-emerald-500 !bg-background !left-[25%]"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="no"
        className="!h-3 !w-3 !border-2 !border-destructive !bg-background !left-[75%]"
      />
    </div>
  );
}

export default memo(ConditionNode);
