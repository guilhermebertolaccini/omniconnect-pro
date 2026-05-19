import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Bot } from '@/types/bot';
import { 
  MoreVertical, 
  MessageSquare, 
  Users, 
  Activity,
  Phone,
  Settings,
  Trash2,
  Edit,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface BotCardProps {
  bot: Bot;
  onEdit?: (bot: Bot) => void;
  onDelete?: (bot: Bot) => void;
  onConfigure?: (bot: Bot) => void;
}

const statusConfig = {
  online: { label: 'Online', className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
  offline: { label: 'Offline', className: 'bg-muted text-muted-foreground border-muted' },
  error: { label: 'Erro', className: 'bg-destructive/10 text-destructive border-destructive/20' },
  connecting: { label: 'Conectando', className: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
};

const healthConfig = {
  healthy: { label: 'Saudável', className: 'text-emerald-600' },
  degraded: { label: 'Degradado', className: 'text-amber-600' },
  disconnected: { label: 'Desconectado', className: 'text-destructive' },
};

export function BotCard({ bot, onEdit, onDelete, onConfigure }: BotCardProps) {
  const status = statusConfig[bot.status];
  const health = healthConfig[bot.lineHealth];

  return (
    <Card className="group transition-shadow hover:shadow-md">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
              <Phone className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">{bot.name}</h3>
              <p className="text-sm text-muted-foreground">{bot.phoneNumber}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={cn('font-medium', status.className)}>
              {status.label}
            </Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit?.(bot)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Editar
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onConfigure?.(bot)}>
                  <Settings className="mr-2 h-4 w-4" />
                  Configurar WhatsApp
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={() => onDelete?.(bot)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Excluir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-sm text-muted-foreground line-clamp-2">
          {bot.description}
        </p>

        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
              <MessageSquare className="h-4 w-4" />
            </div>
            <p className="text-lg font-semibold text-foreground">{bot.messagesReceived}</p>
            <p className="text-xs text-muted-foreground">Recebidas</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
              <MessageSquare className="h-4 w-4" />
            </div>
            <p className="text-lg font-semibold text-foreground">{bot.messagesSent}</p>
            <p className="text-xs text-muted-foreground">Enviadas</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
              <Users className="h-4 w-4" />
            </div>
            <p className="text-lg font-semibold text-foreground">{bot.activeConversations}</p>
            <p className="text-xs text-muted-foreground">Conversas</p>
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-border">
          <div className="flex items-center gap-2">
            <Activity className={cn('h-4 w-4', health.className)} />
            <span className={cn('text-sm font-medium', health.className)}>
              {health.label}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            {bot.lastActivity && !isNaN(new Date(bot.lastActivity).getTime())
              ? `Ativo ${formatDistanceToNow(new Date(bot.lastActivity), { locale: ptBR, addSuffix: true })}`
              : 'Sem atividade'}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
