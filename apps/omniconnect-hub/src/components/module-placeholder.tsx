import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MODULES } from "@/lib/mock-data";
import { resolveModuleDestination } from "@/lib/module-gateway";
import { useAuth } from "@/lib/auth-context";
import type { ModuleId } from "@/lib/permissions";

export function ModulePlaceholder({ moduleId }: { moduleId: ModuleId }) {
  const { tenant, tenantSessionReady, switchingTenant } = useAuth();
  const meta = MODULES.find((m) => m.id === moduleId);
  if (!meta) return null;
  const destination = resolveModuleDestination(moduleId);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header className="flex items-start gap-4">
        <div
          className="grid h-12 w-12 place-items-center rounded-lg text-lg font-semibold text-white"
          style={{ backgroundColor: meta.accent }}
        >
          {meta.name.charAt(0)}
        </div>
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{meta.name}</h1>
            <Badge variant="secondary">{meta.status}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{meta.description}</p>
        </div>
      </header>

      <Card>
        <CardContent className="space-y-4 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Este módulo mantém sua própria interface dedicada. A partir do OmniconnectPRO, você
            acessa todos eles com o mesmo login, empresa ativa e perfil.
          </p>
          <p className="text-sm font-medium">Empresa ativa: {tenant.name}</p>
          <div className="flex flex-wrap justify-center gap-2">
            {destination && tenantSessionReady ? (
              <Button asChild>
                <a
                  href={destination}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Abrir ${meta.name} em nova aba`}
                >
                  Abrir módulo <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                </a>
              </Button>
            ) : destination ? (
              <Button disabled>
                {switchingTenant ? "Confirmando empresa..." : "Sessão da empresa indisponível"}
              </Button>
            ) : (
              <Button disabled title="Destino não configurado neste ambiente">
                Módulo indisponível
              </Button>
            )}
            <Button asChild variant="outline">
              <Link to="/modules">Ver todos os módulos</Link>
            </Button>
          </div>
          {!destination && (
            <p className="text-xs text-muted-foreground">
              O acesso a este módulo ainda não foi configurado neste ambiente.
            </p>
          )}
          {destination && !tenantSessionReady && !switchingTenant && (
            <p className="text-xs text-muted-foreground">
              Selecione uma empresa ativa e confirmada antes de abrir outro módulo.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
