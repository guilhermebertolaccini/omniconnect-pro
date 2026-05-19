import { Building2, Smartphone, Layers } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { BusinessManager, WABA } from '@/types/whatsapp';

interface BusinessOverviewProps {
  businessManagers: BusinessManager[];
  wabas: WABA[];
}

const bmStatusConfig = {
  ACTIVE: { label: 'Ativo', variant: 'default' as const },
  SUSPENDED: { label: 'Suspenso', variant: 'destructive' as const },
  PENDING_VERIFICATION: { label: 'Verificação Pendente', variant: 'secondary' as const },
};

export function BusinessOverview({ businessManagers, wabas }: BusinessOverviewProps) {
  const totalPhoneNumbers = businessManagers.reduce((sum, bm) => sum + bm.phoneNumberCount, 0);
  const totalWabas = wabas.length;

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{businessManagers.length}</p>
                <p className="text-sm text-muted-foreground">Business Managers</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Layers className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalWabas}</p>
                <p className="text-sm text-muted-foreground">Contas WABA</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Smartphone className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalPhoneNumbers}</p>
                <p className="text-sm text-muted-foreground">Números Conectados</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Business Managers List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Business Managers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {businessManagers.map((bm) => {
              const status = bmStatusConfig[bm.status];
              const bmWabas = wabas.filter((w) => w.businessManagerId === bm.id);

              return (
                <div key={bm.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                        <Building2 className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <h4 className="font-medium">{bm.name}</h4>
                        <p className="text-xs text-muted-foreground">ID: {bm.id}</p>
                      </div>
                    </div>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-muted-foreground" />
                      <span>{bm.wabaCount} WABAs</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Smartphone className="h-4 w-4 text-muted-foreground" />
                      <span>{bm.phoneNumberCount} Números</span>
                    </div>
                  </div>

                  {/* WABAs under this BM */}
                  {bmWabas.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase">Contas WABA</p>
                      <div className="grid gap-2">
                        {bmWabas.map((waba) => (
                          <div key={waba.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                            <div>
                              <p className="font-medium text-sm">{waba.name}</p>
                              <p className="text-xs text-muted-foreground">ID: {waba.id}</p>
                            </div>
                            <div className="text-right text-sm">
                              <p className="font-medium">{waba.phoneNumberCount} números</p>
                              <p className="text-xs text-muted-foreground">{waba.timezone}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
