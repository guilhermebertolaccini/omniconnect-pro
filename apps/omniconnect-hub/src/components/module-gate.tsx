import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/auth-context";
import { hasModuleAccess, type ModuleId } from "@/lib/permissions";
import type { ReactNode } from "react";

export function ModuleGate({
  moduleId,
  children,
}: {
  moduleId: ModuleId;
  children: ReactNode;
}) {
  const { role } = useAuth();
  if (hasModuleAccess(role, moduleId)) return <>{children}</>;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center justify-center py-20">
      <Card className="w-full">
        <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
            <Lock className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Acesso restrito</h2>
            <p className="text-sm text-muted-foreground">
              Seu perfil atual não tem permissão para acessar este módulo.
              Solicite acesso ao administrador da sua empresa.
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/">Voltar à home</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/modules">Ver módulos</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
