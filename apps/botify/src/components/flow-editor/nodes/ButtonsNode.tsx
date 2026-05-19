import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ButtonOption {
  id: string;
  text: string;
}

export interface ButtonsNodeData {
  headerText?: string;
  bodyText: string;
  footerText?: string;
  buttons: ButtonOption[];
}

function ButtonsNode({ data, selected }: NodeProps<ButtonsNodeData>) {
  const buttons = data.buttons || [];

  return (
    <div
      className={cn(
        'min-w-[220px] max-w-[300px] rounded-lg border-2 bg-card shadow-md transition-all',
        selected ? 'border-rose-500 shadow-lg' : 'border-border'
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-3 !w-3 !border-2 !border-rose-500 !bg-background"
      />
      
      <div className="flex items-center gap-2 border-b border-border bg-rose-500/10 px-3 py-2 rounded-t-lg">
        <LayoutGrid className="h-4 w-4 text-rose-600" />
        <span className="text-sm font-medium text-foreground">Botões Interativos</span>
      </div>
      
      <div className="p-3 space-y-2">
        {data.headerText && (
          <p className="text-xs font-semibold text-foreground">{data.headerText}</p>
        )}
        <p className="text-sm text-foreground whitespace-pre-wrap">
          {data.bodyText || 'Mensagem com botões...'}
        </p>
        {data.footerText && (
          <p className="text-xs text-muted-foreground">{data.footerText}</p>
        )}
        
        <div className="pt-2 space-y-1.5 border-t border-border mt-2">
          {buttons.length > 0 ? (
            buttons.slice(0, 3).map((btn, idx) => (
              <div
                key={btn.id || idx}
                className="text-xs bg-rose-500/10 text-rose-700 px-2 py-1.5 rounded text-center font-medium"
              >
                {btn.text || `Botão ${idx + 1}`}
              </div>
            ))
          ) : (
            <p className="text-xs text-muted-foreground italic text-center">
              Adicione até 3 botões
            </p>
          )}
        </div>
      </div>
      
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-3 !w-3 !border-2 !border-rose-500 !bg-background"
      />
    </div>
  );
}

export default memo(ButtonsNode);
