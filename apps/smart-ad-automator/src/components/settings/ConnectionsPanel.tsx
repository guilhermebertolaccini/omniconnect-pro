import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  Building2, CheckCircle2, XCircle, AlertCircle, RefreshCw, Loader2, Plug,
  Facebook, Globe, Music2, Hash, Clock, Key
} from 'lucide-react';
import { toast } from 'sonner';
import { testPlatformConnection, type AdPlatform, PLATFORM_LABELS } from '@/services/platformConfigService';

interface Company { id: string; name: string; business_name: string }
interface PlatformConfigRow {
  id: string;
  company_id: string;
  platform: AdPlatform;
  account_id: string | null;
  token_expires_at: string | null;
  is_active: boolean;
  extra: Record<string, any>;
  updated_at: string;
}
interface MetaConfigRow {
  id: string;
  company_id: string;
  meta_business_id: string | null;
  ad_account_id: string | null;
  token_expires_at: string | null;
  is_active: boolean;
  updated_at: string;
}

const PLATFORM_ICON: Record<AdPlatform, any> = {
  meta: Facebook,
  google_ads: Globe,
  tiktok_ads: Music2,
};

function tokenStatus(expiresAt: string | null, isActive: boolean) {
  if (!isActive) return { label: 'Inativo', variant: 'secondary' as const, Icon: XCircle, color: 'text-muted-foreground' };
  if (!expiresAt) return { label: 'Sem expiração', variant: 'outline' as const, Icon: CheckCircle2, color: 'text-green-500' };
  const exp = new Date(expiresAt);
  const now = new Date();
  if (exp < now) return { label: 'Expirado', variant: 'destructive' as const, Icon: XCircle, color: 'text-destructive' };
  const days = Math.ceil((exp.getTime() - now.getTime()) / 86400000);
  if (days <= 7) return { label: `Expira em ${days}d`, variant: 'outline' as const, Icon: AlertCircle, color: 'text-amber-500' };
  return { label: 'Ativo', variant: 'default' as const, Icon: CheckCircle2, color: 'text-green-500' };
}

function extractScopes(extra: Record<string, any> | null): string[] {
  if (!extra) return [];
  const raw = extra.scopes ?? extra.scope ?? extra.granted_scopes;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') return raw.split(/[,\s]+/).filter(Boolean);
  return [];
}

export function ConnectionsPanel() {
  const [verifying, setVerifying] = useState<string | null>(null);

  const { data: companies, isLoading: loadingCompanies } = useQuery({
    queryKey: ['connections-companies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('id, name, business_name')
        .order('name');
      if (error) throw error;
      return data as Company[];
    },
  });

  const { data: platformConfigs } = useQuery({
    queryKey: ['connections-platform-configs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_configurations')
        .select('id, company_id, platform, account_id, token_expires_at, is_active, extra, updated_at');
      if (error) throw error;
      return data as PlatformConfigRow[];
    },
  });

  const { data: metaConfigs } = useQuery({
    queryKey: ['connections-meta-configs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meta_configurations')
        .select('id, company_id, meta_business_id, ad_account_id, token_expires_at, is_active, updated_at');
      if (error) throw error;
      return data as MetaConfigRow[];
    },
  });

  async function handleVerify(platform: AdPlatform, companyId: string, key: string) {
    setVerifying(key);
    try {
      const result = await testPlatformConnection(platform, companyId);
      if (result?.success !== false) toast.success(`${PLATFORM_LABELS[platform]}: conexão OK.`);
      else toast.error(result?.error ?? 'Falha na verificação.');
    } catch (e: any) {
      toast.error(e.message ?? 'Erro ao verificar.');
    } finally {
      setVerifying(null);
    }
  }

  if (loadingCompanies) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!companies || companies.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground text-sm">
          Nenhuma empresa cadastrada ainda.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="bg-muted/30">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Plug className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Conexões dos clientes</CardTitle>
          </div>
          <CardDescription>
            Visão consolidada de todas as Business Managers e contas de anúncio conectadas por cada cliente,
            com status do token e escopos concedidos no OAuth.
          </CardDescription>
        </CardHeader>
      </Card>

      <Accordion type="multiple" className="space-y-2">
        {companies.map((company) => {
          const platforms: AdPlatform[] = ['meta', 'google_ads', 'tiktok_ads'];
          const companyPlatforms = platforms.map((p) => ({
            platform: p,
            config: platformConfigs?.find((c) => c.company_id === company.id && c.platform === p) ?? null,
            metaConfig: p === 'meta'
              ? metaConfigs?.find((m) => m.company_id === company.id) ?? null
              : null,
          }));
          const connectedCount = companyPlatforms.filter(
            (cp) => cp.config?.is_active || cp.metaConfig?.is_active,
          ).length;

          return (
            <Card key={company.id}>
              <AccordionItem value={company.id} className="border-0">
                <AccordionTrigger className="px-6 hover:no-underline">
                  <div className="flex items-center gap-3 flex-1 text-left">
                    <Building2 className="h-5 w-5 text-muted-foreground" />
                    <div className="flex-1">
                      <div className="font-medium">{company.name}</div>
                      <div className="text-xs text-muted-foreground">{company.business_name}</div>
                    </div>
                    <Badge variant={connectedCount > 0 ? 'default' : 'secondary'}>
                      {connectedCount}/3 conectadas
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-6 pb-6">
                  <div className="space-y-3">
                    {companyPlatforms.map(({ platform, config, metaConfig }) => {
                      const Icon = PLATFORM_ICON[platform];
                      const key = `${company.id}-${platform}`;
                      const isConnected = !!(config?.is_active || metaConfig?.is_active);

                      // For Meta, prefer meta_configurations data (BM + ad account)
                      const accountId = platform === 'meta'
                        ? (metaConfig?.ad_account_id || config?.account_id)
                        : config?.account_id;
                      const expiresAt = platform === 'meta'
                        ? (metaConfig?.token_expires_at || config?.token_expires_at)
                        : config?.token_expires_at;
                      const isActive = platform === 'meta'
                        ? !!(metaConfig?.is_active || config?.is_active)
                        : !!config?.is_active;
                      const scopes = extractScopes(config?.extra ?? null);
                      const status = tokenStatus(expiresAt ?? null, isActive);
                      const StatusIcon = status.Icon;

                      // Extra: TikTok advertiser_ids, Google login_customer_id, etc.
                      const extraEntries = Object.entries(config?.extra ?? {}).filter(
                        ([k]) => !['scopes', 'scope', 'granted_scopes'].includes(k),
                      );

                      const recentlyFailed = !isActive && expiresAt && new Date(expiresAt) < new Date();

                      return (
                        <div key={platform} className="rounded-lg border bg-card p-4">
                          {recentlyFailed && (
                            <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs flex items-start gap-2">
                              <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                              <div>
                                <p className="font-medium text-destructive">Reconexão necessária</p>
                                <p className="text-muted-foreground">
                                  Token expirou em {new Date(expiresAt).toLocaleString('pt-BR')}. Veja Auditoria para detalhes.
                                </p>
                              </div>
                            </div>
                          )}
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              <div className="rounded-md bg-muted p-2">
                                <Icon className="h-4 w-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium text-sm">{PLATFORM_LABELS[platform]}</span>
                                  <Badge variant={status.variant} className="gap-1">
                                    <StatusIcon className={`h-3 w-3 ${status.color}`} />
                                    {status.label}
                                  </Badge>
                                </div>
                                {!isConnected ? (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Não conectado.
                                  </p>
                                ) : (
                                  <div className="mt-2 space-y-1.5 text-xs">
                                    {platform === 'meta' && metaConfig?.meta_business_id && (
                                      <div className="flex items-center gap-2">
                                        <Hash className="h-3 w-3 text-muted-foreground" />
                                        <span className="text-muted-foreground">BM:</span>
                                        <span className="font-mono">{metaConfig.meta_business_id}</span>
                                      </div>
                                    )}
                                    {accountId && (
                                      <div className="flex items-center gap-2">
                                        <Hash className="h-3 w-3 text-muted-foreground" />
                                        <span className="text-muted-foreground">Conta:</span>
                                        <span className="font-mono">{accountId}</span>
                                      </div>
                                    )}
                                    {expiresAt && (
                                      <div className="flex items-center gap-2">
                                        <Clock className="h-3 w-3 text-muted-foreground" />
                                        <span className="text-muted-foreground">Expira:</span>
                                        <span>{new Date(expiresAt).toLocaleString('pt-BR')}</span>
                                      </div>
                                    )}
                                    {extraEntries.length > 0 && (
                                      <div className="flex flex-wrap gap-1 pt-1">
                                        {extraEntries.map(([k, v]) => (
                                          <Badge key={k} variant="outline" className="text-[10px] font-mono">
                                            {k}: {Array.isArray(v) ? v.join(',') : String(v).slice(0, 30)}
                                          </Badge>
                                        ))}
                                      </div>
                                    )}
                                    <div className="flex items-start gap-2 pt-1">
                                      <Key className="h-3 w-3 text-muted-foreground mt-0.5" />
                                      <div className="flex-1">
                                        <span className="text-muted-foreground">Escopos:</span>{' '}
                                        {scopes.length === 0 ? (
                                          <span className="text-muted-foreground italic">
                                            não capturados (próximo OAuth registrará)
                                          </span>
                                        ) : (
                                          <div className="flex flex-wrap gap-1 mt-1">
                                            {scopes.map((s) => (
                                              <Badge key={s} variant="secondary" className="text-[10px] font-mono">
                                                {s}
                                              </Badge>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                            {isConnected && (
                              <Button
                                size="sm" variant="outline"
                                disabled={verifying === key}
                                onClick={() => handleVerify(platform, company.id, key)}
                              >
                                {verifying === key ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <><RefreshCw className="h-3 w-3 mr-1" />Verificar</>
                                )}
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Card>
          );
        })}
      </Accordion>
    </div>
  );
}
