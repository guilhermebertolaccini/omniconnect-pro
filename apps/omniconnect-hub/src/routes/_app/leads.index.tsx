import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ModuleGate } from "@/components/module-gate";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  ArrowRight,
  Loader2,
  MessageCircle,
  Phone,
  RefreshCw,
  Search,
  Sparkles,
  Users,
} from "lucide-react";
import {
  listLeads360,
  type Lead360Summary,
  type Lead360Temperature,
  type Leads360Page,
} from "@/lib/omniconnectClient";

export const Route = createFileRoute("/_app/leads/")({
  head: () => ({ meta: [{ title: "Leads 360° — OmniconnectPRO" }] }),
  component: () => (
    <ModuleGate moduleId="leads">
      <LeadsPage />
    </ModuleGate>
  ),
});

const TEMPERATURE_BADGE: Record<Lead360Temperature, string> = {
  hot: "bg-rose-100 text-rose-700 border-rose-200",
  warm: "bg-amber-100 text-amber-700 border-amber-200",
  cold: "bg-sky-100 text-sky-700 border-sky-200",
  unknown: "bg-muted text-muted-foreground border-border",
};

const TEMPERATURE_LABEL: Record<Lead360Temperature, string> = {
  hot: "Quente",
  warm: "Morno",
  cold: "Frio",
  unknown: "—",
};

function LeadsPage() {
  const [search, setSearch] = useState("");
  const [temperature, setTemperature] = useState<Lead360Temperature | "all">("all");
  const [crm, setCrm] = useState<"all" | "matched" | "unmatched">("all");
  const [page, setPage] = useState<Leads360Page | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [debouncedSearch, setDebouncedSearch] = useState(search);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(id);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listLeads360({
      search: debouncedSearch.trim() || undefined,
      temperature: temperature === "all" ? undefined : temperature,
      crm: crm === "all" ? undefined : crm,
      limit: 25,
    })
      .then((p) => !cancelled && setPage(p))
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, temperature, crm, tick]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Users className="h-5 w-5 text-primary" /> Leads 360°
          </h1>
          <p className="text-sm text-muted-foreground">
            Lista cross-channel: Contact + última análise IA + CrmLead +
            contadores de conversa/handoff. Tenant atual.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setTick((t) => t + 1)}
          disabled={loading}
        >
          <RefreshCw className={`mr-1 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </header>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="flex-1 min-w-[200px] space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Buscar
            </label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nome ou telefone"
                className="pl-7"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Temperatura
            </label>
            <Select
              value={temperature}
              onValueChange={(v) => setTemperature(v as Lead360Temperature | "all")}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="hot">Quente</SelectItem>
                <SelectItem value="warm">Morno</SelectItem>
                <SelectItem value="cold">Frio</SelectItem>
                <SelectItem value="unknown">Sem análise</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">CRM</label>
            <Select
              value={crm}
              onValueChange={(v) => setCrm(v as "all" | "matched" | "unmatched")}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="matched">Com CrmLead</SelectItem>
                <SelectItem value="unmatched">Sem CrmLead</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card>
          <CardContent className="flex items-start gap-3 p-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
            <div className="text-sm">
              <p className="font-medium">Falha ao carregar leads</p>
              <p className="text-xs text-muted-foreground">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {loading && !page ? (
        <Card>
          <CardContent className="flex items-center justify-center p-10 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando…
          </CardContent>
        </Card>
      ) : page && page.items.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Nenhum contato encontrado com esses filtros.
          </CardContent>
        </Card>
      ) : page ? (
        <>
          <div className="grid gap-2">
            {page.items.map((lead) => (
              <LeadRow key={lead.contactId} lead={lead} />
            ))}
          </div>
          <p className="text-center text-xs text-muted-foreground">
            Mostrando {page.items.length} de {page.meta.total} leads no tenant.
          </p>
        </>
      ) : null}
    </div>
  );
}

function LeadRow({ lead }: { lead: Lead360Summary }) {
  return (
    <Card className="transition hover:shadow-sm">
      <CardContent className="flex items-center gap-4 p-4">
        <div className="flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{lead.name}</span>
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${TEMPERATURE_BADGE[lead.temperature]}`}
            >
              {TEMPERATURE_LABEL[lead.temperature]}
              {lead.qualificationScore !== null && (
                <> · {lead.qualificationScore}/100</>
              )}
            </span>
            {lead.lostOpportunity && (
              <Badge variant="destructive" className="text-[10px]">
                perdido
              </Badge>
            )}
            {lead.stage && <Badge variant="secondary">{lead.stage}</Badge>}
            {!lead.crmLeadId && (
              <Badge variant="outline" className="text-[10px]">
                sem CrmLead
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Phone className="h-3 w-3" /> {lead.phone}
            </span>
            {lead.email && <span>{lead.email}</span>}
            {lead.brokerName && <span>corretor: {lead.brokerName}</span>}
            {lead.source && <span>origem: {lead.source}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <MessageCircle className="h-3 w-3" />
              {lead.conversationCount} conversas
            </span>
            <span className="inline-flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              {lead.analysisCount} análises
              {lead.modelProvider && lead.analysisCount > 0 && (
                <> ({lead.modelProvider})</>
              )}
            </span>
            {lead.handoffCount > 0 && <span>{lead.handoffCount} handoffs Botify</span>}
            {lead.lastTouchAt && (
              <span>
                último toque: {new Date(lead.lastTouchAt).toLocaleDateString("pt-BR")}
              </span>
            )}
          </div>
          {lead.nextBestAction && (
            <p className="text-xs text-muted-foreground">
              <b>Próxima ação:</b> {lead.nextBestAction}
            </p>
          )}
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/leads/$leadId" params={{ leadId: String(lead.contactId) }}>
            Abrir <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
