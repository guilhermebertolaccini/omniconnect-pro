import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, FileUp } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useClients } from "@/contexts/ClientContext";
import { ProposalDialog } from "@/components/ProposalDialog";
import { Unit } from "@/types/property";
import { uploadPdf, pdfFileToText } from "@/lib/pdfStorage";
import { parseCrmPdf } from "@/lib/api/crm";

interface Props {
  unit: Unit;
  propertyId: string;
  propertyName: string;
  kind?: "proposal" | "contract";
  label?: string;
}

/**
 * Upload a PDF, send it to the parse-document-pdf edge function, then open the
 * ProposalDialog pre-filled with the extracted data for the user to review.
 * For now we focus on the proposal flow; contracts are generated from accepted proposals.
 */
export function PdfImportButton({ unit, propertyId, propertyName, kind = "proposal", label }: Props) {
  const { user } = useAuth();
  const { clients } = useClients();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [prefill, setPrefill] = useState<any>(undefined);
  const [sourcePdfUrl, setSourcePdfUrl] = useState<string | undefined>(undefined);

  const handlePick = () => inputRef.current?.click();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;
    if (file.type !== "application/pdf") {
      toast({ title: "Apenas PDFs", description: "Selecione um arquivo PDF.", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "Arquivo muito grande", description: "Máximo 10MB.", variant: "destructive" });
      return;
    }

    setBusy(true);
    try {
      // 1. Keep a temporary URL for the source PDF until a proposal exists.
      const url = await uploadPdf(user.id, "uploads", file.name, file);
      // 2. Extract best-effort text in-browser and send to the NestJS parser.
      const text = await pdfFileToText(file);
      const ex = await parseCrmPdf({
        kind: kind === "contract" ? "contract" : "proposal",
        text,
      });

      // Try to match a client by name or cpf
      const matched = clients.find(
        (c) =>
          (ex.clientCpfCnpj && c.cpfCnpj && c.cpfCnpj.replace(/\D/g, "") === String(ex.clientCpfCnpj).replace(/\D/g, "")) ||
          (ex.clientName && c.name.toLowerCase() === String(ex.clientName).toLowerCase())
      );

      const fp = ex.finalPrice ?? unit.price;
      const computedDiscountPct =
        unit.price && fp ? Math.max(0, Math.round((1 - fp / unit.price) * 1000) / 10) : undefined;
      const installments = ex.paymentCondition?.installments ?? [];
      const installmentCount = installments.filter((i) => i.type === "installment").length;
      const balloon = installments.find((i) => i.type === "balloon")?.amount ?? 0;

      setPrefill({
        clientId: matched?.id,
        discountPercent: computedDiscountPct,
        downPaymentPercent:
          ex.paymentCondition?.downPayment && fp
            ? Math.round((ex.paymentCondition.downPayment / fp) * 1000) / 10
            : undefined,
        installments: installmentCount || undefined,
        balloonPercent: balloon && fp ? Math.round((balloon / fp) * 1000) / 10 : undefined,
        notes:
          (ex.notes ? ex.notes + "\n\n" : "") +
          `[Importado de PDF] Cliente extraído: ${ex.clientName ?? "—"}${
            ex.clientCpfCnpj ? " (" + ex.clientCpfCnpj + ")" : ""
          }`,
      });
      setSourcePdfUrl(url ?? undefined);
      setOpen(true);

      if (!matched && ex.clientName) {
        toast({
          title: "Cliente não encontrado",
          description: `O cliente "${ex.clientName}" não está cadastrado. Selecione um cliente existente ou cadastre antes.`,
        });
      } else {
        toast({ title: "Dados extraídos", description: "Revise os campos pré-preenchidos antes de salvar." });
      }
    } catch (err) {
      toast({ title: "Erro ao importar PDF", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <input ref={inputRef} type="file" accept="application/pdf" className="hidden" onChange={handleFile} />
      <Button variant="outline" size="sm" className="gap-1" onClick={handlePick} disabled={busy}>
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileUp className="h-3 w-3" />}
        {label ?? "Importar PDF"}
      </Button>
      <ProposalDialog
        open={open}
        onOpenChange={setOpen}
        unit={unit}
        propertyId={propertyId}
        propertyName={propertyName}
        prefill={prefill}
        sourcePdfUrl={sourcePdfUrl}
        onComplete={() => setPrefill(undefined)}
      />
    </>
  );
}