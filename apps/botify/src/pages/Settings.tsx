import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { botifyDomainApi } from '@/services/botify-domain-api';
import { metaAccountsService } from '@/services/meta-accounts-service';
import { getBotifyAuthSource } from '@/lib/omniconnectClient';
import { Link } from 'react-router-dom';
import type { Bot, ConversationFlow, WhatsAppConfig } from '@/types/bot';
import {
  Settings as SettingsIcon,
  Phone,
  Key,
  Webhook,
  CheckCircle,
  AlertCircle,
  Copy,
  ExternalLink,
  Save,
  GitBranch,
  Radio,
} from 'lucide-react';
import { toast } from 'sonner';
import { useSearchParams } from 'react-router-dom';

const EMPTY_FORM = {
  metaAccountId: '',
  businessAccountId: '',
  phoneNumberId: '',
  accessToken: '',
  webhookSecret: '',
  metaWabaAccountId: '',
  evolutionInstance: '',
  evolutionApiKey: '',
  defaultFlowId: '',
};

function microserviceWebhookUrl(): string {
  const base = import.meta.env.VITE_MICROSERVICE_URL?.replace(/\/$/, '');
  return base ? `${base}/webhooks/meta` : '';
}

function configToForm(config: WhatsAppConfig) {
  return {
    metaAccountId: config.metaAccountId ?? '',
    businessAccountId: config.businessAccountId ?? '',
    phoneNumberId: config.phoneNumberId ?? '',
    accessToken: config.accessToken ?? '',
    webhookSecret: config.webhookSecret ?? '',
    metaWabaAccountId: config.metaWabaAccountId ?? '',
    evolutionInstance: config.evolutionInstance ?? '',
    evolutionApiKey: config.evolutionApiKey ?? '',
    defaultFlowId: config.defaultFlowId ?? '',
  };
}

export default function Settings() {
  const [searchParams] = useSearchParams();
  const botIdFromUrl = searchParams.get('bot');
  const isOmniAuth = getBotifyAuthSource() === 'omniconnect';

  const [bots, setBots] = useState<Bot[]>([]);
  const [flows, setFlows] = useState<ConversationFlow[]>([]);
  const [selectedBotId, setSelectedBotId] = useState<string>('');
  const [config, setConfig] = useState<WhatsAppConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [metaAccounts, setMetaAccounts] = useState<
    Awaited<ReturnType<typeof metaAccountsService.loadAccounts>>
  >([]);

  useEffect(() => {
    void metaAccountsService.loadAccounts().then(setMetaAccounts).catch(() => {});
  }, []);

  useEffect(() => {
    const loadBots = async () => {
      try {
        const data = await botifyDomainApi.getBots();
        setBots(data);
        if (botIdFromUrl) {
          setSelectedBotId(botIdFromUrl);
        } else if (data.length > 0) {
          setSelectedBotId(data[0].id);
        }
      } catch {
        toast.error('Erro ao carregar bots');
      } finally {
        setIsLoading(false);
      }
    };
    void loadBots();
  }, [botIdFromUrl]);

  useEffect(() => {
    if (!selectedBotId) return;

    const loadConfig = async () => {
      try {
        const [configData, flowsData] = await Promise.all([
          botifyDomainApi.getWhatsAppConfig(selectedBotId),
          botifyDomainApi.getFlows(selectedBotId),
        ]);
        setFlows(flowsData.filter((f) => f.isActive));
        setConfig(configData);
        if (configData) {
          setFormData(configToForm(configData));
        } else {
          setFormData(EMPTY_FORM);
        }
      } catch {
        toast.error('Erro ao carregar configuração');
      }
    };
    void loadConfig();
  }, [selectedBotId]);

  const handleSave = async () => {
    if (!selectedBotId) return;

    setIsSaving(true);
    try {
      const updated = await botifyDomainApi.updateWhatsAppConfig(selectedBotId, formData);
      setConfig(updated);
      setFormData(configToForm(updated));
      toast.success('Configurações salvas com sucesso!');
    } catch {
      toast.error('Erro ao salvar configurações');
    } finally {
      setIsSaving(false);
    }
  };

  const copyToClipboard = (text: string) => {
    void navigator.clipboard.writeText(text);
    toast.success('Copiado para a área de transferência');
  };

  const selectedBot = bots.find((b) => b.id === selectedBotId);
  const webhookDisplay =
    config?.webhookUrl || microserviceWebhookUrl() || `${window.location.origin}/webhooks/meta`;

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Configurações</h1>
          <p className="text-muted-foreground">
            Canal WhatsApp (Meta Cloud) e routing de webhooks para o microserviço
          </p>
        </div>

        <Tabs defaultValue="whatsapp" className="space-y-6">
          <TabsList>
            <TabsTrigger value="whatsapp">
              <Phone className="mr-2 h-4 w-4" />
              WhatsApp API
            </TabsTrigger>
            {!isOmniAuth && (
              <TabsTrigger value="wordpress">
                <SettingsIcon className="mr-2 h-4 w-4" />
                WordPress
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="whatsapp" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Selecionar Bot</CardTitle>
                <CardDescription>Escolha o bot que deseja configurar</CardDescription>
              </CardHeader>
              <CardContent>
                <Select value={selectedBotId} onValueChange={setSelectedBotId} disabled={isLoading}>
                  <SelectTrigger className="max-w-sm">
                    <SelectValue placeholder="Selecione um bot" />
                  </SelectTrigger>
                  <SelectContent>
                    {bots.map((bot) => (
                      <SelectItem key={bot.id} value={bot.id}>
                        {bot.name}
                        {bot.phoneNumber ? ` — ${bot.phoneNumber}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedBot && (
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <Badge
                      variant="outline"
                      className={
                        config?.isConnected
                          ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                          : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                      }
                    >
                      {config?.isConnected ? (
                        <>
                          <CheckCircle className="mr-1 h-3 w-3" />
                          Conectado
                        </>
                      ) : (
                        <>
                          <AlertCircle className="mr-1 h-3 w-3" />
                          Não conectado
                        </>
                      )}
                    </Badge>
                    {config?.lineHealth && (
                      <Badge variant="secondary">Linha: {config.lineHealth}</Badge>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {selectedBotId && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Conta Meta (fonte única)</CardTitle>
                    <CardDescription>
                      Credenciais em{' '}
                      <Link to="/chips" className="underline text-primary">
                        Chips WhatsApp
                      </Link>
                      . Vincule o bot à conta Omni.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <Label>Conta Meta</Label>
                      <Select
                        value={formData.metaAccountId || '_none'}
                        onValueChange={(v) =>
                          setFormData((prev) => ({
                            ...prev,
                            metaAccountId: v === '_none' ? '' : v,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione a conta" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">— Nenhuma —</SelectItem>
                          {metaAccounts.map((acc) => (
                            <SelectItem key={acc.id} value={acc.id}>
                              {acc.name}
                              {acc.isActive ? ' (ativa)' : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Key className="h-5 w-5 text-primary" />
                      <CardTitle>Credenciais da API</CardTitle>
                    </div>
                    <CardDescription>
                      Overrides do bot (token principal na conta Meta / Chips)
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="businessAccountId">Business Account ID</Label>
                        <Input
                          id="businessAccountId"
                          placeholder="Ex: 123456789012345"
                          value={formData.businessAccountId}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              businessAccountId: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="phoneNumberId">Phone Number ID</Label>
                        <Input
                          id="phoneNumberId"
                          placeholder="Ex: 123456789012345"
                          value={formData.phoneNumberId}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              phoneNumberId: e.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="accessToken">Access Token</Label>
                      <Input
                        id="accessToken"
                        type="password"
                        placeholder="Cole o token (deixe mascarado para manter o atual)"
                        value={formData.accessToken}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, accessToken: e.target.value }))
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        Gravado encriptado no Omni backend. Token em{' '}
                        <a
                          href="https://developers.facebook.com/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline"
                        >
                          Meta for Developers
                        </a>
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Radio className="h-5 w-5 text-primary" />
                      <CardTitle>Routing de webhooks</CardTitle>
                    </div>
                    <CardDescription>
                      Liga mensagens inbound (Meta / Evolution) a este bot e fluxo no microserviço
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="metaWabaAccountId">Meta WABA Account ID</Label>
                        <Input
                          id="metaWabaAccountId"
                          placeholder="entry.id do webhook Meta"
                          value={formData.metaWabaAccountId}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              metaWabaAccountId: e.target.value,
                            }))
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          Também aceita match por Business Account ID ou Phone Number ID
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="defaultFlowId">Fluxo padrão (inbound)</Label>
                        <Select
                          value={formData.defaultFlowId || '_none'}
                          onValueChange={(v) =>
                            setFormData((prev) => ({
                              ...prev,
                              defaultFlowId: v === '_none' ? '' : v,
                            }))
                          }
                        >
                          <SelectTrigger id="defaultFlowId">
                            <SelectValue placeholder="Selecione um fluxo publicado" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_none">— Nenhum —</SelectItem>
                            {flows.map((flow) => (
                              <SelectItem key={flow.id} value={flow.id}>
                                <span className="flex items-center gap-2">
                                  <GitBranch className="h-3 w-3" />
                                  {flow.name}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {flows.length === 0 && (
                          <p className="text-xs text-amber-600">
                            Publique um fluxo para este bot antes de receber webhooks
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="evolutionInstance">Evolution — instância</Label>
                        <Input
                          id="evolutionInstance"
                          placeholder="nome-da-instancia"
                          value={formData.evolutionInstance}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              evolutionInstance: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="evolutionApiKey">Evolution — API Key</Label>
                        <Input
                          id="evolutionApiKey"
                          type="password"
                          placeholder="Chave do webhook Evolution"
                          value={formData.evolutionApiKey}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              evolutionApiKey: e.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Webhook className="h-5 w-5 text-primary" />
                      <CardTitle>Webhook Meta (microserviço)</CardTitle>
                    </div>
                    <CardDescription>
                      Configure no Meta for Developers; secrets globais ficam no `.env` do
                      microserviço (`META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`)
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>URL do Webhook</Label>
                      <div className="flex items-center gap-2">
                        <Input value={webhookDisplay} readOnly className="font-mono text-sm" />
                        <Button
                          variant="outline"
                          size="icon"
                          type="button"
                          onClick={() => copyToClipboard(webhookDisplay)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="webhookSecret">Verify Token (opcional por bot)</Label>
                      <Input
                        id="webhookSecret"
                        placeholder="Token legado por bot (preferir env global)"
                        value={formData.webhookSecret}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, webhookSecret: e.target.value }))
                        }
                      />
                    </div>
                  </CardContent>
                </Card>

                <div className="flex justify-end">
                  <Button onClick={handleSave} disabled={isSaving}>
                    <Save className="mr-2 h-4 w-4" />
                    {isSaving ? 'Salvando...' : 'Salvar Configurações'}
                  </Button>
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="wordpress" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Conexão com WordPress</CardTitle>
                <CardDescription>
                  Modo legado — com auth Omni o domínio vive no backend Nest.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="wpUrl">URL da API WordPress</Label>
                  <Input
                    id="wpUrl"
                    placeholder="https://seu-site.com/wp-json"
                    defaultValue={import.meta.env.VITE_WORDPRESS_API_URL || ''}
                  />
                </div>

                <div className="flex items-center justify-between p-4 border border-border rounded-lg">
                  <div>
                    <p className="font-medium text-foreground">Modo de Demonstração</p>
                    <p className="text-sm text-muted-foreground">Usar dados mockados para teste</p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="pt-4">
                  <Button variant="outline" asChild>
                    <a
                      href="https://developer.wordpress.org/rest-api/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Documentação da API WordPress
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
