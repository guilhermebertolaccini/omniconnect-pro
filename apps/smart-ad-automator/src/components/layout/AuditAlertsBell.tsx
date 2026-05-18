import { Bell, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useUnresolvedAlertsCount } from '@/hooks/useAuditLogs';
import { useNavigate } from 'react-router-dom';

export function AuditAlertsBell() {
  const { data: count = 0 } = useUnresolvedAlertsCount();
  const navigate = useNavigate();
  const hasAlerts = count > 0;

  return (
    <Button
      variant="ghost" size="icon" className="relative"
      onClick={() => navigate('/settings?tab=audit')}
      title={hasAlerts ? `${count} alerta(s) nas últimas 24h` : 'Sem alertas recentes'}
    >
      {hasAlerts ? (
        <AlertTriangle className="h-5 w-5 text-amber-500 animate-pulse" />
      ) : (
        <Bell className="h-5 w-5" />
      )}
      {hasAlerts && (
        <Badge className="absolute -right-1 -top-1 h-5 min-w-5 rounded-full p-0 px-1 text-xs flex items-center justify-center bg-destructive">
          {count > 99 ? '99+' : count}
        </Badge>
      )}
    </Button>
  );
}
