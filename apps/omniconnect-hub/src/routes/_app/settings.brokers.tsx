import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Mail,
  MessageCircle,
  Plus,
  Radio,
  RefreshCw,
  Smartphone,
  Trash2,
  XCircle,
} from "lucide-react";
import {
  createMessageBroker,
  deleteMessageBroker,
  listMessageBrokers,
  OmniconnectError,
  testMessageBroker,
  updateMessageBroker,
  type MessageBroker,
  type MessageBrokerChannel,
  type MessageBrokerStatus,
} from "@/lib/omniconnectClient";

export const Route = createFileRoute("/_app/settings/brokers")({
  head: () => ({ meta: [{ title: "Brokers — Configurações" }] }),
  component: BrokersPage,
});

const CHANNEL_LABEL: Record<MessageBrokerChannel, string> = {
  sms: "SMS",
  email: "Email",
  rcs: "RCS",
};

const CHANNEL_ICON: Record<MessageBrokerChannel, typeof Mail> = {
  sms: Smartphone,
  email: Mail,
  rcs: Radio,
};

const STATUS_LABEL: Record<MessageBrokerStatus, string> = {
  connected: "Conectado",
  attention: "Atenção",
  disconnected: "Desconectado",
};

const STATUS_BADGE: Record<MessageBrokerStatus, string> = {
  connected: "bg-emerald-100 text-emerald-700",
  attention: "bg-amber-100 text-amber-700",
  disconnected: "bg-rose-100 text-rose-700",
};

const VENDOR_HINTS: Record<MessageBrokerChannel, string> = {
  sms: "twilio / zenvia / custom",
  email: "sendgrid / mailgun / amazon-ses / custom",
  rcs: "pulse / infobip / custom",
};

function BrokersPage() {
  const [brokers, setBrokers] = useState<MessageBroker[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listMessageBrokers()
      .then((items) => {
        if (!cancelled) setBrokers(items);
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
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Brokers</h1>
          <p className="text-sm text-muted-foreground">
            Provedores de canal outbound (SMS, Email, RCS). WhatsApp é
            gerenciado em <b>Saúde da linha</b>. Credenciais cifradas em
            repouso (AES-256-GCM).
          </p>
        </div>
        <div className="flex items-center gap-2">
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
          <Dialog open={creating} onOpenChange={setCreating}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-1 h-4 w-4" /> Novo broker
              </Button>
            </DialogTrigger>
            <DialogContent>
              <CreateBrokerForm
                onDone={() => {
                  setCreating(false);
                  reload();
                }}
              />
            </DialogContent>
          </Dialog>
        </div>
      </header>

      {error && (
        <Card>
          <CardContent className="flex items-start gap-3 p-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
            <div className="text-sm">
              <p className="font-medium">Falha ao carregar brokers</p>
              <p className="text-xs text-muted-foreground">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {loading && !brokers ? (
        <Card>
          <CardContent className="flex items-center justify-center p-10 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando…
          </CardContent>
        </Card>
      ) : brokers && brokers.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Nenhum broker configurado ainda. Crie o primeiro pelo botão acima.
          </CardContent>
        </Card>
      ) : brokers ? (
        <div className="grid gap-3">
          {brokers.map((b) => (
            <BrokerRow key={b.id} broker={b} brokers={brokers} onChange={reload} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function BrokerRow({
  broker,
  brokers,
  onChange,
}: {
  broker: MessageBroker;
  brokers: MessageBroker[];
  onChange: () => void;
}) {
  const Icon = CHANNEL_ICON[broker.channel] ?? MessageCircle;
  const [testing, setTesting] = useState(false);

  const fallbackName = broker.fallbackBrokerId
    ? brokers.find((b) => b.id === broker.fallbackBrokerId)?.label ?? "—"
    : null;

  const onTest = async () => {
    setTesting(true);
    try {
      const res = await testMessageBroker(broker.id);
      if (res.canDecrypt) {
        toast.success(
          `Broker "${broker.label}" decifrou OK (status: ${STATUS_LABEL[res.status]}).`,
        );
      } else {
        toast.error(
          `Broker "${broker.label}": apiKey ausente ou não decifra.`,
        );
      }
    } catch (err) {
      toast.error(brokerErrorMessage(err));
    } finally {
      setTesting(false);
    }
  };

  const onToggleStatus = async () => {
    const next: MessageBrokerStatus =
      broker.status === "disconnected" ? "connected" : "disconnected";
    try {
      await updateMessageBroker(broker.id, { status: next });
      toast.success(`Status alterado para "${STATUS_LABEL[next]}".`);
      onChange();
    } catch (err) {
      toast.error(brokerErrorMessage(err));
    }
  };

  const onDelete = async () => {
    if (!window.confirm(`Remover broker "${broker.label}"?`)) return;
    try {
      await deleteMessageBroker(broker.id);
      toast.success("Broker removido.");
      onChange();
    } catch (err) {
      toast.error(brokerErrorMessage(err));
    }
  };

  return (
    <Card>
      <CardContent className="flex items-start gap-4 p-4">
        <div className="grid h-10 w-10 place-items-center rounded-md bg-muted text-muted-foreground">
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{broker.label}</span>
            <Badge variant="secondary">{CHANNEL_LABEL[broker.channel]}</Badge>
            <span className="text-xs text-muted-foreground">
              vendor: {broker.vendor}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[broker.status]}`}
            >
              {STATUS_LABEL[broker.status]}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>
              apiKey:{" "}
              {broker.hasApiKey ? (
                <span className="text-emerald-600">configurada</span>
              ) : (
                <span className="text-rose-600">ausente</span>
              )}
              {broker.apiKeyHint && <> (…{broker.apiKeyHint})</>}
            </span>
            <span>webhook: {broker.hasWebhookSecret ? "✓" : "—"}</span>
            <span>
              custo mensal: R$ {(broker.monthlyCostCents / 100).toFixed(2)}
            </span>
            {fallbackName && <span>fallback: {fallbackName}</span>}
            {broker.autoDisableOnBounce && <span>auto-disable on bounce</span>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onTest} disabled={testing}>
            {testing ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
            )}
            Testar
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onToggleStatus}>
            {broker.status === "disconnected" ? (
              <>
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Conectar
              </>
            ) : (
              <>
                <XCircle className="mr-1 h-3.5 w-3.5" /> Desconectar
              </>
            )}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onDelete}>
            <Trash2 className="mr-1 h-3.5 w-3.5 text-destructive" />
            Remover
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CreateBrokerForm({ onDone }: { onDone: () => void }) {
  const [channel, setChannel] = useState<MessageBrokerChannel>("sms");
  const [vendor, setVendor] = useState("");
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [monthlyCostCents, setMonthlyCostCents] = useState<string>("0");
  const [pending, setPending] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!vendor.trim() || !label.trim()) return;
    setPending(true);
    try {
      await createMessageBroker({
        channel,
        vendor: vendor.trim(),
        label: label.trim(),
        monthlyCostCents: Number(monthlyCostCents) || 0,
        statusMap: {
          delivered: "sent",
          failed: "invalid",
        },
        apiKey: apiKey.trim() || undefined,
      });
      toast.success("Broker criado.");
      onDone();
    } catch (err) {
      toast.error(brokerErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Novo broker</DialogTitle>
      </DialogHeader>

      <div className="space-y-2">
        <Label htmlFor="b-channel">Canal</Label>
        <Select value={channel} onValueChange={(v) => setChannel(v as MessageBrokerChannel)}>
          <SelectTrigger id="b-channel">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sms">SMS</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="rcs">RCS</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="b-vendor">Vendor</Label>
        <Input
          id="b-vendor"
          placeholder={VENDOR_HINTS[channel]}
          value={vendor}
          onChange={(e) => setVendor(e.target.value)}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="b-label">Nome (display)</Label>
        <Input
          id="b-label"
          placeholder="Twilio SMS principal"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="b-apikey">API Key</Label>
        <Input
          id="b-apikey"
          type="password"
          placeholder="sk-… (não será exibida depois)"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          autoComplete="off"
        />
        <p className="text-[11px] text-muted-foreground">
          Cifrada em repouso. O backend nunca devolve plaintext — apenas os
          últimos 4 caracteres na resposta inicial.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="b-cost">Custo mensal estimado (centavos BRL)</Label>
        <Input
          id="b-cost"
          type="number"
          min={0}
          value={monthlyCostCents}
          onChange={(e) => setMonthlyCostCents(e.target.value)}
        />
      </div>

      <DialogFooter>
        <Button type="submit" disabled={pending || !vendor.trim() || !label.trim()}>
          {pending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Criando…
            </>
          ) : (
            "Criar broker"
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}

function brokerErrorMessage(err: unknown): string {
  if (err instanceof OmniconnectError) {
    if (err.status === 403) return "Você não tem permissão para essa ação.";
    if (err.status === 404) return "Broker não encontrado.";
    if (err.status === 400) return `Dados inválidos: ${err.message}`;
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Falha desconhecida";
}
