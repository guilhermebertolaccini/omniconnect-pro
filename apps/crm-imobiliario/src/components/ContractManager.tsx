import { useI18n } from "@/i18n/useI18n";
import { useContracts } from "@/contexts/ContractContext";
import { useClients } from "@/contexts/ClientContext";
import { useProposals } from "@/contexts/ProposalContext";
import { useProperties } from "@/contexts/PropertyContext";
import { useAuth } from "@/contexts/AuthContext";
import { useChangeHistory } from "@/contexts/ChangeHistoryContext";
import { useFinancial } from "@/contexts/FinancialContext";
import { Proposal, Contract, ContractStatus } from "@/types/property";
import { formatCurrency } from "@/data/mockData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { useState } from "react";
import { FileSignature, Check, Clock, PenTool, FileText, Eye, Download } from "lucide-react";
import { generateContractPdf } from "@/lib/contractPdf";
import { uploadPdf } from "@/lib/pdfStorage";
import { recordDocumentVersion } from "@/lib/documentVersions";

interface ContractManagerProps {
  unitId: string;
  propertyId: string;
}

const statusBadge: Record<ContractStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  review: "bg-primary text-primary-foreground",
  pending_signature: "bg-unit-reserved text-primary-foreground",
  signed: "bg-unit-available text-primary-foreground",
};

export function ContractManager({ unitId, propertyId }: ContractManagerProps) {
  const { t } = useI18n();
  const { contracts, addContract, updateContractStatus, signContract, getContractsByUnit, updateContractPdfUrl } = useContracts();
  const { getProposalsByUnit } = useProposals();
  const { getClient } = useClients();
  const { updateUnitStatus } = useProperties();
  const { canEditPrice, user } = useAuth();
  const { addChange } = useChangeHistory();
  const { generatePaymentsFromContract, addCommission, getCommissionConfig } = useFinancial();
  const [previewContract, setPreviewContract] = useState<Contract | null>(null);
  const [signDialogContract, setSignDialogContract] = useState<Contract | null>(null);

  const unitContracts = getContractsByUnit(unitId);
  const acceptedProposals = getProposalsByUnit(unitId).filter((p) => p.status === "accepted");

  const handleGenerateContract = async (proposal: Proposal) => {
    const client = getClient(proposal.clientId);
    if (!client || !user) return;

    const draft: Omit<Contract, "id"> = {
      proposalId: proposal.id,
      propertyId: proposal.propertyId,
      propertyName: proposal.propertyName,
      unitId: proposal.unitId,
      unitNumber: proposal.unitNumber,
      clientId: proposal.clientId,
      clientName: proposal.clientName,
      clientCpfCnpj: client.cpfCnpj,
      finalPrice: proposal.finalPrice,
      paymentCondition: proposal.paymentCondition,
      status: "draft",
      signatures: [
        { role: "buyer", name: client.name, signed: false },
        { role: "seller", name: "Tática Imóveis", signed: false },
        { role: "witness1", name: "", signed: false },
        { role: "witness2", name: "", signed: false },
      ],
      createdAt: new Date().toISOString(),
      createdBy: user.name,
    };

    const newId = await addContract(draft);
    if (!newId) return;
    addChange({
      entityType: "contract",
      entityId: newId,
      field: "status",
      oldValue: "",
      newValue: t("draft"),
      userId: user.id,
      userName: user.name,
    });

    // Generate PDF and upload
    try {
      const blob = generateContractPdf({ ...(draft as Contract), id: newId });
      const fileName = `contrato-${proposal.unitNumber}.pdf`;
      const url = await uploadPdf(user.id, "contracts", fileName, blob);
      if (url) {
        await updateContractPdfUrl(newId, url);
        await recordDocumentVersion({
          parentType: "contract", parentId: newId, pdfUrl: url, fileName,
          action: "generated", uploadedBy: user.id, uploaderName: user.name,
        });
      }
    } catch (e) {
      // non-fatal
    }
  };

  const handleSendToReview = (contract: Contract) => {
    updateContractStatus(contract.id, "review");
  };

  const handleSendToSignature = (contract: Contract) => {
    updateContractStatus(contract.id, "pending_signature");
  };

  const handleSign = async (contract: Contract, role: string) => {
    await signContract(contract.id, role);

    // Check if all signed after this
    const updated = contracts.find((c) => c.id === contract.id);
    if (updated) {
      const sigs = updated.signatures.map((s) =>
        s.role === role ? { ...s, signed: true } : s
      );
      if (sigs.every((s) => s.signed)) {
        // Auto-mark unit as sold
        updateUnitStatus(propertyId, unitId, "sold");

        // Re-generate signed contract PDF
        try {
          const fullySigned: Contract = { ...contract, signatures: sigs as any, status: "signed" };
          const blob = generateContractPdf(fullySigned);
          if (user) {
            const fileName = `contrato-assinado-${contract.unitNumber}.pdf`;
            const url = await uploadPdf(user.id, "contracts", fileName, blob);
            if (url) {
              await updateContractPdfUrl(contract.id, url);
              await recordDocumentVersion({
                parentType: "contract", parentId: contract.id, pdfUrl: url, fileName,
                action: "generated", uploadedBy: user.id, uploaderName: user.name,
              });
            }
          }
        } catch (_) {}

        // Generate payments from contract
        generatePaymentsFromContract({
          id: contract.id,
          propertyId: contract.propertyId,
          propertyName: contract.propertyName,
          unitId: contract.unitId,
          unitNumber: contract.unitNumber,
          clientId: contract.clientId,
          clientName: contract.clientName,
          finalPrice: contract.finalPrice,
          paymentCondition: contract.paymentCondition,
        });

        // Generate broker commission
        const commissionPercent = getCommissionConfig(contract.propertyId);
        if (user) {
          addCommission({
            id: `comm-${Date.now()}`,
            propertyId: contract.propertyId,
            propertyName: contract.propertyName,
            unitId: contract.unitId,
            unitNumber: contract.unitNumber,
            brokerId: user.id,
            brokerName: user.name,
            salePrice: contract.finalPrice,
            commissionPercent,
            commissionValue: contract.finalPrice * (commissionPercent / 100),
            status: "pending",
          });

          addChange({
            entityType: "unit",
            entityId: unitId,
            field: "status",
            oldValue: t("reserved"),
            newValue: t("sold"),
            userId: user.id,
            userName: user.name,
          });
        }
      }
    }
  };

  return (
    <div className="space-y-3">
      {/* Generate from accepted proposals */}
      {canEditPrice && acceptedProposals.length > 0 && (
        <div className="space-y-2">
          {acceptedProposals
            .filter((p) => !unitContracts.some((c) => c.proposalId === p.id))
            .map((proposal) => (
              <Button
                key={proposal.id}
                variant="outline"
                size="sm"
                className="w-full gap-1"
                onClick={() => handleGenerateContract(proposal)}
              >
                <FileSignature className="h-3.5 w-3.5" /> {t("generateContract")}
              </Button>
            ))}
        </div>
      )}

      {unitContracts.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-2">{t("noContracts")}</p>
      ) : (
        unitContracts.map((contract) => (
          <Card key={contract.id}>
            <CardContent className="p-3 space-y-3">
              <div className="flex items-center justify-between">
                <Badge className={statusBadge[contract.status]}>{t(contract.status as any)}</Badge>
                <span className="text-xs text-muted-foreground">
                  {new Date(contract.createdAt).toLocaleDateString("pt-BR")}
                </span>
              </div>

              <div className="text-sm">
                <p className="font-medium">{contract.clientName}</p>
                <p className="text-xs text-muted-foreground">{contract.clientCpfCnpj}</p>
                <p className="font-display font-bold mt-1">{formatCurrency(contract.finalPrice)}</p>
              </div>

              {/* Signatures status */}
              <div className="space-y-1">
                {contract.signatures.map((sig) => (
                  <div key={sig.role} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground capitalize">{t(sig.role as any)}</span>
                    {sig.signed ? (
                      <span className="text-unit-available flex items-center gap-1">
                        <Check className="h-3 w-3" /> {t("signed")}
                      </span>
                    ) : (
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {t("pending")}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {canEditPrice && (
                <>
                  <Separator />
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => setPreviewContract(contract)}>
                      <Eye className="h-3 w-3" /> {t("preview")}
                    </Button>
                    {contract.pdfUrl && (
                      <Button size="sm" variant="outline" className="gap-1" asChild>
                        <a href={contract.pdfUrl} target="_blank" rel="noopener noreferrer">
                          <Download className="h-3 w-3" /> PDF
                        </a>
                      </Button>
                    )}
                    {contract.status === "draft" && (
                      <Button size="sm" variant="outline" onClick={() => handleSendToReview(contract)}>
                        {t("sendToReview")}
                      </Button>
                    )}
                    {contract.status === "review" && (
                      <Button size="sm" onClick={() => handleSendToSignature(contract)}>
                        {t("sendToSignature")}
                      </Button>
                    )}
                    {contract.status === "pending_signature" && (
                      <Button size="sm" className="gap-1" onClick={() => setSignDialogContract(contract)}>
                        <PenTool className="h-3 w-3" /> {t("signNow")}
                      </Button>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        ))
      )}

      {/* Contract Preview Dialog */}
      <Dialog open={!!previewContract} onOpenChange={() => setPreviewContract(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">{t("contractPreview")}</DialogTitle>
          </DialogHeader>
          {previewContract && (
            <div className="border rounded-lg p-6 space-y-4 bg-card text-sm font-serif leading-relaxed">
              <h2 className="text-center text-lg font-bold font-display">{t("saleContract")}</h2>

              <p>{t("contractIntro")}</p>

              <div className="space-y-1">
                <p><strong>{t("seller")}:</strong> Tática Imóveis LTDA</p>
                <p><strong>{t("buyer")}:</strong> {previewContract.clientName} — CPF/CNPJ: {previewContract.clientCpfCnpj}</p>
              </div>

              <div className="space-y-1">
                <p><strong>{t("propertyObj")}:</strong> {previewContract.propertyName} — {t("unit")} {previewContract.unitNumber}</p>
                <p><strong>{t("finalPrice")}:</strong> {formatCurrency(previewContract.finalPrice)}</p>
              </div>

              <div className="space-y-1">
                <p><strong>{t("paymentConditions")}:</strong></p>
                <ul className="list-disc ml-5 space-y-0.5">
                  <li>{t("downPayment")}: {formatCurrency(previewContract.paymentCondition.downPayment)} ({previewContract.paymentCondition.downPaymentPercent}%)</li>
                  <li>{t("installmentsLabel")}: {previewContract.paymentCondition.installments}x {formatCurrency(previewContract.paymentCondition.installmentValue)}</li>
                  {previewContract.paymentCondition.balloon > 0 && (
                    <li>{t("balloon")}: {formatCurrency(previewContract.paymentCondition.balloon)}</li>
                  )}
                  <li>{t("paymentMethod")}: {previewContract.paymentCondition.method.toUpperCase()}</li>
                  <li>{t("monthlyInterest")}: {previewContract.paymentCondition.interestRate}%</li>
                </ul>
              </div>

              <p>{t("contractClause1")}</p>
              <p>{t("contractClause2")}</p>

              <div className="mt-8 grid grid-cols-2 gap-8">
                {previewContract.signatures.map((sig) => (
                  <div key={sig.role} className="text-center">
                    <div className="border-b border-foreground mb-1 h-10 flex items-end justify-center">
                      {sig.signed && <span className="text-unit-available text-xs mb-1">✓ {t("signed")}</span>}
                    </div>
                    <p className="text-xs text-muted-foreground capitalize">{t(sig.role as any)}{sig.name ? `: ${sig.name}` : ""}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Sign Dialog */}
      <Dialog open={!!signDialogContract} onOpenChange={() => setSignDialogContract(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <PenTool className="h-5 w-5" /> {t("digitalSignature")}
            </DialogTitle>
            <DialogDescription>{t("signatureDesc")}</DialogDescription>
          </DialogHeader>
          {signDialogContract && (
            <div className="space-y-3">
              {signDialogContract.signatures.map((sig) => (
                <div key={sig.role} className="flex items-center justify-between p-3 rounded-lg bg-secondary">
                  <div>
                    <p className="text-sm font-medium capitalize">{t(sig.role as any)}</p>
                    <p className="text-xs text-muted-foreground">{sig.name || "—"}</p>
                  </div>
                  {sig.signed ? (
                    <Badge className="bg-unit-available text-primary-foreground gap-1">
                      <Check className="h-3 w-3" /> {t("signed")}
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      className="gap-1"
                      onClick={() => handleSign(signDialogContract, sig.role)}
                    >
                      <PenTool className="h-3 w-3" /> {t("sign")}
                    </Button>
                  )}
                </div>
              ))}
              <p className="text-xs text-muted-foreground text-center">{t("signatureMockNotice")}</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSignDialogContract(null)}>{t("close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
