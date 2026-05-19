import { useState, useEffect, useCallback } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { NumberCard } from '@/components/chips/NumberCard';
import { BusinessOverview } from '@/components/chips/BusinessOverview';
import { MessageAnalyticsPanel } from '@/components/chips/MessageAnalyticsPanel';
import { ConnectNumberDialog, ConnectNumberData } from '@/components/chips/ConnectNumberDialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { 
  Plus, 
  RefreshCw, 
  Phone, 
  Building2, 
  BarChart3, 
  Settings2,
  CheckCircle2,
  XCircle,
  Loader2,
  Key,
  AlertTriangle,
  Bell,
  Server,
  Webhook,
} from 'lucide-react';
import { toast } from 'sonner';
import { AlertsPanel } from '@/components/chips/AlertsPanel';
import { EvolutionPanel } from '@/components/chips/EvolutionPanel';
import { AccountSelector } from '@/components/chips/AccountSelector';
import { WebhookConfigPanel } from '@/components/chips/WebhookConfigPanel';
import { MetaWebhookLogsPanel } from '@/components/chips/MetaWebhookLogsPanel';
import { alertService } from '@/services/alert-service';
import { ApiProvider } from '@/types/evolution';
import { metaGraphAPI } from '@/services/meta-graph-api';
import { metaAccountsService, MetaAccount } from '@/services/meta-accounts-service';
import type {
  WhatsAppNumber,
  BusinessManager,
  WABA,
  MessageAnalytics,
  DeliveryMetrics,
  FailureReason,
  SpamReport,
} from '@/types/whatsapp';

// Storage keys
const STORAGE_KEYS = {
  accessToken: 'meta_access_token',
  businessManagerId: 'meta_business_manager_id',
  businessManagerName: 'meta_business_manager_name',
};

// Generate mock analytics for fallback
const generateMockAnalytics = (): MessageAnalytics[] => 
  Array.from({ length: 30 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (29 - i));
    const sent = Math.floor(Math.random() * 500) + 200;
    const delivered = Math.floor(sent * (0.85 + Math.random() * 0.1));
    const read = Math.floor(delivered * (0.6 + Math.random() * 0.2));
    const failed = sent - delivered;
    return {
      date: date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      sent,
      delivered,
      read,
      failed,
      pending: Math.floor(Math.random() * 20),
    };
  });

const generateMockSpamReports = (): SpamReport[] =>
  Array.from({ length: 14 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (13 - i));
    return {
      date: date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      reportsReceived: Math.floor(Math.random() * 10),
      blockedUsers: Math.floor(Math.random() * 5),
      qualityImpact: ['NONE', 'LOW', 'MEDIUM'][Math.floor(Math.random() * 3)] as SpamReport['qualityImpact'],
    };
  });

const Chips = () => {
  // State for multi-account support
  const [activeAccount, setActiveAccount] = useState<MetaAccount | null>(() => 
    metaAccountsService.getActiveAccount()
  );
  
  // Legacy state for form (used when adding new account via config tab)
  const [accessToken, setAccessToken] = useState('');
  const [businessManagerId, setBusinessManagerId] = useState('');
  const [businessManagerName, setBusinessManagerName] = useState('');
  const [isConnected, setIsConnected] = useState(() => !!metaAccountsService.getActiveAccount());
  const [connectionName, setConnectionName] = useState(() => 
    metaAccountsService.getActiveAccount()?.name || ''
  );
  const [isTestingConnection, setIsTestingConnection] = useState(false);

  // State for data
  const [numbers, setNumbers] = useState<WhatsAppNumber[]>([]);
  const [businessManagers, setBusinessManagers] = useState<BusinessManager[]>([]);
  const [wabas, setWabas] = useState<WABA[]>([]);
  const [analytics, setAnalytics] = useState<MessageAnalytics[]>([]);
  const [metrics, setMetrics] = useState<DeliveryMetrics>({
    totalSent: 0,
    totalDelivered: 0,
    totalRead: 0,
    totalFailed: 0,
    deliveryRate: 0,
    readRate: 0,
    failureRate: 0,
  });
  const [failureReasons, setFailureReasons] = useState<FailureReason[]>([]);
  const [spamReports, setSpamReports] = useState<SpamReport[]>([]);

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false);
  const [selectedNumber, setSelectedNumber] = useState<WhatsAppNumber | null>(null);
  const [viewingAnalytics, setViewingAnalytics] = useState<WhatsAppNumber | null>(null);
  const [activeTab, setActiveTab] = useState('config');
  const [apiProvider, setApiProvider] = useState<ApiProvider>(() => {
    const saved = localStorage.getItem('whatsapp_api_provider');
    return (saved as ApiProvider) || 'meta';
  });

  const loadDataFromAPI = useCallback(async (bmId?: string) => {
    const targetBmId = bmId || activeAccount?.businessManagerId || businessManagerId;
    if (!targetBmId) return;

    setIsLoading(true);
    try {
      const data = await metaGraphAPI.getAllData(targetBmId);

      setBusinessManagers(data.businessManagers);
      setWabas(data.wabas);
      setNumbers(data.phoneNumbers);

      const active = metaAccountsService.getActiveAccount();
      if (active && data.phoneNumbers.length > 0) {
        await metaAccountsService.updateAccount(active.id, {
          phoneNumberIds: data.phoneNumbers.map((p) => p.id),
          metaWabaAccountId: data.wabas[0]?.id ?? active.metaWabaAccountId,
        });
      }

      if (data.phoneNumbers.length > 0) {
        const triggeredAlerts = await alertService.checkAndTriggerAlerts(data.phoneNumbers);
        if (triggeredAlerts.length > 0) {
          toast.warning(`${triggeredAlerts.length} alerta(s) disparado(s)!`, {
            description: 'Verifique a aba de Alertas',
          });
        }
      }

      if (data.wabas.length > 0) {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);

        const analyticsData = await metaGraphAPI.getMessageAnalytics(
          data.wabas[0].id,
          startDate,
          endDate,
        );

        if (analyticsData.analytics.length > 0) {
          setAnalytics(analyticsData.analytics);
          setMetrics(analyticsData.metrics);
        } else {
          setAnalytics(generateMockAnalytics());
        }

        const failures = await metaGraphAPI.getTemplateAnalytics(data.wabas[0].id);
        if (failures.length > 0) {
          setFailureReasons(failures);
        }
      }

      setSpamReports(generateMockSpamReports());
      toast.success('Dados atualizados com sucesso!');
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Erro ao carregar dados da API Meta');
    } finally {
      setIsLoading(false);
    }
  }, [activeAccount, businessManagerId]);

  // Handle account change
  const handleAccountChange = useCallback(async (account: MetaAccount) => {
    try {
      const token =
        account.accessToken && !account.accessToken.startsWith('••')
          ? account.accessToken
          : await metaAccountsService.getAccessTokenForGraph(account.id);
      const withToken = { ...account, accessToken: token };
      setActiveAccount(withToken);
      setIsConnected(true);
      setConnectionName(account.name);
      metaGraphAPI.setAccessToken(token);
      metaGraphAPI.clearCache();
      await loadDataFromAPI(account.businessManagerId);
    } catch {
      toast.error('Erro ao carregar conta Meta');
    }
  }, [loadDataFromAPI]);

  const handleAccountAdded = useCallback((account: MetaAccount) => {
    handleAccountChange(account);
    setActiveTab('numbers');
    // Clear form
    setAccessToken('');
    setBusinessManagerId('');
    setBusinessManagerName('');
  }, [handleAccountChange]);

  const handleAccountDeleted = useCallback((accountId: string) => {
    const newActive = metaAccountsService.getActiveAccount();
    if (newActive) {
      handleAccountChange(newActive);
    } else {
      setActiveAccount(null);
      setIsConnected(false);
      setConnectionName('');
      setNumbers([]);
      setBusinessManagers([]);
      setWabas([]);
      setActiveTab('config');
    }
  }, [handleAccountChange]);

  const testConnection = async (token?: string): Promise<{ success: boolean; name?: string; error?: string }> => {
    const tokenToTest = token || accessToken;
    if (!tokenToTest) {
      return { success: false };
    }

    metaGraphAPI.setAccessToken(tokenToTest);
    const result = await metaGraphAPI.testConnection();
    return result;
  };

  const handleTestConnection = async () => {
    if (!accessToken) {
      toast.error('Insira o Access Token');
      return;
    }

    setIsTestingConnection(true);
    try {
      const result = await testConnection();
      
      if (result.success) {
        const displayName = businessManagerName || result.name || 'Nova Conta';
        
        // Add as new account
        const newAccount = await metaAccountsService.addAccount({
          name: displayName,
          businessManagerId,
          accessToken,
        });

        setActiveAccount({ ...newAccount, accessToken });
        setIsConnected(true);
        setConnectionName(displayName);

        toast.success(`Conta "${displayName}" adicionada no Omni!`);
        
        // Clear form
        setAccessToken('');
        setBusinessManagerId('');
        setBusinessManagerName('');
        
        // Load data
        await loadDataFromAPI(newAccount.businessManagerId);
        setActiveTab('numbers');
      } else {
        toast.error(`Falha na conexão: ${result.error}`);
        setIsConnected(false);
      }
    } catch (error) {
      toast.error('Erro ao testar conexão');
      setIsConnected(false);
    } finally {
      setIsTestingConnection(false);
    }
  };

  useEffect(() => {
    void (async () => {
      try {
        const imported = await metaAccountsService.migrateLegacyLocalStorageIfEmpty();
        if (imported > 0) {
          toast.info(`${imported} conta(s) migrada(s) para o Omni backend`);
        }
        await metaAccountsService.loadAccounts();
        const account = metaAccountsService.getActiveAccount();
        if (account) {
          const token = await metaAccountsService.getAccessTokenForGraph(account.id);
          const withToken = { ...account, accessToken: token };
          setActiveAccount(withToken);
          setIsConnected(true);
          setConnectionName(account.name);
          setActiveTab('numbers');
          metaGraphAPI.setAccessToken(token);
          await loadDataFromAPI(account.businessManagerId);
        }
      } catch {
        toast.error('Erro ao carregar contas Meta (Omni)');
      }
    })();
  }, [loadDataFromAPI]);

  const handleDisconnectAPI = async () => {
    if (activeAccount) {
      await metaAccountsService.deleteAccount(activeAccount.id);
      handleAccountDeleted(activeAccount.id);
    }
  };

  const handleConnectNumber = async (data: ConnectNumberData) => {
    try {
      metaGraphAPI.setAccessToken(data.accessToken);
      
      // Fetch phone numbers for the WABA
      const phoneNumbers = await metaGraphAPI.getPhoneNumbers(data.wabaId);
      
      if (phoneNumbers.length > 0) {
        setNumbers((prev) => [...prev, ...phoneNumbers]);
        toast.success(`${phoneNumbers.length} número(s) conectado(s)!`);
      } else {
        toast.info('Nenhum número encontrado nesta WABA');
      }
      
      // Reload all data
      await loadDataFromAPI();
    } catch (error) {
      console.error('Error connecting number:', error);
      toast.error('Erro ao conectar número');
      throw error;
    }
  };

  const handleDisconnect = async () => {
    if (!selectedNumber) return;
    setNumbers(numbers.filter((n) => n.id !== selectedNumber.id));
    toast.success('Número desconectado com sucesso!');
    setDisconnectDialogOpen(false);
    setSelectedNumber(null);
  };

  const handleViewAnalytics = async (number: WhatsAppNumber) => {
    setViewingAnalytics(number);
    setIsLoading(true);

    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);

      const analyticsData = await metaGraphAPI.getMessageAnalytics(
        number.wabaId,
        startDate,
        endDate
      );

      if (analyticsData.analytics.length > 0) {
        setAnalytics(analyticsData.analytics);
        setMetrics(analyticsData.metrics);
      }

      const failures = await metaGraphAPI.getTemplateAnalytics(number.wabaId);
      if (failures.length > 0) {
        setFailureReasons(failures);
      }
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setIsLoading(false);
    }

    setActiveTab('analytics');
  };

  const handleDisconnectClick = (number: WhatsAppNumber) => {
    setSelectedNumber(number);
    setDisconnectDialogOpen(true);
  };

  // Analytics view for specific number
  if (viewingAnalytics && activeTab === 'analytics') {
    return (
      <MainLayout>
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={() => setViewingAnalytics(null)}>
              ← Voltar
            </Button>
            <h1 className="text-2xl font-bold">Analytics de Mensagens</h1>
          </div>
          <MessageAnalyticsPanel
            analytics={analytics}
            metrics={metrics}
            failureReasons={failureReasons}
            spamReports={spamReports}
            phoneNumber={viewingAnalytics.displayPhoneNumber}
          />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Chips WhatsApp</h1>
            <p className="text-muted-foreground">
              Conecte e gerencie números via {apiProvider === 'meta' ? 'API oficial da Meta' : 'Evolution API'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* API Provider Switcher */}
            <div className="flex items-center rounded-lg border p-1 bg-muted/50">
              <Button
                variant={apiProvider === 'meta' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => {
                  setApiProvider('meta');
                  localStorage.setItem('whatsapp_api_provider', 'meta');
                  setActiveTab('config');
                }}
                className="gap-2"
              >
                <Key className="h-4 w-4" />
                Meta API
              </Button>
              <Button
                variant={apiProvider === 'evolution' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => {
                  setApiProvider('evolution');
                  localStorage.setItem('whatsapp_api_provider', 'evolution');
                  setActiveTab('evolution');
                }}
                className="gap-2"
              >
                <Server className="h-4 w-4" />
                Evolution
              </Button>
            </div>
            
            {apiProvider === 'meta' && (
              <>
                <AccountSelector
                  activeAccount={activeAccount}
                  onAccountChange={handleAccountChange}
                  onAccountAdded={handleAccountAdded}
                  onAccountDeleted={handleAccountDeleted}
                />
                {isConnected && (
                  <>
                    <Button variant="outline" onClick={() => loadDataFromAPI()} disabled={isLoading}>
                      <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                      Atualizar
                    </Button>
                    <Button onClick={() => setConnectDialogOpen(true)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Adicionar Número
                    </Button>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            {apiProvider === 'meta' ? (
              <>
                <TabsTrigger value="config" className="flex items-center gap-2">
                  <Settings2 className="h-4 w-4" />
                  Configuração API
                </TabsTrigger>
                <TabsTrigger value="numbers" className="flex items-center gap-2" disabled={!isConnected}>
                  <Phone className="h-4 w-4" />
                  Números ({numbers.length})
                </TabsTrigger>
                <TabsTrigger value="business" className="flex items-center gap-2" disabled={!isConnected}>
                  <Building2 className="h-4 w-4" />
                  Business Managers
                </TabsTrigger>
                <TabsTrigger value="analytics" className="flex items-center gap-2" disabled={!isConnected}>
                  <BarChart3 className="h-4 w-4" />
                  Analytics Geral
                </TabsTrigger>
                <TabsTrigger value="webhook" className="flex items-center gap-2" disabled={!isConnected}>
                  <Webhook className="h-4 w-4" />
                  Webhook
                </TabsTrigger>
                <TabsTrigger value="webhook-logs" className="flex items-center gap-2" disabled={!isConnected}>
                  <BarChart3 className="h-4 w-4" />
                  Logs
                </TabsTrigger>
              </>
            ) : (
              <TabsTrigger value="evolution" className="flex items-center gap-2">
                <Server className="h-4 w-4" />
                Evolution API
              </TabsTrigger>
            )}
            <TabsTrigger value="alerts" className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Alertas
            </TabsTrigger>
          </TabsList>

          {/* API Configuration Tab */}
          <TabsContent value="config" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  Configuração da Meta Graph API
                </CardTitle>
                <CardDescription>
                  Configure suas credenciais para acessar a API oficial do WhatsApp Business
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Connection Status */}
                <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
                  {isConnected ? (
                    <>
                      <CheckCircle2 className="h-8 w-8 text-green-500" />
                      <div className="flex-1">
                        <p className="font-medium text-green-600">Conectado à API Meta</p>
                        <p className="text-sm text-muted-foreground">Conta: {connectionName}</p>
                      </div>
                      <Button variant="outline" onClick={handleDisconnectAPI}>
                        Desconectar
                      </Button>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-8 w-8 text-muted-foreground" />
                      <div className="flex-1">
                        <p className="font-medium">Não conectado</p>
                        <p className="text-sm text-muted-foreground">
                          Configure suas credenciais para começar
                        </p>
                      </div>
                    </>
                  )}
                </div>

                {/* Credentials Form */}
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="accessToken">Access Token</Label>
                    <Input
                      id="accessToken"
                      type="password"
                      placeholder="EAAGm0PX..."
                      value={accessToken}
                      onChange={(e) => setAccessToken(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Obtenha em{' '}
                      <a
                        href="https://developers.facebook.com/apps"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline"
                      >
                        developers.facebook.com
                      </a>{' '}
                      → Seu App → Configurações → Tokens de Acesso
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="businessManagerName">Nome da BM (apelido)</Label>
                    <Input
                      id="businessManagerName"
                      placeholder="Ex: BM Principal, Cliente X, Empresa Y"
                      value={businessManagerName}
                      onChange={(e) => setBusinessManagerName(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Um nome amigável para identificar esta conta facilmente
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="businessManagerId">Business Manager ID</Label>
                    <Input
                      id="businessManagerId"
                      placeholder="123456789012345"
                      value={businessManagerId}
                      onChange={(e) => setBusinessManagerId(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Encontre em{' '}
                      <a
                        href="https://business.facebook.com/settings"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline"
                      >
                        business.facebook.com
                      </a>{' '}
                      → Configurações → Informações da empresa
                    </p>
                  </div>

                  <Button 
                    onClick={handleTestConnection} 
                    disabled={!accessToken || !businessManagerId || isTestingConnection}
                    className="w-full"
                  >
                    {isTestingConnection ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Testando Conexão...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Testar e Conectar
                      </>
                    )}
                  </Button>
                </div>

                {/* Info Box */}
                <div className="p-4 rounded-lg border border-yellow-500/20 bg-yellow-500/5">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-yellow-600">Importante</p>
                      <ul className="mt-1 space-y-1 text-muted-foreground">
                        <li>• Use um token de acesso com permissões de leitura para WABAs e números</li>
                        <li>• Tokens expiram - configure um token de longa duração ou System User</li>
                        <li>• As credenciais são armazenadas localmente no seu navegador</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Numbers Tab */}
          <TabsContent value="numbers" className="mt-6">
            {isLoading ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-64 rounded-lg bg-card animate-pulse" />
                ))}
              </div>
            ) : numbers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 border border-dashed border-border rounded-lg">
                <Phone className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">
                  Nenhum número encontrado
                </h3>
                <p className="text-muted-foreground text-center mb-4">
                  Não encontramos números vinculados ao seu Business Manager.
                </p>
                <Button onClick={() => setConnectDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar Número
                </Button>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {numbers.map((number) => (
                  <NumberCard
                    key={number.id}
                    number={number}
                    onViewAnalytics={handleViewAnalytics}
                    onDisconnect={handleDisconnectClick}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Business Overview Tab */}
          <TabsContent value="business" className="mt-6">
            <BusinessOverview businessManagers={businessManagers} wabas={wabas} />
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="mt-6">
            <MessageAnalyticsPanel
              analytics={analytics.length > 0 ? analytics : generateMockAnalytics()}
              metrics={metrics.totalSent > 0 ? metrics : {
                totalSent: 12450,
                totalDelivered: 11200,
                totalRead: 7840,
                totalFailed: 1250,
                deliveryRate: 89.96,
                readRate: 70.0,
                failureRate: 10.04,
              }}
              failureReasons={failureReasons.length > 0 ? failureReasons : [
                { code: '131047', description: 'Número inválido', count: 450, percentage: 36 },
                { code: '131051', description: 'Limite excedido', count: 320, percentage: 25.6 },
                { code: '131026', description: 'Usuário bloqueou', count: 280, percentage: 22.4 },
              ]}
              spamReports={spamReports}
              phoneNumber="Todos os números"
            />
          </TabsContent>

          {/* Webhook Config Tab */}
          <TabsContent value="webhook" className="mt-6">
            {activeAccount && (
              <WebhookConfigPanel
                account={activeAccount}
                wabas={wabas.map(w => ({ id: w.id, name: w.name }))}
                onConfigUpdated={(updatedAccount) => setActiveAccount(updatedAccount)}
              />
            )}
          </TabsContent>

          {/* Webhook Logs Tab */}
          <TabsContent value="webhook-logs" className="mt-6">
            <MetaWebhookLogsPanel activeAccount={activeAccount} />
          </TabsContent>

          {/* Evolution API Tab */}
          <TabsContent value="evolution" className="mt-6">
            <EvolutionPanel />
          </TabsContent>

          {/* Alerts Tab */}
          <TabsContent value="alerts" className="mt-6">
            <AlertsPanel />
          </TabsContent>
        </Tabs>
      </div>

      <ConnectNumberDialog
        open={connectDialogOpen}
        onOpenChange={setConnectDialogOpen}
        onConnect={handleConnectNumber}
      />

      <AlertDialog open={disconnectDialogOpen} onOpenChange={setDisconnectDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desconectar Número</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja desconectar o número {selectedNumber?.displayPhoneNumber}? Você
              poderá reconectá-lo posteriormente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDisconnect} 
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Desconectar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
};

export default Chips;
