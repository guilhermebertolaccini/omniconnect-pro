import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MessageNodeData {
  content: string;
  label?: string;
}

function MessageNode({ data, selected }: NodeProps<MessageNodeData>) {
  return (
    <div
      className={cn(
        'min-w-[200px] max-w-[280px] rounded-lg border-2 bg-card shadow-md transition-all',
        selected ? 'border-primary shadow-lg' : 'border-border'
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-3 !w-3 !border-2 !border-primary !bg-background"
      />
      
      <div className="flex items-center gap-2 border-b border-border bg-primary/10 px-3 py-2 rounded-t-lg">
        <MessageSquare className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium text-foreground">Mensagem</span>
      </div>
      
      <div className="p-3">
        <p className="text-sm text-foreground whitespace-pre-wrap">
          {data.content || 'Digite o texto da mensagem...'}
        </p>
      </div>
      
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-3 !w-3 !border-2 !border-primary !bg-background"
      />
    </div>
  );
}

export default memo(MessageNode);
