import { useState, useEffect } from 'react';
import { Node } from 'reactflow';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Trash2, Plus, X } from 'lucide-react';
import { AINodeConfig } from './AINodeConfig';
import { AINodeData } from './nodes/AINode';

interface NodeEditorProps {
  node: Node | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (nodeId: string, data: Record<string, unknown>) => void;
  onDelete: (nodeId: string) => void;
}

interface ButtonOption {
  id: string;
  text: string;
}

interface ListItem {
  id: string;
  title: string;
  description?: string;
}

interface ListSection {
  title: string;
  items: ListItem[];
}

export function NodeEditor({ node, open, onOpenChange, onUpdate, onDelete }: NodeEditorProps) {
  const [formData, setFormData] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (node) {
      setFormData(node.data || {});
    }
  }, [node]);

  const handleSave = () => {
    if (node) {
      onUpdate(node.id, formData);
      onOpenChange(false);
    }
  };

  const handleDelete = () => {
    if (node) {
      onDelete(node.id);
      onOpenChange(false);
    }
  };

  const addButton = () => {
    const buttons = (formData.buttons as ButtonOption[]) || [];
    if (buttons.length >= 3) return;
    setFormData({
      ...formData,
      buttons: [...buttons, { id: `btn-${Date.now()}`, text: '' }],
    });
  };

  const removeButton = (index: number) => {
    const buttons = (formData.buttons as ButtonOption[]) || [];
    setFormData({
      ...formData,
      buttons: buttons.filter((_, i) => i !== index),
    });
  };

  const updateButton = (index: number, text: string) => {
    const buttons = (formData.buttons as ButtonOption[]) || [];
    const updated = [...buttons];
    updated[index] = { ...updated[index], text };
    setFormData({ ...formData, buttons: updated });
  };

  const addSection = () => {
    const sections = (formData.sections as ListSection[]) || [];
    setFormData({
      ...formData,
      sections: [...sections, { title: '', items: [] }],
    });
  };

  const removeSection = (index: number) => {
    const sections = (formData.sections as ListSection[]) || [];
    setFormData({
      ...formData,
      sections: sections.filter((_, i) => i !== index),
    });
  };

  const updateSectionTitle = (index: number, title: string) => {
    const sections = (formData.sections as ListSection[]) || [];
    const updated = [...sections];
    updated[index] = { ...updated[index], title };
    setFormData({ ...formData, sections: updated });
  };

  const addListItem = (sectionIndex: number) => {
    const sections = (formData.sections as ListSection[]) || [];
    const updated = [...sections];
    updated[sectionIndex] = {
      ...updated[sectionIndex],
      items: [...(updated[sectionIndex].items || []), { id: `item-${Date.now()}`, title: '', description: '' }],
    };
    setFormData({ ...formData, sections: updated });
  };

  const removeListItem = (sectionIndex: number, itemIndex: number) => {
    const sections = (formData.sections as ListSection[]) || [];
    const updated = [...sections];
    updated[sectionIndex] = {
      ...updated[sectionIndex],
      items: updated[sectionIndex].items.filter((_, i) => i !== itemIndex),
    };
    setFormData({ ...formData, sections: updated });
  };

  const updateListItem = (sectionIndex: number, itemIndex: number, field: 'title' | 'description', value: string) => {
    const sections = (formData.sections as ListSection[]) || [];
    const updated = [...sections];
    const items = [...updated[sectionIndex].items];
    items[itemIndex] = { ...items[itemIndex], [field]: value };
    updated[sectionIndex] = { ...updated[sectionIndex], items };
    setFormData({ ...formData, sections: updated });
  };

  const renderEditor = () => {
    if (!node) return null;

    switch (node.type) {
      case 'start':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="triggerKeyword">Palavras-chave de gatilho</Label>
              <Input
                id="triggerKeyword"
                value={(formData.triggerKeyword as string) || ''}
                onChange={(e) => setFormData({ ...formData, triggerKeyword: e.target.value })}
                placeholder="oi|olá|hello"
              />
              <p className="text-xs text-muted-foreground">
                Use | para separar múltiplas palavras-chave
              </p>
            </div>
          </div>
        );

      case 'message':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="content">Conteúdo da mensagem</Label>
              <Textarea
                id="content"
                value={(formData.content as string) || ''}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder="Digite a mensagem que será enviada..."
                rows={5}
              />
              <p className="text-xs text-muted-foreground">
                Você pode usar variáveis como {'{{nome}}'} ou {'{{telefone}}'}
              </p>
            </div>
          </div>
        );

      case 'media':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mediaType">Tipo de mídia</Label>
              <Select
                value={(formData.mediaType as string) || 'image'}
                onValueChange={(value) => setFormData({ ...formData, mediaType: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="image">Imagem</SelectItem>
                  <SelectItem value="document">Documento</SelectItem>
                  <SelectItem value="video">Vídeo</SelectItem>
                  <SelectItem value="audio">Áudio</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="url">URL do arquivo</Label>
              <Input
                id="url"
                value={(formData.url as string) || ''}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                placeholder="https://exemplo.com/arquivo.jpg"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="filename">Nome do arquivo (opcional)</Label>
              <Input
                id="filename"
                value={(formData.filename as string) || ''}
                onChange={(e) => setFormData({ ...formData, filename: e.target.value })}
                placeholder="catalogo.pdf"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="caption">Legenda (opcional)</Label>
              <Textarea
                id="caption"
                value={(formData.caption as string) || ''}
                onChange={(e) => setFormData({ ...formData, caption: e.target.value })}
                placeholder="Legenda da mídia..."
                rows={3}
              />
            </div>
          </div>
        );

      case 'buttons': {
        const buttons = (formData.buttons as ButtonOption[]) || [];
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="headerText">Cabeçalho (opcional)</Label>
              <Input
                id="headerText"
                value={(formData.headerText as string) || ''}
                onChange={(e) => setFormData({ ...formData, headerText: e.target.value })}
                placeholder="Título da mensagem"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bodyText">Corpo da mensagem</Label>
              <Textarea
                id="bodyText"
                value={(formData.bodyText as string) || ''}
                onChange={(e) => setFormData({ ...formData, bodyText: e.target.value })}
                placeholder="Texto principal..."
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="footerText">Rodapé (opcional)</Label>
              <Input
                id="footerText"
                value={(formData.footerText as string) || ''}
                onChange={(e) => setFormData({ ...formData, footerText: e.target.value })}
                placeholder="Texto do rodapé"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Botões (máx. 3)</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addButton}
                  disabled={buttons.length >= 3}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Adicionar
                </Button>
              </div>
              <div className="space-y-2">
                {buttons.map((btn, idx) => (
                  <div key={btn.id || idx} className="flex gap-2">
                    <Input
                      value={btn.text}
                      onChange={(e) => updateButton(idx, e.target.value)}
                      placeholder={`Botão ${idx + 1}`}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeButton(idx)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      }

      case 'list': {
        const sections = (formData.sections as ListSection[]) || [];
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="headerText">Cabeçalho (opcional)</Label>
              <Input
                id="headerText"
                value={(formData.headerText as string) || ''}
                onChange={(e) => setFormData({ ...formData, headerText: e.target.value })}
                placeholder="Título da mensagem"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bodyText">Corpo da mensagem</Label>
              <Textarea
                id="bodyText"
                value={(formData.bodyText as string) || ''}
                onChange={(e) => setFormData({ ...formData, bodyText: e.target.value })}
                placeholder="Texto principal..."
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="buttonText">Texto do botão</Label>
              <Input
                id="buttonText"
                value={(formData.buttonText as string) || ''}
                onChange={(e) => setFormData({ ...formData, buttonText: e.target.value })}
                placeholder="Ver opções"
              />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Seções</Label>
                <Button type="button" variant="outline" size="sm" onClick={addSection}>
                  <Plus className="h-3 w-3 mr-1" />
                  Seção
                </Button>
              </div>
              {sections.map((section, sIdx) => (
                <div key={sIdx} className="border border-border rounded-lg p-3 space-y-2">
                  <div className="flex gap-2 items-center">
                    <Input
                      value={section.title}
                      onChange={(e) => updateSectionTitle(sIdx, e.target.value)}
                      placeholder="Título da seção"
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeSection(sIdx)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="pl-2 space-y-2">
                    {section.items?.map((item, iIdx) => (
                      <div key={item.id || iIdx} className="flex gap-2 items-start">
                        <div className="flex-1 space-y-1">
                          <Input
                            value={item.title}
                            onChange={(e) => updateListItem(sIdx, iIdx, 'title', e.target.value)}
                            placeholder="Título do item"
                            className="text-sm"
                          />
                          <Input
                            value={item.description || ''}
                            onChange={(e) => updateListItem(sIdx, iIdx, 'description', e.target.value)}
                            placeholder="Descrição (opcional)"
                            className="text-xs"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeListItem(sIdx, iIdx)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-full"
                      onClick={() => addListItem(sIdx)}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Item
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      }

      case 'condition':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="condition">Condição (regex)</Label>
              <Input
                id="condition"
                value={(formData.condition as string) || ''}
                onChange={(e) => setFormData({ ...formData, condition: e.target.value })}
                placeholder="vendas|comprar|preço"
              />
              <p className="text-xs text-muted-foreground">
                A mensagem do usuário será verificada contra este padrão
              </p>
            </div>
          </div>
        );

      case 'action':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="actionType">Tipo de ação</Label>
              <Select
                value={(formData.actionType as string) || ''}
                onValueChange={(value) => setFormData({ ...formData, actionType: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma ação" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="transfer">Transferir para atendente</SelectItem>
                  <SelectItem value="tag">Adicionar tag ao contato</SelectItem>
                  <SelectItem value="webhook">Chamar webhook externo</SelectItem>
                  <SelectItem value="end">Encerrar conversa</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.actionType === 'tag' && (
              <div className="space-y-2">
                <Label htmlFor="tagName">Nome da tag</Label>
                <Input
                  id="tagName"
                  value={(formData.tagName as string) || ''}
                  onChange={(e) => setFormData({ ...formData, tagName: e.target.value })}
                  placeholder="lead-qualificado"
                />
              </div>
            )}

            {formData.actionType === 'webhook' && (
              <div className="space-y-2">
                <Label htmlFor="webhookUrl">URL do webhook</Label>
                <Input
                  id="webhookUrl"
                  value={(formData.webhookUrl as string) || ''}
                  onChange={(e) => setFormData({ ...formData, webhookUrl: e.target.value })}
                  placeholder="https://api.exemplo.com/webhook"
                />
              </div>
            )}

            {formData.actionType === 'transfer' && (
              <div className="space-y-4 border-t border-border pt-4">
                <p className="text-xs text-muted-foreground">
                  Campos abaixo alimentam o objeto <code className="text-xs">leadSummary</code> no handoff para o Omniconnect (triagem).
                </p>
                <div className="space-y-2">
                  <Label htmlFor="transferMessage">Mensagem na fila</Label>
                  <Textarea
                    id="transferMessage"
                    value={(formData.message as string) || ''}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    placeholder="Texto que o operador vê ao retirar da fila"
                    rows={2}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="contactName">Nome do contato (opcional)</Label>
                    <Input
                      id="contactName"
                      value={(formData.contactName as string) || ''}
                      onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                      placeholder="Como aparece no Omni"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="segment">Segmento (opcional)</Label>
                    <Input
                      id="segment"
                      value={String((formData.segment as string | number) ?? '')}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          segment: e.target.value === '' ? undefined : e.target.value,
                        })
                      }
                      placeholder="ex.: 1"
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="intent">Intent / intenção</Label>
                    <Input
                      id="intent"
                      value={(formData.intent as string) || ''}
                      onChange={(e) => setFormData({ ...formData, intent: e.target.value })}
                      placeholder="ex.: qualificado, visita"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="urgency">Urgência</Label>
                    <Input
                      id="urgency"
                      value={(formData.urgency as string) || ''}
                      onChange={(e) => setFormData({ ...formData, urgency: e.target.value })}
                      placeholder="baixa, média, alta"
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="budget">Orçamento / faixa</Label>
                    <Input
                      id="budget"
                      value={(formData.budget as string) || ''}
                      onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="region">Região</Label>
                    <Input
                      id="region"
                      value={(formData.region as string) || ''}
                      onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="propertyInterest">Interesse (imóvel / produto)</Label>
                  <Input
                    id="propertyInterest"
                    value={(formData.propertyInterest as string) || ''}
                    onChange={(e) => setFormData({ ...formData, propertyInterest: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="transferNotes">Notas / resumo</Label>
                  <Textarea
                    id="transferNotes"
                    value={(formData.notes as string) || ''}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Uma linha de contexto para o operador"
                    rows={2}
                  />
                </div>
              </div>
            )}
          </div>
        );

      case 'delay': {
        const delayMs = (formData.delayMs as number) || 1000;
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tempo de espera</Label>
              <div className="py-4">
                <Slider
                  value={[delayMs]}
                  onValueChange={([value]) => setFormData({ ...formData, delayMs: value })}
                  min={500}
                  max={30000}
                  step={500}
                />
              </div>
              <p className="text-center text-lg font-medium text-foreground">
                {delayMs < 1000 
                  ? `${delayMs}ms` 
                  : delayMs < 60000 
                    ? `${(delayMs / 1000).toFixed(1)}s`
                    : `${(delayMs / 60000).toFixed(1)}min`
                }
              </p>
            </div>
          </div>
        );
      }

      case 'ai': {
        const aiData: AINodeData = {
          provider: (formData.provider as AINodeData['provider']) || 'lovable',
          model: (formData.model as AINodeData['model']) || 'google/gemini-3-flash-preview',
          prompt: (formData.prompt as string) || '',
          systemPrompt: (formData.systemPrompt as string) || '',
          temperature: (formData.temperature as number) || 0.7,
          maxTokens: (formData.maxTokens as number) || undefined,
          saveResponseAs: (formData.saveResponseAs as string) || '',
          label: (formData.label as string) || '',
        };
        return (
          <AINodeConfig
            data={aiData}
            onChange={(updates) => setFormData({ ...formData, ...updates })}
          />
        );
      }
        return <p className="text-muted-foreground">Tipo de nó não suportado</p>;
    }
  };

  const getTitle = () => {
    if (!node) return 'Editar Nó';
    const titles: Record<string, string> = {
      start: 'Configurar Início',
      message: 'Editar Mensagem',
      media: 'Configurar Mídia',
      buttons: 'Configurar Botões',
      list: 'Configurar Lista',
      condition: 'Configurar Condição',
      action: 'Configurar Ação',
      delay: 'Configurar Espera',
      ai: 'Configurar Integração IA',
    };
    return titles[node.type || ''] || 'Editar Nó';
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{getTitle()}</SheetTitle>
          <SheetDescription>
            Configure as propriedades deste componente do fluxo
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {renderEditor()}

          <div className="flex gap-3 pt-4 border-t border-border">
            <Button onClick={handleSave} className="flex-1">
              Salvar
            </Button>
            <Button variant="destructive" size="icon" onClick={handleDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
