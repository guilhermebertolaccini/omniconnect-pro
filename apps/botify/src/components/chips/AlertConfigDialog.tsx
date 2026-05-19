import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { AlertConfig, AlertType } from '@/types/alerts';
import { alertService } from '@/services/alert-service';
import { toast } from 'sonner';
import { Bell, Loader2, Send } from 'lucide-react';

interface AlertConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingConfig?: AlertConfig | null;
  onSave: () => void;
}

export function AlertConfigDialog({ open, onOpenChange, editingConfig, onSave }: AlertConfigDialogProps) {
  const [name, setName] = useState(editingConfig?.name || '');
  const [type, setType] = useState<AlertType>(editingConfig?.type || 'quality_drop');
  const [webhookUrl, setWebhookUrl] = useState(editingConfig?.webhookUrl || '');
  const [enabled, setEnabled] = useState(editingConfig?.enabled ?? true);
  const [qualityThreshold, setQualityThreshold] = useState<'GREEN' | 'YELLOW' | 'RED'>(
    editingConfig?.conditions.qualityThreshold || 'YELLOW'
  );
  const [messagingLimitBelow, setMessagingLimitBelow] = useState(
    editingConfig?.conditions.messagingLimitBelow?.toString() || '100'
  );
  const [testing, setTesting] = useState(false);

  const handleSubmit = () => {
    if (!name.trim()) {
      toast.error('Nome do alerta é obrigatório');
      return;
    }
    if (!webhookUrl.trim()) {
      toast.error('URL do webhook é obrigatória');
      return;
    }

    const conditions: AlertConfig['conditions'] = {};
    
    if (type === 'quality_drop') {
      conditions.qualityThreshold = qualityThreshold;
    } else if (type === 'status_change') {
      conditions.statusChange = true;
    } else if (type === 'messaging_limit') {
      conditions.messagingLimitBelow = parseInt(messagingLimitBelow) || 100;
    }

    if (editingConfig) {
      alertService.updateConfig(editingConfig.id, {
        name,
        type,
        webhookUrl,
        enabled,
        conditions,
      });
      toast.success('Alerta atualizado!');
    } else {
      alertService.addConfig({
        name,
        type,
        webhookUrl,
        enabled,
        conditions,
      });
      toast.success('Alerta criado!');
    }

    onSave();
    onOpenChange(false);
    resetForm();
  };

  const handleTest = async () => {
    if (!webhookUrl.trim()) {
      toast.error('URL do webhook é obrigatória');
      return;
    }

    setTesting(true);
    const result = await alertService.testWebhook(webhookUrl);
    setTesting(false);

    if (result.success) {
      toast.success('Webhook testado com sucesso!');
    } else {
      toast.error(`Erro no webhook: ${result.error}`);
    }
  };

  const resetForm = () => {
    setName('');
    setType('quality_drop');
    setWebhookUrl('');
    setEnabled(true);
    setQualityThreshold('YELLOW');
    setMessagingLimitBelow('100');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            {editingConfig ? 'Editar Alerta' : 'Novo Alerta'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome do Alerta</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Alerta de Qualidade Crítica"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Tipo de Alerta</Label>
            <Select value={type} onValueChange={(v) => setType(v as AlertType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="quality_drop">Queda de Qualidade</SelectItem>
                <SelectItem value="status_change">Mudança de Status</SelectItem>
                <SelectItem value="messaging_limit">Limite de Mensagens</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {type === 'quality_drop' && (
            <div className="space-y-2">
              <Label>Disparar quando qualidade atingir</Label>
              <Select value={qualityThreshold} onValueChange={(v) => setQualityThreshold(v as 'GREEN' | 'YELLOW' | 'RED')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="YELLOW">Amarelo (ou pior)</SelectItem>
                  <SelectItem value="RED">Vermelho</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {type === 'messaging_limit' && (
            <div className="space-y-2">
              <Label htmlFor="limit">Disparar quando limite abaixo de</Label>
              <Input
                id="limit"
                type="number"
                value={messagingLimitBelow}
                onChange={(e) => setMessagingLimitBelow(e.target.value)}
                placeholder="100"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="webhook">URL do Webhook</Label>
            <div className="flex gap-2">
              <Input
                id="webhook"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://hooks.slack.com/services/..."
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleTest}
                disabled={testing}
              >
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Compatível com Slack, Discord, Zapier, Make, ou qualquer endpoint que aceite POST JSON
            </p>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="enabled">Alerta Ativo</Label>
            <Switch
              id="enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit}>
            {editingConfig ? 'Salvar' : 'Criar Alerta'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
