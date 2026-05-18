import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Key, Loader2, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { saveMetaConfig, getMetaConfig, testMetaConnection, type MetaConfig, type TestConnectionResult } from '@/services/metaConfigService';

type ConnectionStatus = 'idle' | 'testing' | 'success' | 'error';

export function MetaConfigPanel() {
  const { toast } = useToast();
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [connectionResult, setConnectionResult] = useState<TestConnectionResult | null>(null);
  const [existingConfig, setExistingConfig] = useState<MetaConfig | null>(null);

  // Form state
  const [accessToken, setAccessToken] = useState('');
  const [businessId, setBusinessId] = useState('');
  const [adAccountId, setAdAccountId] = useState('');
  const [appId, setAppId] = useState('');
  const [appSecret, setAppSecret] = useState('');

  // Load companies
  useEffect(() => {
    async function loadCompanies() {
      const { data } = await supabase.from('companies').select('id, name');
      if (data) setCompanies(data);
    }
    loadCompanies();
  }, []);

  // Load config when company changes
  useEffect(() => {
    if (!selectedCompany) {
      setExistingConfig(null);
      resetForm();
      return;
    }
    loadConfig(selectedCompany);
  }, [selectedCompany]);

  function resetForm() {
    setAccessToken('');
    setBusinessId('');
    setAdAccountId('');
    setAppId('');
    setAppSecret('');
    setConnectionStatus('idle');
    setConnectionResult(null);
  }

  async function loadConfig(companyId: string) {
    setLoading(true);
    try {
      const config = await getMetaConfig(companyId);
      setExistingConfig(config);
      if (config) {
        setAccessToken(''); // Don't show actual token
        setBusinessId(config.meta_business_id || '');
        setAdAccountId(config.ad_account_id || '');
        setAppId(config.app_id || '');
        setAppSecret('');
      } else {
        resetForm();
      }
    } catch (err: any) {
      toast({ title: 'Erro ao carregar configuração', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!selectedCompany) {
      toast({ title: 'Selecione uma empresa', variant: 'destructive' });
      return;
    }
    if (!accessToken.trim() && !existingConfig) {
      toast({ title: 'Access Token obrigatório', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, string> = { company_id: selectedCompany };
      if (accessToken.trim()) payload.access_token = accessToken.trim();
      else if (existingConfig) {
        // If no new token, we need to send something — backend upsert requires it
        toast({ title: 'Insira o Access Token para atualizar', variant: 'destructive' });
        setSaving(false);
        return;
      }
      if (businessId.trim()) payload.meta_business_id = businessId.trim();
      if (adAccountId.trim()) payload.ad_account_id = adAccountId.trim();
      if (appId.trim()) payload.app_id = appId.trim();
      if (appSecret.trim()) payload.app_secret = appSecret.trim();

      await saveMetaConfig(payload as any);
      toast({ title: 'Configuração salva com sucesso!' });
      setAccessToken('');
      setAppSecret('');
      await loadConfig(selectedCompany);
    } catch (err: any) {
      toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function handleTestConnection() {
    if (!selectedCompany) return;
    setConnectionStatus('testing');
    setConnectionResult(null);
    try {
      const result = await testMetaConnection(selectedCompany);
      if (result.success) {
        setConnectionStatus('success');
        setConnectionResult(result);
      } else {
        setConnectionStatus('error');
        setConnectionResult(result);
      }
    } catch (err: any) {
      setConnectionStatus('error');
      setConnectionResult({ success: false, error: err.message });
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Key className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base">Integração Meta Ads</CardTitle>
        </div>
        <CardDescription>
          Configure tokens e IDs para cada empresa. Os tokens são armazenados de forma segura no backend.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Company selector */}
        <div className="space-y-2">
          <Label>Empresa</Label>
          <Select value={selectedCompany} onValueChange={setSelectedCompany}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione uma empresa" />
            </SelectTrigger>
            <SelectContent>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedCompany && !loading && (
          <>
            {existingConfig && (
              <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                Configuração existente — token: {existingConfig.access_token}
              </Badge>
            )}

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="access-token">Access Token *</Label>
              <Input
                id="access-token"
                type="password"
                placeholder={existingConfig ? 'Insira novo token para atualizar' : 'Cole seu token (EAABs...)'}
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Token de acesso da Meta com permissões ads_read, ads_management e business_management.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="business-id">Business ID</Label>
                <Input
                  id="business-id"
                  placeholder="Ex: 123456789"
                  value={businessId}
                  onChange={(e) => setBusinessId(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ad-account-id">Ad Account ID</Label>
                <Input
                  id="ad-account-id"
                  placeholder="Ex: act_123456789"
                  value={adAccountId}
                  onChange={(e) => setAdAccountId(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="app-id">App ID (opcional)</Label>
                <Input
                  id="app-id"
                  placeholder="ID do aplicativo Meta"
                  value={appId}
                  onChange={(e) => setAppId(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="app-secret">App Secret (opcional)</Label>
                <Input
                  id="app-secret"
                  type="password"
                  placeholder={existingConfig ? '***masked***' : 'Secret do aplicativo'}
                  value={appSecret}
                  onChange={(e) => setAppSecret(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar Configuração
              </Button>
              <Button
                variant="secondary"
                onClick={handleTestConnection}
                disabled={connectionStatus === 'testing' || !existingConfig}
              >
                {connectionStatus === 'testing' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Testar Conexão
              </Button>
            </div>

            {connectionStatus === 'success' && connectionResult && (
              <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Conexão OK! {connectionResult.accounts_count} conta(s) encontrada(s).
              </Badge>
            )}
            {connectionStatus === 'error' && connectionResult && (
              <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive gap-1">
                <XCircle className="h-3 w-3" />
                {connectionResult.error || 'Erro ao testar conexão'}
              </Badge>
            )}
          </>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando configuração...
          </div>
        )}
      </CardContent>
    </Card>
  );
}
