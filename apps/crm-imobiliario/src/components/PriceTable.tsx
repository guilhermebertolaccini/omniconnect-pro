import { useState } from "react";
import { useI18n } from "@/i18n/useI18n";
import { useProperties } from "@/contexts/PropertyContext";
import { useAuth } from "@/contexts/AuthContext";
import { useChangeHistory } from "@/contexts/ChangeHistoryContext";
import { Property, Unit } from "@/types/property";
import { formatCurrency } from "@/data/mockData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Pencil, Check, X } from "lucide-react";

interface PriceTableProps {
  property: Property;
}

export function PriceTable({ property }: PriceTableProps) {
  const { t } = useI18n();
  const { updateUnitPrice } = useProperties();
  const { canEditPrice, user } = useAuth();
  const { addChange } = useChangeHistory();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [filterTower, setFilterTower] = useState("all");
  const [filterTypology, setFilterTypology] = useState("all");

  const towers = property.towers.map((t) => t.name);
  const typologies = [...new Set(property.units.map((u) => u.typology))];

  const filtered = property.units.filter((u) => {
    if (filterTower !== "all" && u.tower !== filterTower) return false;
    if (filterTypology !== "all" && u.typology !== filterTypology) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (a.tower !== b.tower) return a.tower.localeCompare(b.tower);
    if (a.floor !== b.floor) return a.floor - b.floor;
    return a.number.localeCompare(b.number);
  });

  const handleSave = (unit: Unit) => {
    const price = parseFloat(editPrice);
    if (!isNaN(price) && price > 0 && user) {
      addChange({
        entityType: "unit",
        entityId: unit.id,
        field: "price",
        oldValue: formatCurrency(unit.price),
        newValue: formatCurrency(price),
        userId: user.id,
        userName: user.name,
      });
      updateUnitPrice(property.id, unit.id, price);
    }
    setEditingId(null);
  };

  const statusBadgeClass: Record<string, string> = {
    available: "bg-unit-available text-primary-foreground",
    reserved: "bg-unit-reserved text-primary-foreground",
    sold: "bg-unit-sold text-primary-foreground",
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <CardTitle className="font-display">{t("priceTable")}</CardTitle>
          <div className="flex gap-2">
            <Select value={filterTower} onValueChange={setFilterTower}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allTowers")}</SelectItem>
                {towers.map((tw) => (
                  <SelectItem key={tw} value={tw}>{tw}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterTypology} onValueChange={setFilterTypology}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allTypologies")}</SelectItem>
                {typologies.map((tp) => (
                  <SelectItem key={tp} value={tp}>{tp}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("unit")}</TableHead>
              <TableHead>{t("tower")}</TableHead>
              <TableHead>{t("floor")}</TableHead>
              <TableHead>{t("typology")}</TableHead>
              <TableHead>{t("area")}</TableHead>
              <TableHead>{t("price")}</TableHead>
              <TableHead>R$/m²</TableHead>
              <TableHead>{t("status")}</TableHead>
              {canEditPrice && <TableHead className="w-20" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((unit) => (
              <TableRow key={unit.id}>
                <TableCell className="font-mono font-medium">{unit.number}</TableCell>
                <TableCell>{unit.tower}</TableCell>
                <TableCell>{unit.floor}º</TableCell>
                <TableCell>{unit.typology}</TableCell>
                <TableCell>{unit.area}m²</TableCell>
                <TableCell>
                  {editingId === unit.id ? (
                    <div className="flex gap-1 items-center">
                      <Input
                        type="number"
                        className="w-28 h-8"
                        value={editPrice}
                        onChange={(e) => setEditPrice(e.target.value)}
                      />
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleSave(unit)}>
                        <Check className="h-3.5 w-3.5 text-unit-available" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingId(null)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    formatCurrency(unit.price)
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatCurrency(Math.round(unit.price / unit.area))}
                </TableCell>
                <TableCell>
                  <Badge className={statusBadgeClass[unit.status]}>{t(unit.status as any)}</Badge>
                </TableCell>
                {canEditPrice && (
                  <TableCell>
                    {editingId !== unit.id && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => { setEditingId(unit.id); setEditPrice(String(unit.price)); }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
