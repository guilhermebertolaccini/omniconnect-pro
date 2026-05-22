import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ModuleGate } from "@/components/module-gate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  ClipboardList,
  Loader2,
  MessageCircle,
  Phone,
  Sparkles,
} from "lucide-react";
import {
  getLead360,
  OmniconnectError,
  type Lead360Detail,
  type Lead360TimelineItem,
} from "@/lib/omniconnectClient";

export const Route = createFileRoute("/_app/leads/$leadId")({
  head: ({ params }) => ({
    meta: [{ title: `Lead ${params.leadId} — OmniconnectPRO` }],
  }),
  component: () => (
    <ModuleGate moduleId="leads">
      <LeadDetail />
    </ModuleGate>
  ),
});

const TIMELINE_ICON: Record<Lead360TimelineItem["kind"], typeof MessageCircle> = {
  conversation: MessageCircle,
  analysis: Sparkles,
  handoff: Bot,
  crm_interaction: ClipboardList,
};

const TIMELINE_COLOR: Record<Lead360TimelineItem["kind"], string> = {
  conversation: "bg-emerald-100 text-emerald-700",
  analysis: "bg-violet-100 text-violet-700",
  handoff: "bg-amber-100 text-amber-700",
  crm_interaction: "bg-sky-100 text-sky-700",
};

function LeadDetail() {
  const { leadId } = Route.useParams();
  const navigate = useNavigate();
  const contactId = Number(leadId);
  const [lead, setLead] = useState<Lead360Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!Number.isFinite(contactId)) {
      setError("ID de contato inválido");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNotFound(false);
    getLead360(contactId)
      .then((d) => !cancelled && setLead(d))
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof OmniconnectError && e.status === 404) {
          setNotFound(true);
        } else if (e instanceof Error) {
          setError(e.message);
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [contactId]);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-5xl py-10">
        <Card>
          <CardContent className="flex items-center justify-center p-10 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando lead…
          </CardContent>
        </Card>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="mx-auto w-full max-w-3xl py-10 space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/leads" })}>
          <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Voltar
        </Button>
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Lead não encontrado neste tenant.
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !lead) {
    return (
      <div className="mx-auto w-full max-w-3xl py-10">
        <Card>
          <CardContent className="flex items-start gap-3 p-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
            <div className="text-sm">
              <p className="font-medium">Falha ao carregar</p>
              <p className="text-xs text-muted-foreground">{error}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/leads">
            <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Todos os leads
          </Link>
        </Button>
        <span className="text-xs text-muted-foreground">
          Contact ID #{lead.contactId} · criado em{" "}
          {new Date(lead.contactCreatedAt).toLocaleDateString("pt-BR")}
        </span>
      </div>

      {/* Cabeçalho */}
      <Card>
        <CardContent className="p-5 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{lead.name}</h1>
            <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
              <Phone className="h-3.5 w-3.5" /> {lead.phone}
            </span>
            {lead.email && <Badge variant="secondary">{lead.email}</Badge>}
            {lead.stage && <Badge>{lead.stage}</Badge>}
            {lead.lostOpportunity && <Badge variant="destructive">perdido</Badge>}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {lead.source && <span>origem: {lead.source}</span>}
            {lead.brokerName && <span>corretor: {lead.brokerName}</span>}
            {lead.cpf && <span>CPF: {lead.cpf}</span>}
            {lead.isCPC && <Badge variant="outline">CPC</Badge>}
          </div>
          {lead.nextBestAction && (
            <p className="rounded-md bg-muted/40 p-3 text-sm">
              <b>Próxima ação:</b> {lead.nextBestAction}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Análise mais recente */}
      {lead.latestAnalysis && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" /> Análise IA mais recente
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="secondary">intent: {lead.latestAnalysis.leadIntent}</Badge>
              <Badge variant="secondary">risk: {lead.latestAnalysis.risk}</Badge>
              <Badge variant="secondary">
                opportunity: {lead.latestAnalysis.opportunityStatus}
              </Badge>
              <span className="text-muted-foreground">
                {lead.latestAnalysis.modelProvider} · {lead.latestAnalysis.modelName}
              </span>
            </div>
            <p className="text-sm">{lead.latestAnalysis.summary}</p>
            <div className="grid gap-3 sm:grid-cols-3 text-xs">
              <Metric label="Qualificação" value={`${lead.latestAnalysis.qualificationScore}/100`} />
              <Metric label="Qualidade atendente" value={`${lead.latestAnalysis.sellerQualityScore}/100`} />
              <Metric label="Objeção principal" value={lead.latestAnalysis.mainObjection ?? "—"} />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Gerada em {new Date(lead.latestAnalysis.createdAt).toLocaleString("pt-BR")}
            </p>
          </CardContent>
        </Card>
      )}

      {/* CRM Lead */}
      {lead.crmLead && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">CRM Lead vinculado</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid gap-3 sm:grid-cols-3 text-xs">
              <Metric label="ID CRM" value={lead.crmLead.id.slice(0, 12) + "…"} />
              <Metric
                label="Valor estimado"
                value={
                  lead.crmLead.estimatedValue
                    ? `R$ ${Number(lead.crmLead.estimatedValue).toLocaleString("pt-BR")}`
                    : "—"
                }
              />
              <Metric label="Interesse" value={lead.crmLead.propertyInterest ?? "—"} />
            </div>
            {lead.crmLead.notes && (
              <p className="text-xs text-muted-foreground">{lead.crmLead.notes}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Timeline */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Timeline</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {lead.timeline.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              Sem eventos no histórico ainda.
            </p>
          ) : (
            <ul className="divide-y">
              {lead.timeline.map((item, idx) => (
                <TimelineRow key={`${item.kind}-${idx}`} item={item} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TimelineRow({ item }: { item: Lead360TimelineItem }) {
  const Icon = TIMELINE_ICON[item.kind];
  return (
    <li className="flex items-start gap-3 p-3">
      <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${TIMELINE_COLOR[item.kind]}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 space-y-0.5">
        <p className="text-sm font-medium">{item.title}</p>
        {item.detail && (
          <p className="text-xs text-muted-foreground">{item.detail}</p>
        )}
      </div>
      <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
        {new Date(item.at).toLocaleString("pt-BR", {
          dateStyle: "short",
          timeStyle: "short",
        })}
      </span>
    </li>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}
