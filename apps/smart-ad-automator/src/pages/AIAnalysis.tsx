import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles, Building2, AlertCircle } from 'lucide-react';
import { useState } from 'react';
import { mockCampaigns, mockAccounts } from '@/data/mockData';
import { AccountSelector } from '@/components/dashboard/AccountSelector';
import { PlatformSelector } from '@/components/dashboard/PlatformSelector';
import { CampaignTable } from '@/components/campaigns/CampaignTable';
import { AIAnalysisPanel } from '@/components/campaigns/AIAnalysisPanel';
import { useCompany } from '@/contexts/CompanyContext';
import { PLATFORM_LABELS } from '@/services/platformConfigService';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { AdAccount, Campaign } from '@/types/campaign';

export default function AIAnalysisPage() {
  const { companies, selectedCompanyId, setSelectedCompanyId, selectedPlatform, isLoading } = useCompany();
  const [selectedAccount, setSelectedAccount] = useState<AdAccount | null>(null);
  const [analyzingCampaign, setAnalyzingCampaign] = useState<Campaign | null>(null);

  const filteredCampaigns = selectedAccount
    ? mockCampaigns.filter((c) => c.accountName === selectedAccount.name)
    : mockCampaigns;

  const hasCompany = !!selectedCompanyId;

  return (
    <DashboardLayout>
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Análise com IA — {PLATFORM_LABELS[selectedPlatform]}</h1>
          <p className="text-muted-foreground">
            Use inteligência artificial para otimizar suas campanhas
          </p>
        </div>
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <Select
            value={selectedCompanyId ?? undefined}
            onValueChange={(v) => setSelectedCompanyId(v)}
            disabled={isLoading || companies.length === 0}
          >
            <SelectTrigger className="w-[240px]">
              <Building2 className="mr-2 h-4 w-4 text-muted-foreground" />
              <SelectValue placeholder={isLoading ? 'Carregando...' : 'Selecione uma empresa'} />
            </SelectTrigger>
            <SelectContent>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <PlatformSelector />
          <AccountSelector
            accounts={mockAccounts}
            selectedAccount={selectedAccount}
            onSelect={setSelectedAccount}
          />
        </div>
      </div>

      {!hasCompany && !isLoading && (
        <Card className="mb-6 border-warning/30 bg-warning/5">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertCircle className="h-5 w-5 text-warning" />
            <div className="text-sm">
              <p className="font-medium">Selecione uma empresa para usar a IA</p>
              <p className="text-muted-foreground">
                {companies.length === 0
                  ? 'Nenhuma empresa cadastrada. Cadastre uma em Empresas para liberar a análise com IA real.'
                  : 'Escolha uma empresa no seletor acima para que a IA possa analisar e salvar os resultados.'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Features Overview */}
      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="bg-gradient-primary text-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-white">
              <Sparkles className="h-5 w-5" />
              Análise Individual
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-white/80">
              Selecione uma campanha na tabela abaixo e clique no ícone ✨ para
              análise detalhada com IA.
            </p>
          </CardContent>
        </Card>
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="text-base">Análise em Lote</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">
              Analise todas as campanhas de uma vez e receba um relatório
              consolidado.
            </p>
            <Button variant="outline" className="gap-2" disabled>
              <Sparkles className="h-4 w-4" />
              Em Breve
            </Button>
          </CardContent>
        </Card>
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="text-base">Otimização Automática</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">
              Em breve: deixe a IA aplicar otimizações automaticamente.
            </p>
            <Button variant="outline" disabled>
              Em Breve
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Campaigns for Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">
            Selecione uma Campanha para Analisar
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <CampaignTable
            campaigns={filteredCampaigns}
            onAnalyze={(campaign) => setAnalyzingCampaign(campaign)}
          />
        </CardContent>
      </Card>

      {analyzingCampaign && (
        <AIAnalysisPanel
          campaign={analyzingCampaign}
          onClose={() => setAnalyzingCampaign(null)}
        />
      )}
    </DashboardLayout>
  );
}
