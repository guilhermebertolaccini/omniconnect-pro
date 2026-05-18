import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, MapPin } from "lucide-react";
import { useI18n } from "@/i18n/useI18n";
import { useProperties } from "@/contexts/PropertyContext";
import { useAuth } from "@/contexts/AuthContext";
import { getPropertyStats, formatCurrency } from "@/data/mockData";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function PropertiesList() {
  const { t } = useI18n();
  const { properties } = useProperties();
  const { canCreateProperty } = useAuth();
  const navigate = useNavigate();
  const [cityFilter, setCityFilter] = useState("all");

  const cities = [...new Set(properties.map((p) => p.city))];
  const filtered = cityFilter === "all" ? properties : properties.filter((p) => p.city === cityFilter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-bold text-foreground">{t("allProperties")}</h1>
        {canCreateProperty && (
          <Button onClick={() => navigate("/properties/new")} className="font-display">
            <Plus className="h-4 w-4 mr-2" />
            {t("newProperty")}
          </Button>
        )}
      </div>

      <div className="flex gap-3">
        <Select value={cityFilter} onValueChange={setCityFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder={t("filterByCity")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allCities")}</SelectItem>
            {cities.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filtered.map((property) => {
          const stats = getPropertyStats(property);
          const soldPct = Math.round((stats.sold / stats.total) * 100);
          const reservedPct = Math.round((stats.reserved / stats.total) * 100);
          const availPct = 100 - soldPct - reservedPct;

          return (
            <Card
              key={property.id}
              className="cursor-pointer hover:shadow-lg transition-shadow overflow-hidden"
              onClick={() => navigate(`/properties/${property.id}`)}
            >
              <div className="h-40 overflow-hidden">
                <img
                  src={property.image}
                  alt={property.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
              <CardContent className="p-5 space-y-3">
                <div>
                  <h3 className="font-display font-bold text-foreground text-lg">{property.name}</h3>
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {property.city}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">
                  {stats.total} {t("units")} · {formatCurrency(stats.totalVGV)}
                </p>
                <div className="space-y-1.5">
                  <div className="flex h-2 rounded-full overflow-hidden bg-secondary">
                    <div style={{ width: `${soldPct}%` }} className="bg-unit-sold" />
                    <div style={{ width: `${reservedPct}%` }} className="bg-unit-reserved" />
                    <div style={{ width: `${availPct}%` }} className="bg-unit-available" />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-unit-available" /> {stats.available}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-unit-reserved" /> {stats.reserved}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-unit-sold" /> {stats.sold}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
