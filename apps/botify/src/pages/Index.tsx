import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { BotCard } from '@/components/dashboard/BotCard';
import { CreateBotDialog } from '@/components/bots/CreateBotDialog';
import { DeleteBotDialog } from '@/components/bots/DeleteBotDialog';
import { Button } from '@/components/ui/button';
import { wpApi, APIError } from '@/services/wordpress-api';
import type { Bot } from '@/types/bot';
import { 
  Bot as BotIcon, 
  MessageSquare, 
  Users, 
  Activity,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

const Index = () => {
  const navigate = useNavigate();
  const [bots, setBots] = useState<Bot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editBot, setEditBot] = useState<Bot | null>(null);
  const [deletingBot, setDeletingBot] = useState<Bot | null>(null);

  const loadBots = async () => {
    setIsLoading(true);
    try {
      const data = await wpApi.getBots();
      setBots(data);
    } catch (error) {
      const message =
        error instanceof APIError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Erro ao carregar bots';
      toast.error(message || 'Erro ao carregar bots');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBots();
  }, []);

  const handleCreateBot = async (botData: Omit<Bot, 'id' | 'createdAt'>) => {
    try {
      if (editBot) {
        await wpApi.updateBot(editBot.id, botData);
        toast.success('Bot atualizado com sucesso!');
      } else {
        await wpApi.createBot(botData);
        toast.success('Bot criado com sucesso!');
      }
      loadBots();
      setEditBot(null);
    } catch (error) {
      const message =
        error instanceof APIError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Erro ao salvar bot';
      toast.error(message || 'Erro ao salvar bot');
    }
  };

  const handleDeleteBot = async () => {
    if (!deletingBot) return;
    try {
      await wpApi.deleteBot(deletingBot.id);
      toast.success('Bot excluído com sucesso!');
      loadBots();
      setDeletingBot(null);
      setDeleteDialogOpen(false);
    } catch {
      toast.error('Erro ao excluir bot');
    }
  };

  const handleEditBot = (bot: Bot) => {
    setEditBot(bot);
    setCreateDialogOpen(true);
  };

  const handleDeleteClick = (bot: Bot) => {
    setDeletingBot(bot);
    setDeleteDialogOpen(true);
  };

  const handleConfigureBot = (bot: Bot) => {
    navigate(`/settings?bot=${bot.id}`);
  };

  // Calculate stats
  const totalMessages = bots.reduce((sum, bot) => sum + bot.messagesReceived + bot.messagesSent, 0);
  const totalConversations = bots.reduce((sum, bot) => sum + bot.activeConversations, 0);
  const onlineBots = bots.filter(bot => bot.status === 'online').length;
  const healthyLines = bots.filter(bot => bot.lineHealth === 'healthy').length;

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
            <p className="text-muted-foreground">
              Gerencie seus bots WhatsApp em um só lugar
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={loadBots} disabled={isLoading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Bot
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Total de Bots"
            value={bots.length}
            description={`${onlineBots} online`}
            icon={BotIcon}
            variant="primary"
            trend={{ value: 12, isPositive: true }}
          />
          <StatsCard
            title="Mensagens Hoje"
            value={totalMessages.toLocaleString('pt-BR')}
            description="Enviadas e recebidas"
            icon={MessageSquare}
            trend={{ value: 8, isPositive: true }}
          />
          <StatsCard
            title="Conversas Ativas"
            value={totalConversations}
            description="Em andamento"
            icon={Users}
            variant="success"
          />
          <StatsCard
            title="Saúde das Linhas"
            value={`${healthyLines}/${bots.length}`}
            description="Linhas saudáveis"
            icon={Activity}
            variant={healthyLines === bots.length ? 'success' : 'warning'}
          />
        </div>

        {/* Bots Section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-foreground">Seus Bots</h2>
          </div>

          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-64 rounded-lg bg-card animate-pulse" />
              ))}
            </div>
          ) : bots.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 border border-dashed border-border rounded-lg">
              <BotIcon className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">
                Nenhum bot criado
              </h3>
              <p className="text-muted-foreground text-center mb-4">
                Crie seu primeiro bot para começar a automatizar suas conversas no WhatsApp.
              </p>
              <Button onClick={() => setCreateDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Criar Primeiro Bot
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {bots.map((bot) => (
                <BotCard
                  key={bot.id}
                  bot={bot}
                  onEdit={handleEditBot}
                  onDelete={handleDeleteClick}
                  onConfigure={handleConfigureBot}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <CreateBotDialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          setCreateDialogOpen(open);
          if (!open) setEditBot(null);
        }}
        onSave={handleCreateBot}
        editBot={editBot}
      />

      <DeleteBotDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        bot={deletingBot}
        onConfirm={handleDeleteBot}
      />
    </MainLayout>
  );
};

export default Index;
