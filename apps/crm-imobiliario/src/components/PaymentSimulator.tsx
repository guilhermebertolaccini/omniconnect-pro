import { useState } from "react";
import { useI18n } from "@/i18n/useI18n";
import { formatCurrency } from "@/data/mockData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Calculator, TrendingUp } from "lucide-react";

interface SimulatorProps {
  unitPrice: number;
}

interface SimulationResult {
  month: number;
  payment: number;
  interest: number;
  amortization: number;
  balance: number;
}

export function PaymentSimulator({ unitPrice }: SimulatorProps) {
  const { t } = useI18n();
  const [price, setPrice] = useState(unitPrice);
  const [downPercent, setDownPercent] = useState(20);
  const [installments, setInstallments] = useState(60);
  const [rate, setRate] = useState(0.8);
  const [balloonPercent, setBalloonPercent] = useState(0);
  const [method, setMethod] = useState<"sac" | "price">("price");
  const [indexer, setIndexer] = useState("incc");
  const [showTable, setShowTable] = useState(false);

  const downPayment = price * (downPercent / 100);
  const balloon = price * (balloonPercent / 100);
  const financed = price - downPayment - balloon;
  const monthlyRate = rate / 100;

  const generateSchedule = (): SimulationResult[] => {
    const results: SimulationResult[] = [];
    let balance = financed;

    for (let i = 1; i <= installments; i++) {
      const interest = balance * monthlyRate;
      let amortization: number;
      let payment: number;

      if (method === "sac") {
        amortization = financed / installments;
        payment = amortization + interest;
      } else {
        if (monthlyRate > 0) {
          payment = financed * (monthlyRate * Math.pow(1 + monthlyRate, installments)) / (Math.pow(1 + monthlyRate, installments) - 1);
        } else {
          payment = financed / installments;
        }
        amortization = payment - interest;
      }

      balance -= amortization;
      results.push({
        month: i,
        payment: Math.round(payment * 100) / 100,
        interest: Math.round(interest * 100) / 100,
        amortization: Math.round(amortization * 100) / 100,
        balance: Math.max(0, Math.round(balance * 100) / 100),
      });
    }
    return results;
  };

  const schedule = generateSchedule();
  const firstPayment = schedule[0]?.payment || 0;
  const lastPayment = schedule[schedule.length - 1]?.payment || 0;
  const totalInterest = schedule.reduce((sum, r) => sum + r.interest, 0);
  const totalPaid = downPayment + balloon + schedule.reduce((sum, r) => sum + r.payment, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display flex items-center gap-2">
          <Calculator className="h-5 w-5" /> {t("paymentSimulator")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <Label>{t("price")}</Label>
            <Input type="number" value={price} onChange={(e) => setPrice(parseFloat(e.target.value) || 0)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("downPaymentPercent")}</Label>
            <Input type="number" min={0} max={100} value={downPercent} onChange={(e) => setDownPercent(parseFloat(e.target.value) || 0)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("installmentsCount")}</Label>
            <Input type="number" min={1} max={420} value={installments} onChange={(e) => setInstallments(parseInt(e.target.value) || 1)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("monthlyInterest")} (%)</Label>
            <Input type="number" step={0.01} value={rate} onChange={(e) => setRate(parseFloat(e.target.value) || 0)} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>{t("balloonPercent")}</Label>
            <Input type="number" min={0} max={50} value={balloonPercent} onChange={(e) => setBalloonPercent(parseFloat(e.target.value) || 0)} />
          </div>
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
            <Select value={indexer} onValueChange={setIndexer}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("noIndexer")}</SelectItem>
                <SelectItem value="incc">INCC</SelectItem>
                <SelectItem value="ipca">IPCA</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Separator />

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SummaryCard label={t("downPayment")} value={formatCurrency(downPayment)} sub={`${downPercent}%`} />
          <SummaryCard label={method === "price" ? t("fixedInstallment") : t("firstInstallment")} value={formatCurrency(firstPayment)} sub={`${installments}x`} />
          {method === "sac" && <SummaryCard label={t("lastInstallment")} value={formatCurrency(lastPayment)} sub="" />}
          <SummaryCard label={t("totalInterest")} value={formatCurrency(totalInterest)} sub="" />
          <SummaryCard label={t("totalPaid")} value={formatCurrency(totalPaid)} sub={totalPaid > price ? `+${formatCurrency(totalPaid - price)}` : ""} />
        </div>

        {balloon > 0 && (
          <div className="p-3 rounded-lg bg-secondary text-sm">
            <span className="font-medium">{t("balloon")}:</span> {formatCurrency(balloon)} ({balloonPercent}%)
          </div>
        )}

        <Button variant="outline" className="w-full" onClick={() => setShowTable(!showTable)}>
          <TrendingUp className="h-4 w-4 mr-2" />
          {showTable ? t("hideSchedule") : t("showSchedule")}
        </Button>

        {showTable && (
          <div className="max-h-80 overflow-auto border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>{t("installmentPayment")}</TableHead>
                  <TableHead>{t("interestLabel")}</TableHead>
                  <TableHead>{t("amortization")}</TableHead>
                  <TableHead>{t("balance")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedule.map((r) => (
                  <TableRow key={r.month}>
                    <TableCell className="font-mono">{r.month}</TableCell>
                    <TableCell>{formatCurrency(r.payment)}</TableCell>
                    <TableCell className="text-muted-foreground">{formatCurrency(r.interest)}</TableCell>
                    <TableCell>{formatCurrency(r.amortization)}</TableCell>
                    <TableCell className="font-medium">{formatCurrency(r.balance)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="p-3 rounded-lg bg-secondary">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-display font-bold text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
