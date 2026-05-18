import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Download, Calendar, BarChart3, Users } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function ReportsPage() {
  return (
    <DashboardLayout>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Relatórios</h1>
          <p className="text-muted-foreground">
            Gere e exporte relatórios de performance
          </p>
        </div>
        <Button className="gap-2 self-start sm:self-auto">
          <FileText className="h-4 w-4" />
          Novo Relatório
        </Button>
      </div>

      {/* Quick Reports */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="card-hover cursor-pointer">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Calendar className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="font-medium">Relatório Semanal</p>
              <p className="text-sm text-muted-foreground">Últimos 7 dias</p>
            </div>
          </CardContent>
        </Card>
        <Card className="card-hover cursor-pointer">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent/10">
              <BarChart3 className="h-6 w-6 text-accent" />
            </div>
            <div>
              <p className="font-medium">Relatório Mensal</p>
              <p className="text-sm text-muted-foreground">Janeiro 2026</p>
            </div>
          </CardContent>
        </Card>
        <Card className="card-hover cursor-pointer">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-success/10">
              <Users className="h-6 w-6 text-success" />
            </div>
            <div>
              <p className="font-medium">Por Cliente</p>
              <p className="text-sm text-muted-foreground">Selecione a conta</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Reports */}
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base font-medium">Relatórios Recentes</CardTitle>
          <Select defaultValue="all">
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              <SelectItem value="weekly">Semanais</SelectItem>
              <SelectItem value="monthly">Mensais</SelectItem>
              <SelectItem value="client">Por cliente</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              {
                name: 'Relatório Semanal - E-commerce Brasil',
                date: '27 Jan 2026',
                type: 'Semanal',
              },
              {
                name: 'Relatório Mensal - Janeiro 2026',
                date: '25 Jan 2026',
                type: 'Mensal',
              },
              {
                name: 'Performance Q4 - Imobiliária SP',
                date: '20 Jan 2026',
                type: 'Por cliente',
              },
              {
                name: 'Relatório Semanal - Clínica Estética',
                date: '19 Jan 2026',
                type: 'Semanal',
              },
            ].map((report, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg border border-border p-4 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{report.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {report.type} • {report.date}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="shrink-0">
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
