import { useI18n } from "@/i18n/useI18n";
import { useProposals } from "@/contexts/ProposalContext";
import { Proposal, ProposalStatus } from "@/types/property";
import { formatCurrency } from "@/data/mockData";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { FileText, Send, CheckCircle, XCircle, Clock, Download } from "lucide-react";

const statusConfig: Record<ProposalStatus, { icon: typeof FileText; class: string }> = {
  draft: { icon: FileText, class: "bg-muted text-muted-foreground" },
  sent: { icon: Send, class: "bg-primary text-primary-foreground" },
  accepted: { icon: CheckCircle, class: "bg-unit-available text-primary-foreground" },
  rejected: { icon: XCircle, class: "bg-unit-sold text-primary-foreground" },
};

interface ProposalListProps {
  unitId: string;
}

export function ProposalList({ unitId }: ProposalListProps) {
  const { t } = useI18n();
  const { getProposalsByUnit, updateProposalStatus } = useProposals();
  const { canEditPrice } = useAuth();
  const proposals = getProposalsByUnit(unitId);

  if (proposals.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-4">
        {t("noProposals")}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {proposals.map((proposal) => {
        const config = statusConfig[proposal.status];
        const Icon = config.icon;
        const isExpired = new Date(proposal.validUntil) < new Date() && proposal.status !== "accepted" && proposal.status !== "rejected";

        return (
          <Card key={proposal.id} className="overflow-hidden">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge className={config.class}>
                    <Icon className="h-3 w-3 mr-1" />
                    {t(proposal.status as any)}
                  </Badge>
                  {isExpired && (
                    <Badge variant="outline" className="text-destructive border-destructive">
                      {t("expired")}
                    </Badge>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(proposal.createdAt).toLocaleDateString("pt-BR")}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">{t("clientName")}</p>
                  <p className="font-medium">{proposal.clientName}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("finalPrice")}</p>
                  <p className="font-display font-bold">{formatCurrency(proposal.finalPrice)}</p>
                </div>
                {proposal.discountPercent > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground">{t("discountPercent")}</p>
                    <p className="font-medium">{proposal.discountPercent}%</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground">{t("paymentMethod")}</p>
                  <p className="font-medium uppercase">{proposal.paymentCondition.method}</p>
                </div>
              </div>

              <div className="text-xs text-muted-foreground">
                {t("downPayment")}: {formatCurrency(proposal.paymentCondition.downPayment)} •{" "}
                {proposal.paymentCondition.installments}x {formatCurrency(proposal.paymentCondition.installmentValue)}
                {proposal.paymentCondition.balloon > 0 && ` • ${t("balloon")}: ${formatCurrency(proposal.paymentCondition.balloon)}`}
              </div>

              {canEditPrice && (proposal.status === "draft" || proposal.status === "sent") && (
                <>
                  <Separator />
                  <div className="flex gap-2">
                    {proposal.pdfUrl && (
                      <Button size="sm" variant="outline" className="gap-1" asChild>
                        <a href={proposal.pdfUrl} target="_blank" rel="noopener noreferrer">
                          <Download className="h-3 w-3" /> PDF
                        </a>
                      </Button>
                    )}
                    {proposal.status === "draft" && (
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => updateProposalStatus(proposal.id, "sent")}>
                        <Send className="h-3 w-3" /> {t("sendProposal")}
                      </Button>
                    )}
                    {proposal.status === "sent" && (
                      <>
                        <Button size="sm" className="gap-1 bg-unit-available hover:bg-unit-available/90" onClick={() => updateProposalStatus(proposal.id, "accepted")}>
                          <CheckCircle className="h-3 w-3" /> {t("acceptProposal")}
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1 text-destructive" onClick={() => updateProposalStatus(proposal.id, "rejected")}>
                          <XCircle className="h-3 w-3" /> {t("rejectProposal")}
                        </Button>
                      </>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
