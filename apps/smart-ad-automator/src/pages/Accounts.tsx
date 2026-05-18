import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, RefreshCw, MoreHorizontal, Building2, Clock, DollarSign, BarChart3, Share2, Check } from 'lucide-react';
import { MetaDataLoading, MetaDataError } from '@/components/MetaDataStatus';
import { mockAccounts } from '@/data/mockData';
import { getPlatformAdapter } from '@/services/platformRegistry';
import { usePlatformData } from '@/hooks/usePlatformData';
import { PLATFORM_LABELS } from '@/services/platformConfigService';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CreateAccountDialog } from '@/components/accounts/CreateAccountDialog';
import { PlatformSelector } from '@/components/dashboard/PlatformSelector';
import { useCompany } from '@/contexts/CompanyContext';
import type { AdAccount } from '@/types/campaign';
import { toast } from 'sonner';
export default function AccountsPage() {
  const { selectedCompanyId, selectedPlatform } = useCompany();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [localAccounts, setLocalAccounts] = useState<AdAccount[]>([]);

  const { data: fetchedAccounts, isLoading, error, refetch, isLive } = usePlatformData({
    queryKey: ['adAccounts', selectedPlatform, selectedCompanyId],
    fetchFn: () => getPlatformAdapter(selectedPlatform).fetchAccounts(selectedCompanyId!),
    mockData: mockAccounts,
    platform: selectedPlatform,
    companyId: selectedCompanyId,
  });

  const accounts = [...fetchedAccounts, ...localAccounts];

  const handleCreateAccount = (account: AdAccount) => {
    setLocalAccounts((prev) => [...prev, account]);
    toast.success(`Empresa "${account.businessName}" cadastrada com sucesso!`);
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      maximumFractionDigits: 0,
    }).format(value);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('pt-BR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleShareClient = (accountId: string) => {
    const url = `${window.location.origin}/client/${accountId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(accountId);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  return (
    <DashboardLayout>
      {error && <MetaDataError error={error} refetch={refetch} />}
      {isLoading && <MetaDataLoading />}

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Contas — {PLATFORM_LABELS[selectedPlatform]}</h1>
          <p className="text-muted-foreground">
            {isLive
              ? `Contas conectadas ao ${PLATFORM_LABELS[selectedPlatform]}`
              : `Sem configuração para ${PLATFORM_LABELS[selectedPlatform]} — exibindo dados de exemplo. Configure em Configurações.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PlatformSelector />
          <CreateAccountDialog onCreateAccount={handleCreateAccount} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {accounts.map((account) => (
          <Card key={account.id} className="card-hover">
            <CardHeader className="flex flex-row items-start justify-between pb-2">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Building2 className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <CardTitle className="truncate text-base">{account.name}</CardTitle>
                  <p className="truncate text-sm text-muted-foreground">
                    {account.businessName}
                  </p>
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>
                    <RefreshCw className="mr-2 h-4 w-4" /> Sincronizar
                  </DropdownMenuItem>
                  <DropdownMenuItem>Ver Detalhes</DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive">
                    Desconectar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <Badge
                  variant="outline"
                  className={cn(
                    account.status === 'connected' &&
                      'border-success/30 bg-success/10 text-success',
                    account.status === 'syncing' &&
                      'border-warning/30 bg-warning/10 text-warning',
                    account.status === 'error' &&
                      'border-destructive/30 bg-destructive/10 text-destructive'
                  )}
                >
                  {account.status === 'connected' && '● Conectada'}
                  {account.status === 'syncing' && '◌ Sincronizando...'}
                  {account.status === 'error' && '● Erro de conexão'}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-muted-foreground">Gasto Total</p>
                    <p className="font-medium">{formatCurrency(account.totalSpent)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="text-muted-foreground">Campanhas Ativas</p>
                    <p className="font-medium">{account.activeCampaigns}</p>
                  </div>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                Última sync: {formatDate(account.lastSync)}
              </div>

              {/* Share with client button */}
              <div className="mt-4 border-t border-border pt-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  onClick={() => handleShareClient(account.id)}
                >
                  {copiedId === account.id ? (
                    <>
                      <Check className="h-4 w-4 text-success" />
                      Link copiado!
                    </>
                  ) : (
                    <>
                      <Share2 className="h-4 w-4" />
                      Compartilhar com Cliente
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {/* Add Account Card */}
        <Card className="flex cursor-pointer items-center justify-center border-dashed transition-colors hover:border-primary hover:bg-muted/50">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Plus className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="font-medium">Conectar Nova Conta</p>
            <p className="text-sm text-muted-foreground">
              Vincule uma conta Meta Ads
            </p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
