import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "@/i18n/useI18n";
import { useProposals } from "@/contexts/ProposalContext";
import { useProperties } from "@/contexts/PropertyContext";
import { FileText, Eye, Filter, Download, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ProposalStatus } from "@/types/property";
import { NewProposalPicker } from "@/components/NewProposalPicker";

const statusBadge: Record<ProposalStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-blue-100 text-blue-700",
  accepted: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

function formatCurrency(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function ProposalsList() {
  const { t } = useI18n();
  const { proposals } = useProposals();
  const { properties } = useProperties();
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [propertyFilter, setPropertyFilter] = useState<string>("all");
  const [pickerOpen, setPickerOpen] = useState(false);

  const filtered = useMemo(() => {
    return proposals.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (propertyFilter !== "all" && p.propertyId !== propertyFilter) return false;
      return true;
    });
  }, [proposals, statusFilter, propertyFilter]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-bold text-foreground">{t("allProposals")}</h1>
        <Button onClick={() => setPickerOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />Nova proposta
        </Button>
      </div>
      <NewProposalPicker open={pickerOpen} onOpenChange={setPickerOpen} />

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
            <SelectItem value="sent">{t("sent")}</SelectItem>
            <SelectItem value="accepted">{t("accepted")}</SelectItem>
            <SelectItem value="rejected">{t("rejected")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <FileText className="h-12 w-12 mb-3 opacity-40" />
              <p className="text-lg font-medium">{t("noProposalsFound")}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("property")}</TableHead>
                  <TableHead>{t("unit")}</TableHead>
                  <TableHead>{t("client")}</TableHead>
                  <TableHead className="text-right">{t("finalPrice")}</TableHead>
                  <TableHead className="text-right">{t("discount")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                  <TableHead>{t("date")}</TableHead>
                  <TableHead>{t("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/proposals/${p.id}`)}>
                    <TableCell className="font-medium">{p.propertyName}</TableCell>
                    <TableCell>{p.unitNumber}</TableCell>
                    <TableCell>{p.clientName}</TableCell>
                    <TableCell className="text-right">{formatCurrency(p.finalPrice)}</TableCell>
                    <TableCell className="text-right">{p.discountPercent > 0 ? `${p.discountPercent}%` : "—"}</TableCell>
                    <TableCell>
                      <Badge className={statusBadge[p.status]}>{t(p.status)}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(p.createdAt).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-1">
                        {p.pdfUrl && (
                          <Button variant="ghost" size="sm" asChild>
                            <a href={p.pdfUrl} target="_blank" rel="noopener noreferrer" title="Baixar PDF">
                              <Download className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/proposals/${p.id}`)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          Ver
                        </Button>
                      </div>
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
