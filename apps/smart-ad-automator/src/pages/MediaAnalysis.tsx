import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useCompany } from '@/contexts/CompanyContext';
import { useMediaIndicators } from '@/hooks/useMediaIndicators';
import { ChannelInvestmentChart } from '@/components/media/ChannelInvestmentChart';
import { CplBreakdown } from '@/components/media/CplBreakdown';
import { LeadSourceBreakdown } from '@/components/media/LeadSourceBreakdown';
import { TopCreativesGrid } from '@/components/media/TopCreativesGrid';
import { CampaignQualityTable } from '@/components/media/CampaignQualityTable';
import { DollarSign, Target, Percent, Sparkles, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const fmtMoney = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtNum = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });

function Kpi({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof DollarSign;
  label: string;
  value: string;
}) {
  return (
    <Card className="bg-card/50 backdrop-blur border-border/50">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-xl font-bold mt-1">{value}</p>
          </div>
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="h-4 w-4 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function MediaAnalysis() {
  const { selectedCompanyId } = useCompany();
  const data = useMediaIndicators(selectedCompanyId);

  return (
    <DashboardLayout>
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Análise de Mídia</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Indicadores cross-platform: investimento, leads, criativos e qualidade comercial.
            </p>
          </div>
          {!data.isLive && (
            <Link to="/settings">
              <Button variant="outline" size="sm">
                <AlertCircle className="h-4 w-4 mr-2" />
                Conectar plataformas
              </Button>
            </Link>
          )}
        </div>

        {data.isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi icon={DollarSign} label="Investimento" value={fmtMoney(data.totals.spend)} />
            <Kpi icon={Target} label="Leads" value={fmtNum(data.totals.leads)} />
            <Kpi icon={Percent} label="CPL médio" value={fmtMoney(data.totals.cpl)} />
            <Kpi
              icon={Sparkles}
              label="Leads qualificados"
              value={fmtNum(data.totals.qualifiedLeads)}
            />
          </div>
        )}

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Visão geral</TabsTrigger>
            <TabsTrigger value="creatives">Criativos</TabsTrigger>
            <TabsTrigger value="campaigns">Campanhas</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChannelInvestmentChart data={data.byChannel} />
              <CplBreakdown data={data.byChannel} totalCpl={data.totals.cpl} />
            </div>
            <LeadSourceBreakdown data={data.bySource} />
          </TabsContent>

          <TabsContent value="creatives" className="mt-4">
            <TopCreativesGrid campaigns={data.campaigns} />
          </TabsContent>

          <TabsContent value="campaigns" className="mt-4">
            <CampaignQualityTable campaigns={data.campaigns} />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
