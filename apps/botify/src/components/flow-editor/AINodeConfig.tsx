import { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Bot, 
  Sparkles, 
  Brain, 
  Settings2, 
  MessageSquare, 
  Variable,
  Zap,
  HelpCircle,
} from 'lucide-react';
import { AINodeData, AIProvider, AIModel } from './nodes/AINode';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface AINodeConfigProps {
  data: AINodeData;
  onChange: (data: Partial<AINodeData>) => void;
}

const providers: { id: AIProvider; label: string; icon: typeof Bot; description: string }[] = [
  { 
    id: 'lovable', 
    label: 'BotFlow AI Gateway', 
    icon: Bot,
    description: 'Gateway unificado (recomendado)',
  },
  { 
    id: 'gemini', 
    label: 'Google Gemini', 
    icon: Sparkles,
    description: 'Modelos Gemini via Gateway',
  },
  { 
    id: 'openai', 
    label: 'OpenAI GPT', 
    icon: Brain,
    description: 'Modelos GPT via Gateway',
  },
];

const modelsByProvider: Record<AIProvider, { id: AIModel; label: string; description: string }[]> = {
  lovable: [
    { id: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash', description: 'Rápido e eficiente (padrão)' },
    { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', description: 'Máxima qualidade' },
    { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash', description: 'Balanceado' },
    { id: 'openai/gpt-5', label: 'GPT-5', description: 'Máxima precisão' },
    { id: 'openai/gpt-5-mini', label: 'GPT-5 Mini', description: 'Rápido e econômico' },
  ],
  gemini: [
    { id: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash', description: 'Rápido e eficiente' },
    { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', description: 'Máxima qualidade' },
    { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash', description: 'Balanceado' },
  ],
  openai: [
    { id: 'openai/gpt-5', label: 'GPT-5', description: 'Máxima precisão' },
    { id: 'openai/gpt-5-mini', label: 'GPT-5 Mini', description: 'Rápido e econômico' },
  ],
};

const promptTemplates = [
  {
    label: 'Atendimento ao Cliente',
    systemPrompt: 'Você é um assistente de atendimento ao cliente amigável e profissional. Responda de forma clara e objetiva, sempre buscando resolver o problema do cliente.',
    prompt: 'Analise a mensagem do cliente e forneça uma resposta adequada: {{user_message}}',
  },
  {
    label: 'Qualificação de Lead',
    systemPrompt: 'Você é um especialista em qualificação de leads. Seu objetivo é identificar o interesse e necessidades do potencial cliente.',
    prompt: 'Com base na conversa, qualifique o lead e sugira os próximos passos: {{conversation_history}}',
  },
  {
    label: 'FAQ Inteligente',
    systemPrompt: 'Você é um assistente de FAQ inteligente. Responda perguntas com base no contexto fornecido.',
    prompt: 'Responda a pergunta do usuário de forma concisa: {{user_question}}',
  },
  {
    label: 'Resumo de Conversa',
    systemPrompt: 'Você é um especialista em análise de conversas. Crie resumos claros e objetivos.',
    prompt: 'Resuma a seguinte conversa destacando os pontos principais: {{conversation}}',
  },
];

export function AINodeConfig({ data, onChange }: AINodeConfigProps) {
  const [activeTab, setActiveTab] = useState('model');
  const availableModels = modelsByProvider[data.provider] || modelsByProvider.lovable;

  const applyTemplate = (template: typeof promptTemplates[0]) => {
    onChange({
      systemPrompt: template.systemPrompt,
      prompt: template.prompt,
    });
  };

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="model" className="gap-1.5">
            <Bot className="h-4 w-4" />
            Modelo
          </TabsTrigger>
          <TabsTrigger value="prompt" className="gap-1.5">
            <MessageSquare className="h-4 w-4" />
            Prompt
          </TabsTrigger>
          <TabsTrigger value="advanced" className="gap-1.5">
            <Settings2 className="h-4 w-4" />
            Avançado
          </TabsTrigger>
        </TabsList>

        {/* Model Selection Tab */}
        <TabsContent value="model" className="space-y-4 mt-4">
          {/* Provider Selection */}
          <div className="space-y-2">
            <Label>Provedor de IA</Label>
            <div className="grid grid-cols-3 gap-2">
              {providers.map((provider) => {
                const Icon = provider.icon;
                const isSelected = data.provider === provider.id;
                return (
                  <button
                    key={provider.id}
                    onClick={() => onChange({ 
                      provider: provider.id,
                      model: modelsByProvider[provider.id][0].id,
                    })}
                    className={`
                      flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all
                      ${isSelected 
                        ? 'border-primary bg-primary/5' 
                        : 'border-border hover:border-primary/50'
                      }
                    `}
                  >
                    <Icon className={`h-6 w-6 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span className={`text-xs font-medium ${isSelected ? 'text-primary' : ''}`}>
                      {provider.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Model Selection */}
          <div className="space-y-2">
            <Label>Modelo</Label>
            <Select 
              value={data.model} 
              onValueChange={(value: AIModel) => onChange({ model: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o modelo" />
              </SelectTrigger>
              <SelectContent>
                {availableModels.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    <div className="flex items-center gap-2">
                      <span>{model.label}</span>
                      <span className="text-xs text-muted-foreground">
                        - {model.description}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Info Card */}
          <Card className="bg-muted/30">
            <CardContent className="pt-4">
              <div className="flex items-start gap-2">
                <Zap className="h-4 w-4 text-primary mt-0.5" />
                <div className="text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">BotFlow AI Gateway</p>
                  <p className="mt-1">
                    Todos os modelos são acessados via BotFlow AI Gateway, que gerencia 
                    autenticação e rate limits automaticamente.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Prompt Tab */}
        <TabsContent value="prompt" className="space-y-4 mt-4">
          {/* Templates */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              Templates
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Clique para aplicar um template pré-configurado</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </Label>
            <div className="flex flex-wrap gap-2">
              {promptTemplates.map((template) => (
                <Badge
                  key={template.label}
                  variant="outline"
                  className="cursor-pointer hover:bg-primary/10 hover:border-primary transition-colors"
                  onClick={() => applyTemplate(template)}
                >
                  {template.label}
                </Badge>
              ))}
            </div>
          </div>

          {/* System Prompt */}
          <div className="space-y-2">
            <Label htmlFor="systemPrompt">System Prompt (Contexto)</Label>
            <Textarea
              id="systemPrompt"
              placeholder="Defina o comportamento e contexto da IA..."
              value={data.systemPrompt || ''}
              onChange={(e) => onChange({ systemPrompt: e.target.value })}
              rows={3}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Define a personalidade e contexto base da IA
            </p>
          </div>

          {/* User Prompt */}
          <div className="space-y-2">
            <Label htmlFor="prompt">Prompt do Usuário</Label>
            <Textarea
              id="prompt"
              placeholder="Ex: Responda a seguinte pergunta: {{user_message}}"
              value={data.prompt || ''}
              onChange={(e) => onChange({ prompt: e.target.value })}
              rows={4}
              className="resize-none font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Use <code className="bg-muted px-1 rounded">{`{{variavel}}`}</code> para inserir dados dinâmicos
            </p>
          </div>

          {/* Available Variables */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Variable className="h-4 w-4" />
                Variáveis Disponíveis
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex flex-wrap gap-1.5">
                {['user_message', 'user_name', 'phone_number', 'conversation_history', 'current_time'].map((v) => (
                  <Badge 
                    key={v} 
                    variant="secondary" 
                    className="font-mono text-xs cursor-pointer hover:bg-primary/20"
                    onClick={() => {
                      const newPrompt = (data.prompt || '') + `{{${v}}}`;
                      onChange({ prompt: newPrompt });
                    }}
                  >
                    {`{{${v}}}`}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Advanced Tab */}
        <TabsContent value="advanced" className="space-y-4 mt-4">
          {/* Temperature */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Temperatura (Criatividade)</Label>
              <span className="text-sm font-mono text-muted-foreground">
                {(data.temperature ?? 0.7).toFixed(1)}
              </span>
            </div>
            <Slider
              value={[data.temperature ?? 0.7]}
              min={0}
              max={2}
              step={0.1}
              onValueChange={([value]) => onChange({ temperature: value })}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Preciso</span>
              <span>Criativo</span>
            </div>
          </div>

          {/* Max Tokens */}
          <div className="space-y-2">
            <Label htmlFor="maxTokens">Máximo de Tokens</Label>
            <Input
              id="maxTokens"
              type="number"
              placeholder="1024"
              value={data.maxTokens || ''}
              onChange={(e) => onChange({ maxTokens: parseInt(e.target.value) || undefined })}
            />
            <p className="text-xs text-muted-foreground">
              Limite máximo de tokens na resposta (padrão: 1024)
            </p>
          </div>

          {/* Save Response As */}
          <div className="space-y-2">
            <Label htmlFor="saveResponseAs">Salvar Resposta Como</Label>
            <Input
              id="saveResponseAs"
              placeholder="ai_response"
              value={data.saveResponseAs || ''}
              onChange={(e) => onChange({ saveResponseAs: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Nome da variável para armazenar a resposta da IA
            </p>
          </div>

          {/* Label */}
          <div className="space-y-2">
            <Label htmlFor="label">Rótulo do Nó (opcional)</Label>
            <Input
              id="label"
              placeholder="Ex: Analisar sentimento"
              value={data.label || ''}
              onChange={(e) => onChange({ label: e.target.value })}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
