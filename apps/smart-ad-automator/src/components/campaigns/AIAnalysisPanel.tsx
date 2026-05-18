import { useEffect, useState, useCallback } from 'react';
import { Sparkles, X, Loader2, AlertTriangle, CheckCircle, Target, Compass, ListChecks, Info, History, ChevronRight, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { Campaign, AIAnalysis, AIAnalysisAction } from '@/types/campaign';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { analyzeCampaignWithAI } from '@/services/aiAnalysisService';
import { useCompany } from '@/contexts/CompanyContext';
import { toast } from 'sonner';

interface AIAnalysisPanelProps {
  campaign: Campaign;
  onClose: () => void;
}

function generateMockAnalysis(campaign: Campaign): AIAnalysis {
  const problems: string[] = [];
  const recommendations: string[] = [];
  const nextActions: AIAnalysisAction[] = [];
  let score = 75;

  if (campaign.roas < 2 && campaign.roas > 0) {
    problems.push('ROAS abaixo do mínimo aceitável (2x)');
    recommendations.push('Revise a segmentação de público e considere criar lookalikes de compradores');
    nextActions.push({ title: 'Criar lookalike de compradores', priority: 'high', area: 'audience', description: 'Use a base de compradores dos últimos 90 dias.' });
    score -= 20;
  }
  if (campaign.ctr < 1.5) {
    problems.push('CTR baixo indica criativos pouco atraentes');
    recommendations.push('Teste novos formatos de anúncio (carrossel, vídeo curto)');
    nextActions.push({ title: 'Testar 3 novos criativos', priority: 'medium', area: 'creative', description: 'Variações de hook nos primeiros 3 segundos.' });
    score -= 15;
  }
  if (campaign.cpa > 100) {
    problems.push('CPA elevado comprometendo margem de lucro');
    recommendations.push('Otimize para conversões de maior valor ou reduza lance');
    score -= 15;
  }
  if (campaign.status === 'issue') {
    problems.push('Campanha com problemas de entrega identificados');
    score -= 25;
  }
  if (campaign.whatsappConversations > 0) {
    const mqlRate = campaign.mqls / campaign.whatsappConversations;
    if (mqlRate < 0.25) {
      problems.push(`Taxa de MQL baixa (${(mqlRate * 100).toFixed(0)}%)`);
      nextActions.push({ title: 'Revisar script de WhatsApp', priority: 'high', area: 'whatsapp', description: 'Ajustar critérios de qualificação de MQL.' });
      score -= 10;
    }
  }
  if (problems.length === 0) {
    recommendations.push('Campanha com boa performance! Considere escalar gradualmente');
  }

  return {
    campaignId: campaign.id,
    overallScore: Math.max(Math.min(score, 100), 20),
    diagnosis: score >= 70
      ? 'Campanha com performance satisfatória, com oportunidades de otimização.'
      : 'Campanha precisa de ajustes para melhorar resultados.',
    rootCause: 'Análise local sem IA — diagnóstico baseado apenas em métricas básicas.',
    problems,
    recommendations,
    nextActions,
    predictedImpact: 'Aplicando as recomendações, espera-se melhora gradual em CPA e ROAS.',
    confidence: 'low',
    generatedAt: new Date().toISOString(),
  };
}

const areaLabels: Record<AIAnalysisAction['area'], string> = {
  campaign: 'Campanha',
  creative: 'Criativo',
  audience: 'Audiência',
  whatsapp: 'WhatsApp',
  sales: 'Vendas',
  budget: 'Orçamento',
  tracking: 'Tracking',
};

const priorityStyles: Record<AIAnalysisAction['priority'], string> = {
  high: 'bg-destructive/15 text-destructive border-destructive/30',
  medium: 'bg-warning/15 text-warning border-warning/30',
  low: 'bg-muted text-muted-foreground border-border',
};

const confidenceLabels: Record<NonNullable<AIAnalysis['confidence']>, string> = {
  low: 'Confiança baixa',
  medium: 'Confiança média',
  high: 'Confiança alta',
};

function AnalysisContent({
  campaign,
  isAnalyzing,
  analysis,
  isFallback,
  onRunAnalysis,
  hasCompany,
}: {
  campaign: Campaign;
  isAnalyzing: boolean;
  analysis: AIAnalysis | null;
  isFallback: boolean;
  onRunAnalysis: () => void;
  hasCompany: boolean;
}) {
  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-success';
    if (score >= 50) return 'text-warning';
    return 'text-destructive';
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg bg-muted/50 p-3">
        <p className="font-medium">{campaign.name}</p>
        <p className="text-sm text-muted-foreground">{campaign.accountName}</p>
      </div>

      {!analysis && !isAnalyzing && (
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-primary/10">
            <Sparkles className="h-8 w-8 text-primary" />
          </div>
          <div className="text-center">
            <p className="font-medium">Pronto para analisar</p>
            <p className="text-sm text-muted-foreground">
              {hasCompany
                ? 'A IA vai avaliar métricas, identificar problemas e sugerir melhorias'
                : 'Selecione uma empresa no topo da página para liberar a análise com IA'}
            </p>
          </div>
          <Button onClick={onRunAnalysis} className="gap-2" disabled={!hasCompany}>
            <Sparkles className="h-4 w-4" />
            Iniciar Análise
          </Button>
        </div>
      )}

      {isAnalyzing && (
        <div className="flex flex-col items-center gap-4 py-8">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <div className="text-center">
            <p className="font-medium">Analisando campanha...</p>
            <p className="text-sm text-muted-foreground">Processando métricas e gerando insights</p>
          </div>
        </div>
      )}

      {analysis && (
        <div className="space-y-4">
          {isFallback && (
            <div className="flex items-start gap-2 rounded-md border border-dashed border-warning/40 bg-warning/10 p-2 text-xs text-warning-foreground">
              <Info className="h-4 w-4 mt-0.5 shrink-0 text-warning" />
              <span>Modo demonstração: análise gerada localmente porque a IA não respondeu.</span>
            </div>
          )}

          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className={cn('text-4xl font-bold', getScoreColor(analysis.overallScore))}>
                {analysis.overallScore}
              </p>
              <p className="text-xs text-muted-foreground">Score</p>
            </div>
            <div className="flex-1">
              <Progress value={analysis.overallScore} className="h-3" />
              <p className="mt-2 text-sm text-muted-foreground">{analysis.diagnosis}</p>
              {analysis.confidence && (
                <Badge variant="outline" className="mt-2 text-xs">
                  {confidenceLabels[analysis.confidence]}
                </Badge>
              )}
            </div>
          </div>

          {analysis.rootCause && (
            <div className="rounded-lg border border-border p-3">
              <div className="mb-1 flex items-center gap-2 text-sm font-medium">
                <Compass className="h-4 w-4 text-accent" />
                Causa provável
              </div>
              <p className="text-sm text-muted-foreground">{analysis.rootCause}</p>
            </div>
          )}

          {analysis.problems.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-destructive">
                <AlertTriangle className="h-4 w-4" />
                Problemas Identificados
              </div>
              <ul className="space-y-2">
                {analysis.problems.map((problem, i) => (
                  <li key={i} className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm">
                    <span className="font-medium text-destructive">•</span>
                    {problem}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
              <CheckCircle className="h-4 w-4" />
              Recomendações
            </div>
            <ul className="space-y-2">
              {analysis.recommendations.map((rec, i) => (
                <li key={i} className="flex items-start gap-2 rounded-lg bg-primary/10 p-3 text-sm">
                  <span className="font-medium text-primary">{i + 1}.</span>
                  {rec}
                </li>
              ))}
            </ul>
          </div>

          {analysis.nextActions && analysis.nextActions.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <ListChecks className="h-4 w-4 text-accent" />
                Próximas ações
              </div>
              <div className="space-y-2">
                {analysis.nextActions.map((action, i) => (
                  <div key={i} className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{action.title}</p>
                      <Badge variant="outline" className={cn('text-[10px]', priorityStyles[action.priority])}>
                        {action.priority}
                      </Badge>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <Badge variant="secondary" className="text-[10px]">{areaLabels[action.area] ?? action.area}</Badge>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{action.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-lg border border-border p-3">
            <div className="mb-1 flex items-center gap-2 text-sm font-medium">
              <Target className="h-4 w-4 text-accent" />
              Impacto Previsto
            </div>
            <p className="text-sm text-muted-foreground">{analysis.predictedImpact}</p>
          </div>

          <Button onClick={onRunAnalysis} variant="outline" className="w-full gap-2">
            <Sparkles className="h-4 w-4" />
            Analisar Novamente
          </Button>
        </div>
      )}
    </div>
  );
}

interface HistoryItem {
  id: string;
  created_at: string;
  analysis: AIAnalysis;
}

const PAGE_SIZE = 20;

// Area filter options. Pseudo-areas (mql/sql) map to underlying areas + keyword search.
const areaOptions: { key: string; label: string; areas: string[]; keywords?: string[] }[] = [
  { key: 'campaign', label: 'Campanha', areas: ['campaign'] },
  { key: 'creative', label: 'Criativo', areas: ['creative'] },
  { key: 'whatsapp', label: 'WhatsApp', areas: ['whatsapp'], keywords: ['whatsapp'] },
  { key: 'mql', label: 'MQL', areas: ['whatsapp'], keywords: ['mql', 'qualific'] },
  { key: 'sql', label: 'SQL', areas: ['sales'], keywords: ['sql'] },
  { key: 'sales', label: 'Vendas', areas: ['sales'], keywords: ['venda', 'fechamento'] },
];
const confOptions: { key: 'low' | 'medium' | 'high'; label: string }[] = [
  { key: 'high', label: 'Alta' },
  { key: 'medium', label: 'Média' },
  { key: 'low', label: 'Baixa' },
];

function matchesFilters(
  item: HistoryItem,
  q: string,
  areaFilters: Set<string>,
  confFilters: Set<string>,
): boolean {
  if (q) {
    const diag = (item.analysis?.diagnosis || '').toLowerCase();
    const dateStr = new Date(item.created_at).toLocaleString('pt-BR').toLowerCase();
    const isoDate = item.created_at.toLowerCase();
    if (!(diag.includes(q) || dateStr.includes(q) || isoDate.includes(q))) return false;
  }
  if (confFilters.size > 0 && !confFilters.has(item.analysis?.confidence ?? '')) return false;
  if (areaFilters.size > 0) {
    const actions = item.analysis?.nextActions ?? [];
    const actionAreas = new Set(actions.map((a) => a.area));
    const haystack = `${item.analysis?.diagnosis || ''} ${item.analysis?.rootCause || ''} ${(item.analysis?.problems || []).join(' ')}`.toLowerCase();
    let any = false;
    for (const k of areaFilters) {
      const opt = areaOptions.find((o) => o.key === k);
      if (!opt) continue;
      const hitArea = opt.areas.some((a) => actionAreas.has(a as never));
      const hitKeyword = opt.keywords?.some((kw) => haystack.includes(kw)) ?? false;
      if (hitArea || hitKeyword) { any = true; break; }
    }
    if (!any) return false;
  }
  return true;
}

function HistorySection({
  items,
  loading,
  loadingMore,
  hasMore,
  onLoadMore,
  onSelect,
  query,
  setQuery,
  areaFilters,
  setAreaFilters,
  confFilters,
  setConfFilters,
}: {
  items: HistoryItem[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onSelect: (a: AIAnalysis) => void;
  query: string;
  setQuery: (v: string) => void;
  areaFilters: Set<string>;
  setAreaFilters: (s: Set<string>) => void;
  confFilters: Set<string>;
  setConfFilters: (s: Set<string>) => void;
}) {
  const toggleSet = (set: Set<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  };

  const q = query.trim().toLowerCase();
  const filtered = items.filter((i) => matchesFilters(i, q, areaFilters, confFilters));
  const hasActiveFilter = q.length > 0 || areaFilters.size > 0 || confFilters.size > 0;


  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <History className="h-4 w-4 text-muted-foreground" />
        Análises anteriores
        {items.length > 0 && (
          <Badge variant="secondary" className="text-[10px]">
            {hasActiveFilter ? `${filtered.length}/${items.length}` : items.length}
          </Badge>
        )}
      </div>

      {items.length > 0 && (
        <>
          <div className="mb-2 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por diagnóstico ou data..."
                className="h-8 pl-7 text-xs"
              />
            </div>
            {hasActiveFilter && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setAreaFilters(new Set());
                  setConfFilters(new Set());
                }}
                className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-card px-2 text-[11px] text-muted-foreground hover:bg-muted/40 hover:text-foreground transition"
              >
                <X className="h-3 w-3" />
                Limpar filtros
              </button>
            )}
          </div>
          <div className="mb-2 space-y-1.5">
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground mr-1">Área</span>
              {areaOptions.map((opt) => {
                const active = areaFilters.has(opt.key);
                return (
                  <button
                    key={opt.key}
                    onClick={() => setAreaFilters(toggleSet(areaFilters, opt.key))}
                    className={cn(
                      'rounded-full border px-2 py-0.5 text-[10px] transition',
                      active
                        ? 'border-primary bg-primary/15 text-primary'
                        : 'border-border bg-card hover:bg-muted/40 text-muted-foreground',
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground mr-1">Confiança</span>
              {confOptions.map((opt) => {
                const active = confFilters.has(opt.key);
                return (
                  <button
                    key={opt.key}
                    onClick={() => setConfFilters(toggleSet(confFilters, opt.key))}
                    className={cn(
                      'rounded-full border px-2 py-0.5 text-[10px] transition',
                      active
                        ? 'border-primary bg-primary/15 text-primary'
                        : 'border-border bg-card hover:bg-muted/40 text-muted-foreground',
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Carregando...
        </div>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma análise anterior para esta campanha.</p>
      ) : filtered.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum resultado para os filtros aplicados.</p>
      ) : (
        <>
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {filtered.map((item) => {
              const score = item.analysis?.overallScore ?? 0;
              const scoreColor = score >= 70 ? 'text-success' : score >= 50 ? 'text-warning' : 'text-destructive';
              return (
                <button
                  key={item.id}
                  onClick={() => onSelect(item.analysis)}
                  className="w-full text-left rounded-md border border-border bg-card hover:bg-muted/40 transition p-2 flex items-center gap-3"
                >
                  <span className={cn('text-lg font-bold w-8 text-center', scoreColor)}>{score}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">
                      {new Date(item.created_at).toLocaleString('pt-BR')}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {item.analysis?.diagnosis || 'Sem diagnóstico'}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              );
            })}
          </div>
          {hasMore && (
            <Button
              variant="outline"
              size="sm"
              className="mt-2 w-full"
              onClick={onLoadMore}
              disabled={loadingMore}
            >
              {loadingMore ? (
                <><Loader2 className="h-3 w-3 animate-spin mr-2" /> Carregando...</>
              ) : (
                'Carregar mais'
              )}
            </Button>
          )}
        </>
      )}
    </div>
  );
}

export function AIAnalysisPanel({ campaign, onClose }: AIAnalysisPanelProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [isFallback, setIsFallback] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [query, setQuery] = useState('');
  const [areaFilters, setAreaFilters] = useState<Set<string>>(new Set());
  const [confFilters, setConfFilters] = useState<Set<string>>(new Set());
  const isMobile = useIsMobile();
  const { selectedCompanyId, selectedPlatform } = useCompany();

  const fetchHistoryPage = useCallback(
    async (offset: number) => {
      if (!selectedCompanyId) return { items: [] as HistoryItem[], hasMore: false };
      const { data, error } = await supabase
        .from('ai_campaign_analyses')
        .select('id, created_at, analysis')
        .eq('company_id', selectedCompanyId)
        .eq('campaign_id', campaign.id)
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE);
      if (error) {
        console.error('Failed to load analysis history:', error);
        return { items: [] as HistoryItem[], hasMore: false };
      }
      const rows = (data || []) as unknown as HistoryItem[];
      const hasMore = rows.length > PAGE_SIZE;
      return { items: hasMore ? rows.slice(0, PAGE_SIZE) : rows, hasMore };
    },
    [selectedCompanyId, campaign.id],
  );

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    const { items, hasMore } = await fetchHistoryPage(0);
    setHistory(items);
    setHasMoreHistory(hasMore);
    setHistoryLoading(false);
  }, [fetchHistoryPage]);

  const loadMoreHistory = useCallback(async () => {
    setHistoryLoadingMore(true);
    const q = query.trim().toLowerCase();
    const filtersActive = q.length > 0 || areaFilters.size > 0 || confFilters.size > 0;
    const MAX_PAGES = 10; // safety cap

    let collected: HistoryItem[] = [];
    let offset = history.length;
    let stillHasMore = true;
    let pages = 0;

    while (pages < MAX_PAGES && stillHasMore) {
      const { items: pageItems, hasMore: pageHasMore } = await fetchHistoryPage(offset);
      collected = [...collected, ...pageItems];
      offset += pageItems.length;
      stillHasMore = pageHasMore;
      pages += 1;
      if (!filtersActive) break;
      const newFilteredCount = collected.filter((i) =>
        matchesFilters(i, q, areaFilters, confFilters),
      ).length;
      if (newFilteredCount >= PAGE_SIZE) break;
    }

    if (collected.length > 0) setHistory((prev) => [...prev, ...collected]);
    setHasMoreHistory(stillHasMore);
    setHistoryLoadingMore(false);
  }, [fetchHistoryPage, history.length, query, areaFilters, confFilters]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const runAnalysis = async () => {
    setIsAnalyzing(true);
    setAnalysis(null);
    setIsFallback(false);
    try {
      if (!selectedCompanyId) throw new Error('Nenhuma empresa selecionada');
      const result = await analyzeCampaignWithAI({
        companyId: selectedCompanyId,
        campaign,
        platform: selectedPlatform,
      });
      setAnalysis(result);
      loadHistory();
    } catch (err) {
      console.error('AI analysis failed, using fallback:', err);
      toast.error('IA indisponível. Exibindo análise demo.');
      setAnalysis(generateMockAnalysis(campaign));
      setIsFallback(true);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const historyBlock = (
    <div className="mt-4 border-t border-border pt-4">
      <HistorySection
        items={history}
        loading={historyLoading}
        loadingMore={historyLoadingMore}
        hasMore={hasMoreHistory}
        onLoadMore={loadMoreHistory}
        onSelect={(a) => {
          setAnalysis(a);
          setIsFallback(false);
        }}
        query={query}
        setQuery={setQuery}
        areaFilters={areaFilters}
        setAreaFilters={setAreaFilters}
        confFilters={confFilters}
        setConfFilters={setConfFilters}
      />
    </div>
  );


  if (isMobile) {
    return (
      <Sheet open onOpenChange={(open) => !open && onClose()}>
        <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader className="mb-4 flex flex-row items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-primary">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <SheetTitle>Análise IA</SheetTitle>
          </SheetHeader>
          <AnalysisContent
            campaign={campaign}
            isAnalyzing={isAnalyzing}
            analysis={analysis}
            isFallback={isFallback}
            onRunAnalysis={runAnalysis}
            hasCompany={!!selectedCompanyId}
          />
          {historyBlock}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Card className="fixed right-6 top-20 z-50 w-[450px] max-h-[calc(100vh-6rem)] overflow-y-auto shadow-2xl border-primary/20">
      <CardHeader className="flex flex-row items-center justify-between border-b border-border pb-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-primary">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <CardTitle className="text-base">Análise IA</CardTitle>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="p-5">
        <AnalysisContent
          campaign={campaign}
          isAnalyzing={isAnalyzing}
          analysis={analysis}
          isFallback={isFallback}
          onRunAnalysis={runAnalysis}
            hasCompany={!!selectedCompanyId}
        />
        {historyBlock}
      </CardContent>
    </Card>
  );
}
