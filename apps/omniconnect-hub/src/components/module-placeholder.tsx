import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MODULES } from "@/lib/mock-data";
import type { ModuleId } from "@/lib/permissions";

export function ModulePlaceholder({ moduleId }: { moduleId: ModuleId }) {
  const meta = MODULES.find((m) => m.id === moduleId);
  if (!meta) return null;

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
            Este módulo mantém sua própria interface dedicada. A partir do
            OmniconnectPRO, você acessa todos eles com o mesmo login, empresa
            ativa e perfil.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button>
              Abrir módulo <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
            </Button>
            <Button asChild variant="outline">
              <Link to="/modules">Ver todos os módulos</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
