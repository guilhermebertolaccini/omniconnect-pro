import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Download, FileText, Send, CheckCircle2, XCircle, Loader2, Clock } from "lucide-react";
import { useProposals } from "@/contexts/ProposalContext";
import { PdfUploadButton, PdfDeleteButton } from "@/components/PdfUploadButton";
import { PdfVersionsList } from "@/components/PdfVersionsList";
import { PdfAccessLogList } from "@/components/PdfAccessLogList";
import { TrackedPdfLink } from "@/components/TrackedPdfLink";
import { recordDocumentVersion } from "@/lib/documentVersions";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ProposalStatus } from "@/types/property";

const STAGES: { key: ProposalStatus; label: string }[] = [
  { key: "draft", label: "Rascunho" },
  { key: "sent", label: "Enviada" },
  { key: "accepted", label: "Aceita" },
];

const statusBadge: Record<ProposalStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-blue-100 text-blue-700",
  accepted: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

function formatCurrency(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

interface EventRow {
  id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  message: string | null;
  created_at: string;
}

export default function ProposalDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getProposal, updateProposalStatus, updateProposalPdfUrl, loading } = useProposals();
  const { user } = useAuth();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [versionsKey, setVersionsKey] = useState(0);
  const [accessKey, setAccessKey] = useState(0);

  const proposal = id ? getProposal(id) : undefined;

  const loadEvents = async () => {
    if (!id) return;
    setLoadingEvents(true);
    const { data } = await supabase
      .from("proposal_events")
      .select("*")
      .eq("proposal_id", id)
      .order("created_at", { ascending: false });
    setEvents((data ?? []) as EventRow[]);
    setLoadingEvents(false);
  };

  useEffect(() => {
    loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (!proposal) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/proposals")}><ArrowLeft className="h-4 w-4 mr-2" />Voltar</Button>
        <Card><CardContent className="py-12 text-center text-muted-foreground">Proposta não encontrada.</CardContent></Card>
      </div>
    );
  }

  const advance = async (next: ProposalStatus) => {
    setUpdating(true);
    await updateProposalStatus(proposal.id, next);
    await loadEvents();
    setUpdating(false);
  };

  const logPdfEvent = async (type: "pdf_replaced" | "pdf_removed" | "pdf_attached", message: string) => {
    await supabase.from("proposal_events").insert({
      proposal_id: proposal.id,
      event_type: type,
      to_status: proposal.status,
      message,
    });
    await loadEvents();
  };

  const pdfLocked = proposal.status === "accepted" || proposal.status === "rejected";
  const lockReason = pdfLocked ? "Proposta finalizada não permite alterar o PDF." : undefined;

  const currentIdx = STAGES.findIndex((s) => s.key === proposal.status);
  const isClosed = proposal.status === "accepted" || proposal.status === "rejected";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate("/proposals")}>
          <ArrowLeft className="h-4 w-4 mr-2" />Voltar
        </Button>
        <div className="flex items-center gap-2">
          <PdfUploadButton
            kind="proposals"
            fileNamePrefix={`proposta-${proposal.unitNumber}`}
            existingUrl={proposal.pdfUrl}
            disabled={pdfLocked}
            disabledReason={lockReason}
            onUploaded={async (url, fileName) => {
              const had = !!proposal.pdfUrl;
              await updateProposalPdfUrl(proposal.id, url, url);
              await recordDocumentVersion({
                parentType: "proposal",
                parentId: proposal.id,
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
            existingUrl={proposal.pdfUrl}
            disabled={pdfLocked}
            disabledReason={lockReason}
            onDeleted={async () => {
              await updateProposalPdfUrl(proposal.id, null, null);
              await logPdfEvent("pdf_removed", "PDF removido");
              setVersionsKey((k) => k + 1);
            }}
          />
          {proposal.pdfUrl && (
            <Button variant="outline" size="sm" asChild>
              <TrackedPdfLink
                href={proposal.pdfUrl}
                parentType="proposal"
                parentId={proposal.id}
                action="downloaded"
                onTracked={() => setAccessKey((k) => k + 1)}
              >
                <Download className="h-4 w-4 mr-2" />PDF
              </TrackedPdfLink>
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="font-display flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Proposta — {proposal.propertyName} • Unidade {proposal.unitNumber}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Cliente: <span className="font-medium text-foreground">{proposal.clientName}</span>
              </p>
            </div>
            <Badge className={statusBadge[proposal.status]}>{proposal.status}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Stage tracker */}
          <div>
            <div className="flex items-center justify-between gap-2">
              {STAGES.map((s, i) => {
                const reached = currentIdx >= i || (proposal.status === "accepted" && i === STAGES.length - 1);
                return (
                  <div key={s.key} className="flex-1 flex items-center">
                    <div className={`flex flex-col items-center gap-1 ${reached ? "text-foreground" : "text-muted-foreground"}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${reached ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                        {i + 1}
                      </div>
                      <span className="text-xs font-medium">{s.label}</span>
                    </div>
                    {i < STAGES.length - 1 && (
                      <div className={`flex-1 h-0.5 mx-2 ${currentIdx > i ? "bg-primary" : "bg-muted"}`} />
                    )}
                  </div>
                );
              })}
            </div>
            {proposal.status === "rejected" && (
              <p className="text-sm text-red-600 font-medium mt-3 text-center">Proposta rejeitada</p>
            )}
          </div>

          {!isClosed && (
            <div className="flex flex-wrap gap-2">
              {proposal.status === "draft" && (
                <Button onClick={() => advance("sent")} disabled={updating} size="sm">
                  <Send className="h-4 w-4 mr-2" />Enviar ao cliente
                </Button>
              )}
              {proposal.status === "sent" && (
                <>
                  <Button onClick={() => advance("accepted")} disabled={updating} size="sm">
                    <CheckCircle2 className="h-4 w-4 mr-2" />Marcar como aceita
                  </Button>
                  <Button onClick={() => advance("rejected")} disabled={updating} variant="outline" size="sm">
                    <XCircle className="h-4 w-4 mr-2" />Marcar como rejeitada
                  </Button>
                </>
              )}
            </div>
          )}

          <Separator />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Preço original</p>
              <p className="font-medium">{formatCurrency(proposal.originalPrice)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Desconto</p>
              <p className="font-medium">{proposal.discountPercent}% ({formatCurrency(proposal.discount)})</p>
            </div>
            <div>
              <p className="text-muted-foreground">Preço final</p>
              <p className="font-medium text-foreground">{formatCurrency(proposal.finalPrice)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Validade</p>
              <p className="font-medium">{new Date(proposal.validUntil).toLocaleDateString("pt-BR")}</p>
            </div>
          </div>

          {proposal.paymentCondition && (
            <div className="p-4 bg-secondary rounded-lg space-y-1 text-sm">
              <h4 className="font-display font-semibold mb-2">Condição de pagamento</h4>
              <div className="grid grid-cols-2 gap-1">
                <span className="text-muted-foreground">Entrada:</span>
                <span className="text-right font-medium">{formatCurrency(proposal.paymentCondition.downPayment ?? 0)} ({proposal.paymentCondition.downPaymentPercent ?? 0}%)</span>
                <span className="text-muted-foreground">Parcelas:</span>
                <span className="text-right font-medium">{proposal.paymentCondition.installments}x {formatCurrency(proposal.paymentCondition.installmentValue ?? 0)}</span>
                {(proposal.paymentCondition.balloon ?? 0) > 0 && (
                  <>
                    <span className="text-muted-foreground">Balão:</span>
                    <span className="text-right font-medium">{formatCurrency(proposal.paymentCondition.balloon ?? 0)} ({proposal.paymentCondition.balloonPercent ?? 0}%)</span>
                  </>
                )}
                <span className="text-muted-foreground">Método:</span>
                <span className="text-right font-medium uppercase">{proposal.paymentCondition.method}</span>
              </div>
            </div>
          )}

          {proposal.notes && (
            <div>
              <p className="text-muted-foreground text-sm mb-1">Observações</p>
              <p className="text-sm">{proposal.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <PdfVersionsList
        parentType="proposal"
        parentId={proposal.id}
        refreshKey={versionsKey}
        onAccess={() => setAccessKey((k) => k + 1)}
      />

      <PdfAccessLogList parentType="proposal" parentId={proposal.id} refreshKey={accessKey} />

      <Card>
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" />Histórico
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingEvents ? (
            <div className="py-6 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
          ) : events.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nenhum evento registrado.</p>
          ) : (
            <ol className="space-y-3">
              {events.map((e) => (
                <li key={e.id} className="flex items-start gap-3 text-sm">
                  <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium">
                      {e.event_type === "created" && `Proposta criada (${e.to_status})`}
                      {e.event_type === "status_change" && `Status: ${e.from_status} → ${e.to_status}`}
                      {e.event_type === "pdf_attached" && "PDF anexado"}
                      {e.event_type === "pdf_replaced" && "PDF substituído"}
                      {e.event_type === "pdf_removed" && "PDF removido"}
                      {!["created","status_change","pdf_attached","pdf_replaced","pdf_removed"].includes(e.event_type) && e.event_type}
                    </p>
                    {e.message && <p className="text-muted-foreground text-xs">{e.message}</p>}
                    <p className="text-xs text-muted-foreground">
                      {new Date(e.created_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}