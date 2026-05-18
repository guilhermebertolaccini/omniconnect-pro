import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, CheckCircle2, XCircle, RefreshCw, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  connectViaOAuth,
  getPlatformConnection,
  listAdvertiserCompanies,
  removePlatformConnection,
  testPlatformConnection,
  type AdvertiserCompany,
  type PlatformConnection,
} from '@/services/platformConfigService';

type ConnectionStatus = 'idle' | 'testing' | 'success' | 'error';

export function GoogleAdsConfigPanel() {
  const { toast } = useToast();
  const [companies, setCompanies] = useState<AdvertiserCompany[]>([]);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [connection, setConnection] = useState<PlatformConnection | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    listAdvertiserCompanies()
      .then(setCompanies)
      .catch((err) =>
        toast({
          title: 'Erro ao carregar empresas',
          description: err instanceof Error ? err.message : 'Falha desconhecida',
          variant: 'destructive',
        }),
      );
  }, [toast]);

  useEffect(() => {
    if (!selectedCompany) {
      setConnection(null);
      setStatus('idle');
      setResult(null);
      return;
    }
    setLoading(true);
    getPlatformConnection('google_ads', selectedCompany)
      .then(setConnection)
      .finally(() => setLoading(false));
  }, [selectedCompany]);

  async function handleConnect() {
    if (!selectedCompany) return;
    try {
      await connectViaOAuth('google_ads', selectedCompany, '/settings');
    } catch (err) {
      toast({
        title: 'OAuth indisponível',
        description: err instanceof Error ? err.message : 'Falha desconhecida',
        variant: 'destructive',
      });
    }
  }

  async function handleTest() {
    if (!connection) return;
    setStatus('testing');
    setResult(null);
    const r = await testPlatformConnection(connection.id);
    setStatus(r.success ? 'success' : 'error');
    setResult({
      ok: r.success,
      msg: r.success
        ? r.accounts && r.accounts.length
          ? `${r.accounts.length} conta(s) acessível(is)`
          : 'Conexão OK'
        : r.error ?? 'Falha na conexão',
    });
  }

  async function handleDisconnect() {
    if (!connection) return;
    try {
      await removePlatformConnection(connection.id);
      toast({ title: 'Conexão removida' });
      setConnection(null);
      setStatus('idle');
      setResult(null);
    } catch (err) {
      toast({
        title: 'Erro ao desconectar',
        description: err instanceof Error ? err.message : 'Falha desconhecida',
        variant: 'destructive',
      });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Integração Google Ads</CardTitle>
        <CardDescription>
          Conecte cada empresa via OAuth. O backend pede os scopes
          <code> adwords openid email </code>e gerencia refresh automaticamente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Empresa</label>
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
            <Separator />

            {connection ? (
              <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                Conectado — token: ••••{connection.accessTokenHint ?? '????'}
                {connection.tokenExpiresAt
                  ? ` · expira ${new Date(connection.tokenExpiresAt).toLocaleDateString()}`
                  : ''}
              </Badge>
            ) : (
              <p className="text-sm text-muted-foreground">
                Esta empresa ainda não tem uma conexão Google Ads ativa.
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-2">
              <Button onClick={handleConnect}>
                <ExternalLink className="mr-2 h-4 w-4" />
                {connection ? 'Reconectar Google Ads' : 'Conectar com Google Ads'}
              </Button>
              <Button variant="outline" onClick={handleTest} disabled={status === 'testing' || !connection}>
                {status === 'testing' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Testar Conexão
              </Button>
              {connection && (
                <Button variant="ghost" onClick={handleDisconnect}>
                  Desconectar
                </Button>
              )}
            </div>

            {result && (
              <Badge
                variant="outline"
                className={
                  result.ok
                    ? 'border-primary/30 bg-primary/10 text-primary gap-1'
                    : 'border-destructive/30 bg-destructive/10 text-destructive gap-1'
                }
              >
                {result.ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                {result.msg}
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
