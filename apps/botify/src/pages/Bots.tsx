import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { BotCard } from '@/components/dashboard/BotCard';
import { CreateBotDialog } from '@/components/bots/CreateBotDialog';
import { DeleteBotDialog } from '@/components/bots/DeleteBotDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { botifyDomainApi } from '@/services/botify-domain-api';
import { APIError } from '@/services/wordpress-api';
import type { Bot } from '@/types/bot';
import { Plus, Search, Filter } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export default function Bots() {
  const navigate = useNavigate();
  const [bots, setBots] = useState<Bot[]>([]);
  const [filteredBots, setFilteredBots] = useState<Bot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editBot, setEditBot] = useState<Bot | null>(null);
  const [deletingBot, setDeletingBot] = useState<Bot | null>(null);

  const loadBots = async () => {
    setIsLoading(true);
    try {
      const data = await botifyDomainApi.getBots();
      setBots(data);
      setFilteredBots(data);
    } catch {
      toast.error('Erro ao carregar bots');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBots();
  }, []);

  useEffect(() => {
    let result = bots;

    if (searchQuery) {
      result = result.filter(
        bot =>
          (bot.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
          (bot.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
          (bot.phoneNumber || '').includes(searchQuery)
      );
    }

    if (statusFilter !== 'all') {
      result = result.filter(bot => bot.status === statusFilter);
    }

    setFilteredBots(result);
  }, [bots, searchQuery, statusFilter]);

  const handleCreateBot = async (botData: Omit<Bot, 'id' | 'createdAt'>) => {
    try {
      if (editBot) {
        await botifyDomainApi.updateBot(editBot.id, botData);
        toast.success('Bot atualizado com sucesso!');
      } else {
        await botifyDomainApi.createBot(botData);
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
      await botifyDomainApi.deleteBot(deletingBot.id);
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

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Bots</h1>
            <p className="text-muted-foreground">
              Gerencie todos os seus bots WhatsApp
            </p>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Bot
          </Button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar bots..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Status</SelectItem>
              <SelectItem value="online">Online</SelectItem>
              <SelectItem value="offline">Offline</SelectItem>
              <SelectItem value="error">Com Erro</SelectItem>
              <SelectItem value="connecting">Conectando</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Bot Grid */}
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-64 rounded-lg bg-card animate-pulse" />
            ))}
          </div>
        ) : filteredBots.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 border border-dashed border-border rounded-lg">
            <Search className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              Nenhum bot encontrado
            </h3>
            <p className="text-muted-foreground text-center">
              {searchQuery || statusFilter !== 'all'
                ? 'Tente ajustar os filtros de busca.'
                : 'Crie seu primeiro bot para começar.'}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredBots.map((bot) => (
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
}
