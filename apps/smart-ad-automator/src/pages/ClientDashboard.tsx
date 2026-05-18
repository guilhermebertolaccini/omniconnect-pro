import { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { ClientLayout } from '@/components/layout/ClientLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Users,
  MousePointerClick,
  ShoppingCart,
  CircleDollarSign,
  TrendingUp,
  CheckCircle2,
  PauseCircle,
  AlertCircle,
  Sparkles,
  CalendarCheck,
  MessageCircle,
  UserCheck,
  ChevronDown,
  Target,
  MapPin,
  Monitor,
  Palette,
  ExternalLink,
  Download,
  PlusCircle,
  DollarSign,
  Briefcase,
  ShoppingBag,
  BarChart3,
  Eye,
  Heart,
  FileText,
  Instagram,
  Facebook,
  Megaphone,
  ImageIcon,
  Bookmark,
} from 'lucide-react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { mockAccounts, mockCampaigns, mockPosts } from '@/data/mockData';
// Note: ClientDashboard uses mock data as default. When Meta API token is configured,
// data will be fetched via services in the admin pages and passed through account context.
import type { Post } from '@/types/campaign';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const typeLabel: Record<string, string> = {
  image: 'Imagem',
  video: 'Vídeo',
  carousel: 'Carrossel',
  reels: 'Reels',
  story: 'Story',
};

const performanceDataRaw = [
  { day: 'Seg', conversoes: 18, whatsapp: 8, gasto: 320 },
  { day: 'Ter', conversoes: 25, whatsapp: 12, gasto: 450 },
  { day: 'Qua', conversoes: 22, whatsapp: 10, gasto: 380 },
  { day: 'Qui', conversoes: 31, whatsapp: 15, gasto: 520 },
  { day: 'Sex', conversoes: 42, whatsapp: 20, gasto: 680 },
  { day: 'Sáb', conversoes: 38, whatsapp: 18, gasto: 610 },
  { day: 'Dom', conversoes: 28, whatsapp: 14, gasto: 440 },
];

function getCostResultLabel(objectives: string[]): string {
  const unique = [...new Set(objectives)];
  if (unique.length === 1) {
    const obj = unique[0].toLowerCase();
    if (obj.includes('convers')) return 'Custo/Conversão';
    if (obj.includes('lead')) return 'Custo/Lead';
    if (obj.includes('awareness') || obj.includes('brand')) return 'CPM';
    if (obj.includes('traffic') || obj.includes('tráfego')) return 'CPC';
    if (obj.includes('engagement') || obj.includes('engaj')) return 'Custo/Engajamento';
    if (obj.includes('messages') || obj.includes('mensag') || obj.includes('whatsapp') || obj.includes('conversa')) return 'Custo/Conversa';
  }
  return 'Custo/Resultado';
}

const statusIcon = {
  active: <CheckCircle2 className="h-5 w-5 text-success" />,
  paused: <PauseCircle className="h-5 w-5 text-warning" />,
  ended: <CheckCircle2 className="h-5 w-5 text-muted-foreground" />,
  issue: <AlertCircle className="h-5 w-5 text-destructive" />,
};

const statusLabel = {
  active: 'Ativa',
  paused: 'Pausada',
  ended: 'Encerrada',
  issue: 'Atenção necessária',
};

const statusBadge = {
  active: 'bg-success/15 text-success border-success/30',
  paused: 'bg-warning/15 text-warning border-warning/30',
  ended: 'bg-muted text-muted-foreground border-muted',
  issue: 'bg-destructive/15 text-destructive border-destructive/30',
};

export default function ClientDashboard() {
  const { accountId } = useParams<{ accountId: string }>();
  const [period, setPeriod] = useState<7 | 30>(7);
  const [creditAmount, setCreditAmount] = useState('');
  const [creditDialogOpen, setCreditDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused' | 'ended'>('all');
  const [viewMode, setViewMode] = useState<'ads' | 'posts'>('ads');

  const account = mockAccounts.find((a) => a.id === accountId) ?? mockAccounts[0];
  const campaigns = mockCampaigns.filter((c) => c.accountName === account.name);

  // Aggregate metrics
  const totalImpressions = campaigns.reduce((s, c) => s + c.impressions, 0);
  const totalClicks = campaigns.reduce((s, c) => s + c.clicks, 0);
  const totalConversions = campaigns.reduce((s, c) => s + c.conversions, 0);
  const totalSpent = campaigns.reduce((s, c) => s + c.spent, 0);
  const totalBudget = campaigns.reduce((s, c) => s + c.budget, 0);
  const totalWhatsapp = campaigns.reduce((s, c) => s + c.whatsappConversations, 0);
  const totalMqls = campaigns.reduce((s, c) => s + c.mqls, 0);
  const totalSqls = campaigns.reduce((s, c) => s + c.sqls, 0);
  const totalSales = campaigns.reduce((s, c) => s + c.salesClosed, 0);
  const avgCpa = totalConversions > 0 ? totalSpent / totalConversions : 0;
  const spentPercent = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

  const fmt = (n: number) =>
    new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      maximumFractionDigits: 0,
    }).format(n);

  const fmtNum = (n: number) =>
    new Intl.NumberFormat('pt-BR').format(n);

  const insightMessage =
    totalConversions > 50
      ? '🎉 Excelente! Suas campanhas estão gerando ótimos resultados esta semana.'
      : totalConversions > 20
      ? '📈 Suas campanhas estão performando bem e continuam crescendo.'
      : '⚙️ Estamos otimizando suas campanhas para melhorar os resultados.';

  const conversionRate = (from: number, to: number) => {
    if (from === 0) return '0%';
    return `${((to / from) * 100).toFixed(1)}%`;
  };

  // CSV Download
  const downloadCSV = () => {
    const headers = ['Campanha', 'Status', 'Orçamento', 'Gasto', 'Impressões', 'Cliques', 'Conversões', 'ROAS', 'CPA', 'WhatsApp', 'MQL', 'SQL', 'Vendas'];
    const rows = campaigns.map((c) => [
      c.name,
      statusLabel[c.status],
      c.budget.toFixed(2),
      c.spent.toFixed(2),
      c.impressions,
      c.clicks,
      c.conversions,
      c.roas.toFixed(2),
      c.cpa.toFixed(2),
      c.whatsappConversations,
      c.mqls,
      c.sqls,
      c.salesClosed,
    ]);
    // Totals row
    rows.push([
      'TOTAL',
      '-',
      totalBudget.toFixed(2),
      totalSpent.toFixed(2),
      totalImpressions,
      totalClicks,
      totalConversions,
      '-',
      avgCpa.toFixed(2),
      totalWhatsapp,
      totalMqls,
      totalSqls,
      totalSales,
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const date = new Date().toISOString().slice(0, 10);
    a.download = `relatorio-${account.name.toLowerCase().replace(/\s+/g, '-')}-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Relatório CSV baixado com sucesso!');
  };

  // Add credit
  const handleAddCredit = () => {
    const value = parseFloat(creditAmount.replace(/[^\d,]/g, '').replace(',', '.'));
    if (!value || value <= 0) {
      toast.error('Informe um valor válido.');
      return;
    }
    const platformFee = value * 0.05;
    const clientCredit = value - platformFee;
    // platformFee can be sent to backend/logged when integrated
    console.log(`[Platform] Fee: ${platformFee.toFixed(2)} | Client credit: ${clientCredit.toFixed(2)}`);
    toast.success(`Crédito de ${fmt(value)} adicionado com sucesso!`);
    setCreditAmount('');
    setCreditDialogOpen(false);
  };

  const presetCredits = [500, 1000, 2000, 5000];

  const hasWhatsappData = totalWhatsapp > 0;

  const campaignObjectives = campaigns.map(c => c.objective);
  const costResultLabel = getCostResultLabel(campaignObjectives);

  const performanceData = performanceDataRaw.map(d => ({
    ...d,
    custoResultado: d.conversoes > 0 ? Math.round((d.gasto / d.conversoes) * 100) / 100 : 0,
  }));

  // Posts data
  const posts = useMemo(() => mockPosts.filter(p => p.accountName === account.name), [account.name]);
  const postMetrics = useMemo(() => {
    const total = posts.length;
    const avgReach = total > 0 ? posts.reduce((s, p) => s + p.reach, 0) / total : 0;
    const engageable = posts.filter(p => p.engagementRate > 0);
    const avgEng = engageable.length > 0 ? engageable.reduce((s, p) => s + p.engagementRate, 0) / engageable.length : 0;
    const best = [...posts].sort((a, b) => b.reach - a.reach)[0];
    return { total, avgReach, avgEng, bestPost: best };
  }, [posts]);

  const postChartData = useMemo(() => {
    if (posts.length === 0) return [];
    const byDate: Record<string, { reach: number; engagement: number; count: number }> = {};
    [...posts]
      .sort((a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime())
      .forEach((p) => {
        const d = new Date(p.publishedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
        if (!byDate[d]) byDate[d] = { reach: 0, engagement: 0, count: 0 };
        byDate[d].reach += p.reach;
        byDate[d].engagement += p.engagementRate;
        byDate[d].count += 1;
      });
    return Object.entries(byDate).map(([date, v]) => ({
      date,
      alcance: v.reach,
      engajamento: Number((v.engagement / v.count).toFixed(1)),
    }));
  }, [posts]);

  return (
    <ClientLayout
      businessName={account.businessName}
      agencyName="Minha Agência"
    >
      {/* Header with actions */}
      <div className="mb-6 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Resultados</h1>
            <p className="text-sm text-muted-foreground">{account.businessName}</p>
          </div>
          <div className="flex gap-1 rounded-lg border border-border p-1">
            <Button
              size="sm"
              variant={period === 7 ? 'default' : 'ghost'}
              className="h-7 px-3 text-xs"
              onClick={() => setPeriod(7)}
            >
              7 dias
            </Button>
            <Button
              size="sm"
              variant={period === 30 ? 'default' : 'ghost'}
              className="h-7 px-3 text-xs"
              onClick={() => setPeriod(30)}
            >
              30 dias
            </Button>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={downloadCSV}>
            <Download className="h-3.5 w-3.5" />
            Baixar CSV
          </Button>
          <Dialog open={creditDialogOpen} onOpenChange={setCreditDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-8 text-xs gap-1.5">
                <PlusCircle className="h-3.5 w-3.5" />
                Adicionar Crédito
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-primary" />
                  Adicionar Crédito
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Selecione um valor ou insira um personalizado:</p>
                <div className="grid grid-cols-2 gap-2">
                  {presetCredits.map((v) => (
                    <Button
                      key={v}
                      variant={creditAmount === String(v) ? 'default' : 'outline'}
                      className="h-10"
                      onClick={() => setCreditAmount(String(v))}
                    >
                      {fmt(v)}
                    </Button>
                  ))}
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Valor personalizado</label>
                  <Input
                    placeholder="Ex: 3000"
                    value={creditAmount}
                    onChange={(e) => setCreditAmount(e.target.value)}
                    type="number"
                    min={1}
                  />
                </div>
                <Button className="w-full" onClick={handleAddCredit}>
                  Confirmar
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* AI Insight */}
      <Card className="mb-6 border-primary/20 bg-primary/5">
        <CardContent className="flex items-start gap-3 p-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-primary">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <p className="text-sm leading-relaxed">{insightMessage}</p>
        </CardContent>
      </Card>

      {/* View Mode Toggle */}
      <div className="mb-6 flex gap-1 rounded-lg border border-border p-1 bg-muted/50">
        <Button
          size="sm"
          variant={viewMode === 'ads' ? 'default' : 'ghost'}
          className="flex-1 h-9 text-xs gap-1.5"
          onClick={() => setViewMode('ads')}
        >
          <Megaphone className="h-3.5 w-3.5" />
          Anúncios
        </Button>
        <Button
          size="sm"
          variant={viewMode === 'posts' ? 'default' : 'ghost'}
          className="flex-1 h-9 text-xs gap-1.5"
          onClick={() => setViewMode('posts')}
        >
          <ImageIcon className="h-3.5 w-3.5" />
          Publicações
        </Button>
      </div>

      {viewMode === 'ads' ? (
        <>
          {/* Gastos Totais */}
          <Card className="mb-6">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">Gastos Totais</span>
              </div>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-2xl font-bold">{fmt(totalSpent)}</p>
                  <p className="text-xs text-muted-foreground">de {fmt(totalBudget)} em orçamento</p>
                </div>
                <span className={cn(
                  'text-sm font-semibold',
                  spentPercent >= 90 ? 'text-destructive' : spentPercent >= 70 ? 'text-warning' : 'text-success'
                )}>
                  {spentPercent.toFixed(0)}%
                </span>
              </div>
              <Progress
                value={Math.min(spentPercent, 100)}
                className={cn(
                  'h-2.5',
                  spentPercent >= 90 ? '[&>div]:bg-destructive' : spentPercent >= 70 ? '[&>div]:bg-warning' : '[&>div]:bg-success'
                )}
              />
            </CardContent>
          </Card>

          {/* WhatsApp Funnel */}
          {hasWhatsappData && (
            <Card className="mb-6">
              <CardHeader className="pb-3 p-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-success" />
                  Funil WhatsApp
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-2">
                {[
                  { label: 'Conversas WhatsApp', value: totalWhatsapp, icon: MessageCircle, color: 'text-success' },
                  { label: 'Leads Qualificados (MQL)', value: totalMqls, icon: UserCheck, color: 'text-accent' },
                  { label: 'Prontos p/ Venda (SQL)', value: totalSqls, icon: Briefcase, color: 'text-warning' },
                  { label: 'Vendas Fechadas', value: totalSales, icon: ShoppingBag, color: 'text-success' },
                ].map((step, i, arr) => {
                  const Icon = step.icon;
                  return (
                    <div key={step.label}>
                      <div className="flex items-center justify-between py-1.5">
                        <div className="flex items-center gap-2">
                          <Icon className={cn('h-4 w-4', step.color)} />
                          <span className="text-xs">{step.label}</span>
                        </div>
                        <span className="text-sm font-bold">{fmtNum(step.value)}</span>
                      </div>
                      {i < arr.length - 1 && (
                        <div className="ml-2 flex items-center gap-1 pb-1">
                          <div className="h-3 border-l border-dashed border-muted-foreground/30" />
                          <span className="ml-4 text-[10px] text-muted-foreground">
                            {conversionRate(step.value, arr[i + 1].value)} conversão
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Key Metrics */}
          <div className="mb-6 grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="p-4">
                <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                  <Users className="h-4 w-4" />
                  <span className="text-xs">Pessoas alcançadas</span>
                </div>
                <p className="text-2xl font-bold">{fmtNum(totalImpressions)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                  <MousePointerClick className="h-4 w-4" />
                  <span className="text-xs">Cliques no anúncio</span>
                </div>
                <p className="text-2xl font-bold">{fmtNum(totalClicks)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                  <ShoppingCart className="h-4 w-4" />
                  <span className="text-xs">Resultados gerados</span>
                </div>
                <p className="text-2xl font-bold text-success">{fmtNum(totalConversions)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                  <CircleDollarSign className="h-4 w-4" />
                  <span className="text-xs">Custo por resultado</span>
                </div>
                <p className="text-2xl font-bold">{avgCpa > 0 ? fmt(avgCpa) : '-'}</p>
              </CardContent>
            </Card>
          </div>

          {/* Performance Chart */}
          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="mb-3 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                <p className="text-sm font-medium">Resultados por dia</p>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={performanceData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: 12,
                    }}
                    formatter={(value: number, name: string) => {
                      if (name === costResultLabel) return [`R$ ${value.toFixed(2)}`, name];
                      if (name === 'Gasto (R$)') return [`R$ ${value.toFixed(0)}`, name];
                      return [value, name];
                    }}
                  />
                  <Line type="monotone" dataKey="conversoes" name="Resultados" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} yAxisId="left" />
                  <Line type="monotone" dataKey="gasto" name="Gasto (R$)" stroke="hsl(var(--warning))" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} yAxisId="left" />
                  <Line type="monotone" dataKey="whatsapp" name="WhatsApp" stroke="hsl(var(--success))" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} strokeDasharray="5 5" yAxisId="left" />
                  <Line type="monotone" dataKey="custoResultado" name={costResultLabel} stroke="hsl(var(--destructive))" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} yAxisId="right" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          {/* Posts Metrics */}
          <div className="mb-6 grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="p-4">
                <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                  <FileText className="h-4 w-4" />
                  <span className="text-xs">Total de Posts</span>
                </div>
                <p className="text-2xl font-bold">{postMetrics.total}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                  <Eye className="h-4 w-4" />
                  <span className="text-xs">Alcance Médio</span>
                </div>
                <p className="text-2xl font-bold">{fmtNum(Math.round(postMetrics.avgReach))}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-xs">Engajamento Médio</span>
                </div>
                <p className="text-2xl font-bold text-success">{postMetrics.avgEng.toFixed(1)}%</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                  <Heart className="h-4 w-4" />
                  <span className="text-xs">Melhor Post</span>
                </div>
                <p className="text-2xl font-bold">{postMetrics.bestPost ? fmtNum(postMetrics.bestPost.reach) : '—'}</p>
                {postMetrics.bestPost && <p className="text-[10px] text-muted-foreground">alcance</p>}
              </CardContent>
            </Card>
          </div>

          {/* Posts Trend Chart */}
          {postChartData.length >= 2 && (
            <Card className="mb-6">
              <CardContent className="p-4">
                <div className="mb-3 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  <p className="text-sm font-medium">Evolução de Alcance e Engajamento</p>
                </div>
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={postChartData}>
                    <defs>
                      <linearGradient id="clientColorReach" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="clientColorEng" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} className="text-muted-foreground" unit="%" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        fontSize: 12,
                      }}
                      formatter={(value: number, name: string) =>
                        name === 'Engajamento' ? [`${value}%`, name] : [value.toLocaleString('pt-BR'), name]
                      }
                    />
                    <Area yAxisId="left" type="monotone" dataKey="alcance" stroke="hsl(var(--primary))" strokeWidth={2} fillOpacity={1} fill="url(#clientColorReach)" name="Alcance" />
                    <Area yAxisId="right" type="monotone" dataKey="engajamento" stroke="hsl(var(--success))" strokeWidth={2} fillOpacity={1} fill="url(#clientColorEng)" name="Engajamento" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Post Insights */}
          {posts.length > 0 && (() => {
            const insights: { icon: React.ReactNode; text: string }[] = [];

            // Best type by avg reach
            const byType = posts.reduce<Record<string, { reach: number; count: number }>>((acc, p) => {
              if (!acc[p.type]) acc[p.type] = { reach: 0, count: 0 };
              acc[p.type].reach += p.reach;
              acc[p.type].count += 1;
              return acc;
            }, {});
            const bestType = Object.entries(byType).sort((a, b) => b[1].reach / b[1].count - a[1].reach / a[1].count)[0];
            if (bestType) {
              insights.push({
                icon: <TrendingUp className="h-4 w-4 text-success" />,
                text: `Posts em formato ${typeLabel[bestType[0]] || bestType[0]} têm o maior alcance médio (${Math.round(bestType[1].reach / bestType[1].count).toLocaleString('pt-BR')})`,
              });
            }

            // Best engagement post
            const bestEng = [...posts].filter(p => p.engagementRate > 0).sort((a, b) => b.engagementRate - a.engagementRate)[0];
            if (bestEng) {
              insights.push({
                icon: <Heart className="h-4 w-4 text-destructive" />,
                text: `Melhor engajamento: "${bestEng.caption.slice(0, 40)}..." com ${bestEng.engagementRate.toFixed(1)}%`,
              });
            }

            // Saves insight
            const highSaves = posts.filter(p => p.saves > 500);
            if (highSaves.length > 0) {
              const avgSavesType = highSaves.reduce<Record<string, number[]>>((acc, p) => {
                if (!acc[p.type]) acc[p.type] = [];
                acc[p.type].push(p.saves);
                return acc;
              }, {});
              const topSaveType = Object.entries(avgSavesType).sort((a, b) => {
                const avgA = a[1].reduce((s, v) => s + v, 0) / a[1].length;
                const avgB = b[1].reduce((s, v) => s + v, 0) / b[1].length;
                return avgB - avgA;
              })[0];
              if (topSaveType) {
                insights.push({
                  icon: <Bookmark className="h-4 w-4 text-warning" />,
                  text: `Posts com ${typeLabel[topSaveType[0]] || topSaveType[0]} geram mais salvamentos`,
                });
              }
            }

            // Best time
            const hourGroups = posts.reduce<Record<number, number>>((acc, p) => {
              const h = new Date(p.publishedAt).getHours();
              acc[h] = (acc[h] || 0) + 1;
              return acc;
            }, {});
            const peakHour = Object.entries(hourGroups).sort((a, b) => Number(b[1]) - Number(a[1]))[0];
            if (peakHour) {
              insights.push({
                icon: <Sparkles className="h-4 w-4 text-accent" />,
                text: `Horário com mais publicações: ${peakHour[0]}h — avalie concentrar posts nesse período`,
              });
            }

            if (insights.length === 0) return null;

            return (
              <Card className="mb-6 border-primary/20 bg-primary/5">
                <CardHeader className="pb-2 p-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    Insights de Publicações
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0 space-y-2">
                  {insights.map((ins, i) => (
                    <div key={i} className="flex items-start gap-3 rounded-lg border border-border/50 bg-muted/30 p-3 text-sm">
                      {ins.icon}
                      <span>{ins.text}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })()}


          <div className="mb-6 space-y-2">
            <p className="mb-3 text-sm font-semibold">Publicações recentes</p>
            {posts.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma publicação encontrada</p>
            ) : (
              [...posts]
                .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
                .map((post) => (
                  <Card key={post.id}>
                    <CardContent className="p-4 space-y-2">
                      <p className="text-sm line-clamp-2">{post.caption}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0">
                          {post.platform === 'Instagram' ? <Instagram className="h-3 w-3" /> : <Facebook className="h-3 w-3" />}
                          {post.platform}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {typeLabel[post.type] || post.type}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(post.publishedAt).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Eye className="h-3 w-3" />
                          {fmtNum(post.reach)}
                        </span>
                        <span className="flex items-center gap-1">
                          <TrendingUp className="h-3 w-3" />
                          {post.engagementRate.toFixed(1)}%
                        </span>
                        <span className="flex items-center gap-1">
                          <Heart className="h-3 w-3" />
                          {fmtNum(post.likes)}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))
            )}
          </div>
        </>
      )}

      {viewMode === 'ads' && <>
      {/* Campaign Status */}
      <div className="mb-6">
        <p className="mb-3 text-sm font-semibold">Status das campanhas</p>
        {/* Filter chips */}
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {([
            { value: 'all' as const, label: 'Todas', count: campaigns.length },
            { value: 'active' as const, label: 'Ativas', count: campaigns.filter(c => c.status === 'active').length },
            { value: 'paused' as const, label: 'Pausadas', count: campaigns.filter(c => c.status === 'paused').length },
            { value: 'ended' as const, label: 'Encerradas', count: campaigns.filter(c => c.status === 'ended').length },
          ]).map((f) => (
            <Button
              key={f.value}
              size="sm"
              variant={statusFilter === f.value ? 'default' : 'outline'}
              className="h-8 shrink-0 text-xs"
              onClick={() => setStatusFilter(f.value)}
            >
              {f.label} ({f.count})
            </Button>
          ))}
        </div>
        <div className="space-y-2">
          {campaigns
            .filter(c => statusFilter === 'all' || c.status === statusFilter)
            .length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma campanha com este status</p>
          ) : campaigns.filter(c => statusFilter === 'all' || c.status === statusFilter).map((campaign) => {
            const hasDetails = campaign.targeting || campaign.geoLocations || campaign.placements || campaign.creative;
            const genderLabel = campaign.targeting?.genders === 'all' ? 'Todos' : campaign.targeting?.genders === 'male' ? 'Masculino' : 'Feminino';

            if (!hasDetails) {
              return (
                <Card key={campaign.id}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3 min-w-0">
                      {statusIcon[campaign.status]}
                      <p className="truncate text-sm font-medium">{campaign.name}</p>
                    </div>
                    <Badge variant="outline" className={cn('ml-2 shrink-0 text-xs', statusBadge[campaign.status])}>
                      {statusLabel[campaign.status]}
                    </Badge>
                  </CardContent>
                </Card>
              );
            }

            return (
              <Collapsible key={campaign.id}>
                <Card>
                  <CollapsibleTrigger className="w-full text-left">
                    <CardContent className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3 min-w-0">
                        {statusIcon[campaign.status]}
                        <p className="truncate text-sm font-medium">{campaign.name}</p>
                      </div>
                      <div className="flex items-center gap-2 ml-2 shrink-0">
                        <Badge variant="outline" className={cn('text-xs', statusBadge[campaign.status])}>
                          {statusLabel[campaign.status]}
                        </Badge>
                        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
                      </div>
                    </CardContent>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="border-t border-border px-4 pb-4 pt-3 space-y-4">
                      {/* Performance Section */}
                      <div className="space-y-3">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                          <BarChart3 className="h-3.5 w-3.5" />
                          Performance
                        </div>

                        {/* Budget progress */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Orçamento</span>
                            <span className="font-medium">{fmt(campaign.spent)} / {fmt(campaign.budget)}</span>
                          </div>
                          <Progress
                            value={Math.min((campaign.spent / campaign.budget) * 100, 100)}
                            className={cn(
                              'h-2',
                              (campaign.spent / campaign.budget) >= 0.9 ? '[&>div]:bg-destructive' : (campaign.spent / campaign.budget) >= 0.7 ? '[&>div]:bg-warning' : '[&>div]:bg-success'
                            )}
                          />
                        </div>

                        {/* Metrics grid */}
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { label: 'Impressões', value: fmtNum(campaign.impressions) },
                            { label: 'Cliques', value: fmtNum(campaign.clicks) },
                            { label: 'Conversões', value: fmtNum(campaign.conversions) },
                            { label: 'CTR', value: `${campaign.ctr.toFixed(2)}%` },
                            { label: 'CPC', value: fmt(campaign.cpc) },
                            { label: 'ROAS', value: `${campaign.roas.toFixed(1)}x` },
                            ...(campaign.cpa > 0 ? [{ label: 'CPA', value: fmt(campaign.cpa) }] : []),
                          ].map((m) => (
                            <div key={m.label} className="rounded-lg bg-muted/50 p-2 text-center">
                              <p className="text-[10px] text-muted-foreground">{m.label}</p>
                              <p className="text-xs font-bold">{m.value}</p>
                            </div>
                          ))}
                        </div>

                        {/* Horizontal bar chart */}
                        {(() => {
                          const maxMetric = Math.max(campaign.impressions, campaign.clicks, campaign.conversions);
                          if (maxMetric === 0) return null;
                          const bars = [
                            { label: 'Impressões', value: campaign.impressions, color: 'bg-primary' },
                            { label: 'Cliques', value: campaign.clicks, color: 'bg-accent' },
                            { label: 'Conversões', value: campaign.conversions, color: 'bg-success' },
                          ];
                          return (
                            <div className="space-y-2">
                              {bars.map((bar) => (
                                <div key={bar.label} className="space-y-0.5">
                                  <div className="flex items-center justify-between text-[10px]">
                                    <span className="text-muted-foreground">{bar.label}</span>
                                    <span className="font-medium">{fmtNum(bar.value)}</span>
                                  </div>
                                  <div className="h-2 w-full rounded-full bg-muted">
                                    <div
                                      className={cn('h-full rounded-full transition-all', bar.color)}
                                      style={{ width: `${(bar.value / maxMetric) * 100}%` }}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          );
                        })()}

                        {/* WhatsApp metrics */}
                        {campaign.whatsappConversations > 0 && (
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
                              <MessageCircle className="h-3 w-3 text-success" />
                              WhatsApp
                            </div>
                            <div className="grid grid-cols-4 gap-1.5">
                              {[
                                { label: 'Conversas', value: campaign.whatsappConversations },
                                { label: 'MQL', value: campaign.mqls },
                                { label: 'SQL', value: campaign.sqls },
                                { label: 'Vendas', value: campaign.salesClosed },
                              ].map((m) => (
                                <div key={m.label} className="rounded-lg bg-success/10 p-1.5 text-center">
                                  <p className="text-[9px] text-muted-foreground">{m.label}</p>
                                  <p className="text-xs font-bold text-success">{fmtNum(m.value)}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {campaign.targeting && (
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                            <Target className="h-3.5 w-3.5" />
                            Público-alvo
                          </div>
                          <p className="text-xs">{campaign.targeting.ageMin}–{campaign.targeting.ageMax} anos · {genderLabel}</p>
                          <div className="flex flex-wrap gap-1">
                            {campaign.targeting.interests.map((i) => (
                              <Badge key={i} variant="secondary" className="text-[10px] px-1.5 py-0">{i}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {campaign.geoLocations && (
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                            <MapPin className="h-3.5 w-3.5" />
                            Localização
                          </div>
                          <p className="text-xs">
                            {campaign.geoLocations.countries.join(', ')}
                            {campaign.geoLocations.cities.length > 0 && ` · ${campaign.geoLocations.cities.join(', ')}`}
                          </p>
                        </div>
                      )}
                      {campaign.placements && (
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                            <Monitor className="h-3.5 w-3.5" />
                            Veiculação
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {campaign.placements.platforms.map((p) => (
                              <Badge key={p} variant="outline" className="text-[10px] px-1.5 py-0">{p}</Badge>
                            ))}
                            {campaign.placements.positions.map((p) => (
                              <Badge key={p} variant="secondary" className="text-[10px] px-1.5 py-0">{p}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {campaign.creative && (
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                            <Palette className="h-3.5 w-3.5" />
                            Anúncio
                          </div>
                          <div className="space-y-1 text-xs">
                            <p><span className="text-muted-foreground">Formato:</span> {campaign.creative.format === 'image' ? 'Imagem' : campaign.creative.format === 'video' ? 'Vídeo' : 'Carrossel'}</p>
                            <p className="font-medium">{campaign.creative.headline}</p>
                            <p className="text-muted-foreground line-clamp-2">{campaign.creative.primaryText}</p>
                            <div className="flex items-center gap-2 pt-1">
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">{campaign.creative.ctaType}</Badge>
                              <a href={campaign.creative.destinationUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline">
                                <ExternalLink className="h-3 w-3" />
                                Ver destino
                              </a>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            );
          })}
        </div>
      </div>
      </>}

      {/* CTA - Agendar reunião */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
          <CalendarCheck className="h-8 w-8 text-primary" />
          <div>
            <p className="text-sm font-semibold">Quer conversar sobre seus resultados?</p>
            <p className="text-xs text-muted-foreground">Agende uma reunião rápida com a agência</p>
          </div>
          <Button asChild className="w-full">
            <a
              href="https://wa.me/5511999999999?text=Olá! Gostaria de agendar uma reunião para falar sobre os resultados das minhas campanhas."
              target="_blank"
              rel="noopener noreferrer"
            >
              <CalendarCheck className="h-4 w-4" />
              Agendar reunião
            </a>
          </Button>
        </CardContent>
      </Card>
    </ClientLayout>
  );
}
