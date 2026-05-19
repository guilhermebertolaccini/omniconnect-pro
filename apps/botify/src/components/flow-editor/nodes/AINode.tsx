import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Bot, Sparkles, Brain, MessageSquareText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

export type AIProvider = 'gemini' | 'openai' | 'lovable';
export type AIModel = 
  | 'google/gemini-3-flash-preview'
  | 'google/gemini-2.5-pro'
  | 'google/gemini-2.5-flash'
  | 'openai/gpt-5'
  | 'openai/gpt-5-mini';

export interface AINodeData {
  provider: AIProvider;
  model: AIModel;
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  saveResponseAs?: string; // Variable name to store response
  label?: string;
}

const providerConfig: Record<AIProvider, { 
  label: string; 
  icon: typeof Bot; 
  color: string;
  bgColor: string;
}> = {
  gemini: {
    label: 'Google Gemini',
    icon: Sparkles,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  openai: {
    label: 'OpenAI GPT',
    icon: Brain,
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10',
  },
  lovable: {
    label: 'BotFlow AI',
    icon: Bot,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
  },
};

const modelLabels: Record<AIModel, string> = {
  'google/gemini-3-flash-preview': 'Gemini 3 Flash',
  'google/gemini-2.5-pro': 'Gemini 2.5 Pro',
  'google/gemini-2.5-flash': 'Gemini 2.5 Flash',
  'openai/gpt-5': 'GPT-5',
  'openai/gpt-5-mini': 'GPT-5 Mini',
};

function AINode({ data, selected }: NodeProps<AINodeData>) {
  const provider = providerConfig[data.provider] || providerConfig.lovable;
  const Icon = provider.icon;

  return (
    <div
      className={cn(
        'min-w-[220px] max-w-[300px] rounded-lg border-2 bg-card shadow-md transition-all',
        selected ? 'border-purple-500 shadow-lg ring-2 ring-purple-500/20' : 'border-border'
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-3 !w-3 !border-2 !border-purple-500 !bg-background"
      />
      
      {/* Header */}
      <div className={cn(
        'flex items-center gap-2 border-b border-border px-3 py-2 rounded-t-lg',
        provider.bgColor
      )}>
        <Icon className={cn('h-4 w-4', provider.color)} />
        <span className="text-sm font-medium text-foreground">IA</span>
        <Badge variant="outline" className="ml-auto text-xs px-1.5 py-0">
          {provider.label}
        </Badge>
      </div>
      
      {/* Content */}
      <div className="p-3 space-y-2">
        {/* Model */}
        <div className="flex items-center gap-2">
          <Bot className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Modelo:</span>
          <span className="text-xs font-medium">
            {modelLabels[data.model] || data.model || 'Não configurado'}
          </span>
        </div>
        
        {/* Prompt Preview */}
        <div className="flex items-start gap-2">
          <MessageSquareText className="h-3.5 w-3.5 text-muted-foreground mt-0.5" />
          <div className="flex-1 min-w-0">
            <span className="text-xs text-muted-foreground block">Prompt:</span>
            <p className="text-xs text-foreground line-clamp-2 mt-0.5">
              {data.prompt || 'Configure o prompt...'}
            </p>
          </div>
        </div>

        {/* Variable Output */}
        {data.saveResponseAs && (
          <div className="flex items-center gap-2 pt-1 border-t border-border/50">
            <span className="text-xs text-muted-foreground">Salvar em:</span>
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
              {`{{${data.saveResponseAs}}}`}
            </code>
          </div>
        )}
      </div>
      
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-3 !w-3 !border-2 !border-purple-500 !bg-background"
      />
    </div>
  );
}

export default memo(AINode);
