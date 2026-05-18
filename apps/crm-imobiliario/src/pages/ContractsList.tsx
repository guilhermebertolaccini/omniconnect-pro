import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "@/i18n/useI18n";
import { useContracts } from "@/contexts/ContractContext";
import { useProperties } from "@/contexts/PropertyContext";
import { ScrollText, Eye, Filter, Download } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ContractStatus } from "@/types/property";

const statusBadge: Record<ContractStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  review: "bg-yellow-100 text-yellow-700",
  pending_signature: "bg-blue-100 text-blue-700",
  signed: "bg-green-100 text-green-700",
};

function formatCurrency(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function ContractsList() {
  const { t } = useI18n();
  const { contracts, updateContractStatus } = useContracts();
  const { properties } = useProperties();
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [propertyFilter, setPropertyFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    return contracts.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (propertyFilter !== "all" && c.propertyId !== propertyFilter) return false;
      return true;
    });
  }, [contracts, statusFilter, propertyFilter]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-bold text-foreground">{t("allContracts")}</h1>
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
            <SelectItem value="draft">{t("draft")}</SelectItem>
            <SelectItem value="review">{t("review")}</SelectItem>
            <SelectItem value="pending_signature">{t("pending_signature")}</SelectItem>
            <SelectItem value="signed">{t("signed")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <ScrollText className="h-12 w-12 mb-3 opacity-40" />
              <p className="text-lg font-medium">{t("noContractsFound")}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("property")}</TableHead>
                  <TableHead>{t("unit")}</TableHead>
                  <TableHead>{t("client")}</TableHead>
                  <TableHead className="text-right">{t("finalPrice")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                  <TableHead>{t("signatureProgress")}</TableHead>
                  <TableHead>{t("date")}</TableHead>
                  <TableHead>{t("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => {
                  const signedCount = c.signatures.filter((s) => s.signed).length;
                  const totalSigs = c.signatures.length;
                  const sigPercent = totalSigs > 0 ? (signedCount / totalSigs) * 100 : 0;

                  return (
                    <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/contracts/${c.id}`)}>
                      <TableCell className="font-medium">{c.propertyName}</TableCell>
                      <TableCell>{c.unitNumber}</TableCell>
                      <TableCell>{c.clientName}</TableCell>
                      <TableCell className="text-right">{formatCurrency(c.finalPrice)}</TableCell>
                      <TableCell>
                        <Badge className={statusBadge[c.status]}>{t(c.status as any)}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 min-w-[120px]">
                          <Progress value={sigPercent} className="h-2 flex-1" />
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {signedCount}/{totalSigs}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(c.createdAt).toLocaleDateString("pt-BR")}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1">
                          {c.pdfUrl && (
                            <Button variant="ghost" size="sm" asChild>
                              <a href={c.pdfUrl} target="_blank" rel="noopener noreferrer" title="Baixar PDF">
                                <Download className="h-4 w-4" />
                              </a>
                            </Button>
                          )}
                          {c.status === "draft" && (
                            <Button size="sm" variant="outline" onClick={() => updateContractStatus(c.id, "review")}>
                              {t("sendToReview")}
                            </Button>
                          )}
                          {c.status === "review" && (
                            <Button size="sm" variant="outline" onClick={() => updateContractStatus(c.id, "pending_signature")}>
                              {t("sendToSignature")}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/contracts/${c.id}`)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
