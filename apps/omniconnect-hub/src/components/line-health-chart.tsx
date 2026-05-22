import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
  ReferenceDot,
} from "recharts";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  GUARD_EVENTS,
  LINE_HEALTH_LINES,
  type GuardEvent,
  type LineHealthLine,
  type LineQuality,
} from "@/lib/leads-data";
import {
  fetchLineHealthHistory,
  fetchLineHealthSnapshot,
  type LineHealthDataSource,
  type ProvenanceEntry,
  type ProvenanceProvider,
} from "@/lib/line-health.functions";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Activity, AlertTriangle, Clock, Info, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

type Range = 7 | 30;

const STATUS_CHIP: Record<LineHealthLine["status"], string> = {
  CONNECTED: "bg-emerald-100 text-emerald-800",
  FLAGGED: "bg-amber-100 text-amber-800",
  PENDING_REVIEW: "bg-blue-100 text-blue-800",
  RESTRICTED: "bg-destructive/15 text-destructive",
};

const PROVIDER_CHIP: Record<ProvenanceProvider, string> = {
  meta: "bg-blue-100 text-blue-800 border-blue-200",
  twilio: "bg-rose-100 text-rose-800 border-rose-200",
  mock: "border-dashed text-muted-foreground",
};

const PROVIDER_LABEL: Record<ProvenanceProvider, string> = {
  meta: "Meta",
  twilio: "Twilio",
  mock: "Mock",
};

const PROVIDER_DOT: Record<ProvenanceProvider, string> = {
  meta: "hsl(217 91% 60%)",
  twilio: "hsl(346 84% 56%)",
  mock: "hsl(var(--muted-foreground))",
};

const QUALITY_CHIP: Record<LineQuality, string> = {
  HIGH: "bg-emerald-100 text-emerald-800",
  MEDIUM: "bg-amber-100 text-amber-800",
  LOW: "bg-destructive/15 text-destructive",
};

type AnnotationKind = "restricted" | "low" | "review" | "medium" | "block";

const ANNOTATION_META: Record<
  AnnotationKind,
  { label: string; chip: string; fill: string; stroke: string; Icon: typeof ShieldAlert }
> = {
  restricted: {
    label: "RESTRICTED",
    chip: "bg-destructive/15 text-destructive",
    fill: "hsl(0 84% 60%)",
    stroke: "hsl(0 84% 35%)",
    Icon: ShieldAlert,
  },
  low: {
    label: "LOW",
    chip: "bg-destructive/15 text-destructive",
    fill: "hsl(0 84% 60%)",
    stroke: "hsl(0 84% 35%)",
    Icon: ShieldAlert,
  },
  review: {
    label: "PENDING_REVIEW",
    chip: "bg-blue-100 text-blue-800",
    fill: "hsl(199 89% 48%)",
    stroke: "hsl(199 89% 30%)",
    Icon: Clock,
  },
  medium: {
    label: "MEDIUM",
    chip: "bg-amber-100 text-amber-800",
    fill: "hsl(38 92% 50%)",
    stroke: "hsl(28 90% 35%)",
    Icon: AlertTriangle,
  },
  block: {
    label: "Bloqueio",
    chip: "bg-destructive/15 text-destructive",
    fill: "hsl(0 84% 60%)",
    stroke: "hsl(0 84% 35%)",
    Icon: ShieldAlert,
  },
};

const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  });

const qualityFromScore = (s: number): LineQuality =>
  s >= 2.5 ? "HIGH" : s >= 1.5 ? "MEDIUM" : "LOW";

/** Tenta inferir a qual linha um evento line_health se refere usando phone/WABA. */
function findLineIdForEvent(ev: GuardEvent): string | null {
  if (ev.reason !== "line_health") return null;
  const hay = `${ev.detail} ${ev.guardData?.map((g) => g.value).join(" ") ?? ""} ${ev.context?.map((c) => c.value).join(" ") ?? ""}`;
  for (const l of LINE_HEALTH_LINES) {
    if (hay.includes(l.phone) || hay.includes(l.wabaId)) return l.id;
  }
  // fallback: mesmo tenant + qualidade compatível
  const sameTenant = LINE_HEALTH_LINES.filter((l) => l.tenantId === ev.tenantId);
  if (sameTenant.length === 1) return sameTenant[0].id;
  return null;
}

function classifyEvent(ev: GuardEvent): AnnotationKind {
  const text = `${ev.detail} ${ev.brokerResponse?.code ?? ""} ${ev.brokerResponse?.message ?? ""}`.toUpperCase();
  if (text.includes("RESTRICTED")) return "restricted";
  if (text.includes("PENDING_REVIEW") || text.includes("PENDING")) return "review";
  if (text.includes("LOW")) return "low";
  if (text.includes("MEDIUM")) return "medium";
  return "block";
}

export function LineHealthChart() {
  const [range, setRange] = useState<Range>(7);
  const [scope, setScope] = useState<string>("all"); // line id, tenant:id, or "all"

  const snapshotFn = useServerFn(fetchLineHealthSnapshot);
  const historyFn = useServerFn(fetchLineHealthHistory);

  const snapshotQuery = useQuery({
    queryKey: ["line-health", "snapshot"],
    queryFn: () => snapshotFn(),
    staleTime: 60_000,
  });

  const historyQuery = useQuery({
    queryKey: ["line-health", "history", range, scope],
    queryFn: () => historyFn({ data: { range, scope } }),
    staleTime: 60_000,
  });

  // Lista canônica das linhas (snapshot quando disponível, mock como fallback).
  const allLines = snapshotQuery.data?.lines ?? LINE_HEALTH_LINES;

  const scopeOptions = useMemo(() => {
    const tenants = new Map<string, string>();
    allLines.forEach((l) => tenants.set(l.tenantId, l.tenantName));
    return {
      tenants: Array.from(tenants, ([id, name]) => ({ id, name })),
      lines: allLines,
    };
  }, [allLines]);

  const activeLines = useMemo(() => {
    if (scope.startsWith("tenant:")) {
      const t = scope.slice("tenant:".length);
      return allLines.filter((l) => l.tenantId === t);
    }
    if (scope !== "all") return allLines.filter((l) => l.id === scope);
    return allLines;
  }, [scope, allLines]);

  const series = useMemo(() => {
    const hist = historyQuery.data?.series;
    if (!hist || hist.length === 0) return [];
    // Eixo X = datas da primeira série (todas vêm alinhadas pelo serverFn).
    const reference = hist[0].points;
    return reference.map((point, i) => {
      const row: Record<string, string | number> = { date: fmtDate(point.date) };
      hist.forEach((s) => {
        const p = s.points[i];
        if (p) row[s.lineId] = p.score;
      });
      return row;
    });
  }, [historyQuery.data]);

  const dataSource: LineHealthDataSource = historyQuery.data?.source ?? "mock";
  const isLoading = historyQuery.isLoading || snapshotQuery.isLoading;

  // Provider primário e provenance por linha — vem do snapshot. Para o histórico
  // usamos o `provider` da série (pode divergir, ex.: snapshot Twilio + histórico Meta).
  const providerByLine = useMemo(() => {
    const m = new Map<string, ProvenanceProvider>();
    snapshotQuery.data?.lines.forEach((l) => m.set(l.id, l.primaryProvider));
    return m;
  }, [snapshotQuery.data]);

  const snapshotLineMap = useMemo(() => {
    const m = new Map<string, NonNullable<typeof snapshotQuery.data>["lines"][number]>();
    snapshotQuery.data?.lines.forEach((l) => m.set(l.id, l));
    return m;
  }, [snapshotQuery.data]);

  const historyProviderByLine = useMemo(() => {
    const m = new Map<string, { provider: ProvenanceProvider; provenance: ProvenanceEntry }>();
    historyQuery.data?.series.forEach((s) =>
      m.set(s.lineId, { provider: s.provider, provenance: s.provenance }),
    );
    return m;
  }, [historyQuery.data]);


  const annotations = useMemo(() => {
    const activeIds = new Set(activeLines.map((l) => l.id));
    const visibleSet = new Set(
      historyQuery.data?.series[0]?.points.map((p) => p.date) ?? [],
    );

    type Ann = {
      id: string;
      lineId: string;
      dateIso: string;
      dateLabel: string;
      score: number;
      kind: AnnotationKind;
      event: GuardEvent;
    };

    const out: Ann[] = [];
    for (const ev of GUARD_EVENTS) {
      if (ev.reason !== "line_health" || !ev.occurredAt) continue;
      const lineId = findLineIdForEvent(ev);
      if (!lineId || !activeIds.has(lineId)) continue;
      const day = ev.occurredAt.slice(0, 10);
      if (!visibleSet.has(day)) continue;
      const dateLabel = fmtDate(day);
      const row = series.find((r) => r.date === dateLabel);
      const score = row ? Number(row[lineId] ?? 1) : 1;
      out.push({
        id: ev.id,
        lineId,
        dateIso: day,
        dateLabel,
        score,
        kind: classifyEvent(ev),
        event: ev,
      });
    }

    // ordena por data crescente
    out.sort((a, b) => a.dateIso.localeCompare(b.dateIso));
    return out;
  }, [activeLines, series, historyQuery.data]);

  const STROKES = [
    "hsl(var(--primary))",
    "hsl(24 95% 53%)", // orange
    "hsl(142 71% 45%)", // green
    "hsl(262 83% 58%)", // violet
    "hsl(199 89% 48%)", // sky
  ];

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm">
            <Activity className="h-4 w-4 text-orange-600" />
            <span className="font-medium">Saúde da linha WhatsApp (Meta)</span>
            <Badge variant="secondary" className="text-[10px]">
              {activeLines.length} linha{activeLines.length === 1 ? "" : "s"}
            </Badge>
            {annotations.length > 0 && (
              <Badge variant="outline" className="gap-1 text-[10px]">
                <AlertTriangle className="h-3 w-3" /> {annotations.length} evento
                {annotations.length === 1 ? "" : "s"}
              </Badge>
            )}
            <Badge
              variant="outline"
              className={cn(
                "text-[10px]",
                dataSource === "mock"
                  ? "border-dashed text-muted-foreground"
                  : "bg-emerald-100 text-emerald-800",
              )}
              title={
                dataSource === "mock"
                  ? "Dados mockados. Backend de coleta ainda não habilitado — ver src/lib/line-health.functions.ts (TODO[real-source])."
                  : `Fonte: ${dataSource}`
              }
            >
              fonte: {dataSource}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger className="h-9 w-[260px] text-xs">
                <SelectValue placeholder="Linha ou empresa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as linhas</SelectItem>
                {scopeOptions.tenants.map((t) => (
                  <SelectItem key={`tenant:${t.id}`} value={`tenant:${t.id}`}>
                    Empresa · {t.name}
                  </SelectItem>
                ))}
                {scopeOptions.lines.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.displayName} · {l.phone}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex rounded-md border bg-card p-0.5">
              {[7, 30].map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r as Range)}
                  className={cn(
                    "rounded px-2.5 py-1 text-xs font-medium transition",
                    range === r
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {r}d
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="h-[260px] w-full">
          {isLoading && series.length === 0 ? (
            <Skeleton className="h-full w-full" />
          ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                interval={range === 30 ? 3 : 0}
              />
              <YAxis
                domain={[0.8, 3.2]}
                ticks={[1, 2, 3]}
                tickFormatter={(v) => (v === 3 ? "HIGH" : v === 2 ? "MED" : "LOW")}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                width={48}
              />
              <ReferenceLine y={2.5} stroke="hsl(var(--border))" strokeDasharray="2 4" />
              <ReferenceLine y={1.5} stroke="hsl(var(--border))" strokeDasharray="2 4" />
              <Tooltip
                wrapperStyle={{ outline: "none" }}
                content={({ active, payload, label }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  return (
                    <div className="rounded-md border bg-popover p-2 text-[11px] shadow-md">
                      <div className="mb-1 font-medium text-foreground">{label}</div>
                      <ul className="space-y-1">
                        {payload.map((p) => {
                          const lineId = String(p.dataKey);
                          const line = LINE_HEALTH_LINES.find((l) => l.id === lineId);
                          const hist = historyProviderByLine.get(lineId);
                          const provider: ProvenanceProvider =
                            hist?.provider ?? providerByLine.get(lineId) ?? "mock";
                          const q = qualityFromScore(Number(p.value));
                          return (
                            <li key={lineId} className="flex items-center gap-2">
                              <span
                                className="h-2 w-2 shrink-0 rounded-full"
                                style={{ background: p.color as string }}
                              />
                              <span className="flex-1 truncate text-foreground">
                                {line?.displayName ?? lineId}
                              </span>
                              <span
                                className={cn(
                                  "rounded px-1 font-medium",
                                  QUALITY_CHIP[q],
                                )}
                              >
                                {q}
                              </span>
                              <span
                                className={cn(
                                  "rounded border px-1 text-[10px] font-medium",
                                  PROVIDER_CHIP[provider],
                                )}
                                title={hist?.provenance.endpoint}
                              >
                                {PROVIDER_LABEL[provider]}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                }}
              />
              {activeLines.map((l, i) => (
                <Line
                  key={l.id}
                  type="stepAfter"
                  dataKey={l.id}
                  stroke={STROKES[i % STROKES.length]}
                  strokeWidth={2}
                  dot={{ r: 2.5 }}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
              ))}
              {annotations.map((a) => {
                const meta = ANNOTATION_META[a.kind];
                return (
                  <ReferenceDot
                    key={a.id}
                    x={a.dateLabel}
                    y={a.score}
                    r={6}
                    fill={meta.fill}
                    stroke={meta.stroke}
                    strokeWidth={1.5}
                    ifOverflow="extendDomain"
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
          )}
        </div>

        {annotations.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5" /> Eventos no período
            </div>
            <ul className="space-y-1.5">
              {annotations.map((a) => {
                const meta = ANNOTATION_META[a.kind];
                const line = LINE_HEALTH_LINES.find((l) => l.id === a.lineId);
                const Icon = meta.Icon;
                return (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-start gap-2 rounded-md border bg-card p-2 text-xs"
                  >
                    <div
                      className={cn(
                        "grid h-6 w-6 shrink-0 place-items-center rounded-md",
                        meta.chip,
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className={cn("text-[10px]", meta.chip)}
                        >
                          {meta.label}
                        </Badge>
                        <span className="font-medium">{line?.displayName}</span>
                        <span className="text-muted-foreground">
                          · {a.event.occurredAt}
                        </span>
                      </div>
                      <p className="line-clamp-2 text-muted-foreground">
                        {a.event.detail}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <TooltipProvider delayDuration={120}>
          <div className="grid gap-2 sm:grid-cols-2">
            {activeLines.map((l, i) => {
              const snap = snapshotLineMap.get(l.id);
              const provider: ProvenanceProvider =
                snap?.primaryProvider ?? providerByLine.get(l.id) ?? "mock";
              const prov = snap?.provenance;
              return (
                <div
                  key={l.id}
                  className="flex items-center justify-between gap-3 rounded-md border bg-card p-2.5 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: STROKES[i % STROKES.length] }}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-medium">{l.displayName}</span>
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ background: PROVIDER_DOT[provider] }}
                          aria-hidden
                        />
                      </div>
                      <div className="truncate text-[10px] text-muted-foreground">
                        {l.phone} · {l.tenantName} · {l.tier}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Badge variant="outline" className={cn("text-[10px]", QUALITY_CHIP[l.current])}>
                      {l.current}
                    </Badge>
                    <Badge variant="outline" className={cn("text-[10px]", STATUS_CHIP[l.status])}>
                      {l.status}
                    </Badge>
                    <UITooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className={cn(
                            "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium",
                            PROVIDER_CHIP[provider],
                          )}
                        >
                          {PROVIDER_LABEL[provider]}
                          <Info className="h-2.5 w-2.5 opacity-70" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent
                        side="top"
                        align="end"
                        className="max-w-[360px] bg-popover p-0 text-popover-foreground"
                      >
                        <div className="space-y-2 p-2.5 text-[11px]">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "rounded border px-1.5 py-0.5 text-[10px] font-semibold",
                                PROVIDER_CHIP[provider],
                              )}
                            >
                              {PROVIDER_LABEL[provider]}
                            </span>
                            <span className="text-muted-foreground">
                              Evidência da coleta
                            </span>
                          </div>
                          {prov ? (
                            <ul className="space-y-1.5">
                              {(
                                [
                                  ["Qualidade", prov.quality],
                                  ["Status", prov.status],
                                  ["Tier", prov.tier],
                                  ...(prov.delivery
                                    ? ([["Entregas", prov.delivery]] as const)
                                    : []),
                                ] as Array<[string, ProvenanceEntry]>
                              ).map(([label, e]) => (
                                <li key={label} className="rounded border bg-card p-1.5">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-medium text-foreground">{label}</span>
                                    <span
                                      className={cn(
                                        "rounded border px-1 text-[9px] font-medium",
                                        PROVIDER_CHIP[e.provider],
                                      )}
                                    >
                                      {PROVIDER_LABEL[e.provider]}
                                    </span>
                                  </div>
                                  <div className="mt-0.5 break-all font-mono text-[10px] text-muted-foreground">
                                    {e.endpoint}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground">
                                    <span className="font-medium text-foreground">{e.field}</span>
                                    {": "}
                                    {e.rawValue}
                                  </div>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-muted-foreground">
                              Sem evidência ainda (snapshot não carregado).
                            </p>
                          )}
                        </div>
                      </TooltipContent>
                    </UITooltip>
                  </div>
                </div>
              );
            })}
          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}
