import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, MapPin, Loader2 } from "lucide-react";
import { useI18n } from "@/i18n/useI18n";
import { useProperties } from "@/contexts/PropertyContext";
import { getPropertyStats, formatCurrency } from "@/data/mockData";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UnitMap } from "@/components/UnitMap";
import { UnitDrawer } from "@/components/UnitDrawer";
import { PriceTable } from "@/components/PriceTable";
import { PaymentSimulator } from "@/components/PaymentSimulator";
import { SalesPipeline } from "@/components/SalesPipeline";
import { DocumentManager } from "@/components/DocumentManager";
import { CommissionManager } from "@/components/CommissionManager";
import { Unit, PropertyDocument } from "@/types/property";

export default function PropertyDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { properties, updateProperty, loading } = useProperties();
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);

  const property = properties.find((p) => p.id === id);
  if (loading && !property) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!property) return <div>Not found</div>;

  const stats = getPropertyStats(property);
  const avgPrice = stats.totalVGV / (property.units.length || 1);
  const typologies = [...new Set(property.units.map((u) => u.typology))];
  const docs = property.documents || [];

  const handleAddDocument = (doc: PropertyDocument) => {
    updateProperty(property.id, { documents: [...docs, doc] });
  };

  const handleRemoveDocument = (docId: string) => {
    updateProperty(property.id, { documents: docs.filter((d) => d.id !== docId) });
  };

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={() => navigate("/properties")} className="gap-2">
        <ArrowLeft className="h-4 w-4" /> {t("back")}
      </Button>

      <div className="flex flex-col md:flex-row gap-6">
        <div className="md:w-80 shrink-0">
          <img src={property.image} alt={property.name} className="w-full h-48 object-cover rounded-lg" />
        </div>
        <div className="flex-1 space-y-4">
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">{property.name}</h1>
            <p className="text-muted-foreground flex items-center gap-1 mt-1">
              <MapPin className="h-4 w-4" /> {property.address}, {property.city}
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <InfoCard label={t("developer")} value={property.developer} />
            <InfoCard label={t("totalVGV")} value={formatCurrency(stats.totalVGV)} />
            <InfoCard label={t("soldVGV")} value={formatCurrency(stats.soldVGV)} />
            <InfoCard label={t("availableUnits")} value={String(stats.available)} />
          </div>
        </div>
      </div>

      <Tabs defaultValue="units">
        <TabsList className="flex-wrap">
          <TabsTrigger value="units">{t("unitMap")}</TabsTrigger>
          <TabsTrigger value="price">{t("priceTable")}</TabsTrigger>
          <TabsTrigger value="simulator">{t("paymentSimulator")}</TabsTrigger>
          <TabsTrigger value="pipeline">{t("pipeline")}</TabsTrigger>
          <TabsTrigger value="plans">{t("plans")}</TabsTrigger>
          <TabsTrigger value="docs">{t("documents")}</TabsTrigger>
          <TabsTrigger value="commissions">{t("commissions")}</TabsTrigger>
        </TabsList>

        <TabsContent value="units" className="mt-4">
          <UnitMap property={property} onSelectUnit={setSelectedUnit} />
        </TabsContent>
        <TabsContent value="price" className="mt-4">
          <PriceTable property={property} />
        </TabsContent>
        <TabsContent value="simulator" className="mt-4">
          <PaymentSimulator unitPrice={Math.round(avgPrice)} />
        </TabsContent>
        <TabsContent value="pipeline" className="mt-4">
          <SalesPipeline propertyId={property.id} />
        </TabsContent>
        <TabsContent value="plans" className="mt-4">
          <DocumentManager
            documents={docs}
            onAddDocument={handleAddDocument}
            onRemoveDocument={handleRemoveDocument}
            filterType="floor_plan"
            typologies={typologies}
          />
        </TabsContent>
        <TabsContent value="docs" className="mt-4">
          <DocumentManager
            documents={docs}
            onAddDocument={handleAddDocument}
            onRemoveDocument={handleRemoveDocument}
            filterType="all"
          />
        </TabsContent>
        <TabsContent value="commissions" className="mt-4">
          <CommissionManager propertyId={property.id} />
        </TabsContent>
      </Tabs>

      <UnitDrawer
        unit={selectedUnit}
        propertyId={property.id}
        propertyName={property.name}
        onClose={() => setSelectedUnit(null)}
      />
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-display font-bold text-foreground mt-0.5">{value}</p>
      </CardContent>
    </Card>
  );
}
