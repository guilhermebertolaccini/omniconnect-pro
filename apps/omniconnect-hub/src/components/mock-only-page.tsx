import { Link } from "@tanstack/react-router";
import { Construction, ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ReactNode } from "react";

const USE_MOCK_DATA = import.meta.env.VITE_USE_MOCK_DATA === "true";

/**
 * Wrapper para páginas que ainda não têm contraparte no `omniconnect-backend`.
 *
 * - `VITE_USE_MOCK_DATA=true` → renderiza o conteúdo mock (preview Lovable).
 * - `VITE_USE_MOCK_DATA=false` → empty-state "em construção" + nota de
 *   roadmap. Nada do estado mock é exibido.
 *
 * Pattern consciente do Sprint Hub: pages com backend real (`/executive`,
 * `/insightai`) mostram dados reais + mocks complementares **gated** dentro
 * de uma seção. Pages 100% mock (Leads 360°, Journeys, Settings.*) usam
 * este wrapper.
 */
export function MockOnlyPage({
  title,
  description,
  roadmapNote,
  children,
}: {
  /** Nome da feature (ex.: "Leads 360°"). */
  title: string;
  /** O que essa feature vai fazer. */
  description: string;
  /** Pointer para a PR/ADR/sprint que vai entregar o real. */
  roadmapNote?: ReactNode;
  /** Conteúdo mock — renderizado apenas quando `VITE_USE_MOCK_DATA=true`. */
  children: ReactNode;
}) {
  if (USE_MOCK_DATA) return <>{children}</>;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <Badge variant="secondary" className="font-normal">
            em construção
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
      </header>

      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
            <Construction className="h-5 w-5" />
          </div>
          <div className="max-w-md space-y-1">
            <h2 className="text-base font-semibold">
              Sem backend disponível ainda
            </h2>
            <p className="text-sm text-muted-foreground">
              Esta superfície existe no Hub mas ainda não há endpoint
              correspondente no <code>omniconnect-backend</code>. Será
              ligada numa próxima sprint — veja{" "}
              <code>docs/migration/06-next-actions.md</code>.
            </p>
            {roadmapNote && (
              <p className="pt-2 text-xs text-muted-foreground">{roadmapNote}</p>
            )}
          </div>
          <div className="flex gap-2 pt-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/">
                <ArrowLeft className="mr-1 h-3.5 w-3.5" />
                Voltar à home
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/modules">Ver módulos</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <p className="text-center text-[11px] text-muted-foreground">
        Preview mock disponível em desenvolvimento via{" "}
        <code>VITE_USE_MOCK_DATA=true</code>.
      </p>
    </div>
  );
}
