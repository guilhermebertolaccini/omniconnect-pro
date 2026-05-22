import { createFileRoute } from "@tanstack/react-router";
import { ModuleCard } from "@/components/module-card";
import { MODULES } from "@/lib/mock-data";
import { hasModuleAccess } from "@/lib/permissions";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_app/modules")({
  head: () => ({ meta: [{ title: "Módulos — OmniconnectPRO" }] }),
  component: ModulesPage,
});

function ModulesPage() {
  const { role } = useAuth();
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Módulos da plataforma</h1>
        <p className="text-sm text-muted-foreground">
          Todos os módulos do OmniconnectPRO. Acesso liberado conforme seu perfil.
        </p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MODULES.map((m) => (
          <ModuleCard key={m.id} module={m} hasAccess={hasModuleAccess(role, m.id)} />
        ))}
      </div>
    </div>
  );
}
