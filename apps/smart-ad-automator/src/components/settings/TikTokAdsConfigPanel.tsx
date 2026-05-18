import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, CheckCircle2, XCircle, RefreshCw, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  getPlatformConfig,
  savePlatformConfig,
  testPlatformConnection,
  getOAuthUrl,
  type PlatformConfig,
} from '@/services/platformConfigService';

export function TikTokAdsConfigPanel() {
  const { toast } = useToast();
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [config, setConfig] = useState<PlatformConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const [accessToken, setAccessToken] = useState('');
  const [advertiserId, setAdvertiserId] = useState('');

  useEffect(() => {
    supabase.from('companies').select('id, name').then(({ data }) => data && setCompanies(data));
  }, []);

  useEffect(() => {
    if (!selectedCompany) return;
    setLoading(true);
    getPlatformConfig('tiktok_ads', selectedCompany)
      .then((c) => {
        setConfig(c);
        setAccessToken('');
        setAdvertiserId(c?.account_id || '');
        setTestResult(null);
      })
      .finally(() => setLoading(false));
  }, [selectedCompany]);

  async function handleSave() {
    if (!selectedCompany) return;
    setSaving(true);
    try {
      await savePlatformConfig('tiktok_ads', selectedCompany, {
        access_token: accessToken.trim() || undefined,
        account_id: advertiserId.trim() || undefined,
      });
      toast({ title: 'Configuração TikTok Ads salva' });
      const c = await getPlatformConfig('tiktok_ads', selectedCompany);
      setConfig(c);
      setAccessToken('');
    } catch (err: any) {
      toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function handleConnectOAuth() {
    if (!selectedCompany) return;
    try {
      const url = await getOAuthUrl('tiktok_ads', selectedCompany);
      window.open(url, '_blank', 'width=600,height=700');
    } catch (err: any) {
      toast({ title: 'OAuth indisponível', description: err.message, variant: 'destructive' });
    }
  }

  async function handleTest() {
    if (!selectedCompany) return;
    setTesting(true);
    setTestResult(null);
    try {
      const r = await testPlatformConnection('tiktok_ads', selectedCompany);
      if (r.success) setTestResult({ ok: true, msg: `${r.accounts_count} advertiser(s) encontrado(s)` });
      else setTestResult({ ok: false, msg: r.error || 'Falha na conexão' });
    } catch (err: any) {
      setTestResult({ ok: false, msg: err.message });
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Integração TikTok Ads</CardTitle>
        <CardDescription>
          Conecte via OAuth ou cole manualmente o Access Token e Advertiser ID obtidos no TikTok Business.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Empresa</Label>
          <Select value={selectedCompany} onValueChange={setSelectedCompany}>
            <SelectTrigger><SelectValue placeholder="Selecione uma empresa" /></SelectTrigger>
            <SelectContent>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedCompany && !loading && (
          <>
            {config?.access_token && (
              <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                Conectado — token: {config.access_token}
              </Badge>
            )}

            <Separator />

            <div className="space-y-2">
              <Label>Access Token</Label>
              <Input
                type="password"
                placeholder={config ? 'Insira novo token para atualizar' : 'Cole o long-lived token'}
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Advertiser ID</Label>
              <Input
                placeholder="Ex: 7123456789012345678"
                value={advertiserId}
                onChange={(e) => setAdvertiserId(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2">
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar
              </Button>
              <Button variant="secondary" onClick={handleConnectOAuth}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Conectar via OAuth
              </Button>
              <Button variant="outline" onClick={handleTest} disabled={testing || !config}>
                {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Testar Conexão
              </Button>
            </div>

            {testResult && (
              <Badge
                variant="outline"
                className={
                  testResult.ok
                    ? 'border-primary/30 bg-primary/10 text-primary gap-1'
                    : 'border-destructive/30 bg-destructive/10 text-destructive gap-1'
                }
              >
                {testResult.ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                {testResult.msg}
              </Badge>
            )}
          </>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
          </div>
        )}
      </CardContent>
    </Card>
  );
}
