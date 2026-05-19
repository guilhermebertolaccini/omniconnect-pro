import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Play } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface StartNodeData {
  triggerKeyword: string;
}

function StartNode({ data, selected }: NodeProps<StartNodeData>) {
  return (
    <div
      className={cn(
        'min-w-[180px] rounded-lg border-2 bg-card shadow-md transition-all',
        selected ? 'border-primary shadow-lg' : 'border-border'
      )}
    >
      <div className="flex items-center gap-2 bg-primary px-4 py-3 rounded-t-lg">
        <Play className="h-4 w-4 text-primary-foreground" />
        <span className="text-sm font-semibold text-primary-foreground">Início</span>
      </div>
      
      <div className="p-3">
        <p className="text-xs text-muted-foreground mb-1">Gatilho:</p>
        <code className="text-xs bg-muted px-2 py-1 rounded block">
          {data.triggerKeyword || 'oi|olá|hello'}
        </code>
      </div>
      
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-3 !w-3 !border-2 !border-primary !bg-background"
      />
    </div>
  );
}

export default memo(StartNode);
