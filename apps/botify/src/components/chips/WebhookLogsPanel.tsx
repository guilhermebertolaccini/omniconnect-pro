import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { webhookLogService, WebhookLogEntry } from '@/services/webhook-log-service';

interface WebhookLogsPanelProps {
  instances: { name: string }[];
}

export function WebhookLogsPanel({ instances }: WebhookLogsPanelProps) {
  const [logs, setLogs] = useState<WebhookLogEntry[]>([]);
  const [search, setSearch] = useState('');
  const [filterInstance, setFilterInstance] = useState<string>('all');
  const [filterEvent, setFilterEvent] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [selectedLog, setSelectedLog] = useState<WebhookLogEntry | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  const loadLogs = () => {
    const filters: any = {};
    if (filterInstance !== 'all') filters.instanceName = filterInstance;
    if (filterEvent !== 'all') filters.event = filterEvent;
    if (filterStatus !== 'all') filters.status = filterStatus;
    
    setLogs(webhookLogService.getLogs(filters));
  };

  useEffect(() => {
    loadLogs();
    // Refresh logs every 5 seconds
    const interval = setInterval(loadLogs, 5000);
    return () => clearInterval(interval);
  }, [filterInstance, filterEvent, filterStatus]);

  const stats = useMemo(() => webhookLogService.getStats(), [logs]);

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
    if (confirm('Tem certeza que deseja limpar todos os logs?')) {
      webhookLogService.clearLogs();
      loadLogs();
      toast.success('Logs limpos');
    }
  };

  const handleExportLogs = () => {
    const data = webhookLogService.exportLogs();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `webhook-logs-${format(new Date(), 'yyyy-MM-dd-HH-mm')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Logs exportados');
  };

  const handleSimulateWebhook = () => {
    if (instances.length === 0) {
      toast.error('Nenhuma instância configurada');
      return;
    }

    const events = ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE', 'SEND_MESSAGE'];
    const randomEvent = events[Math.floor(Math.random() * events.length)];
    const randomInstance = instances[Math.floor(Math.random() * instances.length)].name;

    const samplePayloads: Record<string, any> = {
      MESSAGES_UPSERT: {
        key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: false, id: 'MSG123' },
        message: { conversation: 'Olá, tudo bem?' },
        messageTimestamp: Date.now(),
      },
      MESSAGES_UPDATE: {
        key: { remoteJid: '5511999999999@s.whatsapp.net', id: 'MSG123' },
        update: { status: 3 }, // READ
      },
      CONNECTION_UPDATE: {
        connection: 'open',
        qr: null,
      },
      SEND_MESSAGE: {
        key: { remoteJid: '5511888888888@s.whatsapp.net', fromMe: true, id: 'MSG456' },
        message: { extendedTextMessage: { text: 'Resposta automática' } },
        status: 'PENDING',
      },
    };

    webhookLogService.simulateWebhook(randomInstance, randomEvent, samplePayloads[randomEvent]);
    loadLogs();
    toast.success('Webhook simulado!');
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

  const getEventLabel = (event: string) => {
    const labels: Record<string, string> = {
      MESSAGES_UPSERT: 'Mensagem Recebida',
      MESSAGES_UPDATE: 'Status Atualizado',
      MESSAGES_DELETE: 'Mensagem Deletada',
      SEND_MESSAGE: 'Mensagem Enviada',
      CONNECTION_UPDATE: 'Conexão',
      QRCODE_UPDATED: 'QR Code',
      CONTACTS_UPDATE: 'Contatos',
      PRESENCE_UPDATE: 'Presença',
      CHATS_UPDATE: 'Conversas',
      GROUPS_UPDATE: 'Grupos',
    };
    return labels[event] || event;
  };

  return (
    <div className="space-y-6">
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
                <BarChart3 className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{Object.keys(stats.byEvent).length}</p>
                <p className="text-sm text-muted-foreground">Tipos de Evento</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Logs Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Webhook className="h-5 w-5" />
            Logs de Webhook
          </CardTitle>
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
            <Select value={filterInstance} onValueChange={setFilterInstance}>
              <SelectTrigger className="w-[180px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Instância" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas Instâncias</SelectItem>
                {instances.map((inst) => (
                  <SelectItem key={inst.name} value={inst.name}>
                    {inst.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterEvent} onValueChange={setFilterEvent}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Evento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Eventos</SelectItem>
                {uniqueEvents.map((event) => (
                  <SelectItem key={event} value={event}>
                    {getEventLabel(event)}
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
                Os logs de webhook aparecerão aqui quando eventos forem recebidos
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <div className="space-y-2">
                {filteredLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                    onClick={() => handleViewDetails(log)}
                  >
                    <div className="flex items-center gap-4">
                      <div className="text-xs text-muted-foreground w-[140px]">
                        {log.timestamp ? format(new Date(log.timestamp), "dd/MM HH:mm:ss", { locale: ptBR }) : '-'}
                      </div>
                      <Badge variant="outline">{log.instanceName}</Badge>
                      <Badge variant="secondary">{getEventLabel(log.event)}</Badge>
                    </div>
                    <div className="flex items-center gap-3">
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
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Log Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Webhook className="h-5 w-5" />
              Detalhes do Webhook
            </DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <Tabs defaultValue="info">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="info">Informações</TabsTrigger>
                <TabsTrigger value="payload">Payload</TabsTrigger>
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
                    <p className="text-sm font-medium text-muted-foreground">Instância</p>
                    <p>{selectedLog.instanceName}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Evento</p>
                    <p>{getEventLabel(selectedLog.event)}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Status</p>
                    {getStatusBadge(selectedLog.status)}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Tempo de Resposta</p>
                    <p>{selectedLog.responseTime ? `${selectedLog.responseTime}ms` : '-'}</p>
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
                    className="absolute top-2 right-2"
                    onClick={handleCopyPayload}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copiar
                  </Button>
                  <ScrollArea className="h-[300px] rounded-lg border bg-muted/30 p-4">
                    <pre className="text-sm font-mono whitespace-pre-wrap">
                      {JSON.stringify(selectedLog.payload, null, 2)}
                    </pre>
                  </ScrollArea>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
