import { useSearchParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Bell, Palette, Shield } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MetaConfigPanel } from '@/components/settings/MetaConfigPanel';
import { GoogleAdsConfigPanel } from '@/components/settings/GoogleAdsConfigPanel';
import { TikTokAdsConfigPanel } from '@/components/settings/TikTokAdsConfigPanel';
import { ConnectionsPanel } from '@/components/settings/ConnectionsPanel';
import { AuditLogPanel } from '@/components/settings/AuditLogPanel';
import { IntentScoringPanel } from '@/components/settings/IntentScoringPanel';

export default function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') ?? 'connections';

  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-muted-foreground">
          Gerencie suas preferências e integrações
        </p>
      </div>

      <div className="max-w-5xl space-y-6">
        {/* Plataformas de anúncios */}
        <Tabs value={tab} onValueChange={(v) => setSearchParams({ tab: v })} className="w-full">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="connections">Conexões</TabsTrigger>
            <TabsTrigger value="audit">Auditoria</TabsTrigger>
            <TabsTrigger value="scoring">Scoring</TabsTrigger>
            <TabsTrigger value="meta">Meta Ads</TabsTrigger>
            <TabsTrigger value="google_ads">Google Ads</TabsTrigger>
            <TabsTrigger value="tiktok_ads">TikTok Ads</TabsTrigger>
          </TabsList>
          <TabsContent value="connections" className="mt-4"><ConnectionsPanel /></TabsContent>
          <TabsContent value="audit" className="mt-4"><AuditLogPanel /></TabsContent>
          <TabsContent value="scoring" className="mt-4"><IntentScoringPanel /></TabsContent>
          <TabsContent value="meta" className="mt-4"><MetaConfigPanel /></TabsContent>
          <TabsContent value="google_ads" className="mt-4"><GoogleAdsConfigPanel /></TabsContent>
          <TabsContent value="tiktok_ads" className="mt-4"><TikTokAdsConfigPanel /></TabsContent>
        </Tabs>

        {/* Notifications */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base">Notificações</CardTitle>
            </div>
            <CardDescription>
              Configure alertas e notificações
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Alertas de campanha com problema</Label>
                <p className="text-sm text-muted-foreground">
                  Receba notificações quando uma campanha tiver problemas
                </p>
              </div>
              <Switch defaultChecked />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Resumo diário</Label>
                <p className="text-sm text-muted-foreground">
                  Receba um resumo diário por email
                </p>
              </div>
              <Switch />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Insights da IA</Label>
                <p className="text-sm text-muted-foreground">
                  Notificações sobre novas oportunidades detectadas
                </p>
              </div>
              <Switch defaultChecked />
            </div>
          </CardContent>
        </Card>

        {/* Appearance */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Palette className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base">Aparência</CardTitle>
            </div>
            <CardDescription>
              Personalize a interface
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Tema escuro</Label>
                <p className="text-sm text-muted-foreground">
                  Alternar entre tema claro e escuro
                </p>
              </div>
              <Switch defaultChecked />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Sidebar compacta</Label>
                <p className="text-sm text-muted-foreground">
                  Iniciar com a sidebar recolhida
                </p>
              </div>
              <Switch />
            </div>
          </CardContent>
        </Card>

        {/* Security */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base">Segurança</CardTitle>
            </div>
            <CardDescription>
              Configurações de segurança da conta
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Autenticação em duas etapas</Label>
                <p className="text-sm text-muted-foreground">
                  Adicione uma camada extra de segurança
                </p>
              </div>
              <Button variant="outline" size="sm">Configurar</Button>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Sessões ativas</Label>
                <p className="text-sm text-muted-foreground">
                  Gerencie dispositivos conectados
                </p>
              </div>
              <Button variant="outline" size="sm">Ver sessões</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
