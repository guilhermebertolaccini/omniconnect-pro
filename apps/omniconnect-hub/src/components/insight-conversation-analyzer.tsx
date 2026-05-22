import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LEADS } from "@/lib/leads-data";
import { Progress } from "@/components/ui/progress";
import {
  MessagesSquare,
  Search,
  Sparkles,
  Loader2,
  Quote,
  Wand2,
  History,
  Trash2,
  RotateCcw,
  Copy,
  StopCircle,
  Columns,
  CheckCircle2,
  XCircle,
  FileText,
  FileSpreadsheet,
} from "lucide-react";
import { toast } from "sonner";
import { exportAnalysisCSV, exportAnalysisPDF, type ExportPayload } from "@/lib/insight-export";

type Mode = "single" | "batch";

type LeadResult = {
  id: string;
  name: string;
  stage: string;
  text: string;
  matchedCount: number;
  citationCount: number;
};

type HistoryEntry = {
  id: string;
  createdAt: number;
  mode: Mode;
  selected: string[];
  selectedNames: string[];
  preset: string;
  presetLabel: string;
  prompt: string;
  context: string;
  result: string;
  leadResults?: LeadResult[];
  canceled?: boolean;
};

const HISTORY_KEY = "insightai.analysis.history.v1";
const HISTORY_LIMIT = 50;

const PROMPT_PRESETS = [
  { id: "objections", label: "Identificar objeções", text: "Liste as principais objeções do cliente e o momento da conversa em que aparecem. Para cada objeção, traga a citação literal e sugira uma resposta." },
  { id: "intent", label: "Detectar intenção de compra", text: "Avalie a intenção de compra (alta/média/baixa) e os sinais que fundamentam a avaliação. Aponte próximo passo recomendado." },
  { id: "sentiment", label: "Resumo de sentimento", text: "Resuma o sentimento ao longo da conversa, indicando viradas (positivas ou negativas) e o gatilho de cada mudança." },
  { id: "summary", label: "Resumo executivo", text: "Faça um resumo executivo (até 5 bullets) com pedidos, decisões, pendências e prazo combinado." },
  { id: "custom", label: "Prompt personalizado", text: "" },
];

function loadHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory(entries: HistoryEntry[]) {
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, HISTORY_LIMIT)));
  } catch {
    // ignore quota errors
  }
}

function highlightTerm(text: string, term?: string): React.ReactNode {
  const t = (term ?? "").trim();
  if (!t) return text;
  try {
    const re = new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig");
    const parts = text.split(re);
    return parts.map((p, i) =>
      re.test(p) && p.toLowerCase() === t.toLowerCase() ? (
        <mark key={i} className="rounded bg-primary/20 px-0.5 text-foreground">{p}</mark>
      ) : (
        <span key={i}>{p}</span>
      )
    );
  } catch {
    return text;
  }
}

function CitationCard({
  index,
  lead,
  channel,
  at,
  by,
  text,
  matched,
  highlight,
}: {
  index: number;
  lead: string;
  channel?: string;
  at?: string;
  by?: string;
  text: string;
  matched: boolean;
  highlight?: string;
}) {
  return (
    <div
      id={`cite-${index}`}
      className={`my-2 rounded-md border-l-2 ${matched ? "border-l-primary bg-primary/5" : "border-l-border bg-accent/30"} px-3 py-2`}
    >
      <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
        <Badge variant="outline" className="h-4 px-1.5 text-[10px] font-normal">#{index}</Badge>
        <span className="font-medium text-foreground">{lead}</span>
        {channel && <span>· {channel}</span>}
        {by && <span>· {by}</span>}
        {at && <span>· {at}</span>}
        {matched && (
          <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-normal">trecho relevante</Badge>
        )}
      </div>
      <p className="mt-1 flex gap-2 text-sm italic text-foreground/90">
        <Quote className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
        <span>"{highlightTerm(text, highlight)}"</span>
      </p>
    </div>
  );
}

function renderMarkdownLike(text: string, highlight?: string) {
  return text.split("\n").map((ln, i) => {
    if (ln.startsWith("@@CITE|")) {
      const [, idx, lead, channel, at, by, matchedFlag, ...rest] = ln.split("|");
      const body = rest.join("|");
      return (
        <CitationCard
          key={i}
          index={Number(idx)}
          lead={lead}
          channel={channel || undefined}
          at={at || undefined}
          by={by || undefined}
          text={body}
          matched={matchedFlag === "1"}
          highlight={highlight}
        />
      );
    }
    if (ln.startsWith("### ")) return <p key={i} className="mt-3 font-semibold">{ln.slice(4)}</p>;
    if (ln.startsWith("> ")) return (
      <p key={i} className="my-1 flex gap-2 italic text-muted-foreground">
        <Quote className="mt-0.5 h-3 w-3 shrink-0" />{highlightTerm(ln.slice(2), highlight)}
      </p>
    );
    if (ln.startsWith("- ")) return (
      <p key={i} className="ml-3 text-xs">• {highlightTerm(ln.slice(2), highlight)}</p>
    );
    if (ln.startsWith("**") && ln.endsWith("**")) return <p key={i} className="mt-2 text-sm font-medium">{ln.replace(/\*\*/g, "")}</p>;
    if (ln.startsWith("_") && ln.endsWith("_")) return <p key={i} className="text-xs italic text-muted-foreground">{ln.replace(/_/g, "")}</p>;
    return ln.trim() ? <p key={i} className="text-sm">{highlightTerm(ln, highlight)}</p> : <div key={i} className="h-2" />;
  });
}

export function InsightConversationAnalyzer() {
  const [mode, setMode] = useState<Mode>("single");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [preset, setPreset] = useState<string>("objections");
  const [prompt, setPrompt] = useState(PROMPT_PRESETS[0].text);
  const [context, setContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [leadResults, setLeadResults] = useState<LeadResult[]>([]);
  const [progress, setProgress] = useState<{ current: number; total: number; leadName: string }>({
    current: 0,
    total: 0,
    leadName: "",
  });
  const [canceled, setCanceled] = useState(false);
  const [viewMode, setViewMode] = useState<"combined" | "compare">("combined");
  const cancelRef = useRef(false);

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [viewing, setViewing] = useState<HistoryEntry | null>(null);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return LEADS;
    return LEADS.filter((l) => l.name.toLowerCase().includes(q) || l.stage.toLowerCase().includes(q));
  }, [search]);

  const toggle = (id: string) => {
    if (mode === "single") {
      setSelected([id]);
      return;
    }
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setSelected((prev) => (m === "single" ? prev.slice(0, 1) : prev));
  };

  const resetRunState = () => {
    setResult(null);
    setLeadResults([]);
    setProgress({ current: 0, total: 0, leadName: "" });
    setCanceled(false);
    cancelRef.current = false;
  };

  const openAnalyzer = () => {
    if (selected.length === 0) {
      toast.error("Selecione ao menos uma conversa para analisar.");
      return;
    }
    resetRunState();
    setDialogOpen(true);
  };

  const onPresetChange = (id: string) => {
    setPreset(id);
    const p = PROMPT_PRESETS.find((x) => x.id === id);
    if (p && p.id !== "custom") setPrompt(p.text);
    if (p && p.id === "custom") setPrompt("");
  };

  const persistEntry = (entry: HistoryEntry) => {
    setHistory((prev) => {
      const next = [entry, ...prev].slice(0, HISTORY_LIMIT);
      saveHistory(next);
      return next;
    });
  };

  const removeEntry = (id: string) => {
    setHistory((prev) => {
      const next = prev.filter((e) => e.id !== id);
      saveHistory(next);
      return next;
    });
    if (viewing?.id === id) setViewing(null);
  };

  const clearHistory = () => {
    setHistory([]);
    saveHistory([]);
    setViewing(null);
    toast.success("Histórico de análises limpo.");
  };

  const restoreEntry = (entry: HistoryEntry) => {
    setMode(entry.mode);
    setSelected(entry.selected);
    setPreset(entry.preset);
    setPrompt(entry.prompt);
    setContext(entry.context);
    setResult(entry.result);
    setLeadResults(entry.leadResults ?? []);
    setCanceled(!!entry.canceled);
    setProgress({ current: entry.selected.length, total: entry.selected.length, leadName: "" });
    setViewMode((entry.leadResults?.length ?? 0) > 1 ? "compare" : "combined");
    setViewing(null);
    setHistoryOpen(false);
    setDialogOpen(true);
    toast.success("Análise restaurada — pronta para reexecutar ou ajustar.");
  };

  const cancelRun = () => {
    if (!loading) return;
    cancelRef.current = true;
    toast.message("Cancelando análise…", { description: "Os resultados parciais serão preservados." });
  };

  const copyResult = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Resultado copiado.");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  const buildCurrentPayload = (): ExportPayload | null => {
    if (leadResults.length === 0) return null;
    const presetMeta = PROMPT_PRESETS.find((p) => p.id === preset);
    return {
      createdAt: Date.now(),
      presetLabel: presetMeta?.label ?? preset,
      mode,
      prompt: prompt.trim(),
      context: context.trim(),
      canceled,
      selectedNames: leadResults.map((r) => r.name),
      leadResults,
    };
  };

  const exportCurrent = (format: "pdf" | "csv") => {
    const payload = buildCurrentPayload();
    if (!payload) {
      toast.error("Nada para exportar — execute uma análise primeiro.");
      return;
    }
    try {
      if (format === "pdf") exportAnalysisPDF(payload);
      else exportAnalysisCSV(payload);
      toast.success(`Exportação ${format.toUpperCase()} gerada.`);
    } catch (e) {
      console.error(e);
      toast.error("Falha ao exportar.");
    }
  };

  const exportHistoryEntry = (entry: HistoryEntry, format: "pdf" | "csv") => {
    if (!entry.leadResults || entry.leadResults.length === 0) {
      toast.error("Esta entrada antiga não tem dados estruturados para exportar.");
      return;
    }
    try {
      const payload: ExportPayload = {
        createdAt: entry.createdAt,
        presetLabel: entry.presetLabel,
        mode: entry.mode,
        prompt: entry.prompt,
        context: entry.context,
        canceled: entry.canceled,
        selectedNames: entry.selectedNames,
        leadResults: entry.leadResults,
      };
      if (format === "pdf") exportAnalysisPDF(payload);
      else exportAnalysisCSV(payload);
      toast.success(`Exportação ${format.toUpperCase()} gerada.`);
    } catch (e) {
      console.error(e);
      toast.error("Falha ao exportar.");
    }
  };

  const run = async () => {
    if (!prompt.trim()) {
      toast.error("Escreva um prompt para a IA.");
      return;
    }
    resetRunState();
    setLoading(true);

    const leads = LEADS.filter((l) => selected.includes(l.id));
    const term = context.trim();
    setProgress({ current: 0, total: leads.length, leadName: "" });
    setViewMode(leads.length > 1 ? "compare" : "combined");

    const perLead: LeadResult[] = [];
    let citeIdx = 0;
    let matchedTotal = 0;
    let wasCanceled = false;

    for (let i = 0; i < leads.length; i++) {
      if (cancelRef.current) {
        wasCanceled = true;
        break;
      }
      const l = leads[i];
      setProgress({ current: i, total: leads.length, leadName: l.name });

      // Simulate per-lead analysis latency (cancelable in 100ms slices).
      const totalWait = 600 + Math.floor(Math.random() * 400);
      const slices = Math.ceil(totalWait / 100);
      for (let s = 0; s < slices; s++) {
        if (cancelRef.current) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      if (cancelRef.current) {
        wasCanceled = true;
        break;
      }

      const leadLines: string[] = [];
      leadLines.push(`### ${l.name} · ${l.stage}`);
      const sample = (l.timeline ?? []).slice(0, 4);
      const myMatches: number[] = [];
      sample.forEach((it) => {
        citeIdx += 1;
        const text = String(it.preview ?? it.title ?? "(mensagem)").slice(0, 220);
        const matched = term ? text.toLowerCase().includes(term.toLowerCase()) : false;
        if (matched) {
          matchedTotal += 1;
          myMatches.push(citeIdx);
        }
        leadLines.push(
          `@@CITE|${citeIdx}|${l.name}|${it.channel ?? it.type ?? ""}|${it.at ?? ""}|${it.by ?? ""}|${matched ? "1" : "0"}|${text}`
        );
      });
      const refs = myMatches.length ? ` (ver #${myMatches.join(", #")})` : "";
      leadLines.push(
        `- Sinal detectado: ${myMatches.length ? "evidência direta" : "intenção moderada"}${term ? `, com referências a "${term}"` : ""}${refs}.`
      );
      leadLines.push(`- Próximo passo sugerido: enviar proposta personalizada via WhatsApp em até 24h.`);

      const leadResult: LeadResult = {
        id: l.id,
        name: l.name,
        stage: l.stage,
        text: leadLines.join("\n"),
        matchedCount: myMatches.length,
        citationCount: sample.length,
      };
      perLead.push(leadResult);
      setLeadResults([...perLead]);
      setProgress({ current: i + 1, total: leads.length, leadName: l.name });
    }

    const header: string[] = [];
    const stamp = new Date().toLocaleString("pt-BR");
    header.push(
      wasCanceled
        ? `**Análise cancelada** — ${perLead.length} de ${leads.length} conversa(s) processadas em ${stamp}.`
        : `**Análise de ${leads.length} conversa(s)** — ${stamp}`
    );
    if (term) header.push(`_Contexto de busca: ${term}_`);
    header.push("");

    const body = perLead.map((r) => r.text).join("\n\n");
    const footer: string[] = [""];
    footer.push(
      `**Evidências encontradas:** ${matchedTotal} trecho(s) com correspondência direta em ${perLead.length} conversa(s).`
    );
    if (!wasCanceled) {
      footer.push("**Síntese:** padrões consistentes de hesitação na etapa de proposta. Recomenda-se follow-up com prova social e CTA direto.");
    } else {
      footer.push("**Síntese parcial:** execução interrompida antes de concluir todas as conversas selecionadas.");
    }
    const out = [...header, body, ...footer].join("\n");

    setResult(out);
    setCanceled(wasCanceled);
    setLoading(false);
    cancelRef.current = false;

    const presetMeta = PROMPT_PRESETS.find((p) => p.id === preset);
    const entry: HistoryEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
      mode,
      selected: perLead.map((r) => r.id),
      selectedNames: perLead.map((r) => r.name),
      preset,
      presetLabel: presetMeta?.label ?? preset,
      prompt: prompt.trim(),
      context: term,
      result: out,
      leadResults: perLead,
      canceled: wasCanceled,
    };
    if (perLead.length > 0) persistEntry(entry);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <MessagesSquare className="h-4 w-4 text-primary" />
              Analisar conversa(s) com IA
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Selecione uma conversa específica ou um lote de conversas e descreva o que a IA deve buscar.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border bg-card p-0.5">
              <button
                type="button"
                onClick={() => switchMode("single")}
                className={`rounded px-2.5 py-1 text-xs ${mode === "single" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                Individual
              </button>
              <button
                type="button"
                onClick={() => switchMode("batch")}
                className={`rounded px-2.5 py-1 text-xs ${mode === "batch" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                Em lote
              </button>
            </div>
            <Button size="sm" variant="outline" onClick={() => setHistoryOpen(true)} className="gap-1.5">
              <History className="h-3.5 w-3.5" />
              Histórico ({history.length})
            </Button>
            <Button size="sm" onClick={openAnalyzer} className="gap-1.5">
              <Wand2 className="h-3.5 w-3.5" />
              Analisar ({selected.length})
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou etapa…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <ScrollArea className="h-56 rounded-md border">
          <ul className="divide-y">
            {filtered.map((l) => {
              const checked = selected.includes(l.id);
              return (
                <li key={l.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors hover:bg-accent/50">
                    <Checkbox checked={checked} onCheckedChange={() => toggle(l.id)} />
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium">{l.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {l.timeline?.length ?? 0} interações
                      </p>
                    </div>
                    <Badge variant="secondary" className="text-[10px] font-normal">{l.stage}</Badge>
                  </label>
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="px-3 py-6 text-center text-xs text-muted-foreground">
                Nenhuma conversa encontrada.
              </li>
            )}
          </ul>
        </ScrollArea>
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Prompt para a IA
            </DialogTitle>
            <DialogDescription>
              {selected.length === 1
                ? "Analisando 1 conversa selecionada."
                : `Analisando ${selected.length} conversas em lote.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Modelo de análise</Label>
              <Select value={preset} onValueChange={onPresetChange}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROMPT_PRESETS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Contexto de busca (opcional)</Label>
              <Input
                placeholder='Ex.: "preço", "concorrente X", "prazo de entrega"'
                value={context}
                onChange={(e) => setContext(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                A IA priorizará trechos que mencionem este termo.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Prompt</Label>
              <Textarea
                rows={5}
                value={prompt}
                onChange={(e) => {
                  setPrompt(e.target.value);
                  setPreset("custom");
                }}
                placeholder="Descreva o que a IA deve identificar nas conversas…"
              />
            </div>

            {(loading || progress.total > 0) && (
              <div className="space-y-1.5 rounded-md border bg-card p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2 font-medium">
                    {loading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    ) : canceled ? (
                      <XCircle className="h-3.5 w-3.5 text-destructive" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                    )}
                    {loading
                      ? `Analisando ${progress.current + 1} de ${progress.total}…`
                      : canceled
                        ? `Cancelado em ${progress.current} de ${progress.total}`
                        : `Concluído (${progress.current}/${progress.total})`}
                  </span>
                  <span className="text-muted-foreground">
                    {progress.total > 0
                      ? `${Math.round((progress.current / progress.total) * 100)}%`
                      : ""}
                  </span>
                </div>
                <Progress
                  value={progress.total > 0 ? (progress.current / progress.total) * 100 : 0}
                  className="h-1.5"
                />
                {loading && progress.leadName && (
                  <p className="truncate text-[11px] text-muted-foreground">
                    Em andamento: <span className="font-medium text-foreground">{progress.leadName}</span>
                  </p>
                )}
                {leadResults.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {leadResults.map((r) => (
                      <Badge key={r.id} variant="secondary" className="gap-1 text-[10px] font-normal">
                        <CheckCircle2 className="h-2.5 w-2.5 text-primary" />
                        {r.name}
                        {r.matchedCount > 0 && (
                          <span className="text-muted-foreground">· {r.matchedCount}</span>
                        )}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}

            {result && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs">Resultado</Label>
                  <div className="flex items-center gap-1">
                    {leadResults.length > 1 && (
                      <div className="flex rounded-md border bg-card p-0.5">
                        <button
                          type="button"
                          onClick={() => setViewMode("combined")}
                          className={`flex items-center gap-1 rounded px-2 py-0.5 text-[11px] ${viewMode === "combined" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                        >
                          <Sparkles className="h-3 w-3" /> Combinado
                        </button>
                        <button
                          type="button"
                          onClick={() => setViewMode("compare")}
                          className={`flex items-center gap-1 rounded px-2 py-0.5 text-[11px] ${viewMode === "compare" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                        >
                          <Columns className="h-3 w-3" /> Comparar
                        </button>
                      </div>
                    )}
                    <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => exportCurrent("pdf")}>
                      <FileText className="h-3 w-3" /> PDF
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => exportCurrent("csv")}>
                      <FileSpreadsheet className="h-3 w-3" /> CSV
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => copyResult(result)}>
                      <Copy className="h-3 w-3" /> Copiar
                    </Button>
                  </div>
                </div>

                {viewMode === "combined" || leadResults.length <= 1 ? (
                  <div className="max-h-72 overflow-y-auto rounded-md border bg-accent/30 p-3 text-sm">
                    {renderMarkdownLike(result, context.trim())}
                  </div>
                ) : (
                  <div className="grid max-h-72 gap-3 overflow-y-auto rounded-md border bg-accent/20 p-3 md:grid-cols-2">
                    {leadResults.map((r) => (
                      <div key={r.id} className="rounded-md border bg-card p-2.5">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <p className="truncate text-xs font-semibold">{r.name}</p>
                          <Badge variant="outline" className="text-[10px] font-normal">{r.stage}</Badge>
                        </div>
                        <div className="mb-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span>{r.citationCount} citações</span>
                          <span>·</span>
                          <span className={r.matchedCount > 0 ? "text-primary" : ""}>
                            {r.matchedCount} match{r.matchedCount === 1 ? "" : "es"}
                          </span>
                        </div>
                        <div className="max-h-56 overflow-y-auto pr-1 text-sm">
                          {renderMarkdownLike(r.text, context.trim())}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-[11px] text-muted-foreground">
                  {canceled
                    ? "Execução cancelada — resultados parciais salvos no histórico."
                    : "Esta execução foi salva no histórico automaticamente."}
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={loading}>
              Fechar
            </Button>
            {loading ? (
              <Button variant="destructive" onClick={cancelRun} className="gap-1.5">
                <StopCircle className="h-3.5 w-3.5" />
                Cancelar
              </Button>
            ) : (
              <Button onClick={run} className="gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                {result ? "Reexecutar análise" : "Executar análise"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-4 w-4 text-primary" />
              Histórico de análises
            </DialogTitle>
            <DialogDescription>
              {history.length === 0
                ? "Nenhuma análise executada ainda."
                : `${history.length} execução(ões) salvas neste navegador.`}
            </DialogDescription>
          </DialogHeader>

          {history.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center text-xs text-muted-foreground">
              Execute uma análise para começar a montar seu histórico.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-[280px_1fr]">
              <ScrollArea className="h-[420px] rounded-md border">
                <ul className="divide-y">
                  {history.map((e) => {
                    const active = viewing?.id === e.id;
                    return (
                      <li key={e.id}>
                        <button
                          type="button"
                          onClick={() => setViewing(e)}
                          className={`flex w-full flex-col gap-1 px-3 py-2 text-left transition-colors hover:bg-accent/50 ${active ? "bg-accent" : ""}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-xs font-medium">{e.presetLabel}</span>
                            <Badge variant="secondary" className="text-[10px] font-normal">
                              {e.mode === "single" ? "Individual" : "Lote"}
                            </Badge>
                          </div>
                          <span className="truncate text-[11px] text-muted-foreground">
                            {e.selectedNames.slice(0, 2).join(", ")}
                            {e.selectedNames.length > 2 ? ` +${e.selectedNames.length - 2}` : ""}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(e.createdAt).toLocaleString("pt-BR")}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </ScrollArea>

              <div className="rounded-md border bg-card p-3">
                {!viewing ? (
                  <p className="py-10 text-center text-xs text-muted-foreground">
                    Selecione uma execução para visualizar os detalhes.
                  </p>
                ) : (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="text-[10px]">{viewing.presetLabel}</Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {viewing.mode === "single" ? "Individual" : "Lote"} · {viewing.selected.length} conversa(s)
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">
                        {new Date(viewing.createdAt).toLocaleString("pt-BR")}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Conversas</Label>
                      <p className="text-xs">{viewing.selectedNames.join(", ")}</p>
                    </div>

                    {viewing.context && (
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">Contexto de busca</Label>
                        <p className="text-xs">{viewing.context}</p>
                      </div>
                    )}

                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Prompt</Label>
                      <p className="whitespace-pre-wrap rounded border bg-muted/40 p-2 text-xs">{viewing.prompt}</p>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-[11px] text-muted-foreground">Resultado</Label>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1.5 text-xs"
                            onClick={() => exportHistoryEntry(viewing, "pdf")}
                            disabled={!viewing.leadResults?.length}
                          >
                            <FileText className="h-3 w-3" /> PDF
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1.5 text-xs"
                            onClick={() => exportHistoryEntry(viewing, "csv")}
                            disabled={!viewing.leadResults?.length}
                          >
                            <FileSpreadsheet className="h-3 w-3" /> CSV
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => copyResult(viewing.result)}>
                            <Copy className="h-3 w-3" /> Copiar
                          </Button>
                        </div>
                      </div>
                      <div className="max-h-56 overflow-y-auto rounded border bg-accent/30 p-3 text-sm">
                        {renderMarkdownLike(viewing.result, viewing.context)}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <Button variant="outline" size="sm" onClick={() => restoreEntry(viewing)} className="gap-1.5">
                        <RotateCcw className="h-3.5 w-3.5" /> Restaurar no editor
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => removeEntry(viewing.id)} className="gap-1.5 text-destructive hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" /> Excluir
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="flex items-center justify-between sm:justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={clearHistory}
              disabled={history.length === 0}
              className="gap-1.5 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" /> Limpar histórico
            </Button>
            <Button variant="outline" onClick={() => setHistoryOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
