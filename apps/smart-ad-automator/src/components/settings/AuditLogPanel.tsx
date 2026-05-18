import { useState } from 'react';
import { useAuditLogs, useRealtimeAuditLogs, type AuditLogRow } from '@/hooks/useAuditLogs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  ScrollText, AlertTriangle, AlertCircle, Info, XCircle,
  Download, Search, RefreshCw,
} from 'lucide-react';

const SEVERITY_META: Record<string, { Icon: any; cls: string; label: string }> = {
  info: { Icon: Info, cls: 'text-muted-foreground border-muted', label: 'Info' },
  warning: { Icon: AlertCircle, cls: 'text-amber-500 border-amber-500/40', label: 'Aviso' },
  error: { Icon: AlertTriangle, cls: 'text-orange-500 border-orange-500/40', label: 'Erro' },
  critical: { Icon: XCircle, cls: 'text-destructive border-destructive/40', label: 'Crítico' },
};

const PLATFORM_LABEL: Record<string, string> = {
  meta: 'Meta Ads',
  google_ads: 'Google Ads',
  tiktok_ads: 'TikTok Ads',
};

function exportCsv(rows: AuditLogRow[]) {
  const header = ['created_at', 'severity', 'category', 'action', 'platform', 'company_id', 'message'];
  const csv = [
    header.join(','),
    ...rows.map((r) => header.map((h) => {
      const v = (r as any)[h] ?? '';
      const s = String(v).replace(/"/g, '""');
      return `"${s}"`;
    }).join(',')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `audit-logs-${Date.now()}.csv`; a.click();
  URL.revokeObjectURL(url);
}

export function AuditLogPanel() {
  const [platform, setPlatform] = useState<string>('all');
  const [severity, setSeverity] = useState<string>('all');
  const [category, setCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<AuditLogRow | null>(null);

  const { data: logs = [], isLoading, refetch } = useAuditLogs({
    platform: platform === 'all' ? undefined : (platform as any),
    severity: severity === 'all' ? undefined : (severity as any),
    category: category === 'all' ? undefined : category,
    search: search || undefined,
    limit: 300,
  });

  useRealtimeAuditLogs(() => { /* react-query refetch handled inside hook */ });

  return (
    <div className="space-y-4">
      <Card className="bg-muted/30">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <ScrollText className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Logs de auditoria</CardTitle>
          </div>
          <CardDescription>
            Histórico de eventos de OAuth, expiração de tokens, falhas de API e webhooks.
            Atualizado em tempo real.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar mensagem..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Severidade" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="warning">Aviso</SelectItem>
                <SelectItem value="error">Erro</SelectItem>
                <SelectItem value="critical">Crítico</SelectItem>
              </SelectContent>
            </Select>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Plataforma" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="meta">Meta Ads</SelectItem>
                <SelectItem value="google_ads">Google Ads</SelectItem>
                <SelectItem value="tiktok_ads">TikTok Ads</SelectItem>
              </SelectContent>
            </Select>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Categoria" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="oauth">OAuth</SelectItem>
                <SelectItem value="token">Token</SelectItem>
                <SelectItem value="api_call">API call</SelectItem>
                <SelectItem value="permission">Permissão</SelectItem>
                <SelectItem value="webhook">Webhook</SelectItem>
                <SelectItem value="config">Config</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => refetch()} title="Recarregar">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportCsv(logs)}>
              <Download className="h-4 w-4 mr-1" /> CSV
            </Button>
          </div>

          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px]">Quando</TableHead>
                  <TableHead className="w-[100px]">Sev.</TableHead>
                  <TableHead className="w-[110px]">Plataforma</TableHead>
                  <TableHead className="w-[120px]">Ação</TableHead>
                  <TableHead>Mensagem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Carregando…</TableCell></TableRow>
                ) : logs.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum log encontrado.</TableCell></TableRow>
                ) : logs.map((row) => {
                  const meta = SEVERITY_META[row.severity] ?? SEVERITY_META.info;
                  const Icon = meta.Icon;
                  return (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelected(row)}
                    >
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(row.created_at).toLocaleString('pt-BR')}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`gap-1 ${meta.cls}`}>
                          <Icon className="h-3 w-3" /> {meta.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {row.platform ? PLATFORM_LABEL[row.platform] : '—'}
                      </TableCell>
                      <TableCell className="text-xs font-mono">{row.action}</TableCell>
                      <TableCell className="text-sm truncate max-w-[400px]">{row.message}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-[480px] sm:max-w-[480px] overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  {(() => {
                    const m = SEVERITY_META[selected.severity] ?? SEVERITY_META.info;
                    const Icon = m.Icon;
                    return <Icon className={`h-5 w-5 ${m.cls.split(' ')[0]}`} />;
                  })()}
                  {selected.action}
                </SheetTitle>
                <SheetDescription>
                  {new Date(selected.created_at).toLocaleString('pt-BR')} ·
                  {' '}{selected.actor_type} ·
                  {' '}{selected.platform ?? 'sem plataforma'}
                </SheetDescription>
              </SheetHeader>
              <div className="mt-4 space-y-4 text-sm">
                <div>
                  <p className="text-xs uppercase text-muted-foreground mb-1">Mensagem</p>
                  <p>{selected.message}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground mb-1">Categoria</p>
                  <Badge variant="outline">{selected.category}</Badge>
                </div>
                {selected.company_id && (
                  <div>
                    <p className="text-xs uppercase text-muted-foreground mb-1">Empresa</p>
                    <code className="text-xs">{selected.company_id}</code>
                  </div>
                )}
                <div>
                  <p className="text-xs uppercase text-muted-foreground mb-1">Metadata</p>
                  <pre className="bg-muted rounded p-3 text-[11px] overflow-auto max-h-[400px]">
                    {JSON.stringify(selected.metadata, null, 2)}
                  </pre>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
