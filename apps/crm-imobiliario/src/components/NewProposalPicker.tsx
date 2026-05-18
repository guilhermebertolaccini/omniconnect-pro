import { useState, useMemo } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useProperties } from "@/contexts/PropertyContext";
import { ProposalDialog } from "@/components/ProposalDialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

export function NewProposalPicker({ open, onOpenChange, onCreated }: Props) {
  const { properties } = useProperties();
  const [propertyId, setPropertyId] = useState<string>("");
  const [unitId, setUnitId] = useState<string>("");
  const [openProposal, setOpenProposal] = useState(false);

  const property = useMemo(() => properties.find((p) => p.id === propertyId), [properties, propertyId]);
  const availableUnits = useMemo(
    () => (property?.units ?? []).filter((u) => u.status !== "sold"),
    [property]
  );
  const unit = useMemo(() => availableUnits.find((u) => u.id === unitId), [availableUnits, unitId]);

  const proceed = () => {
    if (!property || !unit) return;
    onOpenChange(false);
    setOpenProposal(true);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Nova proposta</DialogTitle>
            <DialogDescription>Selecione o empreendimento e a unidade.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Empreendimento</Label>
              <Select value={propertyId} onValueChange={(v) => { setPropertyId(v); setUnitId(""); }}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {properties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Unidade</Label>
              <Select value={unitId} onValueChange={setUnitId} disabled={!property}>
                <SelectTrigger><SelectValue placeholder={property ? "Selecione..." : "Escolha o empreendimento primeiro"} /></SelectTrigger>
                <SelectContent>
                  {availableUnits.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.tower ? `${u.tower} • ` : ""}{u.number} — {u.typology} ({u.status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={proceed} disabled={!unit}>Continuar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {property && unit && (
        <ProposalDialog
          open={openProposal}
          onOpenChange={setOpenProposal}
          unit={unit}
          propertyId={property.id}
          propertyName={property.name}
          onComplete={() => onCreated?.()}
        />
      )}
    </>
  );
}