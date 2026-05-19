import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { wpApi } from '@/services/wordpress-api';
import type { Bot } from '@/types/bot';
import { 
  Activity, 
  CheckCircle, 
  AlertTriangle, 
  XCircle,
  RefreshCw,
  Phone,
  Signal,
  Clock,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function Health() {
  const [bots, setBots] = useState<Bot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadBots = async () => {
    setIsLoading(true);
    try {
      const data = await wpApi.getBots();
      setBots(data);
    } catch {
      toast.error('Erro ao carregar dados de saúde');
    } finally {
      setIsLoading(false);
    }
  };

  const refreshHealth = async () => {
    setIsRefreshing(true);
    try {
      await wpApi.checkHealth();
      await loadBots();
      toast.success('Dados atualizados');
    } catch {
      toast.error('Erro ao atualizar');
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadBots();
  }, []);

  const healthyCount = bots.filter(b => b.lineHealth === 'healthy').length;
  const degradedCount = bots.filter(b => b.lineHealth === 'degraded').length;
  const disconnectedCount = bots.filter(b => b.lineHealth === 'disconnected').length;

  const healthPercentage = bots.length > 0 
    ? Math.round((healthyCount / bots.length) * 100) 
    : 0;

  const getHealthIcon = (health: Bot['lineHealth']) => {
    switch (health) {
      case 'healthy':
        return <CheckCircle className="h-5 w-5 text-emerald-600" />;
      case 'degraded':
        return <AlertTriangle className="h-5 w-5 text-amber-600" />;
      case 'disconnected':
        return <XCircle className="h-5 w-5 text-destructive" />;
    }
  };

  const getHealthColor = (health: Bot['lineHealth']) => {
    switch (health) {
      case 'healthy':
        return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
      case 'degraded':
        return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
      case 'disconnected':
        return 'bg-destructive/10 text-destructive border-destructive/20';
    }
  };

  const getSignalStrength = (health: Bot['lineHealth']) => {
    switch (health) {
      case 'healthy':
        return 100;
      case 'degraded':
        return 50;
      case 'disconnected':
        return 0;
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Saúde das Linhas</h1>
            <p className="text-muted-foreground">
              Monitore o status de conexão de todas as suas linhas WhatsApp
            </p>
          </div>
          <Button onClick={refreshHealth} disabled={isRefreshing}>
            <RefreshCw className={cn("mr-2 h-4 w-4", isRefreshing && "animate-spin")} />
            Atualizar
          </Button>
        </div>

        {/* Overview Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Saúde Geral
                  </p>
                  <p className="text-3xl font-bold text-foreground">{healthPercentage}%</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Activity className="h-6 w-6 text-primary" />
                </div>
              </div>
              <Progress value={healthPercentage} className="mt-4" />
            </CardContent>
          </Card>

          <Card className="border-emerald-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Saudáveis</p>
                  <p className="text-3xl font-bold text-emerald-600">{healthyCount}</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <CheckCircle className="h-6 w-6 text-emerald-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-amber-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Degradadas</p>
                  <p className="text-3xl font-bold text-amber-600">{degradedCount}</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-amber-500/10 flex items-center justify-center">
                  <AlertTriangle className="h-6 w-6 text-amber-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-destructive/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Desconectadas</p>
                  <p className="text-3xl font-bold text-destructive">{disconnectedCount}</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
                  <XCircle className="h-6 w-6 text-destructive" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Lines List */}
        <Card>
          <CardHeader>
            <CardTitle>Status das Linhas</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />
                ))}
              </div>
            ) : bots.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Phone className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Nenhuma linha configurada</p>
              </div>
            ) : (
              <div className="space-y-4">
                {bots.map((bot) => (
                  <div
                    key={bot.id}
                    className="flex items-center justify-between p-4 border border-border rounded-lg"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                        <Phone className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-medium text-foreground">{bot.name}</h3>
                        <p className="text-sm text-muted-foreground">{bot.phoneNumber}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      {/* Signal Strength */}
                      <div className="flex items-center gap-2">
                        <Signal className={cn(
                          "h-5 w-5",
                          bot.lineHealth === 'healthy' && "text-emerald-600",
                          bot.lineHealth === 'degraded' && "text-amber-600",
                          bot.lineHealth === 'disconnected' && "text-destructive"
                        )} />
                        <div className="w-24">
                          <Progress 
                            value={getSignalStrength(bot.lineHealth)} 
                            className={cn(
                              "h-2",
                              bot.lineHealth === 'healthy' && "[&>div]:bg-emerald-500",
                              bot.lineHealth === 'degraded' && "[&>div]:bg-amber-500",
                              bot.lineHealth === 'disconnected' && "[&>div]:bg-destructive"
                            )}
                          />
                        </div>
                      </div>

                      {/* Last Activity */}
                      <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-[140px]">
                        <Clock className="h-4 w-4" />
                        {bot.lastActivity && !isNaN(new Date(bot.lastActivity).getTime())
                          ? formatDistanceToNow(new Date(bot.lastActivity), { locale: ptBR, addSuffix: true })
                          : 'Sem atividade'}
                      </div>

                      {/* Status Badge */}
                      <div className="flex items-center gap-2">
                        {getHealthIcon(bot.lineHealth)}
                        <Badge variant="outline" className={getHealthColor(bot.lineHealth)}>
                          {bot.lineHealth === 'healthy' && 'Saudável'}
                          {bot.lineHealth === 'degraded' && 'Degradada'}
                          {bot.lineHealth === 'disconnected' && 'Desconectada'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
