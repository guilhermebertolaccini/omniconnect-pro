import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useI18n } from "@/i18n/useI18n";
import { useProperties } from "@/contexts/PropertyContext";
import { Property, Unit, Tower } from "@/types/property";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function NewProperty() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { addProperty } = useProperties();

  const [form, setForm] = useState({
    name: "",
    address: "",
    city: "",
    developer: "",
    towerCount: 1,
    floorsPerTower: 10,
    unitsPerFloor: 4,
    basePrice: 500000,
  });

  const update = (key: string, value: string | number) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!form.name || !form.city) return;

    const id = `prop-${Date.now()}`; // temporary, DB assigns the real id
    const towers: Tower[] = Array.from({ length: form.towerCount }, (_, i) => ({
      name: `Torre ${String.fromCharCode(65 + i)}`,
      floors: form.floorsPerTower,
      unitsPerFloor: form.unitsPerFloor,
    }));

    const typologies = ["Studio", "1 Quarto", "2 Quartos", "3 Quartos"];
    const areas = [28, 45, 65, 90];

    const units: Unit[] = [];
    towers.forEach((tower) => {
      for (let floor = 1; floor <= tower.floors; floor++) {
        for (let u = 1; u <= tower.unitsPerFloor; u++) {
          const typeIdx = (u - 1) % typologies.length;
          units.push({
            id: `${id}-${tower.name}-${floor}${String(u).padStart(2, "0")}`,
            number: `${floor}${String(u).padStart(2, "0")}`,
            tower: tower.name,
            floor,
            typology: typologies[typeIdx],
            area: areas[typeIdx],
            price: Math.round(form.basePrice * (1 + (floor - 1) * 0.02)),
            status: "available",
          });
        }
      }
    });

    const property: Property = {
      id,
      name: form.name,
      address: form.address,
      city: form.city,
      developer: form.developer,
      image: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=600&h=400&fit=crop",
      towers,
      units,
    };

    setCreating(true);
    try {
      const newId = await addProperty(property);
      navigate(`/properties/${newId}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Button variant="ghost" onClick={() => navigate("/properties")} className="gap-2">
        <ArrowLeft className="h-4 w-4" /> {t("back")}
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="font-display">{t("newProperty")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{t("propertyName")}</Label>
              <Input value={form.name} onChange={(e) => update("name", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("propertyCity")}</Label>
              <Input value={form.city} onChange={(e) => update("city", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("propertyAddress")}</Label>
              <Input value={form.address} onChange={(e) => update("address", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("propertyDeveloper")}</Label>
              <Input value={form.developer} onChange={(e) => update("developer", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label>{t("towers")}</Label>
              <Input type="number" min={1} max={10} value={form.towerCount} onChange={(e) => update("towerCount", parseInt(e.target.value) || 1)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("floorsPerTower")}</Label>
              <Input type="number" min={1} max={50} value={form.floorsPerTower} onChange={(e) => update("floorsPerTower", parseInt(e.target.value) || 1)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("unitsPerFloor")}</Label>
              <Input type="number" min={1} max={12} value={form.unitsPerFloor} onChange={(e) => update("unitsPerFloor", parseInt(e.target.value) || 1)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("basePrice")}</Label>
              <Input type="number" min={0} value={form.basePrice} onChange={(e) => update("basePrice", parseInt(e.target.value) || 0)} />
            </div>
          </div>

          <Button onClick={handleCreate} disabled={creating} className="w-full font-display font-semibold" size="lg">
            {t("createProperty")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
