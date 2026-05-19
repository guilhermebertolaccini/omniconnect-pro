import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { wpApi, APIError } from '@/services/wordpress-api';
import type { Bot, ConversationFlow, Conversation, Message, WhatsAppConfig } from '@/types/bot';
import type { 
  MetaAccount, 
  MetaAccountCreateInput, 
  MetaAccountUpdateInput,
  AINodeConfig,
  AINodeConfigInput,
  WebhookLog,
  WebhookLogFilters,
} from '@/types/api';
import { toast } from 'sonner';

// ============= Query Keys =============

export const queryKeys = {
  bots: ['bots'] as const,
  bot: (id: string) => ['bots', id] as const,
  flows: (botId?: string) => ['flows', botId] as const,
  flow: (id: string) => ['flows', 'detail', id] as const,
  conversations: (botId?: string) => ['conversations', botId] as const,
  messages: (conversationId: string) => ['messages', conversationId] as const,
  whatsappConfig: (botId: string) => ['whatsapp-config', botId] as const,
  metaAccounts: ['meta-accounts'] as const,
  metaAccount: (id: number) => ['meta-accounts', id] as const,
  aiConfigs: (flowId: string) => ['ai-configs', flowId] as const,
  aiConfig: (flowId: string, nodeId: string) => ['ai-configs', flowId, nodeId] as const,
  webhookLogs: (filters: WebhookLogFilters) => ['webhook-logs', filters] as const,
  health: ['health'] as const,
};

// ============= Bot Hooks =============

export function useBots() {
  return useQuery({
    queryKey: queryKeys.bots,
    queryFn: () => wpApi.getBots(),
    staleTime: 30000,
  });
}

export function useBot(id: string) {
  return useQuery({
    queryKey: queryKeys.bot(id),
    queryFn: () => wpApi.getBot(id),
    enabled: !!id,
  });
}

export function useCreateBot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (bot: Omit<Bot, 'id' | 'createdAt'>) => wpApi.createBot(bot),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bots });
      toast.success('Bot criado com sucesso!');
    },
    onError: (error) => {
      toast.error(error instanceof APIError ? error.message : 'Erro ao criar bot');
    },
  });
}

export function useUpdateBot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Bot> }) =>
      wpApi.updateBot(id, updates),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bots });
      queryClient.invalidateQueries({ queryKey: queryKeys.bot(id) });
      toast.success('Bot atualizado!');
    },
    onError: (error) => {
      toast.error(error instanceof APIError ? error.message : 'Erro ao atualizar bot');
    },
  });
}

export function useDeleteBot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => wpApi.deleteBot(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bots });
      toast.success('Bot excluído!');
    },
    onError: (error) => {
      toast.error(error instanceof APIError ? error.message : 'Erro ao excluir bot');
    },
  });
}

// ============= Flow Hooks =============

export function useFlows(botId?: string) {
  return useQuery({
    queryKey: queryKeys.flows(botId),
    queryFn: () => wpApi.getFlows(botId),
    staleTime: 30000,
  });
}

export function useFlow(id: string) {
  return useQuery({
    queryKey: queryKeys.flow(id),
    queryFn: () => wpApi.getFlow(id),
    enabled: !!id,
  });
}

export function useCreateFlow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (flow: Omit<ConversationFlow, 'id' | 'createdAt' | 'updatedAt'>) =>
      wpApi.createFlow(flow),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.flows(variables.botId) });
      toast.success('Fluxo criado!');
    },
    onError: (error) => {
      toast.error(error instanceof APIError ? error.message : 'Erro ao criar fluxo');
    },
  });
}

export function useUpdateFlow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<ConversationFlow> }) =>
      wpApi.updateFlow(id, updates),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.flows() });
      queryClient.invalidateQueries({ queryKey: queryKeys.flow(id) });
      toast.success('Fluxo salvo!');
    },
    onError: (error) => {
      toast.error(error instanceof APIError ? error.message : 'Erro ao salvar fluxo');
    },
  });
}

export function useDeleteFlow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => wpApi.deleteFlow(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.flows() });
      toast.success('Fluxo excluído!');
    },
    onError: (error) => {
      toast.error(error instanceof APIError ? error.message : 'Erro ao excluir fluxo');
    },
  });
}

// ============= Conversation & Message Hooks =============

export function useConversations(botId?: string) {
  return useQuery({
    queryKey: queryKeys.conversations(botId),
    queryFn: async () => {
      const response = await wpApi.getConversations(botId);
      return response.data;
    },
    staleTime: 10000,
  });
}

export function useMessages(conversationId: string) {
  return useQuery({
    queryKey: queryKeys.messages(conversationId),
    queryFn: async () => {
      const response = await wpApi.getMessages(conversationId);
      return response.data;
    },
    enabled: !!conversationId,
    staleTime: 5000,
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ conversationId, content }: { conversationId: string; content: string }) =>
      wpApi.sendMessage(conversationId, content),
    onSuccess: (_, { conversationId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.messages(conversationId) });
    },
    onError: (error) => {
      toast.error(error instanceof APIError ? error.message : 'Erro ao enviar mensagem');
    },
  });
}

// ============= WhatsApp Config Hooks =============

export function useWhatsAppConfig(botId: string) {
  return useQuery({
    queryKey: queryKeys.whatsappConfig(botId),
    queryFn: () => wpApi.getWhatsAppConfig(botId),
    enabled: !!botId,
  });
}

export function useUpdateWhatsAppConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ botId, config }: { botId: string; config: Partial<WhatsAppConfig> }) =>
      wpApi.updateWhatsAppConfig(botId, config),
    onSuccess: (_, { botId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.whatsappConfig(botId) });
      toast.success('Configuração salva!');
    },
    onError: (error) => {
      toast.error(error instanceof APIError ? error.message : 'Erro ao salvar configuração');
    },
  });
}

// ============= Meta Account Hooks =============

export function useMetaAccounts() {
  return useQuery({
    queryKey: queryKeys.metaAccounts,
    queryFn: () => wpApi.getMetaAccounts(),
    staleTime: 60000,
  });
}

export function useCreateMetaAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (account: MetaAccountCreateInput) => wpApi.createMetaAccount(account),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.metaAccounts });
      toast.success('Conta Meta conectada!');
    },
    onError: (error) => {
      toast.error(error instanceof APIError ? error.message : 'Erro ao conectar conta');
    },
  });
}

export function useUpdateMetaAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: MetaAccountUpdateInput }) =>
      wpApi.updateMetaAccount(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.metaAccounts });
      toast.success('Conta atualizada!');
    },
    onError: (error) => {
      toast.error(error instanceof APIError ? error.message : 'Erro ao atualizar conta');
    },
  });
}

export function useDeleteMetaAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => wpApi.deleteMetaAccount(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.metaAccounts });
      toast.success('Conta removida!');
    },
    onError: (error) => {
      toast.error(error instanceof APIError ? error.message : 'Erro ao remover conta');
    },
  });
}

// ============= AI Config Hooks =============

export function useAIConfigs(flowId: string) {
  return useQuery({
    queryKey: queryKeys.aiConfigs(flowId),
    queryFn: () => wpApi.getAIConfigs(flowId),
    enabled: !!flowId,
  });
}

export function useAIConfig(flowId: string, nodeId: string) {
  return useQuery({
    queryKey: queryKeys.aiConfig(flowId, nodeId),
    queryFn: () => wpApi.getAIConfig(flowId, nodeId),
    enabled: !!flowId && !!nodeId,
  });
}

export function useSaveAIConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      flowId,
      nodeId,
      config,
    }: {
      flowId: string;
      nodeId: string;
      config: AINodeConfigInput;
    }) => wpApi.saveAIConfig(flowId, nodeId, config),
    onSuccess: (_, { flowId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.aiConfigs(flowId) });
      toast.success('Configuração de IA salva!');
    },
    onError: (error) => {
      toast.error(error instanceof APIError ? error.message : 'Erro ao salvar configuração');
    },
  });
}

// ============= Webhook Logs Hooks =============

export function useWebhookLogs(filters: WebhookLogFilters = {}) {
  return useQuery({
    queryKey: queryKeys.webhookLogs(filters),
    queryFn: () => wpApi.getWebhookLogs(filters),
    staleTime: 10000,
  });
}

// ============= Health Check =============

export function useHealthCheck() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: () => wpApi.checkHealth(),
    staleTime: 60000,
    retry: false,
  });
}
