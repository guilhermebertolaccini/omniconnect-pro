import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { wpApi } from '@/services/wordpress-api';
import type { Conversation, Message, Bot } from '@/types/bot';
import { 
  Search, 
  Send,
  MessageSquare,
  Check,
  CheckCheck,
  Clock,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function Messages() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [bots, setBots] = useState<Bot[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedBot, setSelectedBot] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [newMessage, setNewMessage] = useState('');

  useEffect(() => {
    const loadData = async () => {
      try {
        const [conversationsResponse, botsData] = await Promise.all([
          wpApi.getConversations(),
          wpApi.getBots(),
        ]);
        setConversations(conversationsResponse.data || []);
        setBots(botsData);
      } catch {
        toast.error('Erro ao carregar conversas');
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  const loadMessages = async (conversation: Conversation) => {
    try {
      const messagesResponse = await wpApi.getMessages(conversation.id);
      setMessages(messagesResponse.data || []);
      setSelectedConversation(conversation);
    } catch {
      toast.error('Erro ao carregar mensagens');
    }
  };

  const filteredConversations = conversations.filter(conv => {
    const matchesBot = selectedBot === 'all' || conv.botId === selectedBot;
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q ||
      (conv.contactName || '').toLowerCase().includes(q) ||
      (conv.contactPhone || '').includes(searchQuery) ||
      (conv.lastMessage || '').toLowerCase().includes(q);
    return matchesBot && matchesSearch;
  });

  const getBotName = (botId: string) => {
    const bot = bots.find(b => b.id === botId);
    return bot?.name || 'Bot';
  };

  const getStatusIcon = (status: Message['status']) => {
    switch (status) {
      case 'sent':
        return <Check className="h-3 w-3 text-muted-foreground" />;
      case 'delivered':
        return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
      case 'read':
        return <CheckCheck className="h-3 w-3 text-primary" />;
      default:
        return <Clock className="h-3 w-3 text-muted-foreground" />;
    }
  };

  const handleSendMessage = () => {
    if (!newMessage.trim() || !selectedConversation) return;
    // In production, this would send to WordPress API
    toast.info('Funcionalidade de envio será implementada com a API do WordPress');
    setNewMessage('');
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground">Mensagens</h1>
          <p className="text-muted-foreground">
            Visualize o histórico de conversas dos seus bots
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-200px)]">
          {/* Conversations List */}
          <Card className="lg:col-span-1">
            <div className="p-4 border-b border-border">
              <div className="flex flex-col gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar conversas..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={selectedBot} onValueChange={setSelectedBot}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filtrar por bot" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Bots</SelectItem>
                    {bots.map(bot => (
                      <SelectItem key={bot.id} value={bot.id}>
                        {bot.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <ScrollArea className="h-[calc(100%-80px)]">
              {isLoading ? (
                <div className="p-4 space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
                  ))}
                </div>
              ) : filteredConversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-4">
                  <MessageSquare className="h-10 w-10 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground text-center">
                    Nenhuma conversa encontrada
                  </p>
                </div>
              ) : (
                <div className="p-2">
                  {filteredConversations.map((conv) => (
                    <button
                      key={conv.id}
                      onClick={() => loadMessages(conv)}
                      className={cn(
                        'w-full flex items-start gap-3 p-3 rounded-lg text-left transition-colors',
                        selectedConversation?.id === conv.id
                          ? 'bg-primary/10'
                          : 'hover:bg-muted'
                      )}
                    >
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-primary/10 text-primary">
                          {conv.contactName.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-sm text-foreground truncate">
                            {conv.contactName}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {conv.lastMessageTime && !isNaN(new Date(conv.lastMessageTime).getTime())
                              ? formatDistanceToNow(new Date(conv.lastMessageTime), { locale: ptBR, addSuffix: false })
                              : ''}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          {conv.lastMessage || 'Sem mensagens'}
                        </p>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-xs text-muted-foreground">
                            {getBotName(conv.botId)}
                          </span>
                          {conv.unreadCount > 0 && (
                            <Badge className="h-5 min-w-5 flex items-center justify-center bg-primary text-primary-foreground">
                              {conv.unreadCount}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </Card>

          {/* Chat View */}
          <Card className="lg:col-span-2 flex flex-col">
            {selectedConversation ? (
              <>
                {/* Chat Header */}
                <div className="p-4 border-b border-border">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {selectedConversation.contactName.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h3 className="font-medium text-foreground">
                        {selectedConversation.contactName}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {selectedConversation.contactPhone}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Messages */}
                <ScrollArea className="flex-1 p-4">
                  <div className="space-y-4">
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={cn(
                          'flex',
                          message.direction === 'outgoing' ? 'justify-end' : 'justify-start'
                        )}
                      >
                        <div
                          className={cn(
                            'max-w-[70%] rounded-lg px-4 py-2',
                            message.direction === 'outgoing'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-foreground'
                          )}
                        >
                          <p className="text-sm">{message.content}</p>
                          <div className={cn(
                            'flex items-center justify-end gap-1 mt-1',
                            message.direction === 'outgoing' 
                              ? 'text-primary-foreground/70' 
                              : 'text-muted-foreground'
                          )}>
                            <span className="text-xs">
                              {message.timestamp && !isNaN(new Date(message.timestamp).getTime())
                                ? format(new Date(message.timestamp), 'HH:mm')
                                : ''}
                            </span>
                            {message.direction === 'outgoing' && getStatusIcon(message.status)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>

                {/* Message Input */}
                <div className="p-4 border-t border-border">
                  <div className="flex items-center gap-3">
                    <Input
                      placeholder="Digite sua mensagem..."
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                      className="flex-1"
                    />
                    <Button onClick={handleSendMessage}>
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <CardContent className="flex-1 flex flex-col items-center justify-center">
                <MessageSquare className="h-16 w-16 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">
                  Selecione uma conversa
                </h3>
                <p className="text-muted-foreground text-center">
                  Escolha uma conversa na lista para visualizar as mensagens
                </p>
              </CardContent>
            )}
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}
