import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { 
  Server, 
  Key, 
  Plus, 
  RefreshCw, 
  QrCode, 
  CheckCircle2, 
  XCircle, 
  Loader2,
  Trash2,
  Power,
  PowerOff,
  Smartphone,
  AlertTriangle,
  Copy,
  ExternalLink,
  Webhook,
  Settings,
  FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { evolutionAPI } from '@/services/evolution-api';
import { EvolutionInstance, EvolutionConfig, EvolutionQRCode } from '@/types/evolution';
import { WebhookLogsPanel } from './WebhookLogsPanel';

export function EvolutionPanel() {
  const [config, setConfig] = useState<EvolutionConfig>({
    serverUrl: '',
    apiKey: '',
    webhookUrl: '',
    webhookEvents: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE', 'QRCODE_UPDATED', 'SEND_MESSAGE'],
    autoConfigureWebhook: true,
  });
  const [isConnected, setIsConnected] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [instances, setInstances] = useState<EvolutionInstance[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Create instance dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newInstanceName, setNewInstanceName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // QR Code dialog
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [qrCode, setQrCode] = useState<EvolutionQRCode | null>(null);
  const [qrInstanceName, setQrInstanceName] = useState('');
  const [isLoadingQR, setIsLoadingQR] = useState(false);
  const [qrPollingInterval, setQrPollingInterval] = useState<NodeJS.Timeout | null>(null);

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [instanceToDelete, setInstanceToDelete] = useState<EvolutionInstance | null>(null);

  // Webhook dialog
  const [webhookDialogOpen, setWebhookDialogOpen] = useState(false);
  const [webhookInstance, setWebhookInstance] = useState<EvolutionInstance | null>(null);
  const [instanceWebhookUrl, setInstanceWebhookUrl] = useState('');
  const [instanceWebhookEvents, setInstanceWebhookEvents] = useState<string[]>([]);
  const [isSavingWebhook, setIsSavingWebhook] = useState(false);

  // Webhook events configuration section
  const [webhookConfigOpen, setWebhookConfigOpen] = useState(false);

  const AVAILABLE_WEBHOOK_EVENTS = [
    { id: 'MESSAGES_UPSERT', label: 'Mensagens Recebidas', description: 'Quando uma nova mensagem chega' },
    { id: 'MESSAGES_UPDATE', label: 'Atualização de Mensagens', description: 'Status de entrega, leitura, etc' },
    { id: 'MESSAGES_DELETE', label: 'Mensagens Deletadas', description: 'Quando mensagens são apagadas' },
    { id: 'SEND_MESSAGE', label: 'Mensagens Enviadas', description: 'Quando você envia uma mensagem' },
    { id: 'CONNECTION_UPDATE', label: 'Status da Conexão', description: 'Conectado, desconectado, etc' },
    { id: 'QRCODE_UPDATED', label: 'QR Code Atualizado', description: 'Quando o QR code muda' },
    { id: 'CONTACTS_UPDATE', label: 'Contatos Atualizados', description: 'Mudanças nos contatos' },
    { id: 'PRESENCE_UPDATE', label: 'Presença', description: 'Online, digitando, etc' },
    { id: 'CHATS_UPDATE', label: 'Conversas Atualizadas', description: 'Mudanças nas conversas' },
    { id: 'GROUPS_UPDATE', label: 'Grupos Atualizados', description: 'Mudanças em grupos' },
  ];

  useEffect(() => {
    const savedConfig = evolutionAPI.getConfig();
    if (savedConfig) {
      setConfig({
        ...savedConfig,
        webhookEvents: savedConfig.webhookEvents || ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE', 'QRCODE_UPDATED', 'SEND_MESSAGE'],
        autoConfigureWebhook: savedConfig.autoConfigureWebhook ?? true,
      });
      testConnection(savedConfig).then((result) => {
        if (result.success) {
          setIsConnected(true);
          loadInstances();
        }
      });
    }
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (qrPollingInterval) {
        clearInterval(qrPollingInterval);
      }
    };
  }, [qrPollingInterval]);

  const testConnection = async (cfg?: EvolutionConfig): Promise<{ success: boolean }> => {
    const configToTest = cfg || config;
    if (!configToTest.serverUrl || !configToTest.apiKey) {
      return { success: false };
    }

    evolutionAPI.saveConfig(configToTest);
    return await evolutionAPI.testConnection();
  };

  const handleTestConnection = async () => {
    if (!config.serverUrl || !config.apiKey) {
      toast.error('Preencha URL e API Key');
      return;
    }

    setIsTestingConnection(true);
    try {
      const result = await testConnection();
      
      if (result.success) {
        toast.success('Conexão com Evolution API estabelecida!');
        setIsConnected(true);
        await loadInstances();
      } else {
        toast.error('Falha na conexão com Evolution API');
        setIsConnected(false);
      }
    } catch (error) {
      toast.error('Erro ao testar conexão');
      setIsConnected(false);
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleDisconnect = () => {
    evolutionAPI.clearConfig();
    setConfig({ 
      serverUrl: '', 
      apiKey: '',
      webhookUrl: '',
      webhookEvents: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE', 'QRCODE_UPDATED', 'SEND_MESSAGE'],
      autoConfigureWebhook: true,
    });
    setIsConnected(false);
    setInstances([]);
    toast.success('Desconectado da Evolution API');
  };

  const loadInstances = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await evolutionAPI.fetchInstances();
      setInstances(data);
    } catch (error) {
      console.error('Error loading instances:', error);
      toast.error('Erro ao carregar instâncias');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleCreateInstance = async () => {
    if (!newInstanceName.trim()) {
      toast.error('Nome da instância é obrigatório');
      return;
    }

    setIsCreating(true);
    try {
      const result = await evolutionAPI.createInstance(newInstanceName, { qrcode: true });
      
      setInstances((prev) => [...prev, result.instance]);
      setCreateDialogOpen(false);
      setNewInstanceName('');
      
      // Auto-configure webhook if enabled
      if (config.autoConfigureWebhook && config.webhookUrl) {
        try {
          await evolutionAPI.autoConfigureWebhook(newInstanceName);
          toast.success('Webhook configurado automaticamente!');
        } catch (error) {
          console.error('Error configuring webhook:', error);
        }
      }
      
      if (result.qrcode) {
        setQrCode(result.qrcode);
        setQrInstanceName(newInstanceName);
        setQrDialogOpen(true);
        startQRPolling(newInstanceName);
      }
      
      toast.success('Instância criada! Escaneie o QR Code.');
    } catch (error) {
      console.error('Error creating instance:', error);
      toast.error('Erro ao criar instância');
    } finally {
      setIsCreating(false);
    }
  };

  const handleShowQRCode = async (instance: EvolutionInstance) => {
    setQrInstanceName(instance.name);
    setIsLoadingQR(true);
    setQrDialogOpen(true);

    try {
      const qr = await evolutionAPI.getQRCode(instance.name);
      setQrCode(qr);
      startQRPolling(instance.name);
    } catch (error) {
      console.error('Error getting QR code:', error);
      toast.error('Erro ao obter QR Code');
      setQrDialogOpen(false);
    } finally {
      setIsLoadingQR(false);
    }
  };

  const startQRPolling = (instanceName: string) => {
    // Clear existing interval
    if (qrPollingInterval) {
      clearInterval(qrPollingInterval);
    }

    // Poll connection state every 3 seconds
    const interval = setInterval(async () => {
      try {
        const state = await evolutionAPI.getConnectionState(instanceName);
        
        if (state.state === 'open') {
          clearInterval(interval);
          setQrPollingInterval(null);
          setQrDialogOpen(false);
          setQrCode(null);
          toast.success('WhatsApp conectado com sucesso!');
          await loadInstances();
        }
      } catch (error) {
        console.error('Error polling connection state:', error);
      }
    }, 3000);

    setQrPollingInterval(interval);

    // Stop polling after 2 minutes
    setTimeout(() => {
      clearInterval(interval);
      setQrPollingInterval(null);
    }, 120000);
  };

  const handleCloseQRDialog = () => {
    if (qrPollingInterval) {
      clearInterval(qrPollingInterval);
      setQrPollingInterval(null);
    }
    setQrDialogOpen(false);
    setQrCode(null);
  };

  const handleLogout = async (instance: EvolutionInstance) => {
    try {
      await evolutionAPI.logout(instance.name);
      toast.success('Logout realizado');
      await loadInstances();
    } catch (error) {
      toast.error('Erro ao fazer logout');
    }
  };

  const handleDelete = async () => {
    if (!instanceToDelete) return;

    try {
      await evolutionAPI.deleteInstance(instanceToDelete.name);
      setInstances((prev) => prev.filter((i) => i.id !== instanceToDelete.id));
      toast.success('Instância excluída');
    } catch (error) {
      toast.error('Erro ao excluir instância');
    } finally {
      setDeleteDialogOpen(false);
      setInstanceToDelete(null);
    }
  };

  const handleRestart = async (instance: EvolutionInstance) => {
    try {
      await evolutionAPI.restartInstance(instance.name);
      toast.success('Instância reiniciada');
      await loadInstances();
    } catch (error) {
      toast.error('Erro ao reiniciar instância');
    }
  };

  const handleOpenWebhookDialog = async (instance: EvolutionInstance) => {
    setWebhookInstance(instance);
    setInstanceWebhookUrl(config.webhookUrl || '');
    setInstanceWebhookEvents(config.webhookEvents || []);
    
    // Try to load existing webhook config
    try {
      const existing = await evolutionAPI.getWebhook(instance.name);
      if (existing && existing.url) {
        setInstanceWebhookUrl(existing.url);
        setInstanceWebhookEvents(existing.events);
      }
    } catch (error) {
      console.error('Error loading webhook:', error);
    }
    
    setWebhookDialogOpen(true);
  };

  const handleSaveWebhook = async () => {
    if (!webhookInstance) return;
    
    if (!instanceWebhookUrl.trim()) {
      toast.error('URL do webhook é obrigatória');
      return;
    }

    setIsSavingWebhook(true);
    try {
      await evolutionAPI.setWebhook(webhookInstance.name, instanceWebhookUrl, instanceWebhookEvents);
      toast.success('Webhook configurado com sucesso!');
      setWebhookDialogOpen(false);
    } catch (error) {
      console.error('Error saving webhook:', error);
      toast.error('Erro ao configurar webhook');
    } finally {
      setIsSavingWebhook(false);
    }
  };

  const toggleWebhookEvent = (eventId: string) => {
    setInstanceWebhookEvents((prev) =>
      prev.includes(eventId)
        ? prev.filter((e) => e !== eventId)
        : [...prev, eventId]
    );
  };

  const toggleConfigWebhookEvent = (eventId: string) => {
    setConfig((prev) => ({
      ...prev,
      webhookEvents: prev.webhookEvents?.includes(eventId)
        ? prev.webhookEvents.filter((e) => e !== eventId)
        : [...(prev.webhookEvents || []), eventId],
    }));
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open':
        return <Badge className="bg-green-500 hover:bg-green-600">Conectado</Badge>;
      case 'connecting':
        return <Badge className="bg-yellow-500 hover:bg-yellow-600">Conectando</Badge>;
      case 'qrcode':
        return <Badge className="bg-blue-500 hover:bg-blue-600">Aguardando QR</Badge>;
      default:
        return <Badge variant="secondary">Desconectado</Badge>;
    }
  };

  const copyPairingCode = () => {
    if (qrCode?.pairingCode) {
      navigator.clipboard.writeText(qrCode.pairingCode);
      toast.success('Código de pareamento copiado!');
    }
  };

  const [activeTab, setActiveTab] = useState('config');

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
      <TabsList>
        <TabsTrigger value="config" className="flex items-center gap-2">
          <Server className="h-4 w-4" />
          Configuração
        </TabsTrigger>
        <TabsTrigger value="instances" className="flex items-center gap-2" disabled={!isConnected}>
          <Smartphone className="h-4 w-4" />
          Instâncias ({instances.length})
        </TabsTrigger>
        <TabsTrigger value="logs" className="flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Logs de Webhook
        </TabsTrigger>
      </TabsList>

      <TabsContent value="config">
      {/* Configuration Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Configuração Evolution API
          </CardTitle>
          <CardDescription>
            Configure o servidor da Evolution API para conectar números via QR Code
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Connection Status */}
          <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
            {isConnected ? (
              <>
                <CheckCircle2 className="h-8 w-8 text-green-500" />
                <div className="flex-1">
                  <p className="font-medium text-green-600">Conectado à Evolution API</p>
                  <p className="text-sm text-muted-foreground">{config.serverUrl}</p>
                </div>
                <Button variant="outline" onClick={handleDisconnect}>
                  Desconectar
                </Button>
              </>
            ) : (
              <>
                <XCircle className="h-8 w-8 text-muted-foreground" />
                <div className="flex-1">
                  <p className="font-medium">Não conectado</p>
                  <p className="text-sm text-muted-foreground">
                    Configure o servidor para começar
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Configuration Form */}
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="serverUrl">URL do Servidor</Label>
              <Input
                id="serverUrl"
                placeholder="https://evolution.seudominio.com"
                value={config.serverUrl}
                onChange={(e) => setConfig({ ...config, serverUrl: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                URL base do seu servidor Evolution API
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="apiKey">API Key</Label>
              <Input
                id="apiKey"
                type="password"
                placeholder="sua-api-key-aqui"
                value={config.apiKey}
                onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Chave de autenticação configurada no servidor
              </p>
            </div>

            {/* Webhook Configuration */}
            <Collapsible open={webhookConfigOpen} onOpenChange={setWebhookConfigOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="outline" className="w-full justify-between">
                  <span className="flex items-center gap-2">
                    <Webhook className="h-4 w-4" />
                    Configuração de Webhook
                  </span>
                  <Settings className="h-4 w-4" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="webhookUrl">URL do Webhook (padrão)</Label>
                  <Input
                    id="webhookUrl"
                    placeholder="https://seu-servidor.com/webhook"
                    value={config.webhookUrl || ''}
                    onChange={(e) => setConfig({ ...config, webhookUrl: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    URL para receber eventos das instâncias
                  </p>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="autoWebhook"
                    checked={config.autoConfigureWebhook}
                    onCheckedChange={(checked) => 
                      setConfig({ ...config, autoConfigureWebhook: checked as boolean })
                    }
                  />
                  <Label htmlFor="autoWebhook" className="text-sm">
                    Configurar webhook automaticamente ao criar instâncias
                  </Label>
                </div>

                <div className="space-y-2">
                  <Label>Eventos do Webhook</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {AVAILABLE_WEBHOOK_EVENTS.map((event) => (
                      <div
                        key={event.id}
                        className="flex items-start space-x-2 p-2 rounded-lg border"
                      >
                        <Checkbox
                          id={`config-${event.id}`}
                          checked={config.webhookEvents?.includes(event.id)}
                          onCheckedChange={() => toggleConfigWebhookEvent(event.id)}
                        />
                        <div className="grid gap-0.5">
                          <Label htmlFor={`config-${event.id}`} className="text-sm font-medium">
                            {event.label}
                          </Label>
                          <p className="text-xs text-muted-foreground">{event.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            <Button
              onClick={handleTestConnection}
              disabled={!config.serverUrl || !config.apiKey || isTestingConnection}
              className="w-full"
            >
              {isTestingConnection ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Testando Conexão...
                </>
              ) : (
                <>
                  <Key className="mr-2 h-4 w-4" />
                  Conectar
                </>
              )}
            </Button>
          </div>

          {/* Documentation Link */}
          <div className="flex items-center gap-2 p-3 rounded-lg border bg-muted/30">
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm text-muted-foreground flex-1">
              Precisa de um servidor Evolution API?
            </p>
            <Button variant="link" size="sm" asChild>
              <a 
                href="https://doc.evolution-api.com" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-1"
              >
                Documentação
                <ExternalLink className="h-3 w-3" />
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
      </TabsContent>

      <TabsContent value="instances">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="h-5 w-5" />
                Instâncias WhatsApp
              </CardTitle>
              <CardDescription>
                Gerencie suas conexões WhatsApp via QR Code
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={loadInstances} disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Atualizar
              </Button>
              <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Nova Instância
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {instances.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Smartphone className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="font-medium">Nenhuma instância configurada</p>
                <p className="text-sm">Crie uma nova instância para conectar um número</p>
              </div>
            ) : (
              <ScrollArea className="h-[400px]">
                <div className="space-y-3">
                  {instances.map((instance) => (
                    <div
                      key={instance.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <Smartphone className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{instance.name}</p>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            {instance.phoneNumber && <span>{instance.phoneNumber}</span>}
                            {instance.profileName && <span>• {instance.profileName}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {getStatusBadge(instance.status)}
                        <div className="flex items-center gap-1">
                          {instance.status !== 'open' && (
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => handleShowQRCode(instance)}
                              title="Conectar via QR Code"
                            >
                              <QrCode className="h-4 w-4" />
                            </Button>
                          )}
                          {instance.status === 'open' && (
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => handleLogout(instance)}
                              title="Desconectar"
                            >
                              <PowerOff className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => handleOpenWebhookDialog(instance)}
                            title="Configurar Webhook"
                          >
                            <Webhook className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => handleRestart(instance)}
                            title="Reiniciar"
                          >
                            <Power className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setInstanceToDelete(instance);
                              setDeleteDialogOpen(true);
                            }}
                            title="Excluir"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="logs">
        <WebhookLogsPanel instances={instances} />
      </TabsContent>

      {/* Create Instance Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Instância WhatsApp</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="instanceName">Nome da Instância</Label>
              <Input
                id="instanceName"
                placeholder="minha-instancia"
                value={newInstanceName}
                onChange={(e) => setNewInstanceName(e.target.value.replace(/\s/g, '-').toLowerCase())}
              />
              <p className="text-xs text-muted-foreground">
                Use apenas letras minúsculas, números e hífens
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateInstance} disabled={isCreating}>
              {isCreating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Criando...
                </>
              ) : (
                'Criar Instância'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR Code Dialog */}
      <Dialog open={qrDialogOpen} onOpenChange={handleCloseQRDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              Conectar WhatsApp
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center py-6">
            {isLoadingQR ? (
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p className="text-muted-foreground">Gerando QR Code...</p>
              </div>
            ) : qrCode?.base64 ? (
              <>
                <div className="p-4 bg-white rounded-lg shadow-lg">
                  <img 
                    src={qrCode.base64.startsWith('data:') ? qrCode.base64 : `data:image/png;base64,${qrCode.base64}`}
                    alt="QR Code"
                    className="w-64 h-64"
                  />
                </div>
                <div className="mt-4 text-center space-y-2">
                  <p className="font-medium">Escaneie com o WhatsApp</p>
                  <p className="text-sm text-muted-foreground">
                    Abra o WhatsApp → Menu → Aparelhos conectados → Conectar dispositivo
                  </p>
                </div>
                {qrCode.pairingCode && (
                  <div className="mt-4 p-3 bg-muted rounded-lg flex items-center gap-2">
                    <span className="text-sm font-mono">{qrCode.pairingCode}</span>
                    <Button variant="ghost" size="icon" onClick={copyPairingCode}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                )}
                <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Aguardando conexão...
                </div>
              </>
            ) : (
              <div className="text-center">
                <AlertTriangle className="h-12 w-12 mx-auto text-yellow-500 mb-4" />
                <p>Não foi possível gerar o QR Code</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Instância</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a instância "{instanceToDelete?.name}"? 
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Webhook Configuration Dialog */}
      <Dialog open={webhookDialogOpen} onOpenChange={setWebhookDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Webhook className="h-5 w-5" />
              Configurar Webhook - {webhookInstance?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="instanceWebhookUrl">URL do Webhook</Label>
              <Input
                id="instanceWebhookUrl"
                placeholder="https://seu-servidor.com/webhook"
                value={instanceWebhookUrl}
                onChange={(e) => setInstanceWebhookUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Endpoint que receberá os eventos desta instância
              </p>
            </div>

            <div className="space-y-2">
              <Label>Eventos</Label>
              <ScrollArea className="h-[250px] rounded-lg border p-3">
                <div className="space-y-2">
                  {AVAILABLE_WEBHOOK_EVENTS.map((event) => (
                    <div
                      key={event.id}
                      className="flex items-start space-x-3 p-2 rounded-lg hover:bg-muted/50"
                    >
                      <Checkbox
                        id={`instance-${event.id}`}
                        checked={instanceWebhookEvents.includes(event.id)}
                        onCheckedChange={() => toggleWebhookEvent(event.id)}
                      />
                      <div className="grid gap-0.5 leading-none">
                        <Label
                          htmlFor={`instance-${event.id}`}
                          className="text-sm font-medium cursor-pointer"
                        >
                          {event.label}
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          {event.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>

            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                O webhook receberá um POST com os dados do evento em formato JSON
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWebhookDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveWebhook} disabled={isSavingWebhook}>
              {isSavingWebhook ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Salvar Webhook'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Tabs>
  );
}
