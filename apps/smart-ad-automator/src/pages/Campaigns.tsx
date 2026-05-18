import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { MetaDataLoading, MetaDataError } from '@/components/MetaDataStatus';
import { useState, useEffect } from 'react';
import { subDays } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { CampaignTable } from '@/components/campaigns/CampaignTable';
import { AIAnalysisPanel } from '@/components/campaigns/AIAnalysisPanel';
import { CreateCampaignDialog } from '@/components/campaigns/CreateCampaignDialog';
import { mockCampaigns, mockAccounts } from '@/data/mockData';
import { AccountSelector } from '@/components/dashboard/AccountSelector';
import { DateRangePicker, dateRangeToPreset } from '@/components/dashboard/DateRangePicker';
import { PlatformSelector } from '@/components/dashboard/PlatformSelector';
import { getPlatformAdapter } from '@/services/platformRegistry';
import { usePlatformData } from '@/hooks/usePlatformData';
import { PLATFORM_LABELS } from '@/services/platformConfigService';
import { useCompany } from '@/contexts/CompanyContext';
import { getMetaConfig } from '@/services/metaConfigService';
import type { AdAccount, Campaign } from '@/types/campaign';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';

export default function CampaignsPage() {
  const { selectedCompanyId, selectedPlatform } = useCompany();
  const [selectedAccount, setSelectedAccount] = useState<AdAccount | null>(null);
  const [analyzingCampaign, setAnalyzingCampaign] = useState<Campaign | null>(null);
  const [localCampaigns, setLocalCampaigns] = useState<Campaign[]>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 7),
    to: new Date(),
  });

  const datePreset = dateRangeToPreset(dateRange);

  const { data: displayAccounts, isLive, isLoading: accountsLoading, error: accountsError, refetch: refetchAccounts } = usePlatformData({
    queryKey: ['adAccounts', selectedPlatform, selectedCompanyId],
    fetchFn: () => getPlatformAdapter(selectedPlatform).fetchAccounts(selectedCompanyId!),
    mockData: mockAccounts,
    platform: selectedPlatform,
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

  const { data: baseCampaigns, isLoading: campaignsLoading, error: campaignsError, refetch: refetchCampaigns } = usePlatformData({
    queryKey: ['campaigns', selectedPlatform, selectedCompanyId, selectedAccount?.id, datePreset],
    fetchFn: () => getPlatformAdapter(selectedPlatform).fetchCampaigns(selectedCompanyId!, selectedAccount!.id, datePreset),
    mockData: mockCampaigns,
    platform: selectedPlatform,
    companyId: selectedCompanyId,
    enabled: !!selectedAccount,
  });

  const isLoading = accountsLoading || campaignsLoading;
  const error = accountsError || campaignsError;
  const refetch = accountsError ? refetchAccounts : refetchCampaigns;
  const campaigns = [...localCampaigns, ...baseCampaigns];

  const handleCreateCampaign = (campaign: Campaign) => {
    setLocalCampaigns((prev) => [campaign, ...prev]);
    queryClient.invalidateQueries({ queryKey: ['campaigns', selectedPlatform, selectedCompanyId] });
  };

  // Don't filter by accountName since we fetch per-account already
  const filteredCampaigns = campaigns;

  const activeCampaigns = filteredCampaigns.filter((c) => c.status === 'active');
  const pausedCampaigns = filteredCampaigns.filter((c) => c.status === 'paused');
  const endedCampaigns = filteredCampaigns.filter((c) => c.status === 'ended');
  const issueCampaigns = filteredCampaigns.filter((c) => c.status === 'issue');

  return (
    <DashboardLayout>
      {error && <MetaDataError error={error} refetch={refetch} />}
      {isLoading && <MetaDataLoading />}

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Campanhas — {PLATFORM_LABELS[selectedPlatform]}</h1>
          <p className="text-muted-foreground">
            {isLive
              ? `Dados ao vivo do ${PLATFORM_LABELS[selectedPlatform]}`
              : `Dados de exemplo — configure ${PLATFORM_LABELS[selectedPlatform]} em Configurações para ver dados reais`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CreateCampaignDialog
            onCreateCampaign={handleCreateCampaign}
            accounts={displayAccounts}
            platform={selectedPlatform}
            companyId={selectedCompanyId}
            isLive={isLive}
          />
          <PlatformSelector />
          <AccountSelector
            accounts={displayAccounts}
            selectedAccount={selectedAccount}
            onSelect={setSelectedAccount}
          />
          <DateRangePicker dateRange={dateRange} onDateRangeChange={setDateRange} />
        </div>
      </div>

      <Tabs defaultValue="all" className="space-y-4">
        <div className="overflow-x-auto">
          <TabsList className="w-max min-w-full sm:w-auto">
            <TabsTrigger value="all">Todas ({filteredCampaigns.length})</TabsTrigger>
            <TabsTrigger value="active">Ativas ({activeCampaigns.length})</TabsTrigger>
            <TabsTrigger value="paused">Pausadas ({pausedCampaigns.length})</TabsTrigger>
            <TabsTrigger value="issues">Problemas ({issueCampaigns.length})</TabsTrigger>
            <TabsTrigger value="ended">Encerradas ({endedCampaigns.length})</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="all">
          <CampaignTable campaigns={filteredCampaigns} onAnalyze={(campaign) => setAnalyzingCampaign(campaign)} />
        </TabsContent>
        <TabsContent value="active">
          <CampaignTable campaigns={activeCampaigns} onAnalyze={(campaign) => setAnalyzingCampaign(campaign)} />
        </TabsContent>
        <TabsContent value="paused">
          <CampaignTable campaigns={pausedCampaigns} onAnalyze={(campaign) => setAnalyzingCampaign(campaign)} />
        </TabsContent>
        <TabsContent value="issues">
          <CampaignTable campaigns={issueCampaigns} onAnalyze={(campaign) => setAnalyzingCampaign(campaign)} />
        </TabsContent>
        <TabsContent value="ended">
          <CampaignTable campaigns={endedCampaigns} onAnalyze={(campaign) => setAnalyzingCampaign(campaign)} />
        </TabsContent>
      </Tabs>

      {analyzingCampaign && (
        <AIAnalysisPanel campaign={analyzingCampaign} onClose={() => setAnalyzingCampaign(null)} />
      )}
    </DashboardLayout>
  );
}
