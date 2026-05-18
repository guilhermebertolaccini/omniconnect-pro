import { useState, useMemo } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AccountSelector } from '@/components/dashboard/AccountSelector';
import { PlatformSelector } from '@/components/dashboard/PlatformSelector';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { mockAccounts, mockPosts } from '@/data/mockData';
import { fetchAdAccounts } from '@/services/adAccountsService';
import { useMetaData } from '@/hooks/useMetaData';
import { MetaDataLoading, MetaDataError } from '@/components/MetaDataStatus';
import { useCompany } from '@/contexts/CompanyContext';
import { PLATFORM_LABELS } from '@/services/platformConfigService';
import type { AdAccount, Post, PostPlatform, PostType } from '@/types/campaign';
import {
  Eye,
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  TrendingUp,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  FileText,
  Sparkles,
  Instagram,
  Facebook,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ExperimentsPanel } from '@/components/experiments/ExperimentsPanel';

const platformIcon = (p: string) =>
  p === 'Instagram' ? (
    <Instagram className="h-4 w-4 text-destructive" />
  ) : (
    <Facebook className="h-4 w-4 text-primary" />
  );

const typeLabel: Record<string, string> = {
  image: 'Imagem',
  video: 'Vídeo',
  carousel: 'Carrossel',
  reels: 'Reels',
  story: 'Story',
};

const typeBadgeVariant = (t: string) => {
  if (t === 'reels') return 'default';
  if (t === 'carousel') return 'secondary';
  return 'outline';
};

function PostInsightsPanel({ posts }: { posts: Post[] }) {
  const insights = useMemo(() => {
    if (posts.length === 0) return [];
    const result: { icon: React.ReactNode; text: string }[] = [];

    // Best type
    const byType = posts.reduce<Record<string, { reach: number; count: number }>>((acc, p) => {
      if (!acc[p.type]) acc[p.type] = { reach: 0, count: 0 };
      acc[p.type].reach += p.reach;
      acc[p.type].count += 1;
      return acc;
    }, {});
    const bestType = Object.entries(byType).sort((a, b) => b[1].reach / b[1].count - a[1].reach / a[1].count)[0];
    if (bestType) {
      result.push({
        icon: <TrendingUp className="h-4 w-4 text-success" />,
        text: `Posts em formato ${typeLabel[bestType[0]] || bestType[0]} têm o maior alcance médio (${Math.round(bestType[1].reach / bestType[1].count).toLocaleString('pt-BR')})`,
      });
    }

    // Best engagement
    const bestEng = [...posts].filter(p => p.engagementRate > 0).sort((a, b) => b.engagementRate - a.engagementRate)[0];
    if (bestEng) {
      result.push({
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
        result.push({
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
      result.push({
        icon: <Sparkles className="h-4 w-4 text-accent" />,
        text: `Horário com mais publicações: ${peakHour[0]}h — avalie concentrar posts nesse período`,
      });
    }

    return result;
  }, [posts]);

  if (insights.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-5 w-5 text-accent" />
          Insights de Publicações
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {insights.map((ins, i) => (
          <div key={i} className="flex items-start gap-3 rounded-lg border border-border/50 bg-muted/30 p-3 text-sm">
            {ins.icon}
            <span className="text-foreground">{ins.text}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function PostsTrendChart({ posts }: { posts: Post[] }) {
  const chartData = useMemo(() => {
    if (posts.length === 0) return [];
    const byDate: Record<string, { reach: number; engagement: number; count: number }> = {};
    posts
      .filter((p) => p.engagementRate > 0)
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

  if (chartData.length < 2) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">
          Evolução de Alcance e Engajamento
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorReach" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(220 90% 56%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(220 90% 56%)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorEng" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(142 76% 36%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(142 76% 36%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="date" axisLine={false} tickLine={false} className="text-xs fill-muted-foreground" />
              <YAxis yAxisId="left" axisLine={false} tickLine={false} className="text-xs fill-muted-foreground" />
              <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} className="text-xs fill-muted-foreground" unit="%" />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
                formatter={(value: number, name: string) =>
                  name === 'Engajamento' ? `${value}%` : value.toLocaleString('pt-BR')
                }
              />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="alcance"
                stroke="hsl(220 90% 56%)"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorReach)"
                name="Alcance"
              />
              <Area
                yAxisId="right"
                type="monotone"
                dataKey="engajamento"
                stroke="hsl(142 76% 36%)"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorEng)"
                name="Engajamento"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Posts() {
  const { selectedCompanyId, selectedPlatform } = useCompany();
  const [selectedAccount, setSelectedAccount] = useState<AdAccount | null>(null);
  const [platformFilter, setPlatformFilter] = useState<PostPlatform | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<PostType | 'all'>('all');

  const { data: displayAccounts, isLoading, error, refetch } = useMetaData({
    queryKey: ['adAccounts', selectedCompanyId],
    fetchFn: () => fetchAdAccounts(selectedCompanyId!),
    mockData: mockAccounts,
    companyId: selectedCompanyId,
  });

  const [sortKey, setSortKey] = useState<'date' | 'reach' | 'engagementRate' | 'likes' | 'comments' | 'shares' | 'saves'>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const filteredPosts = useMemo(
    () =>
      mockPosts
        .filter((p) => !selectedAccount || p.accountName === selectedAccount.name)
        .filter((p) => platformFilter === 'all' || p.platform === platformFilter)
        .filter((p) => typeFilter === 'all' || p.type === typeFilter),
    [selectedAccount, platformFilter, typeFilter]
  );

  const sortedPosts = useMemo(() => {
    const sorted = [...filteredPosts].sort((a, b) => {
      let va: number, vb: number;
      if (sortKey === 'date') {
        va = new Date(a.publishedAt).getTime();
        vb = new Date(b.publishedAt).getTime();
      } else {
        va = a[sortKey];
        vb = b[sortKey];
      }
      return sortDir === 'asc' ? va - vb : vb - va;
    });
    return sorted;
  }, [filteredPosts, sortKey, sortDir]);

  const metrics = useMemo(() => {
    const total = filteredPosts.length;
    const avgReach = total > 0 ? filteredPosts.reduce((s, p) => s + p.reach, 0) / total : 0;
    const engageable = filteredPosts.filter(p => p.engagementRate > 0);
    const avgEng = engageable.length > 0 ? engageable.reduce((s, p) => s + p.engagementRate, 0) / engageable.length : 0;
    const best = [...filteredPosts].sort((a, b) => b.reach - a.reach)[0];
    return { total, avgReach, avgEng, bestPost: best };
  }, [filteredPosts]);

  const grouped = useMemo(() => {
    const map: Record<string, Post[]> = {};
    sortedPosts.forEach((p) => {
      if (!map[p.accountName]) map[p.accountName] = [];
      map[p.accountName].push(p);
    });
    return map;
  }, [sortedPosts]);

  const SortIcon = ({ col }: { col: typeof sortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-40" />;
    return sortDir === 'asc'
      ? <ArrowUp className="ml-1 inline h-3 w-3 text-primary" />
      : <ArrowDown className="ml-1 inline h-3 w-3 text-primary" />;
  };

  const fmt = (n: number) => n.toLocaleString('pt-BR');

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {error && <MetaDataError error={error} refetch={refetch} />}
        {isLoading && <MetaDataLoading />}

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Publicações — {PLATFORM_LABELS[selectedPlatform]}</h1>
            <p className="text-sm text-muted-foreground">
              Insights de posts orgânicos · {filteredPosts.length} publicações
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PlatformSelector />
            <AccountSelector
              accounts={displayAccounts}
              selectedAccount={selectedAccount}
              onSelect={setSelectedAccount}
            />
          </div>
        </div>

        <Tabs defaultValue="posts" className="space-y-4">
          <TabsList>
            <TabsTrigger value="posts">Publicações</TabsTrigger>
            <TabsTrigger value="experiments">Testes A/B</TabsTrigger>
          </TabsList>
          <TabsContent value="experiments">
            <ExperimentsPanel />
          </TabsContent>
          <TabsContent value="posts" className="space-y-6">
        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Plataforma:</span>
            <div className="flex gap-1">
              {(['all', 'Instagram', 'Facebook'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPlatformFilter(p)}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                    platformFilter === p
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-foreground hover:bg-muted'
                  }`}
                >
                  {p === 'Instagram' && <Instagram className="h-3.5 w-3.5" />}
                  {p === 'Facebook' && <Facebook className="h-3.5 w-3.5" />}
                  {p === 'all' ? 'Todas' : p}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Tipo:</span>
            <div className="flex flex-wrap gap-1">
              {(['all', 'reels', 'carousel', 'image', 'video', 'story'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                    typeFilter === t
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-foreground hover:bg-muted'
                  }`}
                >
                  {t === 'all' ? 'Todos' : typeLabel[t]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Metric cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Total de Posts"
            value={metrics.total.toString()}
            icon={FileText}
          />
          <MetricCard
            title="Alcance Médio"
            value={fmt(Math.round(metrics.avgReach))}
            icon={Eye}
          />
          <MetricCard
            title="Engajamento Médio"
            value={`${metrics.avgEng.toFixed(1)}%`}
            icon={TrendingUp}
          />
          <MetricCard
            title="Melhor Post"
            value={metrics.bestPost ? `${fmt(metrics.bestPost.reach)} alcance` : '—'}
            icon={Heart}
          />
        </div>

        {/* AI Insights */}
        <PostInsightsPanel posts={filteredPosts} />

        {/* Reach & Engagement Chart */}
        <PostsTrendChart posts={filteredPosts} />

        {/* Table — desktop */}
        <Card className="hidden md:block">
          <CardContent className="p-0">
            {Object.entries(grouped).map(([account, posts]) => (
              <div key={account}>
                <div className="border-b border-border bg-muted/40 px-4 py-2">
                  <span className="text-sm font-semibold text-foreground">{account}</span>
                  <span className="ml-2 text-xs text-muted-foreground">({posts.length} posts)</span>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[250px]">
                        <button onClick={() => handleSort('date')} className="inline-flex items-center hover:text-foreground transition-colors">
                          Publicação <SortIcon col="date" />
                        </button>
                      </TableHead>
                      <TableHead>Plataforma</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">
                        <button onClick={() => handleSort('reach')} className="inline-flex items-center hover:text-foreground transition-colors">
                          Alcance <SortIcon col="reach" />
                        </button>
                      </TableHead>
                      <TableHead className="text-right">
                        <button onClick={() => handleSort('engagementRate')} className="inline-flex items-center hover:text-foreground transition-colors">
                          Engajamento <SortIcon col="engagementRate" />
                        </button>
                      </TableHead>
                      <TableHead className="text-right">
                        <button onClick={() => handleSort('likes')} className="inline-flex items-center hover:text-foreground transition-colors">
                          Curtidas <SortIcon col="likes" />
                        </button>
                      </TableHead>
                      <TableHead className="text-right">
                        <button onClick={() => handleSort('comments')} className="inline-flex items-center hover:text-foreground transition-colors">
                          Comentários <SortIcon col="comments" />
                        </button>
                      </TableHead>
                      <TableHead className="text-right">
                        <button onClick={() => handleSort('shares')} className="inline-flex items-center hover:text-foreground transition-colors">
                          Compartilh. <SortIcon col="shares" />
                        </button>
                      </TableHead>
                      <TableHead className="text-right">
                        <button onClick={() => handleSort('saves')} className="inline-flex items-center hover:text-foreground transition-colors">
                          Salvamentos <SortIcon col="saves" />
                        </button>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {posts.map((post) => (
                      <TableRow key={post.id}>
                        <TableCell className="max-w-[250px]">
                          <span className="line-clamp-1 text-sm">{post.caption}</span>
                          <span className="block text-xs text-muted-foreground">
                            {new Date(post.publishedAt).toLocaleDateString('pt-BR')}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            {platformIcon(post.platform)}
                            <span className="text-xs">{post.platform}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={typeBadgeVariant(post.type)} className="text-xs">
                            {typeLabel[post.type]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(post.reach)}</TableCell>
                        <TableCell className="text-right tabular-nums">{post.engagementRate.toFixed(1)}%</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(post.likes)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(post.comments)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(post.shares)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(post.saves)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Mobile cards */}
        <div className="space-y-3 md:hidden">
          {sortedPosts.map((post) => (
            <Card key={post.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium line-clamp-2">{post.caption}</p>
                  <Badge variant={typeBadgeVariant(post.type)} className="shrink-0 text-xs">
                    {typeLabel[post.type]}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    {platformIcon(post.platform)} {post.platform}
                  </span>
                  <span>{new Date(post.publishedAt).toLocaleDateString('pt-BR')}</span>
                  <span className="font-medium text-foreground">{post.accountName}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-md bg-muted/50 p-2">
                    <Eye className="mx-auto h-3.5 w-3.5 text-muted-foreground" />
                    <span className="block text-sm font-semibold tabular-nums">{fmt(post.reach)}</span>
                    <span className="text-[10px] text-muted-foreground">Alcance</span>
                  </div>
                  <div className="rounded-md bg-muted/50 p-2">
                    <Heart className="mx-auto h-3.5 w-3.5 text-muted-foreground" />
                    <span className="block text-sm font-semibold tabular-nums">{fmt(post.likes)}</span>
                    <span className="text-[10px] text-muted-foreground">Curtidas</span>
                  </div>
                  <div className="rounded-md bg-muted/50 p-2">
                    <TrendingUp className="mx-auto h-3.5 w-3.5 text-muted-foreground" />
                    <span className="block text-sm font-semibold tabular-nums">{post.engagementRate.toFixed(1)}%</span>
                    <span className="text-[10px] text-muted-foreground">Engaj.</span>
                  </div>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3" /> {fmt(post.comments)}</span>
                  <span className="flex items-center gap-1"><Share2 className="h-3 w-3" /> {fmt(post.shares)}</span>
                  <span className="flex items-center gap-1"><Bookmark className="h-3 w-3" /> {fmt(post.saves)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
