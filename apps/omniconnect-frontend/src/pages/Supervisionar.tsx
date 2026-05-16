import { useState, useEffect, useCallback, useRef } from "react";
import { MessageCircle, ArrowRight, ArrowLeft, AlertTriangle, Loader2, FileText, ArrowRightLeft, Download } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { MainLayout } from "@/components/layout/MainLayout";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { conversationsService, usersService, Conversation as APIConversation, User } from "@/services/api";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";

interface ConversationGroup {
  contactPhone: string;
  contactName: string;
  operatorName: string;
  lastMessage: string;
  lastMessageTime: string;
  isFromContact: boolean;
  messages: APIConversation[];
}


export default function Supervisionar() {
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  const [conversations, setConversations] = useState<ConversationGroup[]>([]);
  const [operators, setOperators] = useState<User[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<ConversationGroup | null>(null);
  const [selectedOperator, setSelectedOperator] = useState("all");
  const [isLoading, setIsLoading] = useState(true);

  // States for Transfer
  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false);
  const [availableOperators, setAvailableOperators] = useState<User[]>([]);
  const [selectedOperatorId, setSelectedOperatorId] = useState<string>("");
  const [isLoadingOperators, setIsLoadingOperators] = useState(false);

  const loadOperators = useCallback(async () => {
    try {
      const data = await usersService.list({ role: 'operator' });
      setOperators(data);
    } catch (error) {
      console.error('Error loading operators:', error);
    }
  }, []);

  // Ref para evitar loop infinito
  const selectedPhoneRef = useRef<string | null>(null);
  const isFirstLoad = useRef(true);

  // Atualizar ref quando selectedConversation mudar
  useEffect(() => {
    selectedPhoneRef.current = selectedConversation?.contactPhone || null;
  }, [selectedConversation?.contactPhone]);

  const loadConversations = useCallback(async () => {
    try {
      // Só mostrar loading na primeira vez
      if (isFirstLoad.current) {
        setIsLoading(true);
      }

      const data = await conversationsService.getActive();

      // Group conversations by contact phone
      const groupedMap = new Map<string, ConversationGroup>();

      data.forEach((conv) => {
        const existing = groupedMap.get(conv.contactPhone);
        if (existing) {
          existing.messages.push(conv);
          // Update last message if this one is more recent
          const convTime = new Date(conv.datetime).getTime();
          const existingTime = new Date(existing.lastMessageTime).getTime();
          if (convTime > existingTime) {
            existing.lastMessage = conv.message;
            existing.lastMessageTime = conv.datetime;
            existing.isFromContact = conv.sender === 'contact';
            existing.operatorName = conv.userName || 'Sem operador';
          }
        } else {
          groupedMap.set(conv.contactPhone, {
            contactPhone: conv.contactPhone,
            contactName: conv.contactName,
            operatorName: conv.userName || 'Sem operador',
            lastMessage: conv.message,
            lastMessageTime: conv.datetime,
            isFromContact: conv.sender === 'contact',
            messages: [conv],
          });
        }
      });

      // Sort messages within each group and groups by last message time
      const groups = Array.from(groupedMap.values()).map(group => ({
        ...group,
        messages: group.messages.sort((a, b) =>
          new Date(a.datetime).getTime() - new Date(b.datetime).getTime()
        ),
      })).sort((a, b) =>
        new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime()
      );

      setConversations(groups);

      // Update selected conversation if it exists (usando ref)
      const currentSelectedPhone = selectedPhoneRef.current;
      if (currentSelectedPhone) {
        const updated = groups.find(g => g.contactPhone === currentSelectedPhone);
        if (updated) {
          setSelectedConversation(updated);
        }
      }
    } catch (error) {
      toast({
        title: "Erro ao carregar conversas",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      isFirstLoad.current = false;
    }
  }, []); // Sem dependências - usa ref

  useEffect(() => {
    loadOperators();
    loadConversations();
  }, [loadOperators, loadConversations]);

  // Poll for new messages - intervalo maior para não sobrecarregar
  useEffect(() => {
    const interval = setInterval(() => {
      loadConversations();
    }, 10000); // 10 segundos

    return () => clearInterval(interval);
  }, [loadConversations]);

  const filteredConversations = selectedOperator === "all"
    ? conversations
    : conversations.filter(c => {
      const operator = operators.find(o => o.id.toString() === selectedOperator);
      return operator && c.operatorName === operator.name;
    });

  const formatTime = (datetime: string) => {
    try {
      return format(new Date(datetime), 'HH:mm');
    } catch {
      return '';
    }
  };

  const handleDownloadPDF = useCallback(() => {
    if (!selectedConversation) return;

    // Criar HTML formatado para a conversa
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Conversa - ${selectedConversation.contactName}</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      padding: 20px;
      max-width: 800px;
      margin: 0 auto;
    }
    .header {
      border-bottom: 2px solid #333;
      padding-bottom: 10px;
      margin-bottom: 20px;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
    }
    .header p {
      margin: 5px 0;
      color: #666;
    }
    .message {
      margin-bottom: 15px;
      padding: 10px;
      border-radius: 8px;
    }
    .message.operator {
      background-color: #e3f2fd;
      margin-left: 20%;
      text-align: right;
    }
    .message.contact {
      background-color: #f5f5f5;
      margin-right: 20%;
    }
    .message-header {
      font-weight: bold;
      margin-bottom: 5px;
      font-size: 12px;
      color: #666;
    }
    .message-content {
      margin-bottom: 5px;
    }
    .message-time {
      font-size: 11px;
      color: #999;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${selectedConversation.contactName}</h1>
    <p>Telefone: ${selectedConversation.contactPhone}</p>
    <p>Data: ${format(new Date(), 'dd/MM/yyyy HH:mm')}</p>
  </div>
  ${selectedConversation.messages.map(msg => `
    <div class="message ${msg.sender === 'operator' ? 'operator' : 'contact'}">
      <div class="message-header">${msg.sender === 'operator' ? (msg.userName || 'Operador') : selectedConversation.contactName}</div>
      <div class="message-content">${msg.message || (msg.mediaUrl ? `[${msg.messageType}]` : '')}</div>
      <div class="message-time">${format(new Date(msg.datetime), 'dd/MM/yyyy HH:mm:ss')}</div>
    </div>
  `).join('')}
</body>
</html>
    `;

    // Criar blob e abrir em nova janela para impressão
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const printWindow = window.open(url, '_blank');

    if (printWindow) {
      printWindow.onload = () => {
        setTimeout(() => {
          printWindow.print();
          URL.revokeObjectURL(url);
        }, 250);
      };
    }

    toast({
      title: "Download iniciado",
      description: "Use a opção 'Salvar como PDF' na janela de impressão",
    });
  }, [selectedConversation]);

  // Carregar operadores quando o dialog de transferência abrir
  useEffect(() => {
    if (isTransferDialogOpen && selectedConversation) {
      const loadTransferOperators = async () => {
        setIsLoadingOperators(true);
        try {
          // Buscar operadores online (mesma lógica do atendimento)
          const operatorsList = await usersService.getOnlineOperators();
          // Remover operador atual da conversa se houver
          // Mas como é supervisão, mostramos todos exceto talvez o atual da conversa
          // Para simplificar, mostramos todos os online disponíveis
          setAvailableOperators(operatorsList);
        } catch (error) {
          console.error('Erro ao carregar operadores:', error);
          toast({
            title: "Erro ao carregar operadores",
            description: "Não foi possível carregar a lista de operadores",
            variant: "destructive",
          });
        } finally {
          setIsLoadingOperators(false);
        }
      };
      loadTransferOperators();
    }
  }, [isTransferDialogOpen, selectedConversation]);

  const handleTransfer = useCallback(async () => {
    if (!selectedConversation || !selectedOperatorId) {
      toast({
        title: "Operador não selecionado",
        description: "Selecione um operador para transferir a conversa",
        variant: "destructive",
      });
      return;
    }

    try {
      // Usar o ID da primeira mensagem da conversa para transferir
      const firstMessage = selectedConversation.messages[0];
      if (!firstMessage) {
        toast({
          title: "Erro",
          description: "Não foi possível identificar a conversa",
          variant: "destructive",
        });
        return;
      }

      await conversationsService.transfer(firstMessage.id, parseInt(selectedOperatorId));

      toast({
        title: "Conversa transferida",
        description: "A conversa foi transferida com sucesso",
      });

      // Fechar dialog e limpar seleção
      setIsTransferDialogOpen(false);
      setSelectedOperatorId("");

      // Atualizar lista
      loadConversations();

      // Limpar seleção
      setSelectedConversation(null);

    } catch (error) {
      toast({
        title: "Erro ao transferir",
        description: error instanceof Error ? error.message : "Erro ao transferir conversa",
        variant: "destructive",
      });
    }
  }, [selectedConversation, selectedOperatorId, loadConversations]);

  return (
    <MainLayout>
      <div className="h-[calc(100vh-6rem)] flex gap-4">
        {/* Conversations List */}
        <GlassCard className="w-80 flex flex-col" padding="none">
          {/* Header */}
          <div className="p-4 border-b border-border/50 space-y-3">
            <h2 className="font-semibold text-foreground">Supervisionar</h2>
            <Select value={selectedOperator} onValueChange={setSelectedOperator}>
              <SelectTrigger>
                <SelectValue placeholder="Todos os Operadores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Operadores</SelectItem>
                {operators.map((op) => (
                  <SelectItem key={op.id} value={op.id.toString()}>{op.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Conversations */}
          <ScrollArea className="flex-1">
            {isLoading ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                <MessageCircle className="h-12 w-12 mb-2 opacity-50" />
                <p className="text-sm">Nenhuma conversa ativa</p>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {filteredConversations.map((conv) => (
                  <button
                    key={conv.contactPhone}
                    onClick={() => setSelectedConversation(conv)}
                    className={cn(
                      "w-full p-3 rounded-xl text-left transition-colors",
                      "hover:bg-primary/5",
                      selectedConversation?.contactPhone === conv.contactPhone && "bg-primary/10"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-cyan flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-medium text-primary-foreground">
                          {conv.contactName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-sm text-foreground truncate">
                            {conv.contactName}
                          </p>
                          <span className="text-xs text-muted-foreground">
                            {formatTime(conv.lastMessageTime)}
                          </span>
                        </div>
                        <p className="text-xs text-warning truncate">Op: {conv.operatorName}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          {conv.isFromContact ? (
                            <ArrowLeft className="h-3 w-3 text-muted-foreground" />
                          ) : (
                            <ArrowRight className="h-3 w-3 text-primary" />
                          )}
                          <p className="text-xs text-muted-foreground truncate">
                            {conv.lastMessage}
                          </p>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </GlassCard>

        {/* Chat Area */}
        <GlassCard className="flex-1 flex flex-col" padding="none">
          {selectedConversation ? (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b border-border/50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-cyan flex items-center justify-center">
                    <span className="text-sm font-medium text-primary-foreground">
                      {selectedConversation.contactName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{selectedConversation.contactName}</p>
                    <p className="text-xs text-muted-foreground">{selectedConversation.contactPhone}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Atendente</p>
                  <p className="text-sm font-medium text-warning">{selectedConversation.operatorName}</p>
                </div>
                <div className="flex gap-2 ml-4">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsTransferDialogOpen(true)}
                    title="Transferir conversa"
                  >
                    <ArrowRightLeft className="h-5 w-5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleDownloadPDF}
                    title="Baixar PDF"
                  >
                    <Download className="h-5 w-5" />
                  </Button>
                </div>
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                  {selectedConversation.messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        "flex gap-2",
                        msg.sender === 'contact' ? "justify-start" : "justify-end"
                      )}
                    >
                      {msg.sender === 'contact' && (
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-medium">
                            {selectedConversation.contactName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                          </span>
                        </div>
                      )}
                      <div
                        className={cn(
                          "max-w-[70%] rounded-2xl px-4 py-2",
                          msg.sender === 'contact'
                            ? "bg-card border border-border"
                            : "bg-primary text-primary-foreground"
                        )}
                      >
                        {/* Renderizar mídia baseado no messageType */}
                        {msg.messageType === 'image' && msg.mediaUrl ? (
                          <div className="mb-2">
                            <img
                              src={msg.mediaUrl.startsWith('http') ? msg.mediaUrl : `${API_URL}${msg.mediaUrl}`}
                              alt="Imagem"
                              className="max-w-full rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                              style={{ maxHeight: '300px' }}
                              onClick={() => window.open(msg.mediaUrl!.startsWith('http') ? msg.mediaUrl! : `${API_URL}${msg.mediaUrl}`, '_blank')}
                            />
                            {msg.message && !msg.message.includes('recebida') && (
                              <p className="text-sm mt-2">{msg.message}</p>
                            )}
                          </div>
                        ) : msg.messageType === 'audio' && msg.mediaUrl ? (
                          <div className="mb-2">
                            <audio
                              controls
                              className="max-w-full"
                              src={msg.mediaUrl.startsWith('http') ? msg.mediaUrl : `${API_URL}${msg.mediaUrl}`}
                            >
                              Seu navegador não suporta áudio.
                            </audio>
                          </div>
                        ) : msg.messageType === 'video' && msg.mediaUrl ? (
                          <div className="mb-2">
                            <video
                              controls
                              className="max-w-full rounded-lg"
                              style={{ maxHeight: '300px' }}
                              src={msg.mediaUrl.startsWith('http') ? msg.mediaUrl : `${API_URL}${msg.mediaUrl}`}
                            >
                              Seu navegador não suporta vídeo.
                            </video>
                            {msg.message && !msg.message.includes('recebido') && (
                              <p className="text-sm mt-2">{msg.message}</p>
                            )}
                          </div>
                        ) : msg.messageType === 'document' && msg.mediaUrl ? (
                          <div className="mb-2">
                            <a
                              href={msg.mediaUrl.startsWith('http') ? msg.mediaUrl : `${API_URL}${msg.mediaUrl}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 text-sm underline hover:no-underline"
                            >
                              <FileText className="h-4 w-4" />
                              {msg.message || 'Documento'}
                            </a>
                          </div>
                        ) : (
                          <p className="text-sm">{msg.message}</p>
                        )}
                        <p className={cn(
                          "text-xs mt-1",
                          msg.sender === 'contact' ? "text-muted-foreground" : "text-primary-foreground/70"
                        )}>
                          {formatTime(msg.datetime)}
                        </p>
                      </div>
                      {msg.sender === 'operator' && (
                        <div className="w-8 h-8 rounded-full bg-warning/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-medium text-warning">OP</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>

              {/* Read Only Banner */}
              <div className="p-3 bg-warning/10 border-t border-warning/30">
                <div className="flex items-center gap-2 justify-center text-warning">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-sm font-medium">Modo supervisão - Somente leitura</span>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
              <MessageCircle className="h-16 w-16 mb-4 opacity-50" />
              <p className="text-lg font-medium">Selecione uma conversa</p>
              <p className="text-sm">Escolha uma conversa para supervisionar</p>
            </div>
          )}
        </GlassCard>
      </div>
      <Dialog open={isTransferDialogOpen} onOpenChange={setIsTransferDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transferir Conversa</DialogTitle>
            <DialogDescription>
              Selecione um operador para transferir esta conversa.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="operator">Operador</Label>
              <Select
                value={selectedOperatorId}
                onValueChange={setSelectedOperatorId}
                disabled={isLoadingOperators}
              >
                <SelectTrigger>
                  <SelectValue placeholder={isLoadingOperators ? "Carregando..." : "Selecione um operador"} />
                </SelectTrigger>
                <SelectContent>
                  {availableOperators.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground">
                      Nenhum operador online disponível
                    </div>
                  ) : (
                    availableOperators.map((op) => (
                      <SelectItem key={op.id} value={op.id.toString()}>
                        {op.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTransferDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleTransfer} disabled={!selectedOperatorId}>
              Transferir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
