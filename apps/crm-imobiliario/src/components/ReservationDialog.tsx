import { useState } from "react";
import { useI18n } from "@/i18n/useI18n";
import { useClients } from "@/contexts/ClientContext";
import { useProperties } from "@/contexts/PropertyContext";
import { useChangeHistory } from "@/contexts/ChangeHistoryContext";
import { useAuth } from "@/contexts/AuthContext";
import { Unit, Client } from "@/types/property";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, UserPlus } from "lucide-react";

interface ReservationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unit: Unit;
  propertyId: string;
  onComplete: () => void;
}

export function ReservationDialog({ open, onOpenChange, unit, propertyId, onComplete }: ReservationDialogProps) {
  const { t } = useI18n();
  const { clients, addClient } = useClients();
  const { updateUnitStatus, updateUnitClient } = useProperties();
  const { addChange } = useChangeHistory();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [mode, setMode] = useState<"select" | "create">("select");
  const [expiry, setExpiry] = useState("48");
  const [newClient, setNewClient] = useState({ name: "", cpfCnpj: "", phone: "", email: "", income: 0 });

  const filtered = clients.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.cpfCnpj.includes(search)
  );

  const handleReserve = () => {
    let clientId = selectedClientId;

    if (mode === "create") {
      if (!newClient.name || !newClient.cpfCnpj) return;
      clientId = `client-${Date.now()}`;
      addClient({
        id: clientId,
        ...newClient,
        score: "B",
        createdAt: new Date().toISOString(),
      });
    }

    if (!clientId) return;

    const expiryDate = new Date();
    expiryDate.setHours(expiryDate.getHours() + parseInt(expiry));

    updateUnitStatus(propertyId, unit.id, "reserved");
    updateUnitClient(propertyId, unit.id, clientId, expiryDate.toISOString());

    if (user) {
      addChange({
        entityType: "unit",
        entityId: unit.id,
        field: "status",
        oldValue: t("available"),
        newValue: t("reserved"),
        userId: user.id,
        userName: user.name,
      });
    }

    onComplete();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">{t("reserveUnit")} {unit.number}</DialogTitle>
          <DialogDescription>{t("reserveUnitDesc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            <Button
              variant={mode === "select" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("select")}
            >
              {t("selectClient")}
            </Button>
            <Button
              variant={mode === "create" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("create")}
              className="gap-1"
            >
              <UserPlus className="h-3.5 w-3.5" /> {t("newClient")}
            </Button>
          </div>

          {mode === "select" ? (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder={t("searchClients")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="max-h-40 overflow-y-auto space-y-1 border rounded-md p-1">
                {filtered.map((client) => (
                  <button
                    key={client.id}
                    className={`w-full text-left p-2 rounded-md text-sm transition-colors ${
                      selectedClientId === client.id
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted"
                    }`}
                    onClick={() => setSelectedClientId(client.id)}
                  >
                    <div className="font-medium">{client.name}</div>
                    <div className="text-xs opacity-70">{client.cpfCnpj} • {client.phone}</div>
                  </button>
                ))}
                {filtered.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">{t("noClients")}</p>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("clientName")}</Label>
                <Input value={newClient.name} onChange={(e) => setNewClient({ ...newClient, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>CPF/CNPJ</Label>
                <Input value={newClient.cpfCnpj} onChange={(e) => setNewClient({ ...newClient, cpfCnpj: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("phone")}</Label>
                <Input value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={newClient.email} onChange={(e) => setNewClient({ ...newClient, email: e.target.value })} />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>{t("reservationExpiry")}</Label>
            <Select value={expiry} onValueChange={setExpiry}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="24">24 {t("hours")}</SelectItem>
                <SelectItem value="48">48 {t("hours")}</SelectItem>
                <SelectItem value="72">72 {t("hours")}</SelectItem>
                <SelectItem value="168">7 {t("days")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("cancel")}</Button>
          <Button onClick={handleReserve} disabled={mode === "select" && !selectedClientId}>
            {t("confirmReservation")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
