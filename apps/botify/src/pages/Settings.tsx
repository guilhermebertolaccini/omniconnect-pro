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
import { wpApi } from '@/services/wordpress-api';
import type { Bot, WhatsAppConfig } from '@/types/bot';
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
} from 'lucide-react';
import { toast } from 'sonner';
import { useSearchParams } from 'react-router-dom';

export default function Settings() {
  const [searchParams] = useSearchParams();
  const botIdFromUrl = searchParams.get('bot');

  const [bots, setBots] = useState<Bot[]>([]);
  const [selectedBotId, setSelectedBotId] = useState<string>('');
  const [config, setConfig] = useState<WhatsAppConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    businessAccountId: '',
    phoneNumberId: '',
    accessToken: '',
    webhookSecret: '',
  });

  useEffect(() => {
    const loadBots = async () => {
      try {
        const data = await wpApi.getBots();
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
    loadBots();
  }, [botIdFromUrl]);

  useEffect(() => {
    if (!selectedBotId) return;

    const loadConfig = async () => {
      try {
        const configData = await wpApi.getWhatsAppConfig(selectedBotId);
        setConfig(configData);
        if (configData) {
          setFormData({
            businessAccountId: configData.businessAccountId,
            phoneNumberId: configData.phoneNumberId,
            accessToken: configData.accessToken,
            webhookSecret: configData.webhookSecret,
          });
        }
      } catch {
        toast.error('Erro ao carregar configuração');
      }
    };
    loadConfig();
  }, [selectedBotId]);

  const handleSave = async () => {
    if (!selectedBotId) return;

    setIsSaving(true);
    try {
      await wpApi.updateWhatsAppConfig(selectedBotId, formData);
      setConfig(prev => prev ? { ...prev, ...formData, isConnected: true } : null);
      toast.success('Configurações salvas com sucesso!');
    } catch {
      toast.error('Erro ao salvar configurações');
    } finally {
      setIsSaving(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado para a área de transferência');
  };

  const selectedBot = bots.find(b => b.id === selectedBotId);

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground">Configurações</h1>
          <p className="text-muted-foreground">
            Configure a integração com WhatsApp Business API
          </p>
        </div>

        <Tabs defaultValue="whatsapp" className="space-y-6">
          <TabsList>
            <TabsTrigger value="whatsapp">
              <Phone className="mr-2 h-4 w-4" />
              WhatsApp API
            </TabsTrigger>
            <TabsTrigger value="wordpress">
              <SettingsIcon className="mr-2 h-4 w-4" />
              WordPress
            </TabsTrigger>
          </TabsList>

          <TabsContent value="whatsapp" className="space-y-6">
            {/* Bot Selector */}
            <Card>
              <CardHeader>
                <CardTitle>Selecionar Bot</CardTitle>
                <CardDescription>
                  Escolha o bot que deseja configurar
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Select value={selectedBotId} onValueChange={setSelectedBotId}>
                  <SelectTrigger className="max-w-sm">
                    <SelectValue placeholder="Selecione um bot" />
                  </SelectTrigger>
                  <SelectContent>
                    {bots.map((bot) => (
                      <SelectItem key={bot.id} value={bot.id}>
                        {bot.name} - {bot.phoneNumber}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedBot && (
                  <div className="mt-4 flex items-center gap-3">
                    <Badge 
                      variant="outline"
                      className={config?.isConnected 
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
                  </div>
                )}
              </CardContent>
            </Card>

            {selectedBotId && (
              <>
                {/* API Credentials */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Key className="h-5 w-5 text-primary" />
                      <CardTitle>Credenciais da API</CardTitle>
                    </div>
                    <CardDescription>
                      Configure suas credenciais do WhatsApp Business API (Meta)
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
                          onChange={(e) => setFormData(prev => ({
                            ...prev,
                            businessAccountId: e.target.value
                          }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="phoneNumberId">Phone Number ID</Label>
                        <Input
                          id="phoneNumberId"
                          placeholder="Ex: 123456789012345"
                          value={formData.phoneNumberId}
                          onChange={(e) => setFormData(prev => ({
                            ...prev,
                            phoneNumberId: e.target.value
                          }))}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="accessToken">Access Token</Label>
                      <Input
                        id="accessToken"
                        type="password"
                        placeholder="Cole seu token de acesso aqui"
                        value={formData.accessToken}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          accessToken: e.target.value
                        }))}
                      />
                      <p className="text-xs text-muted-foreground">
                        O token de acesso pode ser obtido no Meta for Developers
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Webhook Configuration */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Webhook className="h-5 w-5 text-primary" />
                      <CardTitle>Webhook</CardTitle>
                    </div>
                    <CardDescription>
                      Configure o webhook para receber mensagens
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>URL do Webhook</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          value={config?.webhookUrl || `${window.location.origin}/webhook/${selectedBotId}`}
                          readOnly
                          className="font-mono text-sm"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => copyToClipboard(config?.webhookUrl || '')}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Configure esta URL no Meta for Developers
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="webhookSecret">Verify Token (Secret)</Label>
                      <Input
                        id="webhookSecret"
                        placeholder="Defina um token de verificação"
                        value={formData.webhookSecret}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          webhookSecret: e.target.value
                        }))}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Save Button */}
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
                  Configure a conexão com sua instalação do WordPress
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
                  <p className="text-xs text-muted-foreground">
                    A URL base da REST API do WordPress
                  </p>
                </div>

                <div className="flex items-center justify-between p-4 border border-border rounded-lg">
                  <div>
                    <p className="font-medium text-foreground">Modo de Demonstração</p>
                    <p className="text-sm text-muted-foreground">
                      Usar dados mockados para teste
                    </p>
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
