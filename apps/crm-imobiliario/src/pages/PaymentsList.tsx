import { useState, useMemo } from "react";
import { useI18n } from "@/i18n/useI18n";
import { useFinancial } from "@/contexts/FinancialContext";
import { useProperties } from "@/contexts/PropertyContext";
import { CreditCard, Filter, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function formatCurrency(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function PaymentsList() {
  const { t } = useI18n();
  const { payments, markPaymentPaid } = useFinancial();
  const { properties } = useProperties();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [propertyFilter, setPropertyFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    return payments.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (propertyFilter !== "all" && p.propertyId !== propertyFilter) return false;
      return true;
    });
  }, [payments, statusFilter, propertyFilter]);

  const totalReceived = useMemo(() => filtered.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0), [filtered]);
  const totalPending = useMemo(() => filtered.filter((p) => p.status === "pending").reduce((s, p) => s + p.amount, 0), [filtered]);
  const totalOverdue = useMemo(() => filtered.filter((p) => p.status === "overdue").reduce((s, p) => s + p.amount, 0), [filtered]);

  const kpis = [
    { label: t("totalReceived"), value: formatCurrency(totalReceived), icon: CheckCircle2, accent: "text-green-600" },
    { label: t("totalPending"), value: formatCurrency(totalPending), icon: Clock, accent: "text-yellow-600" },
    { label: t("totalOverdue"), value: formatCurrency(totalOverdue), icon: AlertCircle, accent: "text-red-600" },
  ];

  const statusBadgeMap: Record<string, string> = {
    paid: "bg-green-100 text-green-700",
    pending: "bg-yellow-100 text-yellow-700",
    overdue: "bg-red-100 text-red-700",
  };

  const typeLabel = (type: string, num?: number) => {
    if (type === "signal") return t("signal");
    if (type === "balloon") return t("balloon");
    return `${t("installment")} ${num ?? ""}`;
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-display font-bold text-foreground">{t("allPayments")}</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="flex items-center gap-4 p-5">
              <k.icon className={`h-8 w-8 ${k.accent}`} />
              <div>
                <p className="text-sm text-muted-foreground">{k.label}</p>
                <p className="text-xl font-bold text-foreground">{k.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={propertyFilter} onValueChange={setPropertyFilter}>
          <SelectTrigger className="w-[220px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder={t("filterByProperty")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allProperties_filter")}</SelectItem>
            {properties.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t("filterByStatus")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allStatuses")}</SelectItem>
            <SelectItem value="paid">{t("paid")}</SelectItem>
            <SelectItem value="pending">{t("pending")}</SelectItem>
            <SelectItem value="overdue">{t("overdue")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <CreditCard className="h-12 w-12 mb-3 opacity-40" />
              <p className="text-lg font-medium">{t("noPaymentsFound")}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("property")}</TableHead>
                  <TableHead>{t("unit")}</TableHead>
                  <TableHead>{t("client")}</TableHead>
                  <TableHead>{t("paymentType")}</TableHead>
                  <TableHead className="text-right">{t("amount")}</TableHead>
                  <TableHead>{t("dueDate")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                  <TableHead>{t("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.propertyName}</TableCell>
                    <TableCell>{p.unitNumber}</TableCell>
                    <TableCell>{p.clientName}</TableCell>
                    <TableCell>{typeLabel(p.type, p.installmentNumber)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(p.amount)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(p.dueDate).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusBadgeMap[p.status]}>{t(p.status as any)}</Badge>
                    </TableCell>
                    <TableCell>
                      {p.status !== "paid" && (
                        <Button size="sm" variant="outline" onClick={() => markPaymentPaid(p.id)}>
                          {t("markPaid")}
                        </Button>
                      )}
                      {p.status === "paid" && p.paidAt && (
                        <span className="text-xs text-muted-foreground">
                          {new Date(p.paidAt).toLocaleDateString("pt-BR")}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
