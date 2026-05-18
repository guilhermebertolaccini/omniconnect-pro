import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Download, FileText, Send, Loader2, Clock, PenTool, Check, ShieldCheck, Cloud, ExternalLink,
} from "lucide-react";
import { useContracts } from "@/contexts/ContractContext";
import { useAuth } from "@/contexts/AuthContext";
import { createSignatureEnvelope, listContractSignatures } from "@/lib/api/crm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { ContractStatus } from "@/types/property";
import { PdfUploadButton, PdfDeleteButton } from "@/components/PdfUploadButton";
import { PdfVersionsList } from "@/components/PdfVersionsList";
import { PdfAccessLogList } from "@/components/PdfAccessLogList";
import { TrackedPdfLink } from "@/components/TrackedPdfLink";
import { recordDocumentVersion } from "@/lib/documentVersions";
import { toast } from "@/hooks/use-toast";

const statusBadge: Record<ContractStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  review: "bg-yellow-100 text-yellow-700",
  pending_signature: "bg-blue-100 text-blue-700",
  signed: "bg-green-100 text-green-700",
};

const STAGES: { key: ContractStatus; label: string }[] = [
  { key: "draft", label: "Rascunho" },
  { key: "review", label: "Em revisão" },
  { key: "pending_signature", label: "Aguardando assinaturas" },
  { key: "signed", label: "Assinado" },
];

const roleLabel: Record<string, string> = {
  buyer: "Comprador",
  seller: "Vendedor",
  witness1: "Testemunha 1",
  witness2: "Testemunha 2",
};

function formatCurrency(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

interface SigRow {
  id: string;
  role: string;
  signer_name: string | null;
  signer_email: string | null;
  status: string;
  signed_at: string | null;
  signature_hash: string | null;
  ip_address: string | null;
}

interface EventRow {
  id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  created_at: string;
}

export default function ContractDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getContract, updateContractStatus, signContract, updateContractPdfUrl, loading } = useContracts();
  const { user } = useAuth();
  const [signatures, setSignatures] = useState<SigRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [signOpen, setSignOpen] = useState(false);
  const [signRole, setSignRole] = useState<string>("");
  const [signerName, setSignerName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [versionsKey, setVersionsKey] = useState(0);
  const [accessKey, setAccessKey] = useState(0);
  const [clicksignOpen, setClicksignOpen] = useState(false);
  const [clicksignBusy, setClicksignBusy] = useState(false);
  const [clicksignSigners, setClicksignSigners] = useState<
    { role: string; name: string; email: string; cpf: string }[]
  >([]);

  const contract = id ? getContract(id) : undefined;

  const loadData = async () => {
    if (!id) return;
    setLoadingData(true);
    try {
      const sigs = await listContractSignatures(id);
      setSignatures(sigs.map((s) => ({
        id: s.id,
        role: s.role,
        signer_name: s.signerName,
        signer_email: s.signerEmail,
        status: s.status,
        signed_at: s.signedAt,
        signature_hash: s.signatureHash,
        ip_address: s.ipAddress,
      })));
    } catch {
      setSignatures(
        (contract?.signatures ?? []).map((s) => ({
          id: `${id}-${s.role}`,
          role: s.role,
          signer_name: s.name,
          signer_email: null,
          status: s.signed ? "signed" : "pending",
          signed_at: s.signedAt ?? null,
          signature_hash: null,
          ip_address: null,
        })),
      );
    }
    setEvents(readContractEvents(id));
    setLoadingData(false);
  };

  useEffect(() => { loadData(); /* eslint-disable-next-line */ }, [id]);

  if (loading) return <div className="py-20 text-center"><Loader2 className="h-6 w-6 animate-spin inline" /></div>;
  if (!contract) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/contracts")}><ArrowLeft className="h-4 w-4 mr-2" />Voltar</Button>
        <Card><CardContent className="py-12 text-center text-muted-foreground">Contrato não encontrado.</CardContent></Card>
      </div>
    );
  }

  const openClicksign = () => {
    // pré-popula signatários com base nas linhas existentes
    setClicksignSigners(
      signatures.map((s) => ({
        role: s.role,
        name: s.signer_name ?? "",
        email: s.signer_email ?? "",
        cpf: "",
      })),
    );
    setClicksignOpen(true);
  };

  const sendToClicksign = async () => {
    if (clicksignSigners.some((s) => !s.name.trim() || !s.email.trim())) {
      toast({ title: "Preencha nome e e-mail de todos os signatários", variant: "destructive" });
      return;
    }
    setClicksignBusy(true);
    try {
      await createSignatureEnvelope(
        contract.id,
        clicksignSigners.map((s) => ({
          role: s.role,
          name: s.name,
          email: s.email,
        })),
      );
    } catch (err) {
      setClicksignBusy(false);
      toast({
        title: "Falha ao enviar para Clicksign",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      });
      return;
    }
    setClicksignBusy(false);
    toast({
      title: "Enviado para Clicksign",
      description: "Os signatários receberão o link de assinatura por e-mail.",
    });
    setClicksignOpen(false);
    await loadData();
  };

  const advance = async (next: ContractStatus) => {
    setBusy(true);
    await updateContractStatus(contract.id, next);
    await loadData();
    setBusy(false);
  };

  const logPdfEvent = async (type: "pdf_replaced" | "pdf_removed" | "pdf_attached", message: string) => {
    const row: EventRow = {
      id: `contract-event-${Date.now()}`,
      event_type: type,
      from_status: null,
      to_status: contract.status,
      created_at: new Date().toISOString(),
    };
    void message;
    writeContractEvents(contract.id, [row, ...readContractEvents(contract.id)].slice(0, 100));
    await loadData();
  };

  const pdfLocked = contract.status === "signed";
  const lockReason = pdfLocked ? "Contrato assinado não permite alterar o PDF." : undefined;

  const openSign = (sig: SigRow) => {
    setSignRole(sig.role);
    setSignerName(sig.signer_name ?? "");
    setSignerEmail(sig.signer_email ?? "");
    setSignOpen(true);
  };

  const confirmSign = async () => {
    if (!signerName.trim()) {
      toast({ title: "Informe o nome do signatário", variant: "destructive" });
      return;
    }
    setBusy(true);
    setSignatures((cur) =>
      cur.map((s) =>
        s.role === signRole
          ? { ...s, signer_name: signerName.trim(), signer_email: signerEmail.trim() || null }
          : s,
      ),
    );
    await signContract(contract.id, signRole);
    await loadData();
    setBusy(false);
    setSignOpen(false);
  };

  const currentIdx = STAGES.findIndex((s) => s.key === contract.status);
  const totalSigs = signatures.length;
  const signedCount = signatures.filter((s) => s.status === "signed").length;
  const sigPercent = totalSigs ? (signedCount / totalSigs) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate("/contracts")}>
          <ArrowLeft className="h-4 w-4 mr-2" />Voltar
        </Button>
        <div className="flex items-center gap-2">
          {contract.pdfUrl && (
            <Button variant="outline" size="sm" asChild>
              <TrackedPdfLink
                href={contract.pdfUrl}
                parentType="contract"
                parentId={contract.id}
                action="downloaded"
                onTracked={() => setAccessKey((k) => k + 1)}
              >
                <Download className="h-4 w-4 mr-2" />PDF
              </TrackedPdfLink>
            </Button>
          )}
          <PdfUploadButton
            kind="contracts"
            parentType="contract"
            parentId={contract.id}
            fileNamePrefix={`contrato-${contract.unitNumber}`}
            existingUrl={contract.pdfUrl}
            disabled={pdfLocked}
            disabledReason={lockReason}
            onUploaded={async (url, fileName) => {
              const had = !!contract.pdfUrl;
              await updateContractPdfUrl(contract.id, url, url);
              await recordDocumentVersion({
                parentType: "contract",
                parentId: contract.id,
                pdfUrl: url,
                fileName,
                action: had ? "replaced" : "attached",
                uploadedBy: user?.id,
                uploaderName: user?.name,
              });
              await logPdfEvent(had ? "pdf_replaced" : "pdf_attached", had ? "PDF substituído" : "PDF anexado");
              setVersionsKey((k) => k + 1);
            }}
          />
          <PdfDeleteButton
            existingUrl={contract.pdfUrl}
            disabled={pdfLocked}
            disabledReason={lockReason}
            onDeleted={async () => {
              await updateContractPdfUrl(contract.id, null, null);
              await logPdfEvent("pdf_removed", "PDF removido");
              setVersionsKey((k) => k + 1);
            }}
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="font-display flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Contrato — {contract.propertyName} • Unidade {contract.unitNumber}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {contract.clientName} • {contract.clientCpfCnpj}
              </p>
            </div>
            <Badge className={statusBadge[contract.status]}>{contract.status}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between gap-2">
            {STAGES.map((s, i) => {
              const reached = currentIdx >= i;
              return (
                <div key={s.key} className="flex-1 flex items-center">
                  <div className={`flex flex-col items-center gap-1 ${reached ? "text-foreground" : "text-muted-foreground"}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${reached ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                      {i + 1}
                    </div>
                    <span className="text-xs font-medium text-center">{s.label}</span>
                  </div>
                  {i < STAGES.length - 1 && <div className={`flex-1 h-0.5 mx-2 ${currentIdx > i ? "bg-primary" : "bg-muted"}`} />}
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2">
            {contract.status === "draft" && (
              <Button onClick={() => advance("review")} disabled={busy} size="sm">
                <Send className="h-4 w-4 mr-2" />Enviar para revisão
              </Button>
            )}
            {contract.status === "review" && (
              <Button onClick={() => advance("pending_signature")} disabled={busy} size="sm">
                <PenTool className="h-4 w-4 mr-2" />Liberar para assinatura
              </Button>
            )}
          {(contract.status === "pending_signature" || contract.status === "review") && contract.pdfUrl && !contract.externalEnvelopeId && (
            <Button onClick={openClicksign} disabled={busy} size="sm" variant="default" className="gap-2">
              <Cloud className="h-4 w-4" />Enviar para Clicksign
            </Button>
          )}
          {contract.externalEnvelopeId && contract.externalEnvelopeUrl && (
            <Button asChild size="sm" variant="outline" className="gap-2">
              <a href={contract.externalEnvelopeUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />Ver no Clicksign
              </a>
            </Button>
          )}
          </div>

          <Separator />

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Valor</p>
              <p className="font-bold">{formatCurrency(contract.finalPrice)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Criado em</p>
              <p className="font-medium">{new Date(contract.createdAt).toLocaleDateString("pt-BR")}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Por</p>
              <p className="font-medium">{contract.createdBy}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Signatures panel */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="font-display text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />Assinaturas digitais
            </CardTitle>
            <span className="text-xs text-muted-foreground">{signedCount}/{totalSigs} assinadas</span>
          </div>
          <Progress value={sigPercent} className="h-2 mt-2" />
        </CardHeader>
        <CardContent className="space-y-2">
          {loadingData ? (
            <div className="py-6 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
          ) : signatures.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nenhum signatário registrado.</p>
          ) : (
            signatures.map((sig) => (
              <div key={sig.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{roleLabel[sig.role] ?? sig.role}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {sig.signer_name || "—"} {sig.signer_email ? `• ${sig.signer_email}` : ""}
                  </p>
                  {sig.status === "signed" && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {sig.signed_at && new Date(sig.signed_at).toLocaleString("pt-BR")}
                      {sig.signature_hash && ` • hash ${sig.signature_hash.slice(0, 12)}…`}
                    </p>
                  )}
                </div>
                {sig.status === "signed" ? (
                  <Badge className="bg-green-100 text-green-700 gap-1"><Check className="h-3 w-3" />Assinada</Badge>
                ) : (
                  <Button
                    size="sm"
                    disabled={contract.status !== "pending_signature" || busy}
                    onClick={() => openSign(sig)}
                    className="gap-1"
                  >
                    <PenTool className="h-3 w-3" />Assinar
                  </Button>
                )}
              </div>
            ))
          )}
          {contract.status !== "pending_signature" && contract.status !== "signed" && (
            <p className="text-xs text-muted-foreground text-center pt-2">
              Avance o contrato até "Aguardando assinaturas" para liberar a coleta.
            </p>
          )}
        </CardContent>
      </Card>

      <PdfVersionsList
        parentType="contract"
        parentId={contract.id}
        refreshKey={versionsKey}
        onAccess={() => setAccessKey((k) => k + 1)}
      />

      <PdfAccessLogList parentType="contract" parentId={contract.id} refreshKey={accessKey} />

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />Histórico
          </CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Sem eventos registrados.</p>
          ) : (
            <ol className="space-y-3">
              {events.map((e) => (
                <li key={e.id} className="flex items-start gap-3 text-sm">
                  <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium">
                      {e.event_type === "created" && `Contrato criado (${e.to_status})`}
                      {e.event_type === "status_change" && `Status: ${e.from_status} → ${e.to_status}`}
                      {e.event_type === "pdf_attached" && "PDF anexado"}
                      {e.event_type === "pdf_replaced" && "PDF substituído"}
                      {e.event_type === "pdf_removed" && "PDF removido"}
                    </p>
                    <p className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString("pt-BR")}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      {/* Signature dialog */}
      <Dialog open={signOpen} onOpenChange={setSignOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <PenTool className="h-5 w-5" />Assinatura digital
            </DialogTitle>
            <DialogDescription>
              Confirme seus dados para assinar como <span className="font-medium">{roleLabel[signRole] ?? signRole}</span>. Um hash SHA-256 será gerado e armazenado para auditoria.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome completo *</Label>
              <Input value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="Nome do signatário" />
            </div>
            <div className="space-y-1.5">
              <Label>E-mail (opcional)</Label>
              <Input type="email" value={signerEmail} onChange={(e) => setSignerEmail(e.target.value)} placeholder="email@exemplo.com" />
            </div>
            <p className="text-xs text-muted-foreground">
              Ao confirmar, declaro que li e concordo com os termos do contrato e que esta assinatura tem validade legal.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSignOpen(false)} disabled={busy}>Cancelar</Button>
            <Button onClick={confirmSign} disabled={busy || !signerName.trim()}>
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Assinar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clicksign signers dialog */}
      <Dialog open={clicksignOpen} onOpenChange={setClicksignOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Cloud className="h-5 w-5" />Enviar para Clicksign
            </DialogTitle>
            <DialogDescription>
              Preencha nome e e-mail de cada signatário. O Clicksign enviará o link de assinatura por e-mail automaticamente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
            {clicksignSigners.map((s, idx) => (
              <div key={idx} className="space-y-2 rounded-lg border p-3">
                <p className="text-sm font-medium">{roleLabel[s.role] ?? s.role}</p>
                <div className="grid grid-cols-2 gap-2">
                  <Input value={s.name} onChange={(e) => setClicksignSigners((prev) => prev.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))} placeholder="Nome completo" />
                  <Input type="email" value={s.email} onChange={(e) => setClicksignSigners((prev) => prev.map((x, i) => i === idx ? { ...x, email: e.target.value } : x))} placeholder="E-mail" />
                </div>
                <Input value={s.cpf} onChange={(e) => setClicksignSigners((prev) => prev.map((x, i) => i === idx ? { ...x, cpf: e.target.value } : x))} placeholder="CPF (opcional)" />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClicksignOpen(false)} disabled={clicksignBusy}>Cancelar</Button>
            <Button onClick={sendToClicksign} disabled={clicksignBusy}>
              {clicksignBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function readContractEvents(contractId: string): EventRow[] {
  try {
    const all = JSON.parse(window.localStorage.getItem("crm-contract-events") ?? "{}") as Record<string, EventRow[]>;
    return all[contractId] ?? [];
  } catch {
    return [];
  }
}

function writeContractEvents(contractId: string, rows: EventRow[]) {
  const all = JSON.parse(window.localStorage.getItem("crm-contract-events") ?? "{}") as Record<string, EventRow[]>;
  all[contractId] = rows;
  window.localStorage.setItem("crm-contract-events", JSON.stringify(all));
}