import { useState } from "react";
import { useI18n } from "@/i18n/useI18n";
import { useProperties } from "@/contexts/PropertyContext";
import { useClients } from "@/contexts/ClientContext";
import { useAuth } from "@/contexts/AuthContext";
import { useChangeHistory } from "@/contexts/ChangeHistoryContext";
import { Unit, UnitStatus } from "@/types/property";
import { formatCurrency } from "@/data/mockData";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ReservationDialog } from "@/components/ReservationDialog";
import { ProposalDialog } from "@/components/ProposalDialog";
import { ProposalList } from "@/components/ProposalList";
import { ContractManager } from "@/components/ContractManager";
import { PdfImportButton } from "@/components/PdfImportButton";
import { PaymentTracker } from "@/components/PaymentTracker";
import { ChangeHistory } from "@/components/ChangeHistory";
import { useContracts } from "@/contexts/ContractContext";
import { User, Clock, AlertTriangle, FileText, FileSignature, DollarSign } from "lucide-react";

const statusBadge: Record<UnitStatus, string> = {
  available: "bg-unit-available text-primary-foreground",
  reserved: "bg-unit-reserved text-primary-foreground",
  sold: "bg-unit-sold text-primary-foreground",
};

interface UnitDrawerProps {
  unit: Unit | null;
  propertyId: string;
  propertyName: string;
  onClose: () => void;
}

export function UnitDrawer({ unit, propertyId, propertyName, onClose }: UnitDrawerProps) {
  const { t } = useI18n();
  const { updateUnitStatus, clearUnitReservation, updateUnitPrice } = useProperties();
  const { getClient } = useClients();
  const { canEditPrice, canChangeStatus, user } = useAuth();
  const { getContractsByUnit } = useContracts();
  const { addChange } = useChangeHistory();
  const [editingPrice, setEditingPrice] = useState(false);
  const [newPrice, setNewPrice] = useState("");
  const [reservationOpen, setReservationOpen] = useState(false);
  const [proposalOpen, setProposalOpen] = useState(false);

  if (!unit) return null;

  const client = unit.clientId ? getClient(unit.clientId) : null;
  const isExpired = unit.reservationExpiry ? new Date(unit.reservationExpiry) < new Date() : false;

  const handleStatusChange = (status: UnitStatus) => {
    if (status === "reserved" && unit.status === "available") {
      setReservationOpen(true);
      return;
    }
    if (user) {
      addChange({ entityType: "unit", entityId: unit.id, field: "status", oldValue: t(unit.status as any), newValue: t(status as any), userId: user.id, userName: user.name });
    }
    updateUnitStatus(propertyId, unit.id, status);
  };

  const handlePriceSave = () => {
    const price = parseFloat(newPrice);
    if (!isNaN(price) && price > 0) {
      if (user) {
        addChange({ entityType: "unit", entityId: unit.id, field: "price", oldValue: formatCurrency(unit.price), newValue: formatCurrency(price), userId: user.id, userName: user.name });
      }
      updateUnitPrice(propertyId, unit.id, price);
      setEditingPrice(false);
    }
  };

  const handleCancelReservation = () => {
    if (user) {
      addChange({ entityType: "unit", entityId: unit.id, field: "status", oldValue: t("reserved"), newValue: t("available"), userId: user.id, userName: user.name });
    }
    clearUnitReservation(propertyId, unit.id);
  };

  return (
    <>
      <Sheet open={!!unit} onOpenChange={() => onClose()}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="font-display">{t("unit")} {unit.number}</SheetTitle>
            <SheetDescription>{unit.tower}</SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t("status")}</span>
              <div className="flex items-center gap-2">
                <Badge className={statusBadge[unit.status]}>{t(unit.status as any)}</Badge>
                {unit.status === "reserved" && isExpired && (
                  <Badge variant="outline" className="text-destructive border-destructive gap-1">
                    <AlertTriangle className="h-3 w-3" /> {t("expired")}
                  </Badge>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div><p className="text-xs text-muted-foreground">{t("typology")}</p><p className="text-sm font-medium text-foreground">{unit.typology}</p></div>
              <div><p className="text-xs text-muted-foreground">{t("area")}</p><p className="text-sm font-medium text-foreground">{unit.area}m²</p></div>
              <div><p className="text-xs text-muted-foreground">{t("floor")}</p><p className="text-sm font-medium text-foreground">{unit.floor}º</p></div>
              <div><p className="text-xs text-muted-foreground">{t("price")}</p><p className="text-sm font-medium text-foreground">{formatCurrency(unit.price)}</p></div>
            </div>

            {unit.status === "reserved" && client && (
              <div className="p-3 rounded-lg bg-secondary space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium"><User className="h-4 w-4 text-muted-foreground" />{t("reservedBy")}</div>
                <p className="text-sm text-foreground font-medium">{client.name}</p>
                <p className="text-xs text-muted-foreground">{client.cpfCnpj} • {client.phone}</p>
                {unit.reservationExpiry && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3 w-3" />{t("expiresAt")}: {new Date(unit.reservationExpiry).toLocaleString("pt-BR")}</div>
                )}
                <div className="flex gap-2 mt-2">
                  {canChangeStatus && <Button variant="outline" size="sm" onClick={handleCancelReservation}>{t("cancelReservation")}</Button>}
                  {canEditPrice && <Button size="sm" className="gap-1" onClick={() => setProposalOpen(true)}><FileText className="h-3 w-3" /> {t("newProposal")}</Button>}
                </div>
              </div>
            )}

            {canChangeStatus && (
              <div className="space-y-2">
                <Label className="text-sm">{t("changeStatus")}</Label>
                <Select value={unit.status} onValueChange={(v) => handleStatusChange(v as UnitStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">{t("available")}</SelectItem>
                    <SelectItem value="reserved">{t("reserved")}</SelectItem>
                    <SelectItem value="sold">{t("sold")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {canEditPrice && (
              <div className="space-y-2">
                <Label className="text-sm">{t("editPrice")}</Label>
                {editingPrice ? (
                  <div className="flex gap-2">
                    <Input type="number" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} placeholder={String(unit.price)} />
                    <Button size="sm" onClick={handlePriceSave}>{t("save")}</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingPrice(false)}>{t("cancel")}</Button>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" className="w-full" onClick={() => { setNewPrice(String(unit.price)); setEditingPrice(true); }}>{t("editPrice")}</Button>
                )}
              </div>
            )}

            <Separator />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-display">{t("proposals")}</Label>
                {canEditPrice && (
                  <PdfImportButton unit={unit} propertyId={propertyId} propertyName={propertyName} kind="proposal" />
                )}
              </div>
              <ProposalList unitId={unit.id} />
            </div>

            <Separator />
            <div className="space-y-2">
              <Label className="text-sm font-display">{t("contracts")}</Label>
              <ContractManager unitId={unit.id} propertyId={propertyId} />
            </div>

            {unit.status === "sold" && (
              <>
                <Separator />
                <div className="space-y-2">
                  <Label className="text-sm font-display flex items-center gap-1">
                    <DollarSign className="h-3.5 w-3.5" /> {t("paymentTracking")}
                  </Label>
                  {(() => {
                    const unitContracts = getContractsByUnit(unit.id);
                    const signedContract = unitContracts.find((c) => c.status === "signed");
                    if (!signedContract) return <p className="text-sm text-muted-foreground">{t("noPayments")}</p>;
                    return <PaymentTracker contractId={signedContract.id} />;
                  })()}
                </div>
              </>
            )}

            <Separator />
            <ChangeHistory entityId={unit.id} />
          </div>
        </SheetContent>
      </Sheet>

      <ReservationDialog open={reservationOpen} onOpenChange={setReservationOpen} unit={unit} propertyId={propertyId} onComplete={() => {}} />
      <ProposalDialog open={proposalOpen} onOpenChange={setProposalOpen} unit={unit} propertyId={propertyId} propertyName={propertyName} onComplete={() => {}} />
    </>
  );
}
