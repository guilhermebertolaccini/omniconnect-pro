import { Building2, Home, TrendingUp, DollarSign, MessageSquare, Megaphone, ExternalLink } from "lucide-react";
import { getOmniHubUrl, getAdsManagerUrl } from "@/lib/externalApps";
import { useI18n } from "@/i18n/useI18n";
import { useProperties } from "@/contexts/PropertyContext";
import { getPropertyStats, formatCurrency } from "@/data/mockData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

export default function Dashboard() {
  const { t } = useI18n();
  const { properties } = useProperties();

  const allStats = properties.map((p) => ({ name: p.name, ...getPropertyStats(p) }));
  const totalProps = properties.length;
  const totalAvailable = allStats.reduce((s, a) => s + a.available, 0);
  const totalAvailableVGV = allStats.reduce((s, a) => s + a.availableVGV, 0);
  const totalSoldVGV = allStats.reduce((s, a) => s + a.soldVGV, 0);

  const kpis = [
    { label: t("totalProperties"), value: totalProps, icon: Building2, fmt: String(totalProps) },
    { label: t("availableUnits"), value: totalAvailable, icon: Home, fmt: String(totalAvailable) },
    { label: t("availableVGV"), value: totalAvailableVGV, icon: TrendingUp, fmt: formatCurrency(totalAvailableVGV) },
    { label: t("soldVGV"), value: totalSoldVGV, icon: DollarSign, fmt: formatCurrency(totalSoldVGV) },
  ];

  const chartData = allStats.map((s) => ({
    name: s.name.length > 15 ? s.name.substring(0, 15) + "…" : s.name,
    available: s.available,
    reserved: s.reserved,
    sold: s.sold,
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-display font-bold text-foreground">{t("dashboard")}</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="flex items-center gap-4 p-5">
              <div className="p-3 rounded-xl bg-secondary">
                <kpi.icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{kpi.label}</p>
                <p className="text-xl font-display font-bold text-foreground">{kpi.fmt}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Connected Apps */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="font-display text-lg">{t("connectedApps")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <a
              href={getOmniHubUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 rounded-lg border bg-background hover:bg-accent/50 transition-colors group"
            >
              <div className="p-2 rounded-lg bg-secondary">
                <MessageSquare className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-foreground">OmniHub</p>
                <p className="text-xs text-muted-foreground">{t("openConversation")}</p>
              </div>
              <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </a>
            <a
              href={getAdsManagerUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 rounded-lg border bg-background hover:bg-accent/50 transition-colors group"
            >
              <div className="p-2 rounded-lg bg-secondary">
                <Megaphone className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-foreground">Ads Manager</p>
                <p className="text-xs text-muted-foreground">{t("viewCampaign")}</p>
              </div>
              <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </a>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display">{t("statusDistribution")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barGap={2}>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="available" name={t("available")} stackId="a" fill="hsl(160, 84%, 39%)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="reserved" name={t("reserved")} stackId="a" fill="hsl(38, 92%, 50%)" />
                <Bar dataKey="sold" name={t("sold")} stackId="a" fill="hsl(0, 84%, 60%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-6 mt-4 justify-center text-sm">
            <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-unit-available" /> {t("available")}</span>
            <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-unit-reserved" /> {t("reserved")}</span>
            <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-unit-sold" /> {t("sold")}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
