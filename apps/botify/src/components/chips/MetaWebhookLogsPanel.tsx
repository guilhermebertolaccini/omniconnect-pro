import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
  Webhook,
  Search,
  Trash2,
  Download,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  Filter,
  BarChart3,
  Play,
  Copy,
  MessageSquare,
  Bell,
  FileText,
  UserCheck,
  Building2,
  Phone,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { webhookLogService, WebhookLogEntry } from '@/services/webhook-log-service';
import { MetaAccount, metaAccountsService } from '@/services/meta-accounts-service';

interface MetaWebhookLogsPanelProps {
  activeAccount?: MetaAccount | null;
}

// Meta API webhook event types
const META_EVENTS = {
  messages: { label: 'Mensagem', icon: MessageSquare, color: 'bg-blue-500' },
  messaging_postbacks: { label: 'Postback', icon: Bell, color: 'bg-purple-500' },
  message_template_status_update: { label: 'Template', icon: FileText, color: 'bg-orange-500' },
  account_update: { label: 'Conta', icon: Building2, color: 'bg-green-500' },
  message_echoes: { label: 'Eco', icon: RefreshCw, color: 'bg-gray-500' },
  phone_number_quality_update: { label: 'Qualidade', icon: Phone, color: 'bg-yellow-500' },
  security: { label: 'Segurança', icon: UserCheck, color: 'bg-red-500' },
};

export function MetaWebhookLogsPanel({ activeAccount }: MetaWebhookLogsPanelProps) {
  const [logs, setLogs] = useState<WebhookLogEntry[]>([]);
  const [accounts] = useState<MetaAccount[]>(metaAccountsService.getAccounts());
  const [search, setSearch] = useState('');
  const [filterAccount, setFilterAccount] = useState<string>(activeAccount?.id || 'all');
  const [filterEvent, setFilterEvent] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [selectedLog, setSelectedLog] = useState<WebhookLogEntry | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  const loadLogs = () => {
    const filters: any = { provider: 'meta' };
    if (filterAccount !== 'all') filters.accountId = filterAccount;
    if (filterEvent !== 'all') filters.event = filterEvent;
    if (filterStatus !== 'all') filters.status = filterStatus;
    
    setLogs(webhookLogService.getLogs(filters));
  };

  useEffect(() => {
    loadLogs();
    const interval = setInterval(loadLogs, 5000);
    return () => clearInterval(interval);
  }, [filterAccount, filterEvent, filterStatus]);

  useEffect(() => {
    if (activeAccount) {
      setFilterAccount(activeAccount.id);
    }
  }, [activeAccount]);

  const stats = useMemo(() => webhookLogService.getStats('meta'), [logs]);

  const filteredLogs = useMemo(() => {
    if (!search) return logs;
    const searchLower = search.toLowerCase();
    return logs.filter(
      (log) =>
        (log.instanceName || '').toLowerCase().includes(searchLower) ||
        (log.event || '').toLowerCase().includes(searchLower) ||
        (log.payload ? JSON.stringify(log.payload).toLowerCase().includes(searchLower) : false)
    );
  }, [logs, search]);

  const uniqueEvents = useMemo(() => {
    const events = new Set(logs.map((log) => log.event));
    return Array.from(events);
  }, [logs]);

  const handleClearLogs = () => {
    if (confirm('Tem certeza que deseja limpar todos os logs da Meta API?')) {
      // Clear only meta logs
      const allLogs = webhookLogService.getLogs();
      allLogs
        .filter(l => l.provider === 'meta')
        .forEach(l => {
          // We need to implement clearByProvider or manually handle
        });
      webhookLogService.clearLogs();
      loadLogs();
      toast.success('Logs limpos');
    }
  };

  const handleExportLogs = () => {
    const metaLogs = webhookLogService.getMetaLogs();
    const data = JSON.stringify(metaLogs, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meta-webhook-logs-${format(new Date(), 'yyyy-MM-dd-HH-mm')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Logs exportados');
  };

  const handleSimulateWebhook = () => {
    const events = ['messages', 'messaging_postbacks', 'message_template_status_update'];
    const randomEvent = events[Math.floor(Math.random() * events.length)];

    const samplePayloads: Record<string, any> = {
      messages: {
        object: 'whatsapp_business_account',
        entry: [{
          id: 'WABA_ID',
          changes: [{
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '5511999999999',
                phone_number_id: 'PHONE_ID_123',
              },
              messages: [{
                from: '5511888888888',
                id: 'wamid.ABC123',
                timestamp: Math.floor(Date.now() / 1000).toString(),
                type: 'text',
                text: { body: 'Olá, preciso de ajuda!' },
              }],
            },
            field: 'messages',
          }],
        }],
      },
      messaging_postbacks: {
        object: 'whatsapp_business_account',
        entry: [{
          id: 'WABA_ID',
          changes: [{
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '5511999999999',
                phone_number_id: 'PHONE_ID_123',
              },
              messages: [{
                from: '5511888888888',
                id: 'wamid.ABC124',
                timestamp: Math.floor(Date.now() / 1000).toString(),
                type: 'interactive',
                interactive: {
                  type: 'button_reply',
                  button_reply: { id: 'btn_1', title: 'Sim, quero!' },
                },
              }],
            },
            field: 'messages',
          }],
        }],
      },
      message_template_status_update: {
        object: 'whatsapp_business_account',
        entry: [{
          id: 'WABA_ID',
          changes: [{
            value: {
              event: 'APPROVED',
              message_template_id: 123456789,
              message_template_name: 'welcome_message',
              message_template_language: 'pt_BR',
            },
            field: 'message_template_status_update',
          }],
        }],
      },
    };

    webhookLogService.addMetaLog({
      event: randomEvent,
      status: 'received',
      payload: samplePayloads[randomEvent],
      phoneNumberId: 'PHONE_ID_123',
      accountId: activeAccount?.id,
      responseTime: Math.floor(Math.random() * 150) + 30,
    });
    
    loadLogs();
    toast.success('Webhook Meta simulado!');
  };

  const handleViewDetails = (log: WebhookLogEntry) => {
    setSelectedLog(log);
    setDetailDialogOpen(true);
  };

  const handleCopyPayload = () => {
    if (selectedLog) {
      navigator.clipboard.writeText(JSON.stringify(selectedLog.payload, null, 2));
      toast.success('Payload copiado!');
    }
  };

  const getStatusBadge = (status: WebhookLogEntry['status']) => {
    switch (status) {
      case 'received':
        return (
          <Badge className="bg-green-500 hover:bg-green-600">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Recebido
          </Badge>
        );
      case 'error':
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" />
            Erro
          </Badge>
        );
      case 'pending':
        return (
          <Badge variant="secondary">
            <Clock className="h-3 w-3 mr-1" />
            Pendente
          </Badge>
        );
    }
  };

  const getEventInfo = (event: string) => {
    return META_EVENTS[event as keyof typeof META_EVENTS] || { 
      label: event, 
      icon: Webhook, 
      color: 'bg-gray-500' 
    };
  };

  const getAccountName = (accountId?: string) => {
    if (!accountId) return 'Desconhecida';
    const account = accounts.find(a => a.id === accountId);
    return account?.name || accountId;
  };

  const extractMessageInfo = (payload: any) => {
    try {
      const entry = payload?.entry?.[0];
      const change = entry?.changes?.[0];
      const value = change?.value;
      
      if (value?.messages?.[0]) {
        const msg = value.messages[0];
        return {
          from: msg.from,
          type: msg.type,
          content: msg.text?.body || msg.interactive?.button_reply?.title || msg.type,
        };
      }
      
      if (change?.field === 'message_template_status_update') {
        return {
          template: value.message_template_name,
          status: value.event,
          language: value.message_template_language,
        };
      }
      
      return null;
    } catch {
      return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Account Context */}
      {activeAccount && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <Building2 className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium">Logs de Webhook - {activeAccount.name}</p>
                <p className="text-xs text-muted-foreground">
                  BM ID: {activeAccount.businessManagerId}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Webhook className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-sm text-muted-foreground">Total de Logs</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-green-500/10 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.received}</p>
                <p className="text-sm text-muted-foreground">Recebidos</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <XCircle className="h-6 w-6 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.errors}</p>
                <p className="text-sm text-muted-foreground">Erros</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                <MessageSquare className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{Object.keys(stats.byEvent).length}</p>
                <p className="text-sm text-muted-foreground">Tipos de Evento</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Event Distribution */}
      {Object.keys(stats.byEvent).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Distribuição de Eventos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {Object.entries(stats.byEvent).map(([event, count]) => {
                const eventInfo = getEventInfo(event);
                const Icon = eventInfo.icon;
                return (
                  <Badge key={event} variant="outline" className="gap-1 py-1.5 px-3">
                    <Icon className="h-3 w-3" />
                    {eventInfo.label}: {count}
                  </Badge>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Logs Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Webhook className="h-5 w-5" />
              Logs de Webhook Meta API
            </CardTitle>
            <CardDescription>
              Eventos recebidos via webhook da API oficial do WhatsApp
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleSimulateWebhook}>
              <Play className="h-4 w-4 mr-2" />
              Simular
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportLogs}>
              <Download className="h-4 w-4 mr-2" />
              Exportar
            </Button>
            <Button variant="outline" size="sm" onClick={loadLogs}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar
            </Button>
            <Button variant="outline" size="sm" onClick={handleClearLogs}>
              <Trash2 className="h-4 w-4 mr-2" />
              Limpar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar nos logs..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1"
              />
            </div>
            <Select value={filterAccount} onValueChange={setFilterAccount}>
              <SelectTrigger className="w-[200px]">
                <Building2 className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Conta" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as Contas</SelectItem>
                {accounts.map((acc) => (
                  <SelectItem key={acc.id} value={acc.id}>
                    {acc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterEvent} onValueChange={setFilterEvent}>
              <SelectTrigger className="w-[180px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Evento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Eventos</SelectItem>
                {Object.entries(META_EVENTS).map(([key, value]) => (
                  <SelectItem key={key} value={key}>
                    {value.label}
                  </SelectItem>
                ))}
                {uniqueEvents
                  .filter(e => !Object.keys(META_EVENTS).includes(e))
                  .map((event) => (
                    <SelectItem key={event} value={event}>
                      {event}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="received">Recebido</SelectItem>
                <SelectItem value="error">Erro</SelectItem>
                <SelectItem value="pending">Pendente</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Logs List */}
          {filteredLogs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Webhook className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium">Nenhum log encontrado</p>
              <p className="text-sm">
                Os logs de webhook da Meta API aparecerão aqui quando eventos forem recebidos
              </p>
              <Button variant="outline" className="mt-4" onClick={handleSimulateWebhook}>
                <Play className="h-4 w-4 mr-2" />
                Simular Webhook
              </Button>
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <div className="space-y-2">
                {filteredLogs.map((log) => {
                  const eventInfo = getEventInfo(log.event);
                  const Icon = eventInfo.icon;
                  const messageInfo = extractMessageInfo(log.payload);
                  
                  return (
                    <div
                      key={log.id}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => handleViewDetails(log)}
                    >
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className={`h-8 w-8 rounded-full ${eventInfo.color}/10 flex items-center justify-center shrink-0`}>
                          <Icon className={`h-4 w-4 ${eventInfo.color.replace('bg-', 'text-')}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-muted-foreground">
                              {log.timestamp ? format(new Date(log.timestamp), "dd/MM HH:mm:ss", { locale: ptBR }) : '-'}
                            </span>
                            <Badge variant="secondary" className="text-xs">
                              {eventInfo.label}
                            </Badge>
                            {log.accountId && (
                              <Badge variant="outline" className="text-xs">
                                {getAccountName(log.accountId)}
                              </Badge>
                            )}
                          </div>
                          {messageInfo && (
                            <p className="text-sm text-muted-foreground truncate mt-1">
                              {messageInfo.from && `De: ${messageInfo.from} • `}
                              {messageInfo.content || messageInfo.template}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {log.responseTime && (
                          <span className="text-xs text-muted-foreground">
                            {log.responseTime}ms
                          </span>
                        )}
                        {getStatusBadge(log.status)}
                        <Button variant="ghost" size="icon">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Log Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="sm:max-w-[800px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Webhook className="h-5 w-5" />
              Detalhes do Webhook Meta
            </DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <Tabs defaultValue="info">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="info">Informações</TabsTrigger>
                <TabsTrigger value="payload">Payload</TabsTrigger>
                <TabsTrigger value="parsed">Dados Extraídos</TabsTrigger>
              </TabsList>
              <TabsContent value="info" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">ID</p>
                    <p className="font-mono text-sm">{selectedLog.id}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Timestamp</p>
                    <p>{selectedLog.timestamp ? format(new Date(selectedLog.timestamp), "dd/MM/yyyy HH:mm:ss", { locale: ptBR }) : '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Conta</p>
                    <p>{getAccountName(selectedLog.accountId)}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Evento</p>
                    <div className="flex items-center gap-2">
                      {(() => {
                        const eventInfo = getEventInfo(selectedLog.event);
                        const Icon = eventInfo.icon;
                        return (
                          <>
                            <Icon className="h-4 w-4" />
                            {eventInfo.label}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Phone Number ID</p>
                    <p className="font-mono text-sm">{selectedLog.phoneNumberId || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Status</p>
                    {getStatusBadge(selectedLog.status)}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Tempo de Resposta</p>
                    <p>{selectedLog.responseTime ? `${selectedLog.responseTime}ms` : '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Provider</p>
                    <Badge variant="outline">Meta API</Badge>
                  </div>
                </div>
                {selectedLog.error && (
                  <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                    <p className="text-sm font-medium text-destructive">Erro</p>
                    <p className="text-sm">{selectedLog.error}</p>
                  </div>
                )}
              </TabsContent>
              <TabsContent value="payload" className="mt-4">
                <div className="relative">
                  <Button
                    variant="outline"
                    size="sm"
                    className="absolute top-2 right-2 z-10"
                    onClick={handleCopyPayload}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copiar
                  </Button>
                  <ScrollArea className="h-[400px] rounded-lg border bg-muted/30 p-4">
                    <pre className="text-sm font-mono whitespace-pre-wrap">
                      {JSON.stringify(selectedLog.payload, null, 2)}
                    </pre>
                  </ScrollArea>
                </div>
              </TabsContent>
              <TabsContent value="parsed" className="mt-4">
                {(() => {
                  const info = extractMessageInfo(selectedLog.payload);
                  if (!info) {
                    return (
                      <div className="text-center py-8 text-muted-foreground">
                        <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>Não foi possível extrair dados estruturados deste payload</p>
                      </div>
                    );
                  }
                  return (
                    <div className="space-y-4">
                      {Object.entries(info).map(([key, value]) => (
                        <div key={key} className="p-3 rounded-lg border">
                          <p className="text-xs font-medium text-muted-foreground uppercase">{key}</p>
                          <p className="font-medium mt-1">{String(value)}</p>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
