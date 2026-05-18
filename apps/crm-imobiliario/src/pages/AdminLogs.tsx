import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { subscribe, clearLogs, type LogEntry } from "@/lib/errorLogger";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import {
  AlertCircle, AlertTriangle, Bug, Search, RotateCcw, Eye,
  Download, FileJson, FileSpreadsheet, Trash2, FileText, Loader2,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Database } from "@/integrations/supabase/types";

const LEVEL_META: Record<LogEntry["level"], { label: string; color: string; icon: typeof AlertCircle }> = {
  exception: { label: "Exception", color: "bg-destructive/15 text-destructive", icon: AlertCircle },
  rejection: { label: "Rejection", color: "bg-orange-500/15 text-orange-600", icon: Bug },
  error: { label: "Error", color: "bg-red-500/15 text-red-600", icon: AlertCircle },
  warn: { label: "Warning", color: "bg-amber-500/15 text-amber-600", icon: AlertTriangle },
};

function pagePath(url: string) {
  try { return new URL(url).pathname || "/"; } catch { return url || "—"; }
}

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

function toCsv(rows: LogEntry[]): string {
  const header = ["id", "timestamp", "level", "message", "page", "url", "source", "stack", "userAgent"];
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push([
      r.id, r.timestamp, r.level, r.message, pagePath(r.url),
      r.url, r.source ?? "", r.stack ?? "", r.userAgent,
    ].map(escape).join(","));
  }
  return lines.join("\n");
}

export default function AdminLogs() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [pageFilter, setPageFilter] = useState<string>("all");
  const [selected, setSelected] = useState<LogEntry | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportDays, setReportDays] = useState("7");
  const [reportFormat, setReportFormat] = useState<"pdf" | "csv">("pdf");
  const [reportLoading, setReportLoading] = useState(false);
  const [reportTenant, setReportTenant] = useState<string>("all");
  const [properties, setProperties] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => subscribe(setLogs), []);

  useEffect(() => {
    if (!reportOpen) return;
    supabase
      .from("properties")
      .select("id, name")
      .order("name")
      .then(({ data }) => setProperties(data ?? []));
  }, [reportOpen]);

  if (!user) return <Navigate to="/auth" replace />;
  if (user.role !== "admin") return <Navigate to="/" replace />;

  const pages = useMemo(
    () => Array.from(new Set(logs.map((l) => pagePath(l.url)))).sort(),
    [logs],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...logs]
      .reverse()
      .filter((l) => {
        if (levelFilter !== "all" && l.level !== levelFilter) return false;
        if (pageFilter !== "all" && pagePath(l.url) !== pageFilter) return false;
        if (q && !`${l.message} ${l.source ?? ""} ${l.stack ?? ""}`.toLowerCase().includes(q)) return false;
        return true;
      });
  }, [logs, search, levelFilter, pageFilter]);

  const counts = useMemo(() => ({
    total: logs.length,
    errors: logs.filter((l) => l.level === "error" || l.level === "exception").length,
    warnings: logs.filter((l) => l.level === "warn").length,
    rejections: logs.filter((l) => l.level === "rejection").length,
  }), [logs]);

  const resetFilters = () => {
    setSearch(""); setLevelFilter("all"); setPageFilter("all");
  };

  const exportJson = () => {
    download(`logs-${Date.now()}.json`, JSON.stringify(filtered, null, 2), "application/json");
    toast.success(`${filtered.length} registros exportados (JSON)`);
  };
  const exportCsv = () => {
    download(`logs-${Date.now()}.csv`, toCsv(filtered), "text/csv");
    toast.success(`${filtered.length} registros exportados (CSV)`);
  };

  type ServerLog = {
    id: string; level: string; message: string; source: string | null;
    stack: string | null; page: string | null; url: string | null;
    user_id: string | null; session_id: string | null; client_timestamp: string | null;
    created_at: string; metadata: Record<string, unknown> | null;
  };

  const generateReport = async () => {
    const days = Math.max(1, Math.min(90, parseInt(reportDays, 10) || 7));
    setReportLoading(true);
    try {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      let query = supabase
        .from("frontend_logs")
        .select("id, level, message, source, stack, page, url, user_id, session_id, client_timestamp, created_at, metadata")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (reportTenant !== "all") {
        query = query.eq("metadata->>tenant", reportTenant);
      }
      const { data, error } = await query;
      if (error) throw error;
      const rows = (data ?? []) as ServerLog[];
      if (!rows.length) {
        toast.info("Nenhum log encontrado no período selecionado");
        return;
      }

      if (reportFormat === "csv") {
        const header = ["created_at","level","message","page","url","source","stack","user_id","session_id"];
        const esc = (v: unknown) => {
          const s = v == null ? "" : String(v);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        // Resumo estatístico
        const daily = rows.reduce<Record<string, number>>((acc, r) => {
          const d = format(new Date(r.created_at), "dd/MM");
          acc[d] = (acc[d] ?? 0) + 1;
          return acc;
        }, {});
        const topDays = Object.entries(daily)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 7);
        const routes = rows.reduce<Record<string, number>>((acc, r) => {
          const p = r.page ?? "—";
          acc[p] = (acc[p] ?? 0) + 1;
          return acc;
        }, {});
        const topRoutes = Object.entries(routes)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5);
        const summaryLines = [
          "# RESUMO ESTATISTICO",
          `# Total de registros: ${rows.length}`,
          `# Tendencia por dia: ${topDays.map(([d, c]) => `${d}=${c}`).join(" | ")}`,
          `# Top rotas: ${topRoutes.map(([r, c]) => `${r}=${c}`).join(" | ")}`,
          "# ---",
        ];
        const csv = summaryLines.join("\n") + "\n" + [header.join(",")]
          .concat(rows.map((r) => [
            r.created_at, r.level, r.message, r.page ?? "", r.url ?? "",
            r.source ?? "", r.stack ?? "", r.user_id ?? "", r.session_id ?? "",
          ].map(esc).join(",")))
          .join("\n");
        download(`support-logs-${days}d-${Date.now()}.csv`, csv, "text/csv");
      } else {
        const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
        doc.setFontSize(16);
        doc.text("Relatório de Logs do Frontend", 40, 40);
        doc.setFontSize(10);
        doc.setTextColor(100);
        const tenantLabel = reportTenant === "all"
          ? "Todos os projetos"
          : properties.find((p) => p.id === reportTenant)?.name ?? reportTenant;
        doc.text(
          `Período: últimos ${days} dia(s) · ${tenantLabel} · Gerado em ${format(new Date(), "dd/MM/yyyy HH:mm")} · ${rows.length} registro(s)`,
          40, 58,
        );

        const counts = rows.reduce<Record<string, number>>((acc, r) => {
          acc[r.level] = (acc[r.level] ?? 0) + 1; return acc;
        }, {});
        doc.setTextColor(0);
        doc.text(
          `Resumo: ${Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join("  ·  ")}`,
          40, 78,
        );

        // Tendência por dia
        const daily = rows.reduce<Record<string, number>>((acc, r) => {
          const d = format(new Date(r.created_at), "dd/MM");
          acc[d] = (acc[d] ?? 0) + 1;
          return acc;
        }, {});
        const topDays = Object.entries(daily)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 7);
        doc.setFontSize(9);
        doc.text("Tendência por dia (top 7):", 40, 96);
        doc.setFontSize(8);
        let y = 108;
        for (const [day, count] of topDays) {
          doc.text(`${day}: ${count} log(s)`, 40, y);
          y += 12;
        }

        // Top rotas
        const routes = rows.reduce<Record<string, number>>((acc, r) => {
          const p = r.page ?? "—";
          acc[p] = (acc[p] ?? 0) + 1;
          return acc;
        }, {});
        const topRoutes = Object.entries(routes)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5);
        doc.setFontSize(9);
        doc.text("Top rotas afetadas:", 280, 96);
        doc.setFontSize(8);
        y = 108;
        for (const [route, count] of topRoutes) {
          doc.text(`${route}: ${count} log(s)`, 280, y);
          y += 12;
        }

        autoTable(doc, {
          startY: Math.max(y + 10, 170),
          head: [["Data", "Nível", "Página", "Mensagem", "Origem", "URL", "Stack"]],
          body: rows.map((r) => [
            format(new Date(r.created_at), "dd/MM HH:mm:ss"),
            r.level,
            r.page ?? "—",
            (r.message ?? "").slice(0, 200),
            (r.source ?? "—").slice(0, 80),
            (r.url ?? "—").slice(0, 300),
            (r.stack ?? "—").slice(0, 600),
          ]),
          styles: { fontSize: 7, cellPadding: 3, overflow: "linebreak" },
          headStyles: { fillColor: [15, 23, 42] },
          columnStyles: {
            0: { cellWidth: 65 },
            1: { cellWidth: 45 },
            2: { cellWidth: 80 },
            3: { cellWidth: 180 },
            4: { cellWidth: 70 },
            5: { cellWidth: 120 },
            6: { cellWidth: 200 },
          },
          didDrawPage: () => {
            const pageCount = doc.getNumberOfPages();
            const pageNum = doc.getCurrentPageInfo().pageNumber;
            doc.setFontSize(8);
            doc.setTextColor(120);
            doc.text(
              `Página ${pageNum} de ${pageCount}`,
              doc.internal.pageSize.getWidth() - 80,
              doc.internal.pageSize.getHeight() - 20,
            );
          },
        });
        doc.save(`support-logs-${days}d-${Date.now()}.pdf`);
      }
      toast.success(`Relatório gerado (${rows.length} registros)`);
      setReportOpen(false);
    } catch (e) {
      console.error(e);
      toast.error("Falha ao gerar relatório");
    } finally {
      setReportLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Logs do Frontend</h1>
          <p className="text-muted-foreground">Visualize, filtre e exporte erros e warnings capturados.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="default" onClick={() => setReportOpen(true)}>
            <FileText className="h-4 w-4 mr-2" /> Relatório p/ suporte
          </Button>
          <Button variant="outline" onClick={exportCsv} disabled={!filtered.length}>
            <FileSpreadsheet className="h-4 w-4 mr-2" /> CSV
          </Button>
          <Button variant="outline" onClick={exportJson} disabled={!filtered.length}>
            <FileJson className="h-4 w-4 mr-2" /> JSON
          </Button>
          <Button variant="destructive" onClick={() => { clearLogs(); toast.success("Logs apagados"); }} disabled={!logs.length}>
            <Trash2 className="h-4 w-4 mr-2" /> Limpar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total", value: counts.total },
          { label: "Erros", value: counts.errors },
          { label: "Warnings", value: counts.warnings },
          { label: "Rejections", value: counts.rejections },
        ].map((c) => (
          <Card key={c.label}>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{c.label}</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">{c.value}</div></CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar mensagem, origem ou stack..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={levelFilter} onValueChange={setLevelFilter}>
            <SelectTrigger><SelectValue placeholder="Nível" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os níveis</SelectItem>
              <SelectItem value="exception">Exception</SelectItem>
              <SelectItem value="error">Error</SelectItem>
              <SelectItem value="warn">Warning</SelectItem>
              <SelectItem value="rejection">Rejection</SelectItem>
            </SelectContent>
          </Select>
          <Select value={pageFilter} onValueChange={setPageFilter}>
            <SelectTrigger><SelectValue placeholder="Página" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as páginas</SelectItem>
              {pages.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="md:col-span-4 flex justify-end">
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              <RotateCcw className="h-4 w-4 mr-2" /> Resetar filtros
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{filtered.length} registro(s)</CardTitle>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">Nenhum log encontrado.</div>
          ) : (
            <ScrollArea className="h-[520px] pr-2">
              <div className="space-y-2">
                {filtered.map((log) => {
                  const meta = LEVEL_META[log.level];
                  const Icon = meta.icon;
                  return (
                    <div key={log.id} className="flex items-start gap-3 p-3 border rounded-md hover:bg-muted/40 transition">
                      <Icon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <Badge className={meta.color} variant="secondary">{meta.label}</Badge>
                          <span className="text-xs text-muted-foreground">{format(new Date(log.timestamp), "dd/MM/yyyy HH:mm:ss")}</span>
                          <Badge variant="outline" className="text-xs">{pagePath(log.url)}</Badge>
                        </div>
                        <p className="text-sm font-medium truncate">{log.message}</p>
                        {log.source && <p className="text-xs text-muted-foreground truncate">{log.source}</p>}
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setSelected(log)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes do Log</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge className={LEVEL_META[selected.level].color} variant="secondary">{LEVEL_META[selected.level].label}</Badge>
                <Badge variant="outline">{pagePath(selected.url)}</Badge>
                <span className="text-xs text-muted-foreground">{format(new Date(selected.timestamp), "dd/MM/yyyy HH:mm:ss")}</span>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Mensagem</div>
                <div className="p-2 bg-muted rounded font-mono text-xs whitespace-pre-wrap break-words">{selected.message}</div>
              </div>
              {selected.source && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Origem</div>
                  <div className="p-2 bg-muted rounded font-mono text-xs break-all">{selected.source}</div>
                </div>
              )}
              {selected.stack && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Stack</div>
                  <ScrollArea className="h-48 rounded border">
                    <pre className="p-2 text-xs whitespace-pre-wrap break-words">{selected.stack}</pre>
                  </ScrollArea>
                </div>
              )}
              <div>
                <div className="text-xs text-muted-foreground mb-1">URL</div>
                <div className="p-2 bg-muted rounded text-xs break-all">{selected.url}</div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(selected, null, 2));
                  toast.success("Copiado");
                }}>
                  <Download className="h-4 w-4 mr-2" /> Copiar JSON
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Gerar relatório para o suporte</DialogTitle>
            <DialogDescription>
              Inclui todos os logs registrados no servidor no período selecionado (máx. 2.000).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Período</Label>
              <Select value={reportDays} onValueChange={setReportDays}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Último dia</SelectItem>
                  <SelectItem value="3">Últimos 3 dias</SelectItem>
                  <SelectItem value="7">Últimos 7 dias</SelectItem>
                  <SelectItem value="14">Últimos 14 dias</SelectItem>
                  <SelectItem value="30">Últimos 30 dias</SelectItem>
                  <SelectItem value="90">Últimos 90 dias</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Formato</Label>
              <Select value={reportFormat} onValueChange={(v) => setReportFormat(v as "pdf" | "csv")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pdf">PDF</SelectItem>
                  <SelectItem value="csv">CSV</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Projeto / Tenant</Label>
              <Select value={reportTenant} onValueChange={setReportTenant}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os projetos</SelectItem>
                  {properties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReportOpen(false)} disabled={reportLoading}>
              Cancelar
            </Button>
            <Button onClick={generateReport} disabled={reportLoading}>
              {reportLoading
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Gerando...</>
                : <><Download className="h-4 w-4 mr-2" /> Baixar</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}