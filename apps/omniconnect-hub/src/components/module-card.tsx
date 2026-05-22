import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ModuleMeta } from "@/lib/mock-data";

const STATUS_VARIANT: Record<ModuleMeta["status"], string> = {
  Ativo: "bg-success/15 text-success border-success/20",
  Beta: "bg-warning/20 text-warning-foreground border-warning/30",
  "Em breve": "bg-muted text-muted-foreground border-border",
};

export function ModuleCard({
  module,
  hasAccess,
}: {
  module: ModuleMeta;
  hasAccess: boolean;
}) {
  return (
    <Card className="group relative overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div
        className="absolute inset-x-0 top-0 h-1"
        style={{ backgroundColor: module.accent }}
      />
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="grid h-10 w-10 place-items-center rounded-md text-sm font-semibold text-white"
              style={{ backgroundColor: module.accent }}
            >
              {module.name.charAt(0)}
            </div>
            <div>
              <CardTitle className="text-base leading-tight">{module.name}</CardTitle>
              <Badge
                variant="outline"
                className={`mt-1.5 border ${STATUS_VARIANT[module.status]}`}
              >
                {module.status}
              </Badge>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground min-h-[40px]">
          {module.description}
        </p>
        <div className="flex items-center justify-between">
          {hasAccess ? (
            <span className="text-xs font-medium text-success">Você tem acesso</span>
          ) : (
            <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <Lock className="h-3 w-3" /> Sem acesso
            </span>
          )}
          {hasAccess ? (
            <Button asChild size="sm" variant="default">
              <Link to={module.path}>
                Abrir <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled>
              Solicitar acesso
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
