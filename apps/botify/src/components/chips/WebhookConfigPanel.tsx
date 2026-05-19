import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { 
  Webhook, 
  Copy, 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  Info,
  ExternalLink,
  Loader2,
  Shield,
} from 'lucide-react';
import { toast } from 'sonner';
import { MetaAccount, WebhookConfig, metaAccountsService } from '@/services/meta-accounts-service';
import { metaGraphAPI } from '@/services/meta-graph-api';

interface WebhookConfigPanelProps {
  account: MetaAccount;
  wabas: Array<{ id: string; name: string }>;
  onConfigUpdated: (account: MetaAccount) => void;
}

const AVAILABLE_EVENTS = [
  { id: 'messages', label: 'Mensagens', description: 'Mensagens recebidas e enviadas' },
  { id: 'messaging_postbacks', label: 'Postbacks', description: 'Respostas de botões interativos' },
  { id: 'message_template_status_update', label: 'Status de Templates', description: 'Atualizações de aprovação de templates' },
  { id: 'account_update', label: 'Atualizações de Conta', description: 'Mudanças na conta WhatsApp' },
  { id: 'message_echoes', label: 'Ecos de Mensagem', description: 'Confirmações de mensagens enviadas' },
];

export function WebhookConfigPanel({ account, wabas, onConfigUpdated }: WebhookConfigPanelProps) {
  const [callbackUrl, setCallbackUrl] = useState(account.webhookConfig?.callbackUrl || '');
  const [verifyToken, setVerifyToken] = useState(account.webhookConfig?.verifyToken || '');
  const [selectedEvents, setSelectedEvents] = useState<string[]>(
    account.webhookConfig?.subscribedEvents || ['messages', 'messaging_postbacks']
  );
  const [isVerifying, setIsVerifying] = useState(false);
  const [isConfigured, setIsConfigured] = useState(account.webhookConfig?.isConfigured || false);

  // Generate a random verify token
  const generateToken = () => {
    const token = `verify_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    setVerifyToken(token);
    toast.success('Token gerado!');
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  const toggleEvent = (eventId: string) => {
    setSelectedEvents(prev => 
      prev.includes(eventId) 
        ? prev.filter(e => e !== eventId)
        : [...prev, eventId]
    );
  };

  const handleSaveConfig = async () => {
    if (!callbackUrl) {
      toast.error('URL de callback é obrigatória');
      return;
    }
    if (!verifyToken) {
      toast.error('Token de verificação é obrigatório');
      return;
    }

    setIsVerifying(true);
    try {
      // Try to verify webhook for each WABA
      let allSuccess = true;
      for (const waba of wabas) {
        const success = await metaGraphAPI.verifyWebhook(waba.id, callbackUrl, verifyToken);
        if (!success) {
          allSuccess = false;
          console.warn(`Failed to verify webhook for WABA ${waba.id}`);
        }
      }

      const webhookConfig: WebhookConfig = {
        callbackUrl,
        verifyToken,
        isConfigured: true,
        lastVerified: new Date().toISOString(),
        subscribedEvents: selectedEvents,
      };

      const updatedAccount = metaAccountsService.updateAccount(account.id, { webhookConfig });
      
      if (updatedAccount) {
        setIsConfigured(true);
        onConfigUpdated(updatedAccount);
        
        if (allSuccess) {
          toast.success('Webhook configurado e verificado!');
        } else {
          toast.warning('Configuração salva, mas verificação falhou em algumas WABAs. Verifique a URL e tente novamente.');
        }
      }
    } catch (error) {
      toast.error('Erro ao configurar webhook');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleRemoveConfig = () => {
    metaAccountsService.updateAccount(account.id, { webhookConfig: undefined });
    setCallbackUrl('');
    setVerifyToken('');
    setSelectedEvents(['messages', 'messaging_postbacks']);
    setIsConfigured(false);
    toast.success('Configuração de webhook removida');
  };

  return (
    <div className="space-y-6">
      {/* Status Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Webhook className="h-5 w-5" />
              <CardTitle className="text-lg">Configuração de Webhook</CardTitle>
            </div>
            {isConfigured ? (
              <Badge variant="default" className="gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Configurado
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1">
                <XCircle className="h-3 w-3" />
                Não configurado
              </Badge>
            )}
          </div>
          <CardDescription>
            Configure o webhook para receber eventos em tempo real desta conta ({account.name})
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Callback URL */}
          <div className="space-y-2">
            <Label htmlFor="callback-url">URL de Callback</Label>
            <div className="flex gap-2">
              <Input
                id="callback-url"
                placeholder="https://seu-servidor.com/webhook/meta"
                value={callbackUrl}
                onChange={(e) => setCallbackUrl(e.target.value)}
              />
              {callbackUrl && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(callbackUrl, 'URL')}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Esta URL receberá os eventos de webhook da Meta. Deve ser acessível publicamente via HTTPS.
            </p>
          </div>

          {/* Verify Token */}
          <div className="space-y-2">
            <Label htmlFor="verify-token">Token de Verificação</Label>
            <div className="flex gap-2">
              <Input
                id="verify-token"
                placeholder="seu_token_secreto"
                value={verifyToken}
                onChange={(e) => setVerifyToken(e.target.value)}
              />
              <Button variant="outline" size="icon" onClick={generateToken}>
                <RefreshCw className="h-4 w-4" />
              </Button>
              {verifyToken && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(verifyToken, 'Token')}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Token secreto usado para verificar a origem das requisições. Use o mesmo token configurado no App da Meta.
            </p>
          </div>

          <Separator />

          {/* Events Selection */}
          <div className="space-y-3">
            <Label>Eventos Subscritos</Label>
            <div className="grid gap-3">
              {AVAILABLE_EVENTS.map((event) => (
                <div
                  key={event.id}
                  className="flex items-start space-x-3 rounded-lg border p-3 hover:bg-muted/50 cursor-pointer"
                  onClick={() => toggleEvent(event.id)}
                >
                  <Checkbox
                    checked={selectedEvents.includes(event.id)}
                    onCheckedChange={() => toggleEvent(event.id)}
                  />
                  <div className="flex-1">
                    <p className="font-medium text-sm">{event.label}</p>
                    <p className="text-xs text-muted-foreground">{event.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Shield className="h-4 w-4" />
              {account.webhookConfig?.lastVerified && (
                <span>
                  Última verificação: {new Date(account.webhookConfig.lastVerified).toLocaleString('pt-BR')}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              {isConfigured && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" className="text-destructive">
                      Remover Configuração
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remover Webhook?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Isso removerá a configuração de webhook desta conta. Você precisará reconfigurar para receber eventos.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={handleRemoveConfig}>
                        Remover
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              <Button onClick={handleSaveConfig} disabled={isVerifying}>
                {isVerifying ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verificando...
                  </>
                ) : (
                  'Salvar Configuração'
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="bg-muted/30">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div className="space-y-2">
              <p className="text-sm font-medium">Como configurar no Meta for Developers:</p>
              <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Acesse o <a href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">Meta for Developers <ExternalLink className="h-3 w-3" /></a></li>
                <li>Vá para seu App → WhatsApp → Configuração</li>
                <li>Em "Webhook", clique em "Editar"</li>
                <li>Cole a URL de Callback e o Token de Verificação</li>
                <li>Selecione os campos de webhook desejados</li>
                <li>Clique em "Verificar e salvar"</li>
              </ol>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* WABAs Info */}
      {wabas.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">WABAs desta conta</CardTitle>
            <CardDescription className="text-xs">
              O webhook será configurado para todas as WABAs abaixo
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {wabas.map((waba) => (
                <Badge key={waba.id} variant="outline" className="text-xs">
                  {waba.name} ({waba.id})
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
