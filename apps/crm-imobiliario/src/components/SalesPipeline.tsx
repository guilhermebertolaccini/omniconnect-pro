import { useI18n } from "@/i18n/useI18n";
import { useProposals } from "@/contexts/ProposalContext";
import { useProperties } from "@/contexts/PropertyContext";
import { SalePipelineStage } from "@/types/property";
import { formatCurrency } from "@/data/mockData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle, Circle, ArrowRight } from "lucide-react";

interface SalesPipelineProps {
  propertyId: string;
}

const stages: SalePipelineStage[] = [
  "available", "reserved", "proposal", "simulation", "contract", "signature", "sold",
];

export function SalesPipeline({ propertyId }: SalesPipelineProps) {
  const { t } = useI18n();
  const { properties } = useProperties();
  const { proposals } = useProposals();

  const property = properties.find((p) => p.id === propertyId);
  if (!property) return null;

  // Compute stage for each non-available unit
  const unitStages = property.units
    .filter((u) => u.status !== "available")
    .map((unit) => {
      const unitProposals = proposals.filter((p) => p.unitId === unit.id);
      const hasAccepted = unitProposals.some((p) => p.status === "accepted");
      const hasSent = unitProposals.some((p) => p.status === "sent");
      const hasDraft = unitProposals.length > 0;

      let stage: SalePipelineStage = "reserved";
      if (unit.status === "sold") {
        stage = "sold";
      } else if (hasAccepted) {
        stage = "contract";
      } else if (hasSent) {
        stage = "simulation";
      } else if (hasDraft) {
        stage = "proposal";
      }

      return { unit, stage, proposals: unitProposals };
    });

  const stageColors: Record<SalePipelineStage, string> = {
    available: "bg-unit-available",
    reserved: "bg-unit-reserved",
    proposal: "bg-primary",
    simulation: "bg-chart-5",
    contract: "bg-chart-5",
    signature: "bg-chart-5",
    sold: "bg-unit-sold",
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display">{t("salesPipeline")}</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Stage headers */}
        <div className="flex gap-1 mb-4 overflow-x-auto pb-2">
          {stages.map((stage, i) => {
            const count = stage === "available"
              ? property.units.filter((u) => u.status === "available").length
              : unitStages.filter((us) => us.stage === stage).length;

            return (
              <div key={stage} className="flex items-center">
                <div className="flex flex-col items-center min-w-[100px]">
                  <Badge className={`${stageColors[stage]} text-primary-foreground text-xs`}>
                    {t(stage as any)}
                  </Badge>
                  <span className="text-lg font-display font-bold text-foreground mt-1">{count}</span>
                </div>
                {i < stages.length - 1 && (
                  <ArrowRight className="h-4 w-4 text-muted-foreground mx-1 shrink-0" />
                )}
              </div>
            );
          })}
        </div>

        {/* Units in pipeline */}
        <ScrollArea className="max-h-64">
          <div className="space-y-2">
            {unitStages.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">{t("noPipelineUnits")}</p>
            ) : (
              unitStages.map(({ unit, stage }) => (
                <div
                  key={unit.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-secondary"
                >
                  <div className="flex items-center gap-3">
                    <div className={`h-3 w-3 rounded-full ${stageColors[stage]}`} />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {t("unit")} {unit.number} — {unit.tower}
                      </p>
                      <p className="text-xs text-muted-foreground">{unit.typology} • {unit.area}m²</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-display font-bold">{formatCurrency(unit.price)}</p>
                    <Badge variant="outline" className="text-xs">{t(stage as any)}</Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
