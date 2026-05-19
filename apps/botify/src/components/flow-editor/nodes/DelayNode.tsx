import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DelayNodeData {
  delayMs: number;
  label?: string;
}

function formatDelay(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${ms / 1000}s`;
  return `${ms / 60000}min`;
}

function DelayNode({ data, selected }: NodeProps<DelayNodeData>) {
  return (
    <div
      className={cn(
        'min-w-[160px] rounded-lg border-2 bg-card shadow-md transition-all',
        selected ? 'border-violet-500 shadow-lg' : 'border-border'
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-3 !w-3 !border-2 !border-violet-500 !bg-background"
      />
      
      <div className="flex items-center gap-2 border-b border-border bg-violet-500/10 px-3 py-2 rounded-t-lg">
        <Clock className="h-4 w-4 text-violet-600" />
        <span className="text-sm font-medium text-foreground">Aguardar</span>
      </div>
      
      <div className="p-3 text-center">
        <span className="text-lg font-bold text-foreground">
          {formatDelay(data.delayMs || 1000)}
        </span>
      </div>
      
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-3 !w-3 !border-2 !border-violet-500 !bg-background"
      />
    </div>
  );
}

export default memo(DelayNode);
