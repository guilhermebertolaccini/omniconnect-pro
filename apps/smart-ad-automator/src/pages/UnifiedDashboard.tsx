import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCompany } from '@/contexts/CompanyContext';
import { useUnifiedData } from '@/hooks/useUnifiedData';
import { PLATFORM_LABELS, type AdPlatform } from '@/services/platformConfigService';
import { Link } from 'react-router-dom';
import {
  DollarSign,
  Eye,
  MousePointerClick,
  Target,
  Percent,
  TrendingUp,
  AlertCircle,
  Settings as SettingsIcon,
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Legend,
} from 'recharts';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useState } from 'react';

type PlatformFilter = 'all' | AdPlatform;

const PLATFORM_COLORS: Record<AdPlatform, string> = {
  meta: 'hsl(217, 91%, 60%)',
  google_ads: 'hsl(142, 71%, 45%)',
  tiktok_ads: 'hsl(330, 81%, 60%)',
};

function fmtCurrency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function fmtNum(v: number) {
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}
function fmtPct(v: number) {
  return `${v.toFixed(2)}%`;
}

function KpiCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof DollarSign;
  label: string;
  value: string;
}) {
  return (
    <Card className="bg-card/50 backdrop-blur border-border/50">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-xl font-bold mt-1">{value}</p>
          </div>
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="h-4 w-4 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function UnifiedDashboard() {
  const { selectedCompanyId, companies } = useCompany();
  const data = useUnifiedData(selectedCompanyId);
  const company = companies.find((c) => c.id === selectedCompanyId);

  const [filter, setFilter] = useState<PlatformFilter>('all');

  const visiblePlatforms = filter === 'all'
    ? data.platforms
    : data.platforms.filter((p) => p.platform === filter);

  const aggregated = filter === 'all'
    ? data.aggregated
    : (() => {
        const p = data.perPlatform[filter];
        return {
          spend: p.totals.spend,
          impressions: p.totals.impressions,
          clicks: p.totals.clicks,
          conversions: p.totals.conversions,
          ctr: p.totals.ctr,
          cpc: p.totals.cpc,
          cpa: p.totals.conversions > 0 ? p.totals.spend / p.totals.conversions : 0,
        };
      })();

  const pieData = visiblePlatforms
    .filter((p) => p.totals.spend > 0)
    .map((p) => ({
      name: PLATFORM_LABELS[p.platform],
      value: p.totals.spend,
      platform: p.platform,
    }));

  const barData = visiblePlatforms.map((p) => ({
    name: PLATFORM_LABELS[p.platform],
    CTR: Number(p.totals.ctr.toFixed(2)),
    CPC: Number(p.totals.cpc.toFixed(2)),
  }));

  const filteredCampaigns = filter === 'all'
    ? data.allCampaigns
    : data.allCampaigns.filter((c) => c._platform === filter);

  const topCampaigns = [...filteredCampaigns]
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 10);

  const disconnected = data.platforms.filter((p) => !p.isLive);

  return (
    <DashboardLayout>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Visão Unificada</h1>
          <p className="text-muted-foreground">
            {company?.business_name ?? 'Empresa'} — todas as plataformas em um só lugar
          </p>
        </div>
        <ToggleGroup
          type="single"
          value={filter}
          onValueChange={(v) => v && setFilter(v as PlatformFilter)}
          className="bg-muted/40 rounded-lg p-1 self-start"
        >
          <ToggleGroupItem value="all" className="text-xs px-3">Todas</ToggleGroupItem>
          <ToggleGroupItem value="meta" className="text-xs px-3">Meta</ToggleGroupItem>
          <ToggleGroupItem value="google_ads" className="text-xs px-3">Google</ToggleGroupItem>
          <ToggleGroupItem value="tiktok_ads" className="text-xs px-3">TikTok</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Connection alerts */}
      {disconnected.length > 0 && (
        <Card className="mb-6 border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5" />
              <div>
                <p className="font-medium text-sm">Plataformas não conectadas</p>
                <p className="text-xs text-muted-foreground">
                  Mostrando dados de exemplo para:{' '}
                  {disconnected.map((p) => PLATFORM_LABELS[p.platform]).join(', ')}
                </p>
              </div>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to="/settings">
                <SettingsIcon className="h-4 w-4 mr-2" />
                Conectar
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* KPIs consolidados */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <KpiCard icon={DollarSign} label="Investimento" value={fmtCurrency(aggregated.spend)} />
        <KpiCard icon={Eye} label="Impressões" value={fmtNum(aggregated.impressions)} />
        <KpiCard icon={MousePointerClick} label="Cliques" value={fmtNum(aggregated.clicks)} />
        <KpiCard icon={Percent} label="CTR" value={fmtPct(aggregated.ctr)} />
        <KpiCard icon={TrendingUp} label="CPC" value={fmtCurrency(aggregated.cpc)} />
        <KpiCard icon={Target} label="Conversões" value={fmtNum(aggregated.conversions)} />
      </div>

      {/* Comparativo por plataforma */}
      <div className="grid gap-3 md:grid-cols-3 mb-6">
        {visiblePlatforms.map((p) => (
          <Card
            key={p.platform}
            className="bg-card/50 backdrop-blur border-border/50"
            style={{ borderTop: `3px solid ${PLATFORM_COLORS[p.platform]}` }}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{PLATFORM_LABELS[p.platform]}</CardTitle>
                <Badge variant={p.isLive ? 'default' : 'secondary'} className="text-xs">
                  {p.isLive ? 'Ao vivo' : 'Não conectada'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {p.isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Investimento</span>
                    <span className="font-semibold">{fmtCurrency(p.totals.spend)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Impressões</span>
                    <span>{fmtNum(p.totals.impressions)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cliques</span>
                    <span>{fmtNum(p.totals.clicks)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">CTR</span>
                    <span>{fmtPct(p.totals.ctr)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">CPC</span>
                    <span>{fmtCurrency(p.totals.cpc)}</span>
                  </div>
                  {p.error && (
                    <p className="text-xs text-destructive mt-2">{p.error.message}</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2 mb-6">
        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardHeader>
            <CardTitle className="text-base">Distribuição de Investimento</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Sem dados</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label={(e: any) => `${e.name}: ${fmtPct((e.value / (aggregated.spend || 1)) * 100)}`}
                  >
                    {pieData.map((entry) => (
                      <Cell key={entry.platform} fill={PLATFORM_COLORS[entry.platform]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number) => fmtCurrency(v)}
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardHeader>
            <CardTitle className="text-base">CTR vs CPC por Plataforma</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={barData}>
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                />
                <Legend />
                <Bar dataKey="CTR" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="CPC" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Top campaigns */}
      <Card className="bg-card/50 backdrop-blur border-border/50">
        <CardHeader>
          <CardTitle className="text-base">Top Campanhas (todas as plataformas)</CardTitle>
        </CardHeader>
        <CardContent>
          {topCampaigns.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhuma campanha</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plataforma</TableHead>
                    <TableHead>Campanha</TableHead>
                    <TableHead className="text-right">Investimento</TableHead>
                    <TableHead className="text-right">Impressões</TableHead>
                    <TableHead className="text-right">Cliques</TableHead>
                    <TableHead className="text-right">CTR</TableHead>
                    <TableHead className="text-right">CPC</TableHead>
                    <TableHead className="text-right">Conversões</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topCampaigns.map((c) => (
                    <TableRow key={`${c._platform}-${c.id}`}>
                      <TableCell>
                        <Badge
                          variant="outline"
                          style={{
                            borderColor: PLATFORM_COLORS[c._platform],
                            color: PLATFORM_COLORS[c._platform],
                          }}
                        >
                          {PLATFORM_LABELS[c._platform]}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium max-w-[260px] truncate">{c.name}</TableCell>
                      <TableCell className="text-right">{fmtCurrency(c.spent)}</TableCell>
                      <TableCell className="text-right">{fmtNum(c.impressions)}</TableCell>
                      <TableCell className="text-right">{fmtNum(c.clicks)}</TableCell>
                      <TableCell className="text-right">{fmtPct(c.ctr)}</TableCell>
                      <TableCell className="text-right">{fmtCurrency(c.cpc)}</TableCell>
                      <TableCell className="text-right">{fmtNum(c.conversions)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
