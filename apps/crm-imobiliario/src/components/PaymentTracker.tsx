import { useFinancial } from "@/contexts/FinancialContext";
import { useI18n } from "@/i18n/useI18n";
import { formatCurrency } from "@/data/mockData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, AlertTriangle, Clock } from "lucide-react";

interface PaymentTrackerProps {
  contractId: string;
}

export function PaymentTracker({ contractId }: PaymentTrackerProps) {
  const { t } = useI18n();
  const { getPaymentsByContract, markPaymentPaid } = useFinancial();
  const payments = getPaymentsByContract(contractId);

  if (payments.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          {t("noPayments")}
        </CardContent>
      </Card>
    );
  }

  const now = new Date();

  const getStatusInfo = (payment: typeof payments[0]) => {
    if (payment.status === "paid") return { icon: CheckCircle2, label: t("paid"), variant: "default" as const, color: "text-emerald-600" };
    const due = new Date(payment.dueDate);
    if (due < now) return { icon: AlertTriangle, label: t("overdue"), variant: "destructive" as const, color: "text-destructive" };
    return { icon: Clock, label: t("pending"), variant: "secondary" as const, color: "text-muted-foreground" };
  };

  const typeLabel = (type: string, num?: number) => {
    if (type === "signal") return t("downPayment");
    if (type === "balloon") return t("balloon");
    return `${t("installmentPayment")} ${num ?? ""}`;
  };

  const totalDue = payments.filter((p) => p.status !== "paid").reduce((s, p) => s + p.amount, 0);
  const totalPaid = payments.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0);
  const overdueCount = payments.filter((p) => p.status !== "paid" && new Date(p.dueDate) < now).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-lg">{t("paymentTracking")}</CardTitle>
        <div className="flex gap-4 text-sm">
          <span className="text-muted-foreground">{t("totalReceived")}: <strong className="text-foreground">{formatCurrency(totalPaid)}</strong></span>
          <span className="text-muted-foreground">{t("totalPending")}: <strong className="text-foreground">{formatCurrency(totalDue)}</strong></span>
          {overdueCount > 0 && (
            <span className="text-destructive font-medium">{overdueCount} {t("overduePayments")}</span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("paymentType")}</TableHead>
              <TableHead className="text-right">{t("amount")}</TableHead>
              <TableHead>{t("dueDate")}</TableHead>
              <TableHead>{t("status")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map((p) => {
              const info = getStatusInfo(p);
              return (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{typeLabel(p.type, p.installmentNumber)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(p.amount)}</TableCell>
                  <TableCell>{new Date(p.dueDate).toLocaleDateString("pt-BR")}</TableCell>
                  <TableCell>
                    <Badge variant={info.variant} className="gap-1">
                      <info.icon className="h-3 w-3" />
                      {info.label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {p.status !== "paid" && (
                      <Button size="sm" variant="outline" onClick={() => markPaymentPaid(p.id)}>
                        {t("markPaid")}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
