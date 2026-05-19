import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { List } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ListItem {
  id: string;
  title: string;
  description?: string;
}

export interface ListSection {
  title: string;
  items: ListItem[];
}

export interface ListNodeData {
  headerText?: string;
  bodyText: string;
  footerText?: string;
  buttonText: string;
  sections: ListSection[];
}

function ListNode({ data, selected }: NodeProps<ListNodeData>) {
  const sections = data.sections || [];
  const totalItems = sections.reduce((acc, sec) => acc + (sec.items?.length || 0), 0);

  return (
    <div
      className={cn(
        'min-w-[220px] max-w-[300px] rounded-lg border-2 bg-card shadow-md transition-all',
        selected ? 'border-orange-500 shadow-lg' : 'border-border'
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-3 !w-3 !border-2 !border-orange-500 !bg-background"
      />
      
      <div className="flex items-center gap-2 border-b border-border bg-orange-500/10 px-3 py-2 rounded-t-lg">
        <List className="h-4 w-4 text-orange-600" />
        <span className="text-sm font-medium text-foreground">Lista de Opções</span>
      </div>
      
      <div className="p-3 space-y-2">
        {data.headerText && (
          <p className="text-xs font-semibold text-foreground">{data.headerText}</p>
        )}
        <p className="text-sm text-foreground whitespace-pre-wrap">
          {data.bodyText || 'Mensagem com lista...'}
        </p>
        {data.footerText && (
          <p className="text-xs text-muted-foreground">{data.footerText}</p>
        )}
        
        <div className="pt-2 border-t border-border mt-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {sections.length} seções, {totalItems} itens
            </span>
          </div>
          <div className="mt-2 bg-orange-500/10 text-orange-700 px-3 py-2 rounded text-center text-sm font-medium">
            {data.buttonText || '📋 Ver opções'}
          </div>
        </div>
      </div>
      
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-3 !w-3 !border-2 !border-orange-500 !bg-background"
      />
    </div>
  );
}

export default memo(ListNode);
