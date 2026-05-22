import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { ModuleGate } from "@/components/module-gate";
import { MockOnlyPage } from "@/components/mock-only-page";
import { JourneyCanvas } from "@/components/journey-canvas";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, ShieldAlert, Workflow, Zap } from "lucide-react";
import { JOURNEYS, JOURNEY_SAMPLE_NODES, WALLET_BUDGET_DEFAULT } from "@/lib/leads-data";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/journeys/builder")({
  validateSearch: z.object({ id: z.string().optional() }),
  head: () => ({ meta: [{ title: "Editor de Jornada — OmniconnectPRO" }] }),
  component: () => (
    <ModuleGate moduleId="journeys">
      <MockOnlyPage
        title="Editor de Jornada"
        description="Canvas drag-and-drop com guarda de orçamento — preview mock."
        roadmapNote={<>Persistência do grafo + execução real exigem novo módulo backend (Régua).</>}
      >
        <BuilderPage />
      </MockOnlyPage>
    </ModuleGate>
  ),
});

const BRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function BuilderPage() {
  const { id } = Route.useSearch();
  const journey = JOURNEYS.find((j) => j.id === id);
  const isNew = !journey;
  const name = journey?.name ?? "Nova jornada";
  const status = isNew ? "Rascunho" : journey.status;

  const wallet = WALLET_BUDGET_DEFAULT;
  const remaining = wallet.totalBudget - wallet.usedBudget;

  // Estimativa de custo: audiência × custo médio (proxy WhatsApp).
  // Para rascunho sem audiência ainda, assume baseline de 500 leads para sinalização.
  const audience = journey?.audience ?? 500;
  const avgChannelCost = wallet.costPerChannel.whatsapp;
  const estimatedCost = useMemo(
    () => audience * avgChannelCost,
    [audience, avgChannelCost],
  );
  const insufficient = estimatedCost > remaining;
  const guardBlocks = wallet.blockOnInsufficient && insufficient;

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [blockedOpen, setBlockedOpen] = useState(false);

  const handleActivate = () => {
    if (guardBlocks) {
      setBlockedOpen(true);
      return;
    }
    setConfirmOpen(true);
  };

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon" className="h-8 w-8">
            <Link to="/journeys">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
            <Workflow className="h-4.5 w-4.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold leading-tight">{name}</h1>
              <Badge variant={status === "Ativa" ? "default" : "secondary"}>{status}</Badge>
              {wallet.blockOnInsufficient && (
                <Badge variant="outline" className="gap-1 text-[10px]">
                  <ShieldAlert className="h-3 w-3" /> Guard de saldo ativo
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {journey?.trigger ?? "Defina o gatilho que inicia a jornada"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden text-right text-[11px] leading-tight text-muted-foreground sm:block">
            <div>
              Estimativa: <span className="font-medium text-foreground">{BRL(estimatedCost)}</span>
            </div>
            <div>
              Saldo: <span className={cn("font-medium", insufficient ? "text-destructive" : "text-foreground")}>{BRL(remaining)}</span>
            </div>
          </div>
          <Button
            onClick={handleActivate}
            variant={guardBlocks ? "outline" : "default"}
            className="gap-1.5"
          >
            <Zap className="h-4 w-4" />
            {status === "Ativa" ? "Reativar" : "Ativar jornada"}
          </Button>
        </div>
      </div>

      {guardBlocks && (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Ativação bloqueada — saldo insuficiente</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>
              Esta jornada precisa de aproximadamente{" "}
              <strong>{BRL(estimatedCost)}</strong> (audiência de{" "}
              {audience.toLocaleString("pt-BR")} leads × {BRL(avgChannelCost)}/envio), mas
              a carteira tem apenas <strong>{BRL(remaining)}</strong> disponíveis.
            </p>
            <p className="text-xs">
              A regra <em>"Bloquear aprovação se saldo insuficiente"</em> está habilitada em{" "}
              <Link to="/settings/budget" className="underline">Saldo & Budget</Link>.
              Recarregue a carteira, reduza a audiência ou ajuste o canal para um custo menor.
            </p>
            <div className="flex gap-2 pt-1">
              <Button asChild size="sm" variant="destructive">
                <Link to="/settings/budget">Recarregar carteira</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/settings/budget">Revisar custos por canal</Link>
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {!guardBlocks && insufficient && (
        <Alert>
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Atenção: saldo abaixo da estimativa</AlertTitle>
          <AlertDescription>
            Estimativa <strong>{BRL(estimatedCost)}</strong> excede o saldo de{" "}
            <strong>{BRL(remaining)}</strong>. A jornada pode pausar no meio do disparo.
            Habilite <em>"Bloquear aprovação se saldo insuficiente"</em> em{" "}
            <Link to="/settings/budget" className="underline">Saldo & Budget</Link> para prevenir.
          </AlertDescription>
        </Alert>
      )}

      <JourneyCanvas
        journeyId={id ?? "draft"}
        initialNodes={isNew ? [] : JOURNEY_SAMPLE_NODES}
        onSave={() => toast.success("Jornada salva (mock).")}
      />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ativar jornada?</AlertDialogTitle>
            <AlertDialogDescription>
              Custo estimado: <strong>{BRL(estimatedCost)}</strong> · Saldo após reserva:{" "}
              <strong>{BRL(remaining - estimatedCost)}</strong>. O débito é{" "}
              {wallet.realtimeDebit ? "feito em tempo real a cada lote de envios" : "consolidado ao fim do ciclo"}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                toast.success("Jornada ativada (mock). Reserva de saldo aplicada.");
                setConfirmOpen(false);
              }}
            >
              Confirmar ativação
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={blockedOpen} onOpenChange={setBlockedOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="h-5 w-5" /> Não foi possível ativar
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                Saldo insuficiente: precisa de <strong>{BRL(estimatedCost)}</strong>,
                disponível <strong>{BRL(remaining)}</strong>.
              </span>
              <span className="block text-xs text-muted-foreground">
                Guard <em>"Bloquear aprovação se saldo insuficiente"</em> está habilitado.
                Desabilite em Saldo & Budget para forçar a ativação por sua conta e risco.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Fechar</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Link to="/settings/budget">Ir para Saldo & Budget</Link>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
