import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Settings, Cable, ShieldAlert, Wallet, ClipboardList, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({ meta: [{ title: "Configurações — OmniconnectPRO" }] }),
  component: SettingsLayout,
});

const TABS = [
  { to: "/settings/brokers", label: "Brokers", icon: Cable },
  { to: "/settings/anti-fatigue", label: "Anti-fadiga", icon: ShieldAlert },
  { to: "/settings/budget", label: "Saldo & Budget", icon: Wallet },
  { to: "/settings/line-health", label: "Saúde da linha", icon: Activity },
  { to: "/settings/audit", label: "Auditoria", icon: ClipboardList },
];

function SettingsLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <header className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
          <Settings className="h-4.5 w-4.5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
          <p className="text-sm text-muted-foreground">Gerencie integrações, brokers e regras globais.</p>
        </div>
      </header>
      <nav className="flex gap-1 border-b">
        {TABS.map((t) => {
          const active = path.startsWith(t.to);
          return (
            <Link
              key={t.to}
              to={t.to}
              className={cn(
                "flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition",
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <t.icon className="h-3.5 w-3.5" /> {t.label}
            </Link>
          );
        })}
      </nav>
      <Outlet />
    </div>
  );
}
