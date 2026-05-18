import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/useI18n";
import { useClients } from "@/contexts/ClientContext";
import { useProposals } from "@/contexts/ProposalContext";
import { useAuth } from "@/contexts/AuthContext";
import { Unit, Proposal, PaymentCondition } from "@/types/property";
import { formatCurrency } from "@/data/mockData";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Calculator, Loader2 } from "lucide-react";
import { generateProposalPdf } from "@/lib/proposalPdf";
import { uploadPdf } from "@/lib/pdfStorage";
import { recordDocumentVersion } from "@/lib/documentVersions";
import { toast } from "@/hooks/use-toast";

interface ProposalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unit: Unit;
  propertyId: string;
  propertyName: string;
  onComplete: () => void;
  /** Optional defaults extracted from an uploaded PDF */
  prefill?: Partial<{
    clientId: string;
    discountPercent: number;
    downPaymentPercent: number;
    installments: number;
    balloonPercent: number;
    interestRate: number;
    method: "sac" | "price";
    indexer: "none" | "incc" | "ipca";
    validityDays: number;
    notes: string;
  }>;
  /** If provided, this URL is stored as the source PDF on the new proposal */
  sourcePdfUrl?: string;
}

export function ProposalDialog({ open, onOpenChange, unit, propertyId, propertyName, onComplete, prefill, sourcePdfUrl }: ProposalDialogProps) {
  const { t } = useI18n();
  const { clients } = useClients();
  const { addProposal, updateProposalPdfUrl } = useProposals();
  const { user } = useAuth();

  const defaultClient = prefill?.clientId ?? unit.clientId ?? "";
  const [clientId, setClientId] = useState(defaultClient);
  const [discountPercent, setDiscountPercent] = useState(prefill?.discountPercent ?? 0);
  const [downPaymentPercent, setDownPaymentPercent] = useState(prefill?.downPaymentPercent ?? 20);
  const [installments, setInstallments] = useState(prefill?.installments ?? 60);
  const [balloonPercent, setBalloonPercent] = useState(prefill?.balloonPercent ?? 0);
  const [interestRate, setInterestRate] = useState(prefill?.interestRate ?? 0.8);
  const [method, setMethod] = useState<"sac" | "price">(prefill?.method ?? "price");
  const [indexer, setIndexer] = useState<"none" | "incc" | "ipca">(prefill?.indexer ?? "incc");
  const [validityDays, setValidityDays] = useState(prefill?.validityDays ?? 7);
  const [notes, setNotes] = useState(prefill?.notes ?? "");
  const [creating, setCreating] = useState(false);

  // Re-apply prefill if it changes (e.g. dialog reopened with new PDF data)
  useEffect(() => {
    if (!prefill) return;
    if (prefill.clientId !== undefined) setClientId(prefill.clientId);
    if (prefill.discountPercent !== undefined) setDiscountPercent(prefill.discountPercent);
    if (prefill.downPaymentPercent !== undefined) setDownPaymentPercent(prefill.downPaymentPercent);
    if (prefill.installments !== undefined) setInstallments(prefill.installments);
    if (prefill.balloonPercent !== undefined) setBalloonPercent(prefill.balloonPercent);
    if (prefill.interestRate !== undefined) setInterestRate(prefill.interestRate);
    if (prefill.method) setMethod(prefill.method);
    if (prefill.indexer) setIndexer(prefill.indexer);
    if (prefill.validityDays !== undefined) setValidityDays(prefill.validityDays);
    if (prefill.notes !== undefined) setNotes(prefill.notes);
  }, [prefill]);

  const finalPrice = unit.price * (1 - discountPercent / 100);
  const downPayment = finalPrice * (downPaymentPercent / 100);
  const balloon = finalPrice * (balloonPercent / 100);
  const financedAmount = finalPrice - downPayment - balloon;
  const monthlyRate = interestRate / 100;

  let installmentValue = 0;
  if (installments > 0 && financedAmount > 0) {
    if (method === "price") {
      if (monthlyRate > 0) {
        installmentValue = financedAmount * (monthlyRate * Math.pow(1 + monthlyRate, installments)) / (Math.pow(1 + monthlyRate, installments) - 1);
      } else {
        installmentValue = financedAmount / installments;
      }
    } else {
      // SAC - first installment (highest)
      const amort = financedAmount / installments;
      installmentValue = amort + financedAmount * monthlyRate;
    }
  }

  const totalPaid = downPayment + balloon + installmentValue * installments;

  const handleCreate = async () => {
    if (!clientId || !user || creating) return;
    const client = clients.find((c) => c.id === clientId);
    if (!client) return;
    setCreating(true);

    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + validityDays);

    const condition: PaymentCondition = {
      downPayment,
      downPaymentPercent,
      installments,
      installmentValue: Math.round(installmentValue * 100) / 100,
      balloon,
      balloonPercent,
      interestRate,
      method,
      indexer,
    };

    const draft: Omit<Proposal, "id"> = {
      propertyId,
      propertyName,
      unitId: unit.id,
      unitNumber: unit.number,
      clientId,
      clientName: client.name,
      originalPrice: unit.price,
      discount: unit.price - finalPrice,
      discountPercent,
      finalPrice: Math.round(finalPrice),
      paymentCondition: condition,
      status: "draft",
      validUntil: validUntil.toISOString(),
      createdAt: new Date().toISOString(),
      createdBy: user.name,
      notes,
      sourcePdfUrl,
    };

    const newId = await addProposal(draft);
    if (!newId) {
      setCreating(false);
      return;
    }

    // Generate PDF and upload
    try {
      const blob = generateProposalPdf({ ...(draft as Proposal), id: newId });
      const fileName = `proposta-${unit.number}.pdf`;
      const url = await uploadPdf(user.id, "proposals", fileName, blob);
      if (url) {
        await updateProposalPdfUrl(newId, url, sourcePdfUrl);
        await recordDocumentVersion({
          parentType: "proposal",
          parentId: newId,
          pdfUrl: url,
          fileName,
          action: sourcePdfUrl ? "imported" : "generated",
          uploadedBy: user.id,
          uploaderName: user.name,
        });
      }
    } catch (e) {
      toast({ title: "PDF gerado, mas falhou ao salvar", description: (e as Error).message, variant: "destructive" });
    }

    setCreating(false);
    onComplete();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Calculator className="h-5 w-5" /> {t("newProposal")} — {t("unit")} {unit.number}
          </DialogTitle>
          <DialogDescription>{propertyName} • {unit.tower} • {unit.typology} • {unit.area}m²</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Client */}
          <div className="space-y-1.5">
            <Label>{t("selectClient")}</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger><SelectValue placeholder={t("selectClient")} /></SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name} — {c.cpfCnpj}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Pricing */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>{t("originalPrice")}</Label>
              <p className="text-sm font-medium text-foreground">{formatCurrency(unit.price)}</p>
            </div>
            <div className="space-y-1.5">
              <Label>{t("discountPercent")}</Label>
              <Input type="number" min={0} max={30} value={discountPercent} onChange={(e) => setDiscountPercent(parseFloat(e.target.value) || 0)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("finalPrice")}</Label>
              <p className="text-lg font-display font-bold text-foreground">{formatCurrency(finalPrice)}</p>
            </div>
          </div>

          <Separator />

          {/* Payment conditions */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label>{t("downPaymentPercent")}</Label>
              <Input type="number" min={0} max={100} value={downPaymentPercent} onChange={(e) => setDownPaymentPercent(parseFloat(e.target.value) || 0)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("installmentsCount")}</Label>
              <Input type="number" min={1} max={420} value={installments} onChange={(e) => setInstallments(parseInt(e.target.value) || 1)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("balloonPercent")}</Label>
              <Input type="number" min={0} max={50} value={balloonPercent} onChange={(e) => setBalloonPercent(parseFloat(e.target.value) || 0)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("monthlyInterest")}</Label>
              <Input type="number" step={0.01} min={0} value={interestRate} onChange={(e) => setInterestRate(parseFloat(e.target.value) || 0)} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>{t("paymentMethod")}</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as "sac" | "price")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="price">Price</SelectItem>
                  <SelectItem value="sac">SAC</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("indexer")}</Label>
              <Select value={indexer} onValueChange={(v) => setIndexer(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("noIndexer")}</SelectItem>
                  <SelectItem value="incc">INCC</SelectItem>
                  <SelectItem value="ipca">IPCA</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("proposalValidity")}</Label>
              <Select value={String(validityDays)} onValueChange={(v) => setValidityDays(parseInt(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 {t("days")}</SelectItem>
                  <SelectItem value="7">7 {t("days")}</SelectItem>
                  <SelectItem value="15">15 {t("days")}</SelectItem>
                  <SelectItem value="30">30 {t("days")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          {/* Summary */}
          <div className="p-4 rounded-lg bg-secondary space-y-2">
            <h4 className="font-display font-semibold text-sm">{t("paymentSummary")}</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span className="text-muted-foreground">{t("downPayment")}:</span>
              <span className="font-medium text-right">{formatCurrency(downPayment)} ({downPaymentPercent}%)</span>
              <span className="text-muted-foreground">{t("installmentsLabel")}:</span>
              <span className="font-medium text-right">{installments}x {formatCurrency(installmentValue)}</span>
              {balloon > 0 && (
                <>
                  <span className="text-muted-foreground">{t("balloon")}:</span>
                  <span className="font-medium text-right">{formatCurrency(balloon)} ({balloonPercent}%)</span>
                </>
              )}
              <span className="text-muted-foreground font-semibold">{t("totalPaid")}:</span>
              <span className="font-bold text-right">{formatCurrency(totalPaid)}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t("observations")}</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>{t("cancel")}</Button>
          <Button onClick={handleCreate} disabled={!clientId || creating}>
            {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t("createProposal")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
