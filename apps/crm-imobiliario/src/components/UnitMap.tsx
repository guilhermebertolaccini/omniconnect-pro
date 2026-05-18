import { useState } from "react";
import { useI18n } from "@/i18n/useI18n";
import { Property, Unit } from "@/types/property";
import { formatCurrency } from "@/data/mockData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const statusColors: Record<string, string> = {
  available: "bg-unit-available hover:bg-unit-available/80",
  reserved: "bg-unit-reserved hover:bg-unit-reserved/80",
  sold: "bg-unit-sold hover:bg-unit-sold/80",
};

interface UnitMapProps {
  property: Property;
  onSelectUnit: (unit: Unit) => void;
}

export function UnitMap({ property, onSelectUnit }: UnitMapProps) {
  const { t } = useI18n();
  const towerNames = property.towers.map((tw) => tw.name);
  const [selectedTower, setSelectedTower] = useState(towerNames[0]);

  const towerUnits = property.units.filter((u) => u.tower === selectedTower);
  const tower = property.towers.find((tw) => tw.name === selectedTower);
  if (!tower) return null;

  const floors = Array.from({ length: tower.floors }, (_, i) => tower.floors - i);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <CardTitle className="font-display">{t("unitMap")}</CardTitle>
        <div className="flex items-center gap-4">
          <div className="flex gap-3 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-unit-available" /> {t("available")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-unit-reserved" /> {t("reserved")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-unit-sold" /> {t("sold")}
            </span>
          </div>
          {towerNames.length > 1 && (
            <Select value={selectedTower} onValueChange={setSelectedTower}>
              <SelectTrigger className="w-40 h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {towerNames.map((name) => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div className="inline-flex flex-col gap-1 min-w-fit">
            {floors.map((floor) => {
              const floorUnits = towerUnits
                .filter((u) => u.floor === floor)
                .sort((a, b) => a.number.localeCompare(b.number));

              return (
                <div key={floor} className="flex items-center gap-1">
                  <span className="w-12 text-xs text-muted-foreground text-right pr-2 font-mono shrink-0">
                    {t("floor")} {floor}
                  </span>
                  {floorUnits.map((unit) => (
                    <Tooltip key={unit.id}>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => onSelectUnit(unit)}
                          className={`h-9 w-16 rounded-md text-[11px] font-semibold text-primary-foreground transition-all cursor-pointer ${statusColors[unit.status]}`}
                        >
                          {unit.number}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        <p className="font-semibold">{t("unit")} {unit.number}</p>
                        <p>{unit.typology} · {unit.area}m²</p>
                        <p>{formatCurrency(unit.price)}</p>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
