import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  subscribe, clearLogs, updateLog, deleteLog,
  type LogEntry, type LogStatus,
} from "@/lib/errorLogger";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertCircle, AlertTriangle, Bug, Trash2, Search, RotateCcw, Eye, Repeat, CheckCircle2,
} from "lucide-react";
import { format } from "date-fns";

const LEVEL_META: Record<LogEntry["level"], { label: string; color: string; icon: typeof AlertCircle }> = {
  exception: { label: "Exception", color: "bg-destructive/15 text-destructive", icon: AlertCircle },
  rejection: { label: "Rejection", color: "bg-orange-500/15 text-orange-600", icon: Bug },
  error: { label: "Error", color: "bg-red-500/15 text-red-600", icon: AlertCircle },
  warn: { label: "Warning", color: "bg-amber-500/15 text-amber-600", icon: AlertTriangle },
};

const STATUS_META: Record<LogStatus, { label: string; color: string }> = {
  open: { label: "Aberto", color: "bg-blue-500/15 text-blue-600" },
  recurring: { label: "Recorrente", color: "bg-purple-500/15 text-purple-600" },
  resolved: { label: "Resolvido", color: "bg-green-500/15 text-green-600" },
};

function pagePath(url: string) {
  try { return new URL(url).pathname; } catch { return url; }
}

export default function ErrorBacklog() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [pageFilter, setPageFilter] = useState<string>("all");
  const [active, setActive] = useState<LogEntry | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

  useEffect(() => subscribe(setLogs), []);

  const pages = useMemo(() => {
    const set = new Set(logs.map((l) => pagePath(l.url)));
    return Array.from(set).sort();
  }, [logs]);

  // Group identical messages to surface recurring ones
  const grouped = useMemo(() => {
    const map = new Map<string, { sample: LogEntry; count: number; lastSeen: string; pages: Set<string> }>();
    for (const l of logs) {
      const key = `${l.level}::${l.message}`;
      const cur = map.get(key);
      if (cur) {
        cur.count += 1;
        cur.pages.add(pagePath(l.url));
        if (l.timestamp > cur.lastSeen) {
          cur.lastSeen = l.timestamp;
          cur.sample = l;
        }
      } else {
        map.set(key, { sample: l, count: 1, lastSeen: l.timestamp, pages: new Set([pagePath(l.url)]) });
      }
    }
    return Array.from(map.values()).sort((a, b) => (a.lastSeen < b.lastSeen ? 1 : -1));
  }, [logs]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return grouped.filter((g) => {
      if (levelFilter !== "all" && g.sample.level !== levelFilter) return false;
      if (statusFilter !== "all" && (g.sample.status ?? "open") !== statusFilter) return false;
      if (pageFilter !== "all" && !g.pages.has(pageFilter)) return false;
      if (q && !g.sample.message.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [grouped, search, levelFilter, statusFilter, pageFilter]);

  const counts = useMemo(() => ({
    total: logs.length,
    unique: grouped.length,
    recurring: grouped.filter((g) => g.count > 1).length,
    open: logs.filter((l) => (l.status ?? "open") === "open").length,
  }), [logs, grouped]);

  if (!user) return <Navigate to="/auth" replace />;
  if (user.role !== "admin") {
    return (
      <div className="p-8 text-center">
        <h1 className="text-xl font-display font-bold">Acesso restrito</h1>
        <p className="text-sm text-muted-foreground">Apenas administradores.</p>
      </div>
    );
  }

  const openDetails = (entry: LogEntry) => {
    setActive(entry);
    setNoteDraft(entry.notes ?? "");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Backlog de Erros</h1>
          <p className="text-sm text-muted-foreground">Capturados automaticamente no frontend</p>
        </div>
        <Button variant="outline" size="sm" onClick={clearLogs} className="gap-1.5">
          <Trash2 className="h-4 w-4" /> Limpar tudo
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">Total capturado</p>
          <p className="text-2xl font-display font-bold">{counts.total}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">Erros únicos</p>
          <p className="text-2xl font-display font-bold">{counts.unique}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">Recorrentes (&gt;1)</p>
          <p className="text-2xl font-display font-bold text-purple-600">{counts.recurring}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">Abertos</p>
          <p className="text-2xl font-display font-bold text-blue-600">{counts.open}</p>
        </CardContent></Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px] space-y-1">
            <Label className="text-xs">Buscar</Label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Mensagem do erro..."
                className="pl-8 h-9"
              />
            </div>
          </div>
          <div className="space-y-1 min-w-[140px]">
            <Label className="text-xs">Nível</Label>
            <Select value={levelFilter} onValueChange={setLevelFilter}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="exception">Exception</SelectItem>
                <SelectItem value="rejection">Rejection</SelectItem>
                <SelectItem value="error">Error</SelectItem>
                <SelectItem value="warn">Warning</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 min-w-[140px]">
            <Label className="text-xs">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="open">Aberto</SelectItem>
                <SelectItem value="recurring">Recorrente</SelectItem>
                <SelectItem value="resolved">Resolvido</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 min-w-[180px]">
            <Label className="text-xs">Página afetada</Label>
            <Select value={pageFilter} onValueChange={setPageFilter}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {pages.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setSearch(""); setLevelFilter("all"); setStatusFilter("all"); setPageFilter("all"); }}
            className="gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Resetar
          </Button>
        </CardContent>
      </Card>

      {/* List */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-display">
            {filtered.length} {filtered.length === 1 ? "erro" : "erros"}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              Nenhum erro capturado ainda. Boa! 🎉
            </p>
          ) : (
            <div className="divide-y">
              {filtered.map((g) => {
                const meta = LEVEL_META[g.sample.level];
                const status = g.sample.status ?? "open";
                const sMeta = STATUS_META[status];
                const Icon = meta.icon;
                return (
                  <div key={g.sample.id} className="p-3 hover:bg-accent/30 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-md ${meta.color} shrink-0`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-[10px]">{meta.label}</Badge>
                          <Badge className={`${sMeta.color} text-[10px] border-0`}>{sMeta.label}</Badge>
                          {g.count > 1 && (
                            <Badge className="bg-purple-500/15 text-purple-600 text-[10px] border-0 gap-1">
                              <Repeat className="h-3 w-3" /> {g.count}×
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm font-medium text-foreground break-words">{g.sample.message}</p>
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                          <span>{format(new Date(g.lastSeen), "dd/MM/yyyy HH:mm:ss")}</span>
                          <span>•</span>
                          <span>{Array.from(g.pages).join(", ")}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Select
                          value={status}
                          onValueChange={(v) => updateLog(g.sample.id, { status: v as LogStatus })}
                        >
                          <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="open">Aberto</SelectItem>
                            <SelectItem value="recurring">Recorrente</SelectItem>
                            <SelectItem value="resolved">Resolvido</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openDetails(g.sample)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteLog(g.sample.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail dialog */}
      <Dialog open={!!active} onOpenChange={(o) => { if (!o) setActive(null); }}>
        {active && (
          <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display flex items-center gap-2">
                <Bug className="h-5 w-5" /> {LEVEL_META[active.level].label}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div>
                <Label className="text-xs text-muted-foreground">Mensagem</Label>
                <p className="font-medium break-words">{active.message}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Quando</Label>
                  <p>{format(new Date(active.timestamp), "dd/MM/yyyy HH:mm:ss")}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Página</Label>
                  <p className="break-all">{pagePath(active.url)}</p>
                </div>
              </div>
              {active.source && (
                <div>
                  <Label className="text-xs text-muted-foreground">Origem</Label>
                  <p className="font-mono text-xs break-all">{active.source}</p>
                </div>
              )}
              {active.stack && (
                <div>
                  <Label className="text-xs text-muted-foreground">Stack trace</Label>
                  <ScrollArea className="h-48 rounded border bg-muted/30 p-2">
                    <pre className="text-[11px] font-mono whitespace-pre-wrap">{active.stack}</pre>
                  </ScrollArea>
                </div>
              )}
              <div>
                <Label className="text-xs text-muted-foreground">Notas</Label>
                <Textarea
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  placeholder="Adicionar contexto, hipótese, próxima ação..."
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => updateLog(active.id, { status: "recurring" })} className="gap-1.5">
                  <Repeat className="h-3.5 w-3.5" /> Marcar como recorrente
                </Button>
                <Button variant="outline" size="sm" onClick={() => updateLog(active.id, { status: "resolved" })} className="gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Resolvido
                </Button>
                <Button size="sm" onClick={() => { updateLog(active.id, { notes: noteDraft }); setActive(null); }}>
                  Salvar
                </Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}