import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Send, FileText, MessageCircle, ArrowRight, ArrowLeft, Loader2, Wifi, WifiOff, Edit, UserCheck, X, Check, Phone, AlertTriangle, RefreshCw, Search, Menu, Download, Trash2 } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useNotificationSound } from "@/hooks/useNotificationSound";
import { toast } from "@/hooks/use-toast";
import { conversationsService, tabulationsService, contactsService, templatesService, linesService, usersService, Contact, Conversation as APIConversation, Tabulation, Template, getAuthToken } from "@/services/api";
import { useRealtimeConnection, useRealtimeSubscription } from "@/hooks/useRealtimeConnection";
import { WS_EVENTS, realtimeSocket } from "@/services/websocket";
import { format } from "date-fns";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/contexts/AuthContext";

interface ConversationGroup {
  contactPhone: string;
  contactName: string;
  userLine?: number | null; // Linha da plataforma usada nesta conversa
  lastMessage: string;
  lastMessageTime: string;
  isFromContact: boolean;
  unread?: boolean;
  messages: APIConversation[];
  isTabulated?: boolean; // Indica se a conversa foi tabulada
  tabulationId?: number | null; // ID da tabulação de finalização
}

// Chave única para agrupar conversas: contactPhone + userLine
const getConversationKey = (contactPhone: string, userLine?: number | null): string => {
  return `${contactPhone}-${userLine || 0}`;
};

export default function Atendimento() {
  const { user } = useAuth();

  // API Base URL
  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  const [selectedConversation, setSelectedConversation] = useState<ConversationGroup | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [isNewConversationOpen, setIsNewConversationOpen] = useState(false);
  const [conversations, setConversations] = useState<ConversationGroup[]>([]);
  const [tabulations, setTabulations] = useState<Tabulation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [messageText, setMessageText] = useState<string>("");
  const [newContactName, setNewContactName] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [newContactCpf, setNewContactCpf] = useState("");
  const [newContactContract, setNewContactContract] = useState("");
  const [newContactTemplateId, setNewContactTemplateId] = useState<string>("");
  const [templateVariableValues, setTemplateVariableValues] = useState<Record<string, string>>({});
  const [detectedVariables, setDetectedVariables] = useState<string[]>([]);
  const [availableLines, setAvailableLines] = useState<any[]>([]);
  const [selectedLineId, setSelectedLineId] = useState<string>("");
  const [isLoadingLines, setIsLoadingLines] = useState(false);
  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false);
  const [availableOperators, setAvailableOperators] = useState<any[]>([]);
  const [selectedOperatorId, setSelectedOperatorId] = useState<string>("");
  const [isLoadingOperators, setIsLoadingOperators] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { playMessageSound, playSuccessSound, playErrorSound } = useNotificationSound();
  const { isConnected: isRealtimeConnected } = useRealtimeConnection();

  // Estado para edição de contato
  const [isEditContactOpen, setIsEditContactOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [editContactName, setEditContactName] = useState("");
  const [editContactCpf, setEditContactCpf] = useState("");
  const [editContactContract, setEditContactContract] = useState("");
  const [editContactIsCPC, setEditContactIsCPC] = useState(false);
  const [isSavingContact, setIsSavingContact] = useState(false);
  const previousConversationsRef = useRef<ConversationGroup[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [isWaitingForDelivery, setIsWaitingForDelivery] = useState(false);
  const pendingMessageIdRef = useRef<string | null>(null);

  // Subscribe to message status updates (sent, delivered, read) to clear input
  useRealtimeSubscription('message-status', (data: any) => {
    // Se a mensagem enviada foi confirmada como enviada (sent) ou entregue/lida
    if (data?.messageId && (data.status === 'sent' || data.status === 'delivered' || data.status === 'read')) {
      // Verificar se é a mensagem que estamos aguardando
      if (pendingMessageIdRef.current === data.messageId) {
        console.log('[Atendimento] Mensagem confirmada pelo webhook, limpando input');
        setMessageText("");
        setIsWaitingForDelivery(false);
        pendingMessageIdRef.current = null;
        playSuccessSound();

        // Recarregar conversas para atualizar status visual
        loadConversations();
      }
    }
  });

  // Estado para filtro de conversas
  type FilterType = 'todas' | 'stand-by' | 'atendimento' | 'finalizadas';
  const [conversationFilter, setConversationFilter] = useState<FilterType>('atendimento');

  // Estado para pesquisa de tabulação
  const [tabulationSearch, setTabulationSearch] = useState("");

  // Estado para notificação de linha banida
  const [lineBannedNotification, setLineBannedNotification] = useState<{
    bannedLinePhone: string;
    newLinePhone: string | null;
    contactsToRecall: Array<{ phone: string; name: string }>;
    message: string;
  } | null>(null);
  const [isRecallingContact, setIsRecallingContact] = useState<string | null>(null);

  // Estado para controlar visibilidade da sidebar em mobile
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Estado para deletar conversa
  const [isDeletingConversation, setIsDeletingConversation] = useState(false);

  // Subscribe to new messages in real-time
  useRealtimeSubscription(WS_EVENTS.NEW_MESSAGE, (data: any) => {
    console.log('[Atendimento] New message received:', data);

    if (data.message) {
      const newMsg = data.message as APIConversation;

      // IGNORAR MENSAGENS ENVIADAS PELO PRÓPRIO USUÁRIO (sender !== 'contact')
      // Elas serão adicionadas apenas quando recebermos o status 'sent' ou 'delivered'
      // Isso evita que mensagens que falharam (ex: 24h) apareçam no chat
      if (newMsg.sender === 'contact') {
        const msgKey = getConversationKey(newMsg.contactPhone, newMsg.userLine);
        console.log(`[Atendimento] Mensagem recebida de CONTATO: contactPhone=${newMsg.contactPhone}, userLine=${newMsg.userLine}`);

        // ... (resto do código de processamento de mensagem recebida)
      } else {
        console.log('[Atendimento] Mensagem enviada por mim (via new_message), ignorando para aguardar confirmação do webhook.');
        return;
      }

      const msgKey = getConversationKey(newMsg.contactPhone, newMsg.userLine);
      console.log(`[Atendimento] Mensagem: contactPhone=${newMsg.contactPhone}, userLine=${newMsg.userLine}, msgKey=${msgKey}`);

      // Play sound for incoming messages
      if (newMsg.sender === 'contact') {
        playMessageSound();
      }

      setConversations(prev => {
        console.log(`[Atendimento] Conversas atuais: ${prev.length}, keys=[${prev.map(c => getConversationKey(c.contactPhone, c.userLine)).join(', ')}]`);
        const existing = prev.find(c => getConversationKey(c.contactPhone, c.userLine) === msgKey);
        console.log(`[Atendimento] Conversa encontrada: ${existing ? 'SIM' : 'NÃO'}`);

        if (existing) {
          // Add message to existing conversation
          const updated = prev.map(conv => {
            if (getConversationKey(conv.contactPhone, conv.userLine) === msgKey) {
              console.log(`[Atendimento] Adicionando mensagem à conversa existente`);
              return {
                ...conv,
                messages: [...conv.messages, newMsg].sort((a, b) =>
                  new Date(a.datetime).getTime() - new Date(b.datetime).getTime()
                ),
                lastMessage: newMsg.message,
                lastMessageTime: newMsg.datetime,
                isFromContact: newMsg.sender === 'contact',
              };
            }
            return conv;
          });
          console.log(`[Atendimento] Ordenando conversas, timestamps: ${updated.map(c => `${c.contactPhone.slice(-4)}:${c.lastMessageTime}`).join(', ')}`);
          const sorted = updated.sort((a, b) =>
            new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime()
          );
          console.log(`[Atendimento] Após ordenação: ${sorted.map(c => c.contactPhone.slice(-4)).join(', ')}`);
          return sorted;
        } else {
          // Create new conversation group
          console.log(`[Atendimento] Criando nova conversa`);
          const newGroup: ConversationGroup = {
            contactPhone: newMsg.contactPhone,
            contactName: newMsg.contactName,
            userLine: newMsg.userLine,
            lastMessage: newMsg.message,
            lastMessageTime: newMsg.datetime,
            isFromContact: newMsg.sender === 'contact',
            messages: [newMsg],
            unread: true,
          };
          return [newGroup, ...prev];
        }
      });

      // Update selected conversation if it's the same contact+line (usando ref)
      if (selectedConvKeyRef.current === msgKey) {
        setSelectedConversation(prev => {
          if (!prev) return null;
          return {
            ...prev,
            messages: [...prev.messages, newMsg].sort((a, b) =>
              new Date(a.datetime).getTime() - new Date(b.datetime).getTime()
            ),
            lastMessage: newMsg.message,
            lastMessageTime: newMsg.datetime,
            isFromContact: newMsg.sender === 'contact',
          };
        });
      }
    }
  }, [playMessageSound]); // Removido selectedConversation da dependência

  // Subscribe to message sent confirmation
  useRealtimeSubscription('message-sent', (data: any) => {
    console.log('[Atendimento] Message sent confirmation:', data);
    if (data?.message) {
      // Adicionar mensagem à conversa ativa
      const newMsg = data.message as APIConversation;

      // Mostrar toast de sucesso
      playSuccessSound();
      toast({
        title: "Mensagem enviada",
        description: "Sua mensagem foi enviada com sucesso",
      });

      // Se estava criando nova conversa, fechar dialog e limpar campos
      if (isNewConversationOpen) {
        closeNewConversationModal();
      }

      setConversations(prev => {
        const sentKey = getConversationKey(newMsg.contactPhone, newMsg.userLine);
        const existing = prev.find(c => getConversationKey(c.contactPhone, c.userLine) === sentKey);

        if (existing) {
          return prev.map(conv => {
            if (getConversationKey(conv.contactPhone, conv.userLine) === sentKey) {
              return {
                ...conv,
                messages: [...conv.messages, newMsg].sort((a, b) =>
                  new Date(a.datetime).getTime() - new Date(b.datetime).getTime()
                ),
                lastMessage: newMsg.message,
                lastMessageTime: newMsg.datetime,
                isFromContact: false,
              };
            }
            return conv;
          }).sort((a, b) =>
            new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime()
          );
        } else {
          // Nova conversa criada
          const newGroup: ConversationGroup = {
            contactPhone: newMsg.contactPhone,
            contactName: newMsg.contactName,
            userLine: newMsg.userLine,
            lastMessage: newMsg.message,
            lastMessageTime: newMsg.datetime,
            isFromContact: false,
            messages: [newMsg],
          };
          return [newGroup, ...prev];
        }
      });

      // Atualizar conversa selecionada se for a mesma (usando ref)
      const sentMsgKey = getConversationKey(newMsg.contactPhone, newMsg.userLine);
      if (selectedConvKeyRef.current === sentMsgKey) {
        setSelectedConversation(prev => {
          if (!prev) return null;
          return {
            ...prev,
            messages: [...prev.messages, newMsg].sort((a, b) =>
              new Date(a.datetime).getTime() - new Date(b.datetime).getTime()
            ),
            lastMessage: newMsg.message,
            lastMessageTime: newMsg.datetime,
          };
        });
      }
    }
  }, [playSuccessSound, isNewConversationOpen]);

  // Subscribe to message errors (bloqueios CPC, repescagem, etc)
  useRealtimeSubscription('message-error', (data: any) => {
    console.log('[Atendimento] Message error received:', data);
    playErrorSound();

    // Se houver erro, liberar o input se estiver travado
    setIsWaitingForDelivery(false);
    pendingMessageIdRef.current = null;

    // Novo formato: data.type e data.message (para erros como 24h)
    if (data?.type === '24h_window_expired') {
      toast({
        title: "Janela de 24h expirada",
        description: data.message || "Use um template para reativar a conversa.",
        variant: "destructive",
        duration: 10000,
      });
      return;
    }

    // Formato antigo: data.error como string
    if (data?.error) {
      // Determinar título baseado no tipo de erro
      let title = "Mensagem bloqueada";
      if (data.error.includes('CPC')) {
        title = "Bloqueio de CPC";
      } else if (data.error.includes('repescagem') || data.error.includes('Aguarde')) {
        title = "Bloqueio de Repescagem";
      } else if (data.error.includes('permissão')) {
        title = "Sem permissão";
      }

      toast({
        title,
        description: data.error,
        variant: "destructive",
        duration: data.hoursRemaining ? 8000 : 5000, // Mostrar por mais tempo se tiver horas restantes
      });
    }
  }, [playErrorSound]);

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      // Tentar encontrar o viewport do ScrollArea para rolar diretamente
      // Isso evita que o scrollIntoView role a página inteira (window)
      const viewport = messagesEndRef.current.closest('[data-radix-scroll-area-viewport]');
      if (viewport) {
        viewport.scrollTo({
          top: viewport.scrollHeight,
          behavior: "smooth"
        });
      } else {
        // Fallback caso o seletor mude ou não seja encontrado
        messagesEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
      }
    }
  };



  // Ref para armazenar a chave da conversa selecionada (contactPhone+userLine)
  const selectedConvKeyRef = useRef<string | null>(null);

  // Atualizar ref quando selectedConversation mudar
  useEffect(() => {
    selectedConvKeyRef.current = selectedConversation
      ? getConversationKey(selectedConversation.contactPhone, selectedConversation.userLine)
      : null;
  }, [selectedConversation?.contactPhone, selectedConversation?.userLine]);

  const loadConversations = useCallback(async () => {
    try {
      // Carregar tanto conversas ativas quanto tabuladas para ter todos os dados
      const [activeData, tabulatedData] = await Promise.all([
        conversationsService.getActive(),
        conversationsService.getTabulated().catch(() => []), // Se falhar, retorna array vazio
      ]);

      // Combinar todos os dados
      const allData = [...activeData, ...tabulatedData];

      // Group conversations by contact phone + userLine (cada linha é um chat separado)
      const groupedMap = new Map<string, ConversationGroup>();

      allData.forEach((conv) => {
        const convKey = getConversationKey(conv.contactPhone, conv.userLine);
        const existing = groupedMap.get(convKey);
        const isTabulated = conv.tabulation !== null && conv.tabulation !== undefined;

        if (existing) {
          existing.messages.push(conv);
          // Update last message if this one is more recent
          const convTime = new Date(conv.datetime).getTime();
          const existingTime = new Date(existing.lastMessageTime).getTime();
          if (convTime > existingTime) {
            existing.lastMessage = conv.message;
            existing.lastMessageTime = conv.datetime;
            existing.isFromContact = conv.sender === 'contact';
            // IMPORTANTE: Conversa é tabulada se a ÚLTIMA mensagem for tabulada, não qualquer mensagem
            existing.isTabulated = isTabulated;
            if (isTabulated && conv.tabulation) {
              existing.tabulationId = conv.tabulation;
            } else if (!isTabulated) {
              // Se a última mensagem não é tabulada, limpar tabulationId
              existing.isTabulated = false;
              existing.tabulationId = undefined;
            }
          }
        } else {
          groupedMap.set(convKey, {
            contactPhone: conv.contactPhone,
            contactName: conv.contactName,
            userLine: conv.userLine,
            lastMessage: conv.message,
            lastMessageTime: conv.datetime,
            isFromContact: conv.sender === 'contact',
            isTabulated: isTabulated,
            tabulationId: conv.tabulation,
            messages: [conv],
          });
        }
      });

      // Sort messages within each group and groups by last message time
      let groups = Array.from(groupedMap.values()).map(group => ({
        ...group,
        messages: group.messages.sort((a, b) =>
          new Date(a.datetime).getTime() - new Date(b.datetime).getTime()
        ),
      })).sort((a, b) =>
        new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime()
      );

      // Aplicar filtro
      // Stand-by: operador enviou última mensagem E mais de 6 horas sem resposta do cliente
      // Atendimento: cliente enviou última mensagem OU operador respondeu há menos de 6 horas
      const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

      if (conversationFilter !== 'todas') {
        groups = groups.filter(group => {
          if (conversationFilter === 'finalizadas') {
            return group.isTabulated === true;
          }
          // Para stand-by e atendimento, só mostrar não tabuladas
          if (group.isTabulated === true) {
            return false;
          }

          const lastMessageTime = new Date(group.lastMessageTime).getTime();
          const timeSinceLastMessage = Date.now() - lastMessageTime;

          if (conversationFilter === 'stand-by') {
            // Stand By: última mensagem foi do operador E mais de 6 horas sem resposta
            return group.isFromContact === false && timeSinceLastMessage > SIX_HOURS_MS;
          }
          if (conversationFilter === 'atendimento') {
            // Atendimento: 
            // - última mensagem foi do cliente, OU
            // - operador respondeu há menos de 6 horas (aguardando cliente responder)
            return group.isFromContact === true ||
              (group.isFromContact === false && timeSinceLastMessage <= SIX_HOURS_MS);
          }
          return true;
        });
      }

      setConversations(groups);

      // Update selected conversation if it exists (usando ref para evitar loop)
      const currentSelectedKey = selectedConvKeyRef.current;
      if (currentSelectedKey) {
        const updated = groups.find(g => getConversationKey(g.contactPhone, g.userLine) === currentSelectedKey);
        if (updated) {
          setSelectedConversation(updated);
        }
      }
    } catch (error) {
      console.error('Error loading conversations:', error);
    } finally {
      setIsLoading(false);
    }
  }, [conversationFilter]); // Adicionar conversationFilter como dependência

  // Subscribe to line reallocation (depois de loadConversations estar definido)
  useRealtimeSubscription('line-reallocated', (data: any) => {
    console.log('[Atendimento] Line reallocated:', data);
    if (data?.newLinePhone) {
      playSuccessSound();
      toast({
        title: "Linha realocada",
        description: data.message || `Nova linha ${data.newLinePhone} foi atribuída automaticamente.`,
        duration: 8000,
      });

      // Recarregar conversas para atualizar com a nova linha
      setTimeout(() => {
        loadConversations();
      }, 1000);
    }
  }, [playSuccessSound, loadConversations]);

  const loadTabulations = useCallback(async () => {
    try {
      const data = await tabulationsService.list();
      setTabulations(data);
    } catch (error) {
      console.error('Error loading tabulations:', error);
    }
  }, []);

  // Carregar dados do contato para edição
  const openEditContact = useCallback(async () => {
    if (!selectedConversation) return;

    try {
      const contact = await contactsService.getByPhone(selectedConversation.contactPhone);
      if (contact) {
        setEditingContact(contact);
        setEditContactName(contact.name);
        setEditContactCpf(contact.cpf || "");
        setEditContactContract(contact.contract || "");
        setEditContactIsCPC(contact.isCPC || false);
        setIsEditContactOpen(true);
      } else {
        // Contato não existe, criar com dados básicos
        setEditingContact(null);
        setEditContactName(selectedConversation.contactName);
        setEditContactCpf("");
        setEditContactContract("");
        setEditContactIsCPC(false);
        setIsEditContactOpen(true);
      }
    } catch (error) {
      console.error('Error loading contact:', error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar os dados do contato",
        variant: "destructive",
      });
    }
  }, [selectedConversation]);

  // Salvar alterações do contato
  const handleSaveContact = useCallback(async () => {
    if (!selectedConversation) return;

    setIsSavingContact(true);
    try {
      const updateData = {
        name: editContactName.trim(),
        cpf: editContactCpf.trim() || undefined,
        contract: editContactContract.trim() || undefined,
        isCPC: editContactIsCPC,
      };

      if (editingContact) {
        await contactsService.updateByPhone(selectedConversation.contactPhone, updateData);
      } else {
        // Criar contato se não existir
        await contactsService.create({
          name: editContactName.trim(),
          phone: selectedConversation.contactPhone,
          cpf: editContactCpf.trim() || undefined,
          contract: editContactContract.trim() || undefined,
          isCPC: editContactIsCPC,
          segment: user?.segmentId,
        });
      }

      // Atualizar nome na conversa selecionada
      if (editContactName.trim() !== selectedConversation.contactName) {
        setSelectedConversation(prev => prev ? {
          ...prev,
          contactName: editContactName.trim(),
        } : null);

        // Atualizar na lista de conversas
        setConversations(prev => prev.map(c =>
          c.contactPhone === selectedConversation.contactPhone
            ? { ...c, contactName: editContactName.trim() }
            : c
        ));
      }

      playSuccessSound();
      toast({
        title: "Contato atualizado",
        description: editContactIsCPC ? "Contato marcado como CPC" : "Dados salvos com sucesso",
      });
      setIsEditContactOpen(false);
    } catch (error) {
      playErrorSound();
      toast({
        title: "Erro ao salvar",
        description: error instanceof Error ? error.message : "Erro ao salvar contato",
        variant: "destructive",
      });
    } finally {
      setIsSavingContact(false);
    }
  }, [selectedConversation, editingContact, editContactName, editContactCpf, editContactContract, editContactIsCPC, user, playSuccessSound, playErrorSound]);

  const loadTemplates = useCallback(async () => {
    if (!user?.segmentId) return;
    setIsLoadingTemplates(true);
    try {
      const data = await templatesService.getBySegment(user.segmentId);
      setTemplates(data.filter(t => t.status === 'APPROVED')); // Apenas templates aprovados
    } catch (error) {
      console.error('Error loading templates:', error);
    } finally {
      setIsLoadingTemplates(false);
    }
  }, [user?.segmentId]);

  // Carregar templates filtrados pela linha selecionada
  const loadTemplatesByLine = useCallback(async (lineId: string) => {
    if (!lineId) return;
    setIsLoadingTemplates(true);
    try {
      const data = await templatesService.getByLine(parseInt(lineId));
      setTemplates(data.filter(t => t.status === 'APPROVED')); // Apenas templates aprovados
    } catch (error) {
      console.error('Error loading templates by line:', error);
      toast({
        title: "Erro ao carregar templates",
        description: "Não foi possível carregar os templates desta linha",
        variant: "destructive",
      });
    } finally {
      setIsLoadingTemplates(false);
    }
  }, []);

  const loadAvailableLines = useCallback(async () => {
    if (!user?.segmentId) return;
    setIsLoadingLines(true);
    try {
      const data = await linesService.getBySegment(user.segmentId);
      setAvailableLines(data);
      // Selecionar primeira linha por padrão se não tiver nenhuma selecionada
      if (data.length > 0) {
        setSelectedLineId(prev => prev || data[0].id.toString());
      }
    } catch (error) {
      console.error('Error loading lines:', error);
      toast({
        title: "Erro ao carregar linhas",
        description: "Não foi possível carregar as linhas disponíveis",
        variant: "destructive",
      });
    } finally {
      setIsLoadingLines(false);
    }
  }, [user?.segmentId]);

  useEffect(() => {
    loadConversations();
    loadTabulations();
    loadTemplates();
    loadAvailableLines();
  }, [loadConversations, loadTabulations, loadTemplates, loadAvailableLines]);

  // Carregar linhas disponíveis quando o modal abrir
  useEffect(() => {
    if (isNewConversationOpen && user?.segmentId) {
      const loadLines = async () => {
        setIsLoadingLines(true);
        try {
          const data = await linesService.getBySegment(user.segmentId);
          setAvailableLines(data);
          // Selecionar primeira linha por padrão se não tiver nenhuma selecionada
          if (data.length > 0 && !selectedLineId) {
            setSelectedLineId(data[0].id.toString());
          }
        } catch (error) {
          console.error('Error loading lines:', error);
          toast({
            title: "Erro ao carregar linhas",
            description: "Não foi possível carregar as linhas disponíveis",
            variant: "destructive",
          });
        } finally {
          setIsLoadingLines(false);
        }
      };
      loadLines();
    }
  }, [isNewConversationOpen, user?.segmentId, selectedLineId]);

  // Carregar templates quando linha mudar no modal de nova conversa
  useEffect(() => {
    if (selectedLineId && isNewConversationOpen) {
      const loadTemplates = async () => {
        setIsLoadingTemplates(true);
        try {
          const data = await templatesService.getByLine(parseInt(selectedLineId));
          setTemplates(data.filter(t => t.status === 'APPROVED'));
        } catch (error) {
          console.error('Error loading templates by line:', error);
          toast({
            title: "Erro ao carregar templates",
            description: "Não foi possível carregar os templates desta linha",
            variant: "destructive",
          });
        } finally {
          setIsLoadingTemplates(false);
        }
      };
      loadTemplates();
    }
  }, [selectedLineId, isNewConversationOpen]);

  // Detectar desconexão do WebSocket e sugerir atualização
  useEffect(() => {
    if (!isRealtimeConnected) {
      // Mostrar toast informando sobre desconexão após 5 segundos
      const timeout = setTimeout(() => {
        toast({
          title: "Conexão perdida",
          description: "A conexão com o servidor foi perdida. Atualize a página para reconectar.",
          variant: "destructive",
          duration: 10000,
          action: (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.location.reload()}
            >
              Atualizar
            </Button>
          ),
        });
      }, 5000);

      return () => clearTimeout(timeout);
    }
  }, [isRealtimeConnected]);

  // Poll for new messages only if WebSocket not connected
  useEffect(() => {
    if (isRealtimeConnected) {
      console.log('[Atendimento] WebSocket connected, polling disabled');
      return;
    }

    console.log('[Atendimento] WebSocket not connected, using polling fallback');
    const interval = setInterval(() => {
      loadConversations();
    }, 5000);

    return () => clearInterval(interval);
  }, [loadConversations, isRealtimeConnected]);

  useEffect(() => {
    scrollToBottom();
  }, [selectedConversation?.messages]);

  // Função para determinar o tipo de mídia baseado no mimetype
  const getMessageTypeFromMime = (mimeType: string): 'image' | 'video' | 'audio' | 'document' => {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    return 'document';
  };

  // Função para fazer upload de arquivo
  const handleFileUpload = useCallback(async (file: File) => {
    if (!selectedConversation || isUploadingFile) return;

    setIsUploadingFile(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const token = getAuthToken();
      if (!token) {
        throw new Error('Não autenticado');
      }

      const response = await fetch(`${API_BASE_URL}/media/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Erro ao fazer upload do arquivo');
      }

      const data = await response.json();
      const messageType = getMessageTypeFromMime(data.mimeType);
      const mediaUrl = data.mediaUrl.startsWith('http') ? data.mediaUrl : `${API_BASE_URL}${data.mediaUrl}`;

      // Upload de arquivo removido - no 1x1 apenas templates podem ser enviados
      toast({
        title: "Upload não disponível",
        description: "No 1x1, apenas templates podem ser enviados",
        variant: "default",
      });
      toast({
        title: "Arquivo enviado",
        description: "Arquivo enviado com sucesso",
      });
    } catch (error) {
      console.error('Erro ao fazer upload:', error);
      playErrorSound();
      toast({
        title: "Erro ao enviar arquivo",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsUploadingFile(false);
      // Limpar input de arquivo
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [selectedConversation, isUploadingFile, isRealtimeConnected, playErrorSound]);

  // Handler para seleção de arquivo
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  }, [handleFileUpload]);

  // Verificar se pode enviar mensagem livre (não precisa de template)
  const canSendFreeMessage = useCallback((conversation: ConversationGroup | null): boolean => {
    if (!conversation) return false;

    // Verificar se há mensagens do operador na conversa
    const hasOperatorMessages = conversation.messages.some(msg => msg.sender === 'operator');

    // Verificar se a conversa foi iniciada pelo cliente (primeira mensagem é do cliente)
    const isInbound = conversation.messages.length > 0 && conversation.messages[0]?.sender === 'contact';

    // Pode enviar mensagem livre se:
    // 1. Já há mensagens do operador (não é primeira mensagem), OU
    // 2. A conversa foi iniciada pelo cliente (inbound - janela de 24h da Meta)
    return hasOperatorMessages || isInbound;
  }, []);

  const handleSendMessage = useCallback(async () => {
    if (!messageText.trim() || !selectedConversation || isSending) {
      if (!messageText.trim()) {
        toast({
          title: "Mensagem vazia",
          description: "Digite uma mensagem para enviar",
          variant: "destructive",
        });
      }
      return;
    }

    // Verificar se pode enviar mensagem livre
    if (!canSendFreeMessage(selectedConversation)) {
      toast({
        title: "Template obrigatório",
        description: "A primeira mensagem deve ser um template aprovado",
        variant: "destructive",
      });
      return;
    }

    setIsSending(true);

    // Enviar mensagem livre via WebSocket com acknowledgement
    realtimeSocket.emit('send-message', {
      contactPhone: selectedConversation.contactPhone,
      message: messageText.trim(),
      messageType: 'text',
      isNewConversation: false, // Já existe conversa
    }, (response: any) => {
      setIsSending(false);

      if (response?.success) {
        // SUCESSO NO ENVIO PARA META (mas ainda não confirmado pelo webhook)
        // Não limpamos o input ainda, aguardamos o webhook
        // Salvamos o ID da mensagem para comparar depois
        console.log('[Atendimento] Mensagem enviada para API, aguardando webhook. ID:', response.conversation?.messageId);

        if (response.conversation?.messageId) {
          pendingMessageIdRef.current = response.conversation.messageId;
          setIsWaitingForDelivery(true);

          // Fallback: Se não receber confirmação em 10 segundos, liberar
          setTimeout(() => {
            if (pendingMessageIdRef.current === response.conversation.messageId) {
              console.log('[Atendimento] Timeout aguardando webhook, liberando input');
              setIsWaitingForDelivery(false);
              pendingMessageIdRef.current = null;
              // Não limpamos o texto, pois pode ter falhado silenciosamente
            }
          }, 10000);
        } else {
          // Se não veio ID (caso raro), limpamos logo
          setMessageText("");
          playSuccessSound();
          loadConversations();
        }

      } else {
        // Erro retornado pelo backend (ex: erro síncrono da API)
        playErrorSound();
        const errorMessage = response?.error || "Erro ao enviar mensagem";

        toast({
          title: "Erro ao enviar mensagem",
          description: errorMessage,
          variant: "destructive",
        });
      }
    });

  }, [messageText, selectedConversation, isSending, isWaitingForDelivery, canSendFreeMessage, playSuccessSound, playErrorSound, loadConversations, toast]);

  const handleSendTemplate = useCallback(async () => {
    if (!selectedTemplateId || !selectedConversation || isSending) {
      if (!selectedTemplateId) {
        toast({
          title: "Template obrigatório",
          description: "Selecione um template para enviar",
          variant: "destructive",
        });
      }
      return;
    }

    // Obter linha da conversa atual
    const conversationLine = selectedConversation.messages.find(m => m.userLine)?.userLine;
    if (!conversationLine) {
      toast({
        title: "Erro",
        description: "Não foi possível identificar a linha desta conversa",
        variant: "destructive",
      });
      return;
    }

    setIsSending(true);

    try {
      // Enviar template via API REST (templates são enviados via API, não WebSocket)
      await templatesService.send({
        templateId: parseInt(selectedTemplateId),
        phone: selectedConversation.contactPhone,
        contactName: selectedConversation.contactName,
        lineId: conversationLine,
      });

      playSuccessSound();
      toast({
        title: "Template enviado",
        description: "Template enviado com sucesso",
      });

      setSelectedTemplateId(""); // Limpar seleção
      await loadConversations();
    } catch (error) {
      playErrorSound();
      toast({
        title: "Erro ao enviar template",
        description: error instanceof Error ? error.message : "Erro ao enviar template",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  }, [selectedTemplateId, selectedConversation, isSending, playSuccessSound, playErrorSound, loadConversations]);

  const handleTabulate = useCallback(async (tabulationId: number) => {
    if (!selectedConversation) return;

    try {
      // Passar userLine para tabular apenas esta conversa específica (não outras do mesmo contato)
      await conversationsService.tabulate(
        selectedConversation.contactPhone,
        tabulationId,
        selectedConversation.userLine ?? undefined
      );
      playSuccessSound();
      toast({
        title: "Conversa tabulada",
        description: "A conversa foi tabulada com sucesso",
      });

      // Remove apenas esta conversa específica (usando chave composta)
      const convKey = getConversationKey(selectedConversation.contactPhone, selectedConversation.userLine);
      setConversations(prev => prev.filter(c => getConversationKey(c.contactPhone, c.userLine) !== convKey));
      setSelectedConversation(null);
    } catch (error) {
      playErrorSound();
      toast({
        title: "Erro ao tabular",
        description: error instanceof Error ? error.message : "Erro ao tabular conversa",
        variant: "destructive",
      });
    }
  }, [selectedConversation, playSuccessSound, playErrorSound]);

  // Carregar operadores quando o dialog de transferência abrir
  useEffect(() => {
    if (isTransferDialogOpen && selectedConversation) {
      const loadOperators = async () => {
        setIsLoadingOperators(true);
        try {
          // Buscar operadores online do mesmo segmento
          const segment = user?.segmentId || selectedConversation.messages[0]?.segment;
          const operators = await usersService.getOnlineOperators(segment || undefined);
          // Filtrar o operador atual se houver
          const filtered = operators.filter(op => op.id !== user?.id);
          setAvailableOperators(filtered);
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
      loadOperators();
    }
  }, [isTransferDialogOpen, selectedConversation, user]);

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

      playSuccessSound();
      toast({
        title: "Conversa transferida",
        description: "A conversa foi transferida com sucesso",
      });

      // Fechar dialog e limpar seleção
      setIsTransferDialogOpen(false);
      setSelectedOperatorId("");

      // Remover conversa da lista atual (ela será atribuída ao novo operador)
      setConversations(prev => prev.filter(c => c.contactPhone !== selectedConversation.contactPhone));
      setSelectedConversation(null);

      // Recarregar conversas após um delay
      setTimeout(() => {
        loadConversations();
      }, 500);
    } catch (error) {
      playErrorSound();
      toast({
        title: "Erro ao transferir",
        description: error instanceof Error ? error.message : "Erro ao transferir conversa",
        variant: "destructive",
      });
    }
  }, [selectedConversation, selectedOperatorId, playSuccessSound, playErrorSound, loadConversations, user]);

  // Função para deletar conversa (apenas admin e digital)
  const handleDeleteConversation = useCallback(async () => {
    if (!selectedConversation) return;
    if (isDeletingConversation) return;

    // Confirmação antes de deletar
    const confirmed = window.confirm(
      `Tem certeza que deseja deletar TODAS as mensagens do contato ${selectedConversation.contactName} (${selectedConversation.contactPhone})?\n\nEsta ação não pode ser desfeita!`
    );

    if (!confirmed) return;

    setIsDeletingConversation(true);
    try {
      const token = getAuthToken();
      if (!token) {
        throw new Error('Não autenticado');
      }

      const response = await fetch(`${API_BASE_URL}/conversations/contact/${encodeURIComponent(selectedConversation.contactPhone)}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Erro ao deletar conversa');
      }

      const result = await response.json();

      playSuccessSound();
      toast({
        title: "Conversa deletada",
        description: `${result.deleted} mensagens deletadas com sucesso`,
      });

      // Remover conversa da lista
      setConversations(prev => prev.filter(c => c.contactPhone !== selectedConversation.contactPhone));
      setSelectedConversation(null);

      // Recarregar conversas
      setTimeout(() => {
        loadConversations();
      }, 500);
    } catch (error) {
      playErrorSound();
      toast({
        title: "Erro ao deletar",
        description: error instanceof Error ? error.message : "Erro ao deletar conversa",
        variant: "destructive",
      });
    } finally {
      setIsDeletingConversation(false);
    }
  }, [selectedConversation, isDeletingConversation, playSuccessSound, playErrorSound, loadConversations]);


  // Função para fechar modal e limpar estados
  const closeNewConversationModal = useCallback(() => {
    setIsNewConversationOpen(false);
    setNewContactName("");
    setNewContactPhone("");
    setNewContactCpf("");
    setNewContactContract("");
    setNewContactTemplateId("");
    setSelectedLineId("");
    setNewContactTemplateId("");
    setSelectedLineId("");
    setTemplateVariableValues({});
    setDetectedVariables([]);
  }, []);

  // Detect variables when template changes
  useEffect(() => {
    console.log('🔍 [Atendimento] useEffect triggered - newContactTemplateId:', newContactTemplateId);
    console.log('🔍 [Atendimento] templates count:', templates.length);
    if (newContactTemplateId) {
      const template = templates.find(t => t.id === parseInt(newContactTemplateId));
      console.log('🔍 [Atendimento] Found template:', template ? { id: template.id, name: template.name, bodyText: template.bodyText?.substring(0, 100) } : 'NOT FOUND');
      if (template) {
        let allVars: { key: string; label: string; isHeader: boolean }[] = [];

        // 1. Detect Header Variables
        if (template.headerType === 'TEXT' && template.headerContent) {
          const headerMatches = template.headerContent.match(/{{\s*[\w\d]+\s*}}/g);
          if (headerMatches) {
            headerMatches.forEach((m: string) => {
              const varName = m.replace(/[{}]/g, '').trim();
              // Backend expects keys starting with 'header' to place them in header component
              allVars.push({
                key: `header_${varName}`,
                label: `Cabeçalho: ${varName}`,
                isHeader: true
              });
            });
          }
        }

        // 2. Detect Body Variables
        if (template.bodyText) {
          const bodyMatches = template.bodyText.match(/{{\s*[\w\d]+\s*}}/g);
          if (bodyMatches) {
            bodyMatches.forEach((m: string) => {
              const varName = m.replace(/[{}]/g, '').trim();
              // Body variables don't need prefix, but we must ensure they don't start with 'header' or 'button' unintentionally
              // Usually they are numbers just like '1'
              allVars.push({
                key: varName,
                label: `Corpo: ${varName}`,
                isHeader: false
              });
            });
          }
        }

        // Remove duplicates based on KEY
        const uniqueVars = Array.from(new Map(allVars.map(v => [v.key, v])).values());
        const varKeys = uniqueVars.map(v => v.key);
        console.log('🔍 [Atendimento] Setting detectedVariables:', varKeys);
        setDetectedVariables(varKeys);
        setTemplateVariableValues({});
      } else {
        setDetectedVariables([]);
      }
    } else {
      setDetectedVariables([]);
    }
  }, [newContactTemplateId, templates]);

  const handleNewConversation = useCallback(async () => {
    console.log('🔍 [Atendimento] handleNewConversation - detectedVariables:', detectedVariables);
    console.log('🔍 [Atendimento] handleNewConversation - templateVariableValues:', templateVariableValues);
    if (!newContactName.trim() || !newContactPhone.trim()) {
      toast({
        title: "Campos obrigatórios",
        description: "Nome e telefone são obrigatórios",
        variant: "destructive",
      });
      return;
    }

    if (!selectedLineId) {
      toast({
        title: "Linha obrigatória",
        description: "Selecione uma linha para enviar o template",
        variant: "destructive",
      });
      return;
    }

    if (!newContactTemplateId) {
      toast({
        title: "Template obrigatório",
        description: "Selecione um template para enviar",
        variant: "destructive",
      });
      return;
    }

    // Validar que operador tem permissão para 1x1
    if (!user?.oneToOneActive) {
      toast({
        title: "Sem permissão",
        description: "Você não tem permissão para iniciar conversas 1x1",
        variant: "destructive",
      });
      return;
    }

    try {
      // Primeiro, criar ou atualizar o contato
      try {
        await contactsService.create({
          name: newContactName.trim(),
          phone: newContactPhone.trim(),
          cpf: newContactCpf.trim() || undefined,
          contract: newContactContract.trim() || undefined,
          segment: user.segmentId,
        });
      } catch {
        // Contato pode já existir, ignorar erro
      }

      // Map variable values to format expected by backend
      const variables = detectedVariables
        .map(key => ({
          key,
          value: templateVariableValues[key] || ''
        }));

      // Validate that all detected variables have values
      const emptyVars = variables.filter(v => v.value.trim() === '');
      if (emptyVars.length > 0) {
        toast({
          title: "Variáveis obrigatórias",
          description: `Preencha todas as variáveis do template: ${emptyVars.map(v => v.key).join(', ')}`,
          variant: "destructive",
        });
        return;
      }

      // Enviar template imediatamente
      await templatesService.send({
        templateId: parseInt(newContactTemplateId),
        phone: newContactPhone.trim(),
        contactName: newContactName.trim(),
        lineId: parseInt(selectedLineId),
        variables: variables
      });

      playSuccessSound();
      toast({
        title: "Conversa criada",
        description: "Template enviado com sucesso",
      });

      await loadConversations();

      // Fechar dialog e limpar campos
      closeNewConversationModal();

      // Aguardar um pouco e selecionar a nova conversa
      // Aguardar um pouco e selecionar a nova conversa
      setTimeout(async () => {
        await loadConversations();
        const updated = await conversationsService.getActive();

        // Encontrar a conversa correta usando telefone E linha
        const targetLineId = parseInt(selectedLineId);
        const newConv = updated.find(c =>
          c.contactPhone === newContactPhone.trim() &&
          c.userLine === targetLineId
        );

        if (newConv) {
          const grouped: ConversationGroup = {
            contactPhone: newConv.contactPhone,
            contactName: newConv.contactName,
            userLine: newConv.userLine,
            lastMessage: newConv.message,
            lastMessageTime: newConv.datetime,
            isFromContact: newConv.sender === 'contact',
            messages: [newConv],
            unread: false,
          };
          setSelectedConversation(grouped);
        }
      }, 1000);
    } catch (error) {
      playErrorSound();
      toast({
        title: "Erro ao criar conversa",
        description: error instanceof Error ? error.message : "Erro ao criar conversa",
        variant: "destructive",
      });
    }
  }, [newContactName, newContactPhone, newContactCpf, newContactContract, newContactTemplateId, selectedLineId, user, playSuccessSound, playErrorSound, loadConversations, detectedVariables, templateVariableValues, closeNewConversationModal, toast]);

  const formatTime = (datetime: string) => {
    try {
      return format(new Date(datetime), 'dd/MM HH:mm');
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

  return (
    <MainLayout>
      <div className="h-[calc(100vh-6rem)] flex flex-col md:flex-row gap-4 relative">
        {/* Mobile: Botão para abrir sidebar */}
        {!selectedConversation && !isSidebarOpen && (
          <Button
            variant="outline"
            size="icon"
            className="md:hidden fixed top-20 left-4 z-50"
            onClick={() => setIsSidebarOpen(true)}
          >
            <Menu className="h-4 w-4" />
          </Button>
        )}

        {/* Mobile: Overlay para fechar sidebar */}
        {isSidebarOpen && !selectedConversation && (
          <div
            className="md:hidden fixed inset-0 bg-background/80 backdrop-blur-sm z-30"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Conversations List */}
        <GlassCard className={cn(
          "flex flex-col transition-transform duration-300",
          "w-full md:w-80",
          "fixed md:relative inset-0 md:inset-auto z-40 md:z-auto",
          (!selectedConversation || isSidebarOpen) ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )} padding="none">
          {/* Header */}
          <div className="p-4 border-b border-border/50">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {/* Mobile: Botão para fechar sidebar */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden h-8 w-8"
                  onClick={() => {
                    setSelectedConversation(null);
                    setIsSidebarOpen(true);
                  }}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <h2 className="font-semibold text-foreground">Atendimentos</h2>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${isRealtimeConnected
                        ? 'bg-success/10 text-success'
                        : 'bg-muted text-muted-foreground'
                        }`}>
                        {isRealtimeConnected ? (
                          <Wifi className="h-3 w-3" />
                        ) : (
                          <WifiOff className="h-3 w-3" />
                        )}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      {isRealtimeConnected
                        ? 'Conectado em tempo real'
                        : 'WebSocket desconectado - Atualize a página'}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.location.reload()}
                className="h-8 w-8 p-0"
                title="Atualizar página"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Dialog open={isNewConversationOpen} onOpenChange={setIsNewConversationOpen}>
                <DialogTrigger asChild>
                  <Button size="icon" className="h-8 w-8">
                    <Plus className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Nova Conversa</DialogTitle>
                    <DialogDescription>
                      Inicie uma nova conversa com um contato
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Nome *</Label>
                      <Input
                        id="name"
                        placeholder="Nome do contato"
                        value={newContactName}
                        onChange={(e) => setNewContactName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Telefone *</Label>
                      <Input
                        id="phone"
                        placeholder="+55 11 99999-9999"
                        value={newContactPhone}
                        onChange={(e) => setNewContactPhone(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cpf">CPF</Label>
                      <Input
                        id="cpf"
                        placeholder="000.000.000-00"
                        value={newContactCpf}
                        onChange={(e) => setNewContactCpf(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="contract">Contrato</Label>
                      <Input
                        id="contract"
                        placeholder="Número do contrato"
                        value={newContactContract}
                        onChange={(e) => setNewContactContract(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="line">Linha * (escolha a linha do seu segmento)</Label>
                      <Select
                        value={selectedLineId}
                        onValueChange={setSelectedLineId}
                        disabled={isLoadingLines}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={isLoadingLines ? "Carregando linhas..." : "Selecione uma linha"} />
                        </SelectTrigger>
                        <SelectContent>
                          {availableLines.length === 0 ? (
                            <div className="p-2 text-sm text-muted-foreground">
                              Nenhuma linha disponível
                            </div>
                          ) : (
                            availableLines.map((line) => (
                              <SelectItem key={line.id} value={line.id.toString()}>
                                {line.phone}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Escolha a linha que será usada para enviar a mensagem. Os templates disponíveis serão filtrados pela linha escolhida.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="new-template">Template * (apenas templates da linha selecionada)</Label>
                      <Select
                        value={newContactTemplateId}
                        onValueChange={setNewContactTemplateId}
                        disabled={isLoadingTemplates}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={isLoadingTemplates ? "Carregando templates..." : "Selecione um template"} />
                        </SelectTrigger>
                        <SelectContent>
                          {templates.length === 0 ? (
                            <div className="p-2 text-sm text-muted-foreground">
                              Nenhum template disponível
                            </div>
                          ) : (
                            templates.map((template) => (
                              <SelectItem key={template.id} value={template.id.toString()}>
                                {template.name}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        A primeira mensagem deve SEMPRE ser um template. Ele será enviado automaticamente ao criar a conversa.
                      </p>
                      <p className="text-xs text-muted-foreground">
                        A primeira mensagem deve SEMPRE ser um template. Ele será enviado automaticamente ao criar a conversa.
                      </p>
                    </div>

                    {detectedVariables.length > 0 && (
                      <div className="space-y-3 border rounded-md p-3 bg-muted/20">
                        <Label className="text-sm font-semibold">Variáveis do Template</Label>
                        {detectedVariables.map((variable) => (
                          <div key={variable} className="space-y-1">
                            <Label htmlFor={`var-${variable}`} className="text-xs">
                              Valor para {'{{'}{variable}{'}}'}
                            </Label>
                            <Input
                              id={`var-${variable}`}
                              placeholder={`Digite o valor para ${variable}`}
                              value={templateVariableValues[variable] || ''}
                              onChange={(e) => setTemplateVariableValues({
                                ...templateVariableValues,
                                [variable]: e.target.value
                              })}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={closeNewConversationModal}>
                      Cancelar
                    </Button>
                    <Button onClick={handleNewConversation} disabled={!newContactTemplateId || !selectedLineId}>
                      Criar e Enviar Template
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {/* Botões de Filtro */}
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant={conversationFilter === 'atendimento' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setConversationFilter('atendimento')}
              >
                Atendimento
              </Button>
              <Button
                variant={conversationFilter === 'stand-by' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setConversationFilter('stand-by')}
              >
                Stand By
              </Button>
              <Button
                variant={conversationFilter === 'finalizadas' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setConversationFilter('finalizadas')}
              >
                Finalizadas
              </Button>
              <Button
                variant={conversationFilter === 'todas' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setConversationFilter('todas')}
              >
                Todas
              </Button>
            </div>
          </div>

          {/* Conversations */}
          <ScrollArea className="flex-1">
            {isLoading ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                <MessageCircle className="h-12 w-12 mb-2 opacity-50" />
                <p className="text-sm">Nenhuma conversa ativa</p>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {conversations.map((conv) => (
                  <button
                    key={getConversationKey(conv.contactPhone, conv.userLine)}
                    onClick={() => {
                      setSelectedConversation(conv);
                      setIsSidebarOpen(false); // Fechar sidebar em mobile quando conversa é selecionada
                    }}
                    className={cn(
                      "w-full p-3 rounded-xl text-left transition-colors",
                      "hover:bg-primary/5",
                      selectedConversation?.contactPhone === conv.contactPhone &&
                      selectedConversation?.userLine === conv.userLine &&
                      "bg-primary/10"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-cyan flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-medium text-primary-foreground">
                          {conv.contactName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col">
                          <div className="flex items-center justify-between">
                            <p className="font-medium text-sm text-foreground truncate">
                              {conv.contactName}
                            </p>
                            <span className="text-xs text-muted-foreground">
                              {formatTime(conv.lastMessageTime)}
                            </span>
                          </div>
                          {conv.userLine && (
                            <span className="text-[10px] text-primary/80 font-medium">
                              {availableLines.find(l => l.id === conv.userLine)?.name || availableLines.find(l => l.id === conv.userLine)?.phone || `Linha ${conv.userLine}`}
                            </span>
                          )}
                        </div>
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
                        {/* Exibir tabulação para conversas finalizadas */}
                        {conv.isTabulated && conv.tabulationId && (
                          <div className="mt-1">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/20 text-emerald-400">
                              <FileText className="h-2.5 w-2.5" />
                              {tabulations.find(t => t.id === conv.tabulationId)?.name || `Tab. #${conv.tabulationId}`}
                            </span>
                          </div>
                        )}
                      </div>
                      {conv.unread && (
                        <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-2" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </GlassCard>

        {/* Chat Area */}
        <GlassCard className={cn(
          "flex-1 flex flex-col",
          selectedConversation ? "flex" : "hidden md:flex"
        )} padding="none">
          {selectedConversation ? (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b border-border/50 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-3">
                  {/* Mobile: Botão voltar */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="md:hidden h-8 w-8"
                    onClick={() => {
                      setSelectedConversation(null);
                      setIsSidebarOpen(true);
                    }}
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-cyan flex items-center justify-center">
                    <span className="text-sm font-medium text-primary-foreground">
                      {selectedConversation.contactName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{selectedConversation.contactName}</p>
                    <p className="text-xs text-muted-foreground">{selectedConversation.contactPhone}</p>
                  </div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={openEditContact}>
                          <Edit className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Editar Contato</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  {(user?.role === 'admin' || user?.role === 'digital' || user?.role === 'supervisor') && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleDownloadPDF}>
                            <Download className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Baixar conversa em PDF</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  {(user?.role === 'admin' || user?.role === 'digital') && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={handleDeleteConversation}
                            disabled={isDeletingConversation}
                          >
                            {isDeletingConversation ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Deletar conversa</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
                <div className="flex gap-2">
                  {(user?.role === 'supervisor' || user?.role === 'admin' || user?.role === 'digital') && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsTransferDialogOpen(true)}
                    >
                      Transferir
                    </Button>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        Tabular
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64">
                      <div className="p-2 border-b" onClick={(e) => e.stopPropagation()}>
                        <div className="relative">
                          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="Pesquisar tabulação..."
                            value={tabulationSearch}
                            onChange={(e) => setTabulationSearch(e.target.value)}
                            className="pl-8 h-8"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      </div>
                      <div className="max-h-64 overflow-y-auto">
                        {tabulations
                          .filter((tab) =>
                            tab.name.toLowerCase().includes(tabulationSearch.toLowerCase())
                          )
                          .map((tab) => (
                            <DropdownMenuItem key={tab.id} onClick={() => handleTabulate(tab.id)}>
                              {tab.name}
                            </DropdownMenuItem>
                          ))}
                        {tabulations.filter((tab) =>
                          tab.name.toLowerCase().includes(tabulationSearch.toLowerCase())
                        ).length === 0 && (
                            <DropdownMenuItem disabled>
                              {tabulationSearch ? 'Nenhuma tabulação encontrada' : 'Nenhuma tabulação disponível'}
                            </DropdownMenuItem>
                          )}
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Modal de Edição de Contato */}
              <Dialog open={isEditContactOpen} onOpenChange={setIsEditContactOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Editar Contato</DialogTitle>
                    <DialogDescription>
                      Edite as informações do contato
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-name">Nome</Label>
                      <Input
                        id="edit-name"
                        placeholder="Nome do contato"
                        value={editContactName}
                        onChange={(e) => setEditContactName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-cpf">CPF</Label>
                      <Input
                        id="edit-cpf"
                        placeholder="000.000.000-00"
                        value={editContactCpf}
                        onChange={(e) => setEditContactCpf(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-contract">Contrato</Label>
                      <Input
                        id="edit-contract"
                        placeholder="Número do contrato"
                        value={editContactContract}
                        onChange={(e) => setEditContactContract(e.target.value)}
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <Label className="text-base font-medium">Marcar como CPC</Label>
                        <p className="text-sm text-muted-foreground">
                          Contato foi contatado com sucesso
                        </p>
                      </div>
                      <Switch
                        checked={editContactIsCPC}
                        onCheckedChange={setEditContactIsCPC}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsEditContactOpen(false)}>
                      Cancelar
                    </Button>
                    <Button onClick={handleSaveContact} disabled={isSavingContact}>
                      {isSavingContact ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Salvando...
                        </>
                      ) : (
                        <>
                          <Check className="mr-2 h-4 w-4" />
                          Salvar
                        </>
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Dialog de Transferência */}
              <Dialog open={isTransferDialogOpen} onOpenChange={setIsTransferDialogOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Transferir Conversa</DialogTitle>
                    <DialogDescription>
                      Selecione o operador para quem deseja transferir esta conversa
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="operator">Operador *</Label>
                      <Select
                        value={selectedOperatorId}
                        onValueChange={setSelectedOperatorId}
                        disabled={isLoadingOperators}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={isLoadingOperators ? "Carregando operadores..." : "Selecione um operador"} />
                        </SelectTrigger>
                        <SelectContent>
                          {availableOperators.length === 0 ? (
                            <div className="p-2 text-sm text-muted-foreground">
                              Nenhum operador online disponível
                            </div>
                          ) : (
                            availableOperators.map((operator) => (
                              <SelectItem key={operator.id} value={operator.id.toString()}>
                                {operator.name}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Apenas operadores online do mesmo segmento são exibidos
                      </p>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => {
                      setIsTransferDialogOpen(false);
                      setSelectedOperatorId("");
                    }}>
                      Cancelar
                    </Button>
                    <Button onClick={handleTransfer} disabled={!selectedOperatorId}>
                      Transferir
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

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
                              src={msg.mediaUrl.startsWith('http') ? msg.mediaUrl : `${API_BASE_URL}${msg.mediaUrl}`}
                              alt="Imagem"
                              className="max-w-full rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                              style={{ maxHeight: '300px' }}
                              onClick={() => window.open(msg.mediaUrl!.startsWith('http') ? msg.mediaUrl! : `${API_BASE_URL}${msg.mediaUrl}`, '_blank')}
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
                              src={msg.mediaUrl.startsWith('http') ? msg.mediaUrl : `${API_BASE_URL}${msg.mediaUrl}`}
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
                              src={msg.mediaUrl.startsWith('http') ? msg.mediaUrl : `${API_BASE_URL}${msg.mediaUrl}`}
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
                              href={msg.mediaUrl.startsWith('http') ? msg.mediaUrl : `${API_BASE_URL}${msg.mediaUrl}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 text-sm underline hover:no-underline"
                            >
                              <FileText className="h-4 w-4" />
                              {msg.message || 'Documento'}
                            </a>
                          </div>
                        ) : (
                          <div>
                            {msg.messageType === 'template' && (
                              <div className={cn(
                                "text-xs font-medium mb-1 flex items-center gap-1",
                                msg.sender === 'contact' ? "text-muted-foreground" : "text-primary-foreground/80"
                              )}>
                                <FileText className="h-3 w-3" />
                                Template
                              </div>
                            )}
                            <p className="text-sm">{msg.message.replace(/^template:\s*/i, '')}</p>
                          </div>
                        )}
                        <p className={cn(
                          "text-xs mt-1",
                          msg.sender === 'contact' ? "text-muted-foreground" : "text-primary-foreground/70"
                        )}>
                          {formatTime(msg.datetime)}
                        </p>
                      </div>
                      {msg.sender === 'operator' && (
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-cyan flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-medium text-primary-foreground">OP</span>
                        </div>
                      )}
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* Message Input */}
              <div className="p-4 border-t border-border/50 flex-shrink-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                {selectedConversation && canSendFreeMessage(selectedConversation) ? (
                  // Mensagem livre (quando já há mensagens do operador ou é inbound)
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Textarea
                        value={messageText}
                        onChange={(e) => setMessageText(e.target.value)}
                        placeholder="Digite sua mensagem..."
                        disabled={isSending || !selectedConversation}
                        rows={3}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSendMessage();
                          }
                        }}
                        className="flex-1 resize-none"
                      />
                      <Button
                        size="icon"
                        onClick={handleSendMessage}
                        disabled={isSending || !messageText.trim()}
                        className="self-end"
                      >
                        {isSending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Você também pode enviar um template usando o seletor abaixo
                    </p>
                    <Select
                      value={selectedTemplateId}
                      onValueChange={setSelectedTemplateId}
                      disabled={isSending || isLoadingTemplates}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={isLoadingTemplates ? "Carregando templates..." : "Ou selecione um template (opcional)"} />
                      </SelectTrigger>
                      <SelectContent>
                        {templates.length === 0 ? (
                          <div className="p-2 text-sm text-muted-foreground">
                            Nenhum template disponível
                          </div>
                        ) : (
                          templates.map((template) => (
                            <SelectItem key={template.id} value={template.id.toString()}>
                              {template.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    {selectedTemplateId && (
                      <Button
                        onClick={handleSendTemplate}
                        disabled={isSending || !selectedTemplateId || isLoadingTemplates}
                        className="w-full"
                        variant="outline"
                      >
                        {isSending ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Enviando...
                          </>
                        ) : (
                          <>
                            <Send className="h-4 w-4 mr-2" />
                            Enviar Template
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                ) : (
                  // Template obrigatório (primeira mensagem outbound)
                  <div className="space-y-2">
                    <Select
                      value={selectedTemplateId}
                      onValueChange={setSelectedTemplateId}
                      disabled={isSending || isLoadingTemplates || !selectedConversation}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={isLoadingTemplates ? "Carregando templates..." : "Selecione um template (obrigatório)"} />
                      </SelectTrigger>
                      <SelectContent>
                        {templates.length === 0 ? (
                          <div className="p-2 text-sm text-muted-foreground">
                            Nenhum template disponível
                          </div>
                        ) : (
                          templates.map((template) => (
                            <SelectItem key={template.id} value={template.id.toString()}>
                              {template.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <Button
                      onClick={handleSendTemplate}
                      disabled={isSending || !selectedTemplateId || isLoadingTemplates}
                      className="w-full"
                    >
                      {isSending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Enviando...
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4 mr-2" />
                          Enviar Template
                        </>
                      )}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      A primeira mensagem deve ser um template aprovado. Após isso, você poderá enviar mensagens livres.
                    </p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
              <MessageCircle className="h-16 w-16 mb-4 opacity-50" />
              <p className="text-lg font-medium">Selecione uma conversa</p>
              <p className="text-sm">Escolha uma conversa para começar o atendimento</p>
            </div>
          )}
        </GlassCard>
      </div>

      {/* Dialog de Notificação de Linha Banida */}
      <Dialog open={!!lineBannedNotification} onOpenChange={(open) => !open && setLineBannedNotification(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Linha Banida
            </DialogTitle>
            <DialogDescription>
              {lineBannedNotification?.message}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm font-medium mb-1">Linha banida:</p>
              <p className="text-sm text-muted-foreground">{lineBannedNotification?.bannedLinePhone}</p>
              {lineBannedNotification?.newLinePhone && (
                <>
                  <p className="text-sm font-medium mt-3 mb-1">Nova linha atribuída:</p>
                  <p className="text-sm text-success">{lineBannedNotification.newLinePhone}</p>
                </>
              )}
            </div>

            {lineBannedNotification && lineBannedNotification.contactsToRecall.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-3">
                  Contatos para rechamar ({lineBannedNotification.contactsToRecall.length}):
                </p>
                <ScrollArea className="h-[300px] pr-4">
                  <div className="space-y-2">
                    {lineBannedNotification.contactsToRecall.map((contact) => (
                      <div
                        key={contact.phone}
                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex-1">
                          <p className="text-sm font-medium">{contact.name}</p>
                          <p className="text-xs text-muted-foreground">{contact.phone}</p>
                        </div>
                        <Button
                          size="sm"
                          onClick={async () => {
                            if (isRecallingContact === contact.phone) return;

                            setIsRecallingContact(contact.phone);
                            try {
                              await conversationsService.recallContact(contact.phone);
                              toast({
                                title: "✅ Contato rechamado",
                                description: `Conversa reiniciada com ${contact.name}`,
                              });

                              // Recarregar conversas
                              await loadConversations();

                              // Selecionar a conversa recém-criada
                              await loadConversations();
                              // Usar setTimeout para garantir que o estado foi atualizado
                              setTimeout(() => {
                                setConversations(prev => {
                                  const found = prev.find(c => c.contactPhone === contact.phone);
                                  if (found) {
                                    setSelectedConversation(found);
                                  }
                                  return prev;
                                });
                              }, 100);

                              // Remover da lista de contatos para rechamar
                              setLineBannedNotification(prev => {
                                if (!prev) return null;
                                const updated = prev.contactsToRecall.filter(c => c.phone !== contact.phone);
                                if (updated.length === 0) {
                                  return null; // Fechar dialog se não houver mais contatos
                                }
                                return { ...prev, contactsToRecall: updated };
                              });
                            } catch (error) {
                              toast({
                                title: "Erro ao rechamar contato",
                                description: error instanceof Error ? error.message : "Erro desconhecido",
                                variant: "destructive",
                              });
                            } finally {
                              setIsRecallingContact(null);
                            }
                          }}
                          disabled={isRecallingContact === contact.phone || !!isRecallingContact}
                        >
                          {isRecallingContact === contact.phone ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Rechamando...
                            </>
                          ) : (
                            <>
                              <Phone className="mr-2 h-4 w-4" />
                              Rechamar
                            </>
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}

            {lineBannedNotification && lineBannedNotification.contactsToRecall.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum contato para rechamar.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setLineBannedNotification(null)}
            >
              Fechar
            </Button>
            {lineBannedNotification && lineBannedNotification.contactsToRecall.length > 0 && (
              <Button
                onClick={async () => {
                  // Rechamar todos os contatos
                  if (!lineBannedNotification) return;

                  const contacts = [...lineBannedNotification.contactsToRecall];
                  for (const contact of contacts) {
                    try {
                      setIsRecallingContact(contact.phone);
                      await conversationsService.recallContact(contact.phone);
                      await new Promise(resolve => setTimeout(resolve, 500)); // Pequeno delay entre chamadas
                    } catch (error) {
                      console.error(`Erro ao rechamar ${contact.phone}:`, error);
                    } finally {
                      setIsRecallingContact(null);
                    }
                  }

                  toast({
                    title: "✅ Contatos rechamados",
                    description: `${contacts.length} contato(s) rechamado(s) com sucesso`,
                  });

                  await loadConversations();
                  setLineBannedNotification(null);
                }}
                disabled={!!isRecallingContact}
              >
                {isRecallingContact ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Rechamando todos...
                  </>
                ) : (
                  <>
                    <Phone className="mr-2 h-4 w-4" />
                    Rechamar Todos
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout >
  );
}
