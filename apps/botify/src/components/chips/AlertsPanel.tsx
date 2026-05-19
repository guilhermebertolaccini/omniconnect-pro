import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertConfig, AlertEvent } from '@/types/alerts';
import { alertService } from '@/services/alert-service';
import { AlertConfigDialog } from './AlertConfigDialog';
import { 
  Bell, 
  Plus, 
  Trash2, 
  Edit, 
  AlertTriangle, 
  AlertCircle, 
  Info,
  CheckCircle2,
  XCircle,
  Clock,
  Webhook
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function AlertsPanel() {
  const [configs, setConfigs] = useState<AlertConfig[]>([]);
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<AlertConfig | null>(null);

  const loadData = () => {
    setConfigs(alertService.getConfigs());
    setEvents(alertService.getEvents());
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleToggleEnabled = (config: AlertConfig) => {
    alertService.updateConfig(config.id, { enabled: !config.enabled });
    loadData();
    toast.success(config.enabled ? 'Alerta desativado' : 'Alerta ativado');
  };

  const handleDelete = (config: AlertConfig) => {
    if (confirm(`Excluir alerta "${config.name}"?`)) {
      alertService.deleteConfig(config.id);
      loadData();
      toast.success('Alerta excluído');
    }
  };

  const handleEdit = (config: AlertConfig) => {
    setEditingConfig(config);
    setDialogOpen(true);
  };

  const handleNewAlert = () => {
    setEditingConfig(null);
    setDialogOpen(true);
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'quality_drop': return 'Queda de Qualidade';
      case 'status_change': return 'Mudança de Status';
      case 'messaging_limit': return 'Limite de Mensagens';
      case 'health_degraded': return 'Saúde Degradada';
      default: return type;
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <AlertCircle className="h-4 w-4 text-destructive" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      default: return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical': return <Badge variant="destructive">Crítico</Badge>;
      case 'warning': return <Badge className="bg-yellow-500 hover:bg-yellow-600">Aviso</Badge>;
      default: return <Badge variant="secondary">Info</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Alert Configurations */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Configurações de Alertas
          </CardTitle>
          <Button onClick={handleNewAlert} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Novo Alerta
          </Button>
        </CardHeader>
        <CardContent>
          {configs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Webhook className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum alerta configurado</p>
              <p className="text-sm">Crie alertas para ser notificado sobre mudanças nos seus números</p>
            </div>
          ) : (
            <div className="space-y-3">
              {configs.map((config) => (
                <div
                  key={config.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <Switch
                      checked={config.enabled}
                      onCheckedChange={() => handleToggleEnabled(config)}
                    />
                    <div>
                      <p className="font-medium">{config.name}</p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Badge variant="outline">{getTypeLabel(config.type)}</Badge>
                        {config.lastTriggered && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Último: {format(new Date(config.lastTriggered), 'dd/MM HH:mm', { locale: ptBR })}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(config)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(config)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Event History */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Histórico de Alertas
          </CardTitle>
          {events.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                alertService.clearEvents();
                loadData();
                toast.success('Histórico limpo');
              }}
            >
              Limpar Histórico
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum alerta disparado ainda</p>
              <p className="text-sm">Os alertas aparecerão aqui quando forem disparados</p>
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <div className="space-y-3">
                {events.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-start gap-3 p-4 border rounded-lg"
                  >
                    {getSeverityIcon(event.severity)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {getSeverityBadge(event.severity)}
                        <span className="text-sm text-muted-foreground">
                          {event.triggeredAt ? format(new Date(event.triggeredAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : '-'}
                        </span>
                      </div>
                      <p className="font-medium">{event.message}</p>
                      <p className="text-sm text-muted-foreground">
                        {event.phoneDisplayName} ({event.phoneNumber})
                      </p>
                      {event.previousValue && event.currentValue && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {event.previousValue} → {event.currentValue}
                        </p>
                      )}
                      <div className="flex items-center gap-1 mt-2 text-xs">
                        {event.webhookResponse?.success ? (
                          <>
                            <CheckCircle2 className="h-3 w-3 text-green-500" />
                            <span className="text-green-600">Webhook enviado</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="h-3 w-3 text-destructive" />
                            <span className="text-destructive">
                              Erro: {event.webhookResponse?.error}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <AlertConfigDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingConfig={editingConfig}
        onSave={loadData}
      />
    </div>
  );
}
