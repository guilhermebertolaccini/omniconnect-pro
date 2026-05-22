import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/kpi-card";
import { useAuth } from "@/lib/auth-context";
import { MODULES } from "@/lib/mock-data";
import { hasModuleAccess, ROLE_LABELS, type Role } from "@/lib/permissions";
import { useTenantStats, formatStat } from "@/lib/useTenantStats";

export const Route = createFileRoute("/_app/")({
  head: () => ({
    meta: [{ title: "Início — OmniconnectPRO" }],
  }),
  component: HomePage,
});

function HomePage() {
  const { user, role, tenant } = useAuth();
  const firstName = user.name.split(" ")[0];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8">
      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {tenant.name} · {ROLE_LABELS[role]}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Olá, {firstName}.
        </h1>
        <p className="text-sm text-muted-foreground">
          Aqui está o resumo do seu dia na plataforma OmniconnectPRO.
        </p>
      </header>

      <RoleDashboard role={role} />

      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Acesso rápido</h2>
            <p className="text-sm text-muted-foreground">
              Módulos disponíveis para o seu perfil.
            </p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/modules">
              Ver todos <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.filter((m) => hasModuleAccess(role, m.id))
            .slice(0, 3)
            .map((m) => (
              <Card key={m.id} className="transition hover:shadow-md">
                <CardContent className="flex items-center gap-3 p-4">
                  <div
                    className="grid h-10 w-10 place-items-center rounded-md text-sm font-semibold text-white"
                    style={{ backgroundColor: m.accent }}
                  >
                    {m.name.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium leading-tight">{m.name}</p>
                    <p className="text-xs text-muted-foreground">{m.description}</p>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link to={m.path}>Abrir</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
        </div>
      </section>
    </div>
  );
}

function RoleDashboard({ role }: { role: Role }) {
  const { summary, pilot, loading, error } = useTenantStats(30);

  // Janela: 30 dias. Cada card abaixo usa apenas dados reais do tenant
  // (`/insight-ai/dashboard/summary` + `/dashboards/pilot-overview`).
  // Loading mostra "—"; error preserva o layout para não quebrar a UX.

  const titleByRole: Record<Role, string> = {
    admin: "Plataforma — últimos 30 dias",
    ceo_cfo: "Visão executiva — últimos 30 dias",
    analista_agencia: "Inteligência comercial — últimos 30 dias",
    gestor_comercial: "Funil comercial — últimos 30 dias",
    atendente: "Sua fila no OmniHub — últimos 30 dias",
    corretor: "Seu pipeline — últimos 30 dias",
  };

  const kpis = buildKpisForRole(role, summary, pilot);

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">{titleByRole[role]}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <KpiCard key={k.label} label={k.label} value={loading ? "…" : k.value} />
        ))}
      </div>
      {error && (
        <p className="text-xs text-muted-foreground">
          Não foi possível atualizar os números agora: {error}
        </p>
      )}
      {role === "ceo_cfo" || role === "admin" ? (
        <div className="flex justify-end">
          <Button asChild variant="outline" size="sm">
            <Link to="/executive">
              Abrir Painel Executivo <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
      ) : null}
    </section>
  );
}

interface Kpi {
  label: string;
  value: string;
}

function buildKpisForRole(
  role: Role,
  summary: ReturnType<typeof useTenantStats>["summary"],
  pilot: ReturnType<typeof useTenantStats>["pilot"],
): Kpi[] {
  // Helpers para extrair com fallback "—".
  const k = (label: string, value: number | null | undefined): Kpi => ({
    label,
    value: formatStat(value),
  });
  const dollar = (label: string, amount: number | null | undefined): Kpi => ({
    label,
    value: amount == null ? "—" : `$${amount.toFixed(2)}`,
  });

  switch (role) {
    case "ceo_cfo":
      return [
        k("Leads ingeridos", pilot?.leadsIngested),
        k("Conversas criadas", pilot?.conversationsCreated),
        k("Análises geradas", pilot?.insightAnalyses),
        k("Oportunidades recuperáveis", pilot?.recoverableOpportunities),
      ];
    case "analista_agencia":
      return [
        k("Leads ingeridos", pilot?.leadsIngested),
        k("Análises geradas", pilot?.insightAnalyses),
        k("Sinais de perda/abandono", pilot?.lossOrAbandonmentSignals),
        dollar("Custo IA no período", pilot?.aiCost.amount),
      ];
    case "gestor_comercial":
      return [
        k("Conversas no período", pilot?.conversationsCreated),
        k("Análises geradas", pilot?.insightAnalyses),
        k("Recuperáveis", pilot?.recoverableOpportunities),
        k("Qualidade média (atendente)", summary?.averageSellerQualityScore),
      ];
    case "atendente":
      return [
        k("Conversas no período", pilot?.conversationsCreated),
        k("Handoffs recebidos", pilot?.botifyHandoffs),
        k("Análises do meu tenant", summary?.analyzedConversations),
        k("Abandono detectado", summary?.leadAbandonments),
      ];
    case "corretor":
      return [
        k("Análises do meu tenant", summary?.analyzedConversations),
        k("Recuperáveis", pilot?.recoverableOpportunities),
        k("Oportunidades perdidas", summary?.lostOpportunities),
        k("Tentativas de visita/proposta",
          (summary?.schedulingAttempts ?? 0) + (summary?.proposalOrSimulationAttempts ?? 0)),
      ];
    case "admin":
    default:
      return [
        k("Leads ingeridos", pilot?.leadsIngested),
        k("Conversas", pilot?.conversationsCreated),
        k("Análises geradas", pilot?.insightAnalyses),
        k("Recuperáveis", pilot?.recoverableOpportunities),
      ];
  }
}
