import { useState } from "react";
import { useFinancial } from "@/contexts/FinancialContext";
import { useI18n } from "@/i18n/useI18n";
import { formatCurrency } from "@/data/mockData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Settings, CheckCircle2, Clock } from "lucide-react";

interface CommissionManagerProps {
  propertyId: string;
}

export function CommissionManager({ propertyId }: CommissionManagerProps) {
  const { t } = useI18n();
  const { getCommissionsByProperty, markCommissionPaid, getCommissionConfig, setCommissionConfig } = useFinancial();
  const commissions = getCommissionsByProperty(propertyId);
  const currentPercent = getCommissionConfig(propertyId);
  const [editPercent, setEditPercent] = useState(false);
  const [newPercent, setNewPercent] = useState(currentPercent);

  const totalCommissions = commissions.reduce((s, c) => s + c.commissionValue, 0);
  const totalPaid = commissions.filter((c) => c.status === "paid").reduce((s, c) => s + c.commissionValue, 0);
  const totalPending = totalCommissions - totalPaid;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="font-display text-lg">{t("commissions")}</CardTitle>
          <div className="flex items-center gap-2">
            {editPercent ? (
              <>
                <Input
                  type="number"
                  value={newPercent}
                  onChange={(e) => setNewPercent(Number(e.target.value))}
                  className="w-20 h-8"
                  min={0}
                  max={100}
                  step={0.5}
                />
                <span className="text-sm text-muted-foreground">%</span>
                <Button size="sm" onClick={() => { setCommissionConfig(propertyId, newPercent); setEditPercent(false); }}>
                  {t("save")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditPercent(false)}>{t("cancel")}</Button>
              </>
            ) : (
              <Button size="sm" variant="outline" className="gap-1" onClick={() => { setNewPercent(currentPercent); setEditPercent(true); }}>
                <Settings className="h-3 w-3" />
                {currentPercent}%
              </Button>
            )}
          </div>
        </div>
        <div className="flex gap-4 text-sm">
          <span className="text-muted-foreground">{t("totalCommissions")}: <strong className="text-foreground">{formatCurrency(totalCommissions)}</strong></span>
          <span className="text-muted-foreground">{t("paid")}: <strong className="text-foreground">{formatCurrency(totalPaid)}</strong></span>
          <span className="text-muted-foreground">{t("pending")}: <strong className="text-foreground">{formatCurrency(totalPending)}</strong></span>
        </div>
      </CardHeader>
      <CardContent>
        {commissions.length === 0 ? (
          <p className="text-center text-muted-foreground py-4">{t("noCommissions")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("unit")}</TableHead>
                <TableHead>{t("brokerLabel")}</TableHead>
                <TableHead className="text-right">{t("salePrice")}</TableHead>
                <TableHead className="text-right">{t("commissionValue")}</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {commissions.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.unitNumber}</TableCell>
                  <TableCell>{c.brokerName}</TableCell>
                  <TableCell className="text-right">{formatCurrency(c.salePrice)}</TableCell>
                  <TableCell className="text-right font-semibold">{formatCurrency(c.commissionValue)}</TableCell>
                  <TableCell>
                    <Badge variant={c.status === "paid" ? "default" : "secondary"} className="gap-1">
                      {c.status === "paid" ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                      {c.status === "paid" ? t("paid") : t("pending")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {c.status !== "paid" && (
                      <Button size="sm" variant="outline" onClick={() => markCommissionPaid(c.id)}>
                        {t("markPaid")}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
