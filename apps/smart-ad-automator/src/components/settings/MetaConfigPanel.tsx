import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Key, Loader2, CheckCircle2, XCircle, RefreshCw, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  connectViaOAuth,
  listAdvertiserCompanies,
  removePlatformConnection,
  testPlatformConnection,
  type AdvertiserCompany,
  type PlatformConnection,
} from '@/services/platformConfigService';
import { getPlatformConnection } from '@/services/platformConfigService';

type ConnectionStatus = 'idle' | 'testing' | 'success' | 'error';

/**
 * Sprint 2.4 — Bloco E. Configuração da integração Meta agora é OAuth-first:
 *   1. Operador escolhe a AdvertiserCompany.
 *   2. Clica em "Conectar com Meta" — redireciona para o backend
 *      /oauth/meta/start, que assina state e leva ao Facebook.
 *   3. Após callback, o backend cifra os tokens e devolve o usuário a
 *      /settings/?platform=meta&status=success&connectionId=...
 *   4. O painel mostra o estado da conexão e permite testar / desconectar.
 *
 * Não há mais campo de "Access Token" manual — app_secret e access_token só
 * vivem no backend (BridgeSecretCipher / token-refresh).
 */
export function MetaConfigPanel() {
  const { toast } = useToast();
  const [companies, setCompanies] = useState<AdvertiserCompany[]>([]);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [connection, setConnection] = useState<PlatformConnection | null>(null);
  const [loading, setLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [connectionResult, setConnectionResult] = useState<{ message: string } | null>(null);

  useEffect(() => {
    listAdvertiserCompanies()
      .then((rows) => setCompanies(rows))
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
      setConnectionStatus('idle');
      setConnectionResult(null);
      return;
    }
    setLoading(true);
    getPlatformConnection('meta', selectedCompany)
      .then((c) => setConnection(c))
      .catch((err) =>
        toast({
          title: 'Erro ao carregar conexão',
          description: err instanceof Error ? err.message : 'Falha desconhecida',
          variant: 'destructive',
        }),
      )
      .finally(() => setLoading(false));
  }, [selectedCompany, toast]);

  async function handleConnect() {
    if (!selectedCompany) return;
    try {
      await connectViaOAuth('meta', selectedCompany, '/settings');
    } catch (err) {
      toast({
        title: 'Erro ao iniciar OAuth',
        description: err instanceof Error ? err.message : 'Falha desconhecida',
        variant: 'destructive',
      });
    }
  }

  async function handleTest() {
    if (!connection) return;
    setConnectionStatus('testing');
    setConnectionResult(null);
    const r = await testPlatformConnection(connection.id);
    if (r.success) {
      setConnectionStatus('success');
      setConnectionResult({
        message:
          r.accounts && r.accounts.length
            ? `${r.accounts.length} conta(s) acessível(is)`
            : 'Conexão OK',
      });
    } else {
      setConnectionStatus('error');
      setConnectionResult({ message: r.error ?? 'Erro ao testar conexão' });
    }
  }

  async function handleDisconnect() {
    if (!connection) return;
    try {
      await removePlatformConnection(connection.id);
      toast({ title: 'Conexão removida' });
      setConnection(null);
      setConnectionStatus('idle');
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
        <div className="flex items-center gap-2">
          <Key className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base">Integração Meta Ads</CardTitle>
        </div>
        <CardDescription>
          Conecte cada empresa via OAuth. Tokens nunca chegam ao navegador — o
          backend cifra e armazena server-side.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label className="text-sm font-medium">Empresa</Label>
          <Select value={selectedCompany} onValueChange={setSelectedCompany}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione uma empresa" />
            </SelectTrigger>
            <SelectContent>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedCompany && !loading && (
          <>
            <Separator />

            {connection ? (
              <div className="space-y-2">
                <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                  Conectado — token: ••••{connection.accessTokenHint ?? '????'}
                  {connection.tokenExpiresAt
                    ? ` · expira ${new Date(connection.tokenExpiresAt).toLocaleDateString()}`
                    : ''}
                </Badge>
                {connection.accountId && (
                  <p className="text-xs text-muted-foreground">
                    Ad Account: {connection.accountId}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Esta empresa ainda não tem uma conexão Meta ativa.
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-2">
              <Button onClick={handleConnect}>
                <ExternalLink className="mr-2 h-4 w-4" />
                {connection ? 'Reconectar com Meta' : 'Conectar com Meta'}
              </Button>
              <Button
                variant="secondary"
                onClick={handleTest}
                disabled={connectionStatus === 'testing' || !connection}
              >
                {connectionStatus === 'testing' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Testar Conexão
              </Button>
              {connection && (
                <Button variant="ghost" onClick={handleDisconnect}>
                  Desconectar
                </Button>
              )}
            </div>

            {connectionStatus === 'success' && connectionResult && (
              <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary gap-1">
                <CheckCircle2 className="h-3 w-3" />
                {connectionResult.message}
              </Badge>
            )}
            {connectionStatus === 'error' && connectionResult && (
              <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive gap-1">
                <XCircle className="h-3 w-3" />
                {connectionResult.message}
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

function Label({ className, children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={`text-sm font-medium ${className ?? ''}`} {...props}>
      {children}
    </label>
  );
}
