import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Loader2,
  RefreshCw,
  Wallet,
} from "lucide-react";
import {
  creditMyWallet,
  getMyWallet,
  listMyWalletTransactions,
  OmniconnectError,
  updateMyWallet,
  upsertWalletChannelCost,
  type TenantWallet,
  type WalletGuardMode,
  type WalletResetCycle,
  type WalletTransaction,
} from "@/lib/omniconnectClient";

export const Route = createFileRoute("/_app/settings/budget")({
  head: () => ({ meta: [{ title: "Saldo & Budget — Configurações" }] }),
  component: BudgetPage,
});

const KNOWN_CHANNELS = ["sms", "email", "rcs", "hsm", "whatsapp"] as const;

function BudgetPage() {
  const [wallet, setWallet] = useState<TenantWallet | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      getMyWallet(),
      listMyWalletTransactions({ limit: 25 }),
    ])
      .then(([w, t]) => {
        if (cancelled) return;
        setWallet(w);
        setTransactions(t.items);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadTick]);

  const reload = () => setReloadTick((t) => t + 1);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Saldo & Budget</h1>
          <p className="text-sm text-muted-foreground">
            Orçamento mensal/semanal por tenant + custo unitário por canal +
            histórico de débitos. Pré-requisito da Régua de Acionamento.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={reload}
          disabled={loading}
        >
          <RefreshCw className={`mr-1 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </header>

      {error && (
        <Card>
          <CardContent className="flex items-start gap-3 p-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
            <div className="text-sm">
              <p className="font-medium">Falha ao carregar wallet</p>
              <p className="text-xs text-muted-foreground">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {loading && !wallet ? (
        <Card>
          <CardContent className="flex items-center justify-center p-10 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando…
          </CardContent>
        </Card>
      ) : wallet ? (
        <>
          <WalletSummary wallet={wallet} onChange={reload} />
          <ChannelCosts wallet={wallet} onChange={reload} />
          <TransactionList transactions={transactions ?? []} />
        </>
      ) : null}
    </div>
  );
}

function WalletSummary({
  wallet,
  onChange,
}: {
  wallet: TenantWallet;
  onChange: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const usedPct = wallet.totalBudgetCents
    ? Math.min(100, Math.round((wallet.usedBudgetCents / wallet.totalBudgetCents) * 100))
    : 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="h-4 w-4 text-primary" /> Wallet do tenant
        </CardTitle>
        <Button size="sm" variant={editing ? "secondary" : "outline"} onClick={() => setEditing(!editing)}>
          {editing ? "Cancelar" : "Editar"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {editing ? (
          <WalletEditForm
            wallet={wallet}
            onDone={() => {
              setEditing(false);
              onChange();
            }}
          />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Total
                </p>
                <p className="text-2xl font-semibold tracking-tight">
                  R$ {(wallet.totalBudgetCents / 100).toFixed(2)}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Usado
                </p>
                <p className="text-2xl font-semibold tracking-tight">
                  R$ {(wallet.usedBudgetCents / 100).toFixed(2)}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Restante
                </p>
                <p className="text-2xl font-semibold tracking-tight">
                  R$ {(wallet.remainingCents / 100).toFixed(2)}
                </p>
              </div>
            </div>
            <Progress value={usedPct} />
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary">
                guard:{" "}
                {wallet.guardMode === "hard_block" ? "hard (refuse)" : "soft (alert)"}
              </Badge>
              <Badge variant="secondary">ciclo: {wallet.resetCycle}</Badge>
              <Badge variant="secondary">
                débito real-time: {wallet.realtimeDebit ? "on" : "off"}
              </Badge>
              {wallet.resetAt && (
                <span>
                  reset em {new Date(wallet.resetAt).toLocaleDateString("pt-BR")}
                </span>
              )}
            </div>
            <TopUpForm onDone={onChange} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function WalletEditForm({
  wallet,
  onDone,
}: {
  wallet: TenantWallet;
  onDone: () => void;
}) {
  const [totalReais, setTotalReais] = useState((wallet.totalBudgetCents / 100).toFixed(2));
  const [guardMode, setGuardMode] = useState<WalletGuardMode>(wallet.guardMode);
  const [resetCycle, setResetCycle] = useState<WalletResetCycle>(wallet.resetCycle);
  const [realtimeDebit, setRealtimeDebit] = useState(wallet.realtimeDebit);
  const [pending, setPending] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true);
    try {
      const totalBudgetCents = Math.round(Number(totalReais) * 100) || 0;
      await updateMyWallet({
        totalBudgetCents,
        guardMode,
        resetCycle,
        realtimeDebit,
      });
      toast.success("Wallet atualizada.");
      onDone();
    } catch (err) {
      toast.error(walletErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="w-total">Orçamento total (R$)</Label>
          <Input
            id="w-total"
            type="number"
            step="0.01"
            min={0}
            value={totalReais}
            onChange={(e) => setTotalReais(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="w-guard">Modo do guard</Label>
          <Select value={guardMode} onValueChange={(v) => setGuardMode(v as WalletGuardMode)}>
            <SelectTrigger id="w-guard">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="soft_block">Soft block (alerta)</SelectItem>
              <SelectItem value="hard_block">Hard block (recusa send)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="w-cycle">Ciclo de reset</Label>
          <Select value={resetCycle} onValueChange={(v) => setResetCycle(v as WalletResetCycle)}>
            <SelectTrigger id="w-cycle">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Mensal</SelectItem>
              <SelectItem value="weekly">Semanal</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end gap-3 pb-1">
          <Switch id="w-rt" checked={realtimeDebit} onCheckedChange={setRealtimeDebit} />
          <Label htmlFor="w-rt" className="text-sm font-normal">
            Débito em tempo real
          </Label>
        </div>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando…
          </>
        ) : (
          "Salvar configurações"
        )}
      </Button>
    </form>
  );
}

function ChannelCosts({
  wallet,
  onChange,
}: {
  wallet: TenantWallet;
  onChange: () => void;
}) {
  const knownEntries = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of wallet.channelCosts) map.set(c.channel, c.costCents);
    return KNOWN_CHANNELS.map((ch) => ({ channel: ch, costCents: map.get(ch) ?? 0 }));
  }, [wallet.channelCosts]);

  const onSave = async (channel: string, costCents: number) => {
    try {
      await upsertWalletChannelCost(channel, costCents);
      toast.success(`Custo de ${channel.toUpperCase()} atualizado.`);
      onChange();
    } catch (err) {
      toast.error(walletErrorMessage(err));
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Custo unitário por canal</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {knownEntries.map((entry) => (
            <ChannelCostInput key={entry.channel} {...entry} onSave={onSave} />
          ))}
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Valor em centavos por send. Quando a Régua enviar uma mensagem, o
          Wallet é debitado deste valor + guard apropriado.
        </p>
      </CardContent>
    </Card>
  );
}

function ChannelCostInput({
  channel,
  costCents,
  onSave,
}: {
  channel: string;
  costCents: number;
  onSave: (channel: string, costCents: number) => Promise<void>;
}) {
  const [value, setValue] = useState(String(costCents));
  const [pending, setPending] = useState(false);
  useEffect(() => {
    setValue(String(costCents));
  }, [costCents]);

  const dirty = String(costCents) !== value;
  const onCommit = async () => {
    const n = Math.max(0, Number(value) || 0);
    setPending(true);
    try {
      await onSave(channel, n);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex items-end gap-2">
      <div className="flex-1 space-y-1">
        <Label className="text-xs uppercase tracking-wide" htmlFor={`cc-${channel}`}>
          {channel.toUpperCase()}
        </Label>
        <Input
          id={`cc-${channel}`}
          type="number"
          min={0}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      <Button
        type="button"
        size="sm"
        variant={dirty ? "default" : "outline"}
        disabled={!dirty || pending}
        onClick={onCommit}
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Salvar"}
      </Button>
    </div>
  );
}

function TopUpForm({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [reais, setReais] = useState("0.00");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const amountCents = Math.round(Number(reais) * 100);
    if (!amountCents || amountCents < 1) return;
    setPending(true);
    try {
      await creditMyWallet({
        amountCents,
        reason: reason.trim() || undefined,
      });
      toast.success("Top-up aplicado.");
      setReais("0.00");
      setReason("");
      setOpen(false);
      onDone();
    } catch (err) {
      toast.error(walletErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  if (!open) {
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        <ArrowDownCircle className="mr-1 h-3.5 w-3.5" /> Top-up manual
      </Button>
    );
  }
  return (
    <form onSubmit={onSubmit} className="space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="tu-amount" className="text-xs">
            Valor (R$)
          </Label>
          <Input
            id="tu-amount"
            type="number"
            step="0.01"
            min={0.01}
            value={reais}
            onChange={(e) => setReais(e.target.value)}
            className="w-[140px]"
          />
        </div>
        <div className="flex-1 space-y-1">
          <Label htmlFor="tu-reason" className="text-xs">
            Razão (opcional)
          </Label>
          <Input
            id="tu-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="ex.: ajuste mês 06"
          />
        </div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
          Aplicar top-up
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Top-up reduz <code>usedBudgetCents</code>. Vai pra trilha como{" "}
        <code>WalletTransaction.type = credit</code>.
      </p>
    </form>
  );
}

function TransactionList({ transactions }: { transactions: WalletTransaction[] }) {
  if (transactions.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Transações recentes</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Sem transações ainda. Top-up acima ou aguardar a Régua executar para
          ver débitos.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Transações recentes</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y">
          {transactions.map((t) => (
            <li key={t.id} className="flex items-center justify-between p-3 text-sm">
              <div className="flex items-center gap-3">
                {t.type === "debit" ? (
                  <ArrowUpCircle className="h-4 w-4 text-rose-600" />
                ) : (
                  <ArrowDownCircle className="h-4 w-4 text-emerald-600" />
                )}
                <div>
                  <p className="font-medium">
                    {t.type === "debit" ? "Débito" : t.type === "credit" ? "Top-up" : "Reembolso"}
                    {t.channel && <> · {t.channel}</>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t.refType ?? "—"} {t.refId && <>· {t.refId.slice(0, 16)}</>}{" "}
                    · {new Date(t.createdAt).toLocaleString("pt-BR")}
                  </p>
                </div>
              </div>
              <span
                className={`font-semibold ${
                  t.type === "debit" ? "text-rose-600" : "text-emerald-700"
                }`}
              >
                {t.type === "debit" ? "−" : "+"} R$ {(t.amountCents / 100).toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function walletErrorMessage(err: unknown): string {
  if (err instanceof OmniconnectError) {
    if (err.status === 403) return "Você não tem permissão para essa ação.";
    if (err.status === 404) return "Wallet não encontrada.";
    if (err.status === 400) return `Dados inválidos: ${err.message}`;
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Falha desconhecida";
}
