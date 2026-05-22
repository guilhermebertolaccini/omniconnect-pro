import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { KpiCard } from "@/components/kpi-card";
import { InsightConversationAnalyzer } from "@/components/insight-conversation-analyzer";
import { InsightBackendPanel } from "@/components/insight-backend-panel";
import { ModuleGate } from "@/components/module-gate";

// Sprint Hub / PR 5. Em produção (`VITE_USE_MOCK_DATA=false`) só o painel
// backend é renderizado. No modo mock (Lovable preview / dev) mantemos o
// dashboard mock antigo (VOC, sentiment, keywords, ranking) como preview.
const USE_MOCK_DATA = import.meta.env.VITE_USE_MOCK_DATA === "true";
import { toast } from "sonner";
import {
  INSIGHT_KPIS,
  VOC_SENTIMENT,
  VOC_TREND,
  VOC_EMOTIONS,
  VOC_QUOTES,
  LOSS_REASONS,
  CUSTOMER_TRAITS,
  KEYWORD_CATEGORIES,
  TRENDING_TOPICS,
  RECOMMENDATIONS,
  RANKING,
  type SentimentKey,
  type KeywordSentiment,
  type Recommendation,
} from "@/lib/mock-data";
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  Info,
  MessageCircle,
  AlertTriangle,
  UserSearch,
  Tag,
  Flame,
  ArrowRight,
  Quote,
} from "lucide-react";

export const Route = createFileRoute("/_app/insightai")({
  head: () => ({ meta: [{ title: "InsightAI · Text Analytics — OmniconnectPRO" }] }),
  component: () => (
    <ModuleGate moduleId="insightai">
      <InsightPage />
    </ModuleGate>
  ),
});

const SENTIMENT_BADGE: Record<SentimentKey, { label: string; cls: string }> = {
  positivo: { label: "Positivo", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" },
  neutro: { label: "Neutro", cls: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30" },
  negativo: { label: "Negativo", cls: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30" },
  frustrado: { label: "Frustrado", cls: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30" },
};

const KW_SENT: Record<KeywordSentiment, { label: string; cls: string }> = {
  pos: { label: "Positivo", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" },
  neu: { label: "Neutro", cls: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30" },
  neg: { label: "Negativo", cls: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30" },
};

type DrillItem = {
  title: string;
  subtitle?: string;
  metric?: string;
  delta?: string;
  snippets: { text: string; lead: string; channel: string; sentiment?: SentimentKey }[];
};

function InsightPage() {
  const [period, setPeriod] = useState("30");
  const [channel, setChannel] = useState("all");
  const [stage, setStage] = useState("all");
  const [drill, setDrill] = useState<DrillItem | null>(null);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h1 className="text-2xl font-semibold tracking-tight">InsightAI</h1>
              <Badge variant="secondary" className="ml-1 font-normal">Text Analytics</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Voz do cliente, motivos de recusa, traços de perfil e menções relevantes
              extraídas das conversas de WhatsApp, e-mail, SMS e RCS.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="h-9 w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Últimos 7 dias</SelectItem>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
                <SelectItem value="90">Últimos 90 dias</SelectItem>
              </SelectContent>
            </Select>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos canais</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="rcs">RCS</SelectItem>
              </SelectContent>
            </Select>
            <Select value={stage} onValueChange={setStage}>
              <SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as etapas</SelectItem>
                <SelectItem value="novo">Novo</SelectItem>
                <SelectItem value="qualificado">Qualificado</SelectItem>
                <SelectItem value="atendimento">Em atendimento</SelectItem>
                <SelectItem value="proposta">Proposta</SelectItem>
                <SelectItem value="perdido">Perdido</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </header>

        {/* Painel backend — dados reais do tenant (sempre visível). */}
        <InsightBackendPanel />

        {USE_MOCK_DATA && (
        <>
        <div className="rounded-md border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
          A partir daqui, o conteúdo é <b>preview com dados mock</b> (apenas
          quando <code>VITE_USE_MOCK_DATA=true</code>). Em produção, somente o
          painel acima é exibido.
        </div>

        {/* KPIs */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {INSIGHT_KPIS.map((k) => (
            <KpiCard key={k.label} {...k} />
          ))}
        </div>

        {/* Analisador de conversas com IA */}
        <Section
          icon={<Sparkles className="h-4 w-4 text-primary" />}
          title="Análise sob demanda"
          tooltip="Selecione uma conversa específica ou várias em lote e descreva o que a IA deve buscar nelas."
        >
          <InsightConversationAnalyzer />
        </Section>



        {/* Voz do Cliente */}
        <Section
          icon={<MessageCircle className="h-4 w-4 text-primary" />}
          title="Voz do Cliente"
          tooltip="Sentimento e emoção agregados de todas as conversas no período. Calculado por classificação NLP frase a frase."
        >
          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Distribuição de sentimento</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {VOC_SENTIMENT.map((s) => (
                  <div key={s.key} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{s.label}</span>
                      <span className="text-muted-foreground">{s.pct}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div className={`h-full rounded-full ${s.color}`} style={{ width: `${s.pct}%` }} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Tendência (30d)</CardTitle>
              </CardHeader>
              <CardContent>
                <Sparkline data={VOC_TREND} />
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-2xl font-semibold">+0,42</span>
                  <span className="text-xs text-success">+0,08 vs período anterior</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Escala de -1 (muito negativo) a +1 (muito positivo).
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Top emoções</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {VOC_EMOTIONS.map((e) => (
                  <div key={e.label} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">{e.label}</span>
                      <span className="text-muted-foreground">{e.pct}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className={`h-full rounded-full ${e.color}`} style={{ width: `${e.pct * 2.5}%` }} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card className="mt-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Trechos reais detectados</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {VOC_QUOTES.map((q, i) => (
                <div key={i} className="rounded-lg border bg-card p-3">
                  <div className="flex items-start gap-2">
                    <Quote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <p className="text-sm italic">"{q.text}"</p>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{q.lead} · {q.channel}</span>
                    <Badge variant="outline" className={SENTIMENT_BADGE[q.sentiment].cls}>
                      {SENTIMENT_BADGE[q.sentiment].label}
                    </Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </Section>

        {/* Motivos de Recusa + Perfis */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Section
            icon={<AlertTriangle className="h-4 w-4 text-orange-500" />}
            title="Motivos de recusa / perda"
            tooltip="Razões pelas quais leads não avançaram, extraídas de mensagens e notas. Inclui % do total de perdas e variação vs período anterior."
          >
            <Card>
              <CardContent className="divide-y p-0">
                {LOSS_REASONS.map((r) => (
                  <button
                    key={r.label}
                    type="button"
                    onClick={() =>
                      setDrill({
                        title: r.label,
                        subtitle: `Etapa: ${r.stage}`,
                        metric: `${r.count} ocorrências · ${r.pct}%`,
                        delta: r.delta,
                        snippets: [
                          { text: r.snippet, lead: "Carlos Menezes", channel: "WhatsApp", sentiment: "negativo" },
                          { text: "Esperava algo bem diferente disso.", lead: "Patrícia Lopes", channel: "WhatsApp", sentiment: "negativo" },
                          { text: "Vou pensar e te retorno.", lead: "André Faria", channel: "Email", sentiment: "neutro" },
                        ],
                      })
                    }
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{r.label}</p>
                        <Badge variant="secondary" className="text-[10px] font-normal">{r.stage}</Badge>
                      </div>
                      <p className="mt-0.5 truncate text-xs italic text-muted-foreground">"{r.snippet}"</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums">{r.pct}%</p>
                      <p className={`text-xs ${r.delta.startsWith("+") ? "text-orange-500" : r.delta.startsWith("-") ? "text-emerald-500" : "text-muted-foreground"}`}>
                        {r.delta}
                      </p>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </button>
                ))}
              </CardContent>
            </Card>
          </Section>

          <Section
            icon={<UserSearch className="h-4 w-4 text-primary" />}
            title="Traços de perfil do cliente"
            tooltip="Perfis inferidos da linguagem usada pelo lead. Útil para personalizar abordagem e ofertas."
          >
            <Card>
              <CardContent className="space-y-5 p-5">
                {CUSTOMER_TRAITS.map((g) => (
                  <div key={g.dimension} className="space-y-2">
                    <div>
                      <p className="text-sm font-medium">{g.dimension}</p>
                      <p className="text-xs text-muted-foreground">{g.description}</p>
                    </div>
                    <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
                      {g.items.map((it, i) => (
                        <div
                          key={it.label}
                          className={["bg-primary", "bg-primary/70", "bg-primary/50", "bg-primary/30"][i] ?? "bg-primary/20"}
                          style={{ width: `${it.pct}%` }}
                        />
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {g.items.map((it, i) => (
                        <span key={it.label} className="inline-flex items-center gap-1.5">
                          <span className={`h-2 w-2 rounded-sm ${["bg-primary", "bg-primary/70", "bg-primary/50", "bg-primary/30"][i] ?? "bg-primary/20"}`} />
                          {it.label} <span className="tabular-nums">{it.pct}%</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </Section>
        </div>

        {/* Keyword Spotting */}
        <Section
          icon={<Tag className="h-4 w-4 text-primary" />}
          title="Menções e palavras-chave"
          tooltip="Termos detectados nas conversas, agrupados por categoria. O sentimento é o da frase em que o termo aparece, não da palavra isolada."
        >
          <KeywordExplorer onDrill={setDrill} />
        </Section>

        {/* Trending + Recomendações */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Section
            icon={<Flame className="h-4 w-4 text-orange-500" />}
            title="Tópicos emergentes"
            tooltip="Temas com aumento significativo de menções nos últimos 7 dias."
          >
            <Card>
              <CardContent className="divide-y p-0">
                {TRENDING_TOPICS.map((t) => (
                  <div key={t.label} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1">
                      <p className="text-sm font-medium">{t.label}</p>
                      <p className="text-xs text-muted-foreground">{t.mentions} menções</p>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        t.dir === "up"
                          ? "border-orange-500/30 bg-orange-500/15 text-orange-700 dark:text-orange-300"
                          : "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                      }
                    >
                      {t.dir === "up" ? <TrendingUp className="mr-1 h-3 w-3" /> : <TrendingDown className="mr-1 h-3 w-3" />}
                      {t.delta > 0 ? "+" : ""}{t.delta}%
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </Section>

          <Section
            icon={<TrendingUp className="h-4 w-4 text-success" />}
            title="Recomendações acionáveis"
            tooltip="Sugestões geradas a partir do cruzamento de sentimento, motivos de recusa, traços e palavras-chave."
          >
            <Card>
              <CardContent className="space-y-2.5 p-4">
                {RECOMMENDATIONS.map((r, i) => (
                  <RecommendationItem key={i} rec={r} />
                ))}
              </CardContent>
            </Card>
          </Section>
        </div>

        {/* Ranking — mantido */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ranking de corretores</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {RANKING.map((r, i) => (
                <li key={r.name} className="flex items-center gap-3 py-3">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                    {i + 1}
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{r.name}</p>
                    <p className="text-xs text-muted-foreground">{r.deals} negócios fechados</p>
                  </div>
                  <Badge variant="secondary" className="font-medium">{r.score.toFixed(1)}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <DrillDialog item={drill} onOpenChange={(o) => !o && setDrill(null)} />
        </>
        )}
      </div>
    </TooltipProvider>
  );
}

function Section({
  icon,
  title,
  tooltip,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  tooltip: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="Sobre esta métrica">
              <Info className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs text-xs">{tooltip}</TooltipContent>
        </Tooltip>
      </div>
      {children}
    </section>
  );
}

function Sparkline({ data }: { data: number[] }) {
  const w = 100;
  const h = 32;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  });
  const path = `M${pts.join(" L")}`;
  const area = `${path} L${w},${h} L0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-12 w-full" preserveAspectRatio="none">
      <path d={area} fill="currentColor" className="text-primary/15" />
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-primary" />
    </svg>
  );
}

function KeywordExplorer({ onDrill }: { onDrill: (i: DrillItem) => void }) {
  const [tab, setTab] = useState(KEYWORD_CATEGORIES[0].id);
  const max = useMemo(() => {
    const all = KEYWORD_CATEGORIES.flatMap((c) => c.terms.map((t) => t.count));
    return Math.max(...all);
  }, []);

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="flex h-auto flex-wrap justify-start">
        {KEYWORD_CATEGORIES.map((c) => (
          <TabsTrigger key={c.id} value={c.id} className="text-xs">{c.label}</TabsTrigger>
        ))}
      </TabsList>

      {KEYWORD_CATEGORIES.map((c) => (
        <TabsContent key={c.id} value={c.id} className="mt-3">
          <Card>
            <CardHeader className="pb-2">
              <p className="text-xs text-muted-foreground">{c.description}</p>
            </CardHeader>
            <CardContent className="space-y-2">
              {c.terms
                .slice()
                .sort((a, b) => b.count - a.count)
                .map((t) => {
                  const size = 0.75 + (t.count / max) * 0.6;
                  return (
                    <button
                      key={t.term}
                      type="button"
                      onClick={() =>
                        onDrill({
                          title: `"${t.term}"`,
                          subtitle: c.label,
                          metric: `${t.count.toLocaleString("pt-BR")} menções`,
                          snippets: [
                            { text: t.example, lead: "Lead exemplo", channel: "WhatsApp" },
                            { text: `Outro lead também disse: ${t.example.toLowerCase()}`, lead: "Outro lead", channel: "Email" },
                          ],
                        })
                      }
                      className="flex w-full items-center gap-3 rounded-md border bg-card px-3 py-2 text-left transition-colors hover:bg-accent/50"
                    >
                      <span
                        className="font-medium tabular-nums"
                        style={{ fontSize: `${size}rem` }}
                      >
                        {t.term}
                      </span>
                      <Badge variant="outline" className={`${KW_SENT[t.sentiment].cls} text-[10px]`}>
                        {KW_SENT[t.sentiment].label}
                      </Badge>
                      <span className="ml-auto text-xs italic text-muted-foreground truncate max-w-[40%]">
                        "{t.example}"
                      </span>
                      <span className="text-sm font-semibold tabular-nums">{t.count.toLocaleString("pt-BR")}</span>
                    </button>
                  );
                })}
            </CardContent>
          </Card>
        </TabsContent>
      ))}
    </Tabs>
  );
}

function RecommendationItem({ rec }: { rec: Recommendation }) {
  const sevCls =
    rec.severity === "Alta"
      ? "border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300"
      : rec.severity === "Média"
        ? "border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300"
        : "border-slate-500/30 bg-slate-500/15 text-slate-700 dark:text-slate-300";

  return (
    <div className="rounded-md border bg-accent/30 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className={`${sevCls} text-[10px]`}>{rec.severity}</Badge>
            <Badge variant="secondary" className="text-[10px] font-normal">{rec.category}</Badge>
          </div>
          <p className="mt-1.5 text-sm font-medium">{rec.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{rec.rationale}</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0"
          onClick={() => toast.success("Recomendação aplicada", { description: rec.title })}
        >
          Aplicar
        </Button>
      </div>
    </div>
  );
}

function DrillDialog({
  item,
  onOpenChange,
}: {
  item: DrillItem | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={!!item} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        {item && (
          <>
            <DialogHeader>
              <DialogTitle>{item.title}</DialogTitle>
              {item.subtitle && <DialogDescription>{item.subtitle}</DialogDescription>}
            </DialogHeader>

            {(item.metric || item.delta) && (
              <div className="flex items-baseline gap-3 rounded-md border bg-accent/30 px-4 py-3">
                <span className="text-lg font-semibold">{item.metric}</span>
                {item.delta && <span className="text-xs text-muted-foreground">{item.delta} vs período anterior</span>}
              </div>
            )}

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Trechos detectados
              </p>
              <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                {item.snippets.map((s, i) => (
                  <div key={i} className="rounded-md border bg-card p-3">
                    <div className="flex items-start gap-2">
                      <Quote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <p className="text-sm italic">"{s.text}"</p>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{s.lead} · {s.channel}</span>
                      {s.sentiment && (
                        <Badge variant="outline" className={SENTIMENT_BADGE[s.sentiment].cls}>
                          {SENTIMENT_BADGE[s.sentiment].label}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
