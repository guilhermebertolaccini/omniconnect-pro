import { useState, useEffect } from 'react';
import { DollarSign, TrendingUp, Target, ShoppingCart, MessageCircle } from 'lucide-react';
import { subDays } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { MetaDataLoading, MetaDataError } from '@/components/MetaDataStatus';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { StatusCards } from '@/components/dashboard/StatusCards';
import { InsightCard } from '@/components/dashboard/InsightCard';
import { QuickActions } from '@/components/dashboard/QuickActions';
import { PerformanceChart } from '@/components/dashboard/PerformanceChart';
import { AccountSelector } from '@/components/dashboard/AccountSelector';
import { PlatformSelector } from '@/components/dashboard/PlatformSelector';
import { DateRangePicker, dateRangeToPreset } from '@/components/dashboard/DateRangePicker';
import { ConversionFunnel } from '@/components/dashboard/ConversionFunnel';
import { CampaignTable } from '@/components/campaigns/CampaignTable';
import { AIAnalysisPanel } from '@/components/campaigns/AIAnalysisPanel';
import { mockAccounts, mockCampaigns, mockInsights, mockMetricSummary } from '@/data/mockData';
import { fetchAdAccounts } from '@/services/adAccountsService';
import { fetchCampaigns } from '@/services/campaignsService';
import { useMetaData } from '@/hooks/useMetaData';
import { useCompany } from '@/contexts/CompanyContext';
import { PLATFORM_LABELS } from '@/services/platformConfigService';
import { getMetaConfig } from '@/services/metaConfigService';
import type { AdAccount, Campaign } from '@/types/campaign';
import { useQuery } from '@tanstack/react-query';

const Index = () => {
  const { selectedCompanyId, selectedPlatform } = useCompany();
  const [selectedAccount, setSelectedAccount] = useState<AdAccount | null>(null);
  const [analyzingCampaign, setAnalyzingCampaign] = useState<Campaign | null>(null);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 7),
    to: new Date(),
  });

  const datePreset = dateRangeToPreset(dateRange);

  const { data: displayAccounts, isLive, isLoading: accountsLoading, error: accountsError, refetch: refetchAccounts } = useMetaData({
    queryKey: ['adAccounts', selectedCompanyId],
    fetchFn: () => fetchAdAccounts(selectedCompanyId!),
    mockData: mockAccounts,
    companyId: selectedCompanyId,
  });

  const isValidMetaAccountId = (id: string) => /^\d+$/.test(id);

  // Fetch configured ad_account_id from meta_configurations
  const { data: metaConfig } = useQuery({
    queryKey: ['metaConfig', selectedCompanyId],
    queryFn: () => getMetaConfig(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    staleTime: 60_000,
  });

  const configuredAccountId = metaConfig?.ad_account_id ?? null;

  // Auto-select: prioritize configured ad_account_id
  useEffect(() => {
    if (!selectedAccount && displayAccounts.length > 0) {
      const configured = configuredAccountId
        ? displayAccounts.find((a) => a.id === configuredAccountId || a.id === `act_${configuredAccountId}`)
        : null;
      if (configured) {
        setSelectedAccount(configured);
      } else {
        const firstAccount = displayAccounts[0];
        if (!isLive || isValidMetaAccountId(firstAccount.id)) {
          setSelectedAccount(firstAccount);
        }
      }
    }
  }, [displayAccounts, selectedAccount, isLive, configuredAccountId]);

  const { data: allCampaigns, isLoading: campaignsLoading, error: campaignsError, refetch: refetchCampaigns } = useMetaData({
    queryKey: ['campaigns', selectedCompanyId, selectedAccount?.id, datePreset],
    fetchFn: () => fetchCampaigns(selectedCompanyId!, selectedAccount!.id, datePreset),
    mockData: mockCampaigns,
    companyId: selectedCompanyId,
    enabled: !!selectedAccount,
  });

  const isLoading = accountsLoading || campaignsLoading;
  const error = accountsError || campaignsError;
  const refetch = accountsError ? refetchAccounts : refetchCampaigns;

  // Don't filter by accountName since we fetch per-account
  const filteredCampaigns = allCampaigns;

  const metricSummary = isLive
    ? {
        totalSpent: filteredCampaigns.reduce((s, c) => s + c.spent, 0),
        totalConversions: filteredCampaigns.reduce((s, c) => s + c.conversions, 0),
        avgRoas: filteredCampaigns.length > 0
          ? filteredCampaigns.reduce((s, c) => s + c.roas, 0) / filteredCampaigns.filter(c => c.roas > 0).length || 0
          : 0,
        avgCpa: filteredCampaigns.length > 0
          ? filteredCampaigns.reduce((s, c) => s + c.cpa, 0) / filteredCampaigns.filter(c => c.cpa > 0).length || 0
          : 0,
        activeCampaigns: filteredCampaigns.filter(c => c.status === 'active').length,
        pausedCampaigns: filteredCampaigns.filter(c => c.status === 'paused').length,
        issuesCampaigns: filteredCampaigns.filter(c => c.status === 'issue').length,
        totalWhatsappConversations: filteredCampaigns.reduce((s, c) => s + c.whatsappConversations, 0),
        totalMqls: filteredCampaigns.reduce((s, c) => s + c.mqls, 0),
        totalSqls: filteredCampaigns.reduce((s, c) => s + c.sqls, 0),
      }
    : mockMetricSummary;

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      maximumFractionDigits: 0,
    }).format(value);

  return (
    <DashboardLayout>
      {error && <MetaDataError error={error} refetch={refetch} />}
      {isLoading && <MetaDataLoading />}

      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard — {PLATFORM_LABELS[selectedPlatform]}</h1>
          <p className="text-muted-foreground">
            Visão geral das suas campanhas
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PlatformSelector />
          <AccountSelector
            accounts={displayAccounts}
            selectedAccount={selectedAccount}
            onSelect={setSelectedAccount}
          />
          <DateRangePicker dateRange={dateRange} onDateRangeChange={setDateRange} />
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5 md:gap-4">
        <MetricCard title="Total Gasto" value={formatCurrency(metricSummary.totalSpent)} change="+12% vs período anterior" changeType="neutral" icon={DollarSign} />
        <MetricCard title="Conversões" value={metricSummary.totalConversions.toLocaleString('pt-BR')} change="+24% vs período anterior" changeType="positive" icon={ShoppingCart} />
        <MetricCard title="Conversas WhatsApp" value={metricSummary.totalWhatsappConversations.toLocaleString('pt-BR')} change="+18% vs período anterior" changeType="positive" icon={MessageCircle} iconColor="text-success" />
        <MetricCard title="ROAS Médio" value={`${metricSummary.avgRoas.toFixed(1)}x`} change="+0.5 vs período anterior" changeType="positive" icon={TrendingUp} />
        <MetricCard title="CPA Médio" value={formatCurrency(metricSummary.avgCpa)} change="-8% vs período anterior" changeType="positive" icon={Target} />
      </div>

      {/* Main Grid */}
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PerformanceChart />
        </div>
        <div className="space-y-4">
          <StatusCards active={metricSummary.activeCampaigns} paused={metricSummary.pausedCampaigns} issues={metricSummary.issuesCampaigns} />
          <QuickActions />
        </div>
      </div>

      {/* Conversion Funnel */}
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ConversionFunnel
          clicks={filteredCampaigns.reduce((s, c) => s + c.clicks, 0)}
          whatsappConversations={filteredCampaigns.reduce((s, c) => s + c.whatsappConversations, 0)}
          mqls={filteredCampaigns.reduce((s, c) => s + c.mqls, 0)}
          sqls={filteredCampaigns.reduce((s, c) => s + c.sqls, 0)}
          salesClosed={filteredCampaigns.reduce((s, c) => s + c.salesClosed, 0)}
        />
      </div>

      {/* AI Insights */}
      <div className="mb-6">
        <h2 className="mb-4 text-lg font-semibold">Insights da IA</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {mockInsights.slice(0, 4).map((insight) => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </div>
      </div>

      {/* Campaigns Table */}
      <div>
        <h2 className="mb-4 text-lg font-semibold">Campanhas</h2>
        <CampaignTable campaigns={filteredCampaigns} onAnalyze={(campaign) => setAnalyzingCampaign(campaign)} />
      </div>

      {analyzingCampaign && (
        <AIAnalysisPanel campaign={analyzingCampaign} onClose={() => setAnalyzingCampaign(null)} />
      )}
    </DashboardLayout>
  );
};

export default Index;
