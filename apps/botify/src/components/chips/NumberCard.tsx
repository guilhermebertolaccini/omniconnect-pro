import { Phone, Signal, MessageSquare, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { WhatsAppNumber } from '@/types/whatsapp';

interface NumberCardProps {
  number: WhatsAppNumber;
  onViewAnalytics: (number: WhatsAppNumber) => void;
  onDisconnect: (number: WhatsAppNumber) => void;
}

const statusConfig = {
  CONNECTED: { label: 'Conectado', variant: 'default' as const, icon: CheckCircle2, color: 'text-green-500' },
  DISCONNECTED: { label: 'Desconectado', variant: 'secondary' as const, icon: XCircle, color: 'text-muted-foreground' },
  PENDING: { label: 'Pendente', variant: 'outline' as const, icon: Signal, color: 'text-yellow-500' },
  BANNED: { label: 'Banido', variant: 'destructive' as const, icon: AlertTriangle, color: 'text-destructive' },
};

const qualityConfig = {
  GREEN: { label: 'Alta', color: 'bg-green-500' },
  YELLOW: { label: 'Média', color: 'bg-yellow-500' },
  RED: { label: 'Baixa', color: 'bg-red-500' },
  UNKNOWN: { label: 'Desconhecida', color: 'bg-muted' },
};

export function NumberCard({ number, onViewAnalytics, onDisconnect }: NumberCardProps) {
  const status = statusConfig[number.status];
  const quality = qualityConfig[number.qualityRating];
  const StatusIcon = status.icon;

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Phone className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">{number.displayPhoneNumber}</h3>
              <p className="text-sm text-muted-foreground">{number.verifiedName}</p>
            </div>
          </div>
          <Badge variant={status.variant} className="flex items-center gap-1">
            <StatusIcon className={`h-3 w-3 ${status.color}`} />
            {status.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Business Manager</p>
            <p className="font-medium truncate">{number.businessManagerName}</p>
          </div>
          <div>
            <p className="text-muted-foreground">WABA</p>
            <p className="font-medium truncate">{number.wabaName}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Limite de Mensagens</p>
            <p className="font-medium">{number.messagingLimit.toLocaleString('pt-BR')}/dia</p>
          </div>
          <div>
            <p className="text-muted-foreground">Tier</p>
            <p className="font-medium">{number.currentTier}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Qualidade:</span>
          <div className="flex items-center gap-2">
            <div className={`h-3 w-3 rounded-full ${quality.color}`} />
            <span className="text-sm font-medium">{quality.label}</span>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={() => onViewAnalytics(number)}>
            <MessageSquare className="mr-2 h-4 w-4" />
            Analytics
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            className="text-destructive hover:text-destructive"
            onClick={() => onDisconnect(number)}
          >
            Desconectar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
