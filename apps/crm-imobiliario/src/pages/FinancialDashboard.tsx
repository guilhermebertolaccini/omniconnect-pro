import { useMemo, useState } from "react";
import { useI18n } from "@/i18n/useI18n";
import { useProperties } from "@/contexts/PropertyContext";
import { useFinancial } from "@/contexts/FinancialContext";
import { formatCurrency } from "@/data/mockData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from "recharts";
import {
  DollarSign, TrendingUp, AlertTriangle, Percent, Download, Wallet, Banknote, Clock, CheckCircle2,
} from "lucide-react";

const FMT_MONTH = new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit" });

type Period = "30" | "90" | "180" | "365" | "all";

function downloadCsv(filename: string, rows: Record<string, any>[]) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: any) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function FinancialDashboard() {
  const { t } = useI18n();
  const { properties } = useProperties();
  const { payments, commissions, markPaymentPaid, markCommissionPaid } = useFinancial();

  const [selectedProperty, setSelectedProperty] = useState<string>("all");
  const [selectedBroker, setSelectedBroker] = useState<string>("all");
  const [period, setPeriod] = useState<Period>("90");

  const brokers = useMemo(() => {
    const map = new Map<string, string>();
    commissions.forEach((c) => { if (c.brokerId) map.set(c.brokerId, c.brokerName || "—"); });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [commissions]);

  const periodStart = useMemo(() => {
    if (period === "all") return null;
    const d = new Date(); d.setDate(d.getDate() - Number(period)); return d;
  }, [period]);

  const filteredPayments = useMemo(() => payments.filter((p) => {
    if (selectedProperty !== "all" && p.propertyId !== selectedProperty) return false;
    if (selectedBroker !== "all") {
      // Broker filter via commission match by contract
      const com = commissions.find((c) => c.unitId === p.unitId);
      if (com?.brokerId !== selectedBroker) return false;
    }
    return true;
  }), [payments, commissions, selectedProperty, selectedBroker]);

  const filteredCommissions = useMemo(() => commissions.filter((c) => {
    if (selectedProperty !== "all" && c.propertyId !== selectedProperty) return false;
    if (selectedBroker !== "all" && c.brokerId !== selectedBroker) return false;
    return true;
  }), [commissions, selectedProperty, selectedBroker]);

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const in30 = new Date(now); in30.setDate(in30.getDate() + 30);
  const in60 = new Date(now); in60.setDate(in60.getDate() + 60);
  const in90 = new Date(now); in90.setDate(in90.getDate() + 90);

  const isOverdue = (p: any) => p.status !== "paid" && new Date(p.dueDate) < now;
  const dueWithin = (p: any, until: Date) =>
    p.status !== "paid" && new Date(p.dueDate) >= now && new Date(p.dueDate) <= until;

  const totalReceivedThisMonth = filteredPayments
    .filter((p) => p.status === "paid" && p.paidAt && new Date(p.paidAt) >= startOfMonth)
    .reduce((s, p) => s + p.amount, 0);
  const dueIn30 = filteredPayments.filter((p) => dueWithin(p, in30)).reduce((s, p) => s + p.amount, 0);
  const dueIn60 = filteredPayments.filter((p) => dueWithin(p, in60)).reduce((s, p) => s + p.amount, 0);
  const dueIn90 = filteredPayments.filter((p) => dueWithin(p, in90)).reduce((s, p) => s + p.amount, 0);
  const overdueList = filteredPayments.filter(isOverdue);
  const totalOverdue = overdueList.reduce((s, p) => s + p.amount, 0);
  const totalPendingAll = filteredPayments.filter((p) => p.status !== "paid").reduce((s, p) => s + p.amount, 0);
  const inadimplencia = totalPendingAll > 0 ? (totalOverdue / totalPendingAll) * 100 : 0;

  const commissionsToPay = filteredCommissions.filter((c) => c.status !== "paid").reduce((s, c) => s + c.commissionValue, 0);
  const commissionsPaid = filteredCommissions.filter((c) => c.status === "paid").reduce((s, c) => s + c.commissionValue, 0);

  const ticketMedio = filteredCommissions.length > 0
    ? filteredCommissions.reduce((s, c) => s + c.salePrice, 0) / filteredCommissions.length
    : 0;

  const kpis = [
    { label: "Recebido no mês", value: formatCurrency(totalReceivedThisMonth), icon: CheckCircle2, accent: "text-emerald-600" },
    { label: "A receber 30d", value: formatCurrency(dueIn30), icon: Clock, accent: "text-blue-600" },
    { label: "A receber 60d", value: formatCurrency(dueIn60), icon: Clock, accent: "text-blue-600" },
    { label: "A receber 90d", value: formatCurrency(dueIn90), icon: Clock, accent: "text-blue-600" },
    { label: "Inadimplência", value: `${inadimplencia.toFixed(1)}%`, icon: AlertTriangle, accent: "text-destructive" },
    { label: "Em atraso", value: formatCurrency(totalOverdue), icon: AlertTriangle, accent: "text-destructive" },
    { label: "Comissões a pagar", value: formatCurrency(commissionsToPay), icon: Wallet, accent: "text-amber-600" },
    { label: "Comissões pagas", value: formatCurrency(commissionsPaid), icon: Banknote, accent: "text-emerald-600" },
    { label: "Ticket médio", value: formatCurrency(ticketMedio), icon: TrendingUp, accent: "text-primary" },
  ];

  // Cashflow projection: 12 months forward
  const cashflow = useMemo(() => {
    const months: { key: string; label: string; previsto: number; recebido: number }[] = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      months.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        label: FMT_MONTH.format(d),
        previsto: 0,
        recebido: 0,
      });
    }
    filteredPayments.forEach((p) => {
      const d = new Date(p.dueDate);
      const k = `${d.getFullYear()}-${d.getMonth()}`;
      const m = months.find((x) => x.key === k);
      if (!m) return;
      if (p.status === "paid") m.recebido += p.amount;
      else m.previsto += p.amount;
    });
    return months;
  }, [filteredPayments]);

  // Aging buckets for overdue
  const aging = useMemo(() => {
    const buckets = [
      { name: "0-30d", value: 0 },
      { name: "31-60d", value: 0 },
      { name: "61-90d", value: 0 },
      { name: "90d+", value: 0 },
    ];
    overdueList.forEach((p) => {
      const days = Math.floor((now.getTime() - new Date(p.dueDate).getTime()) / 86400000);
      if (days <= 30) buckets[0].value += p.amount;
      else if (days <= 60) buckets[1].value += p.amount;
      else if (days <= 90) buckets[2].value += p.amount;
      else buckets[3].value += p.amount;
    });
    return buckets;
  }, [overdueList]);

  // Top 10 debtors
  const topDebtors = useMemo(() => {
    const map = new Map<string, { client: string; total: number; count: number }>();
    overdueList.forEach((p) => {
      const k = p.clientId;
      const cur = map.get(k) ?? { client: p.clientName, total: 0, count: 0 };
      cur.total += p.amount; cur.count += 1;
      map.set(k, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [overdueList]);

  // Broker commissions
  const brokerCommissions = useMemo(() => {
    const map = new Map<string, { name: string; pago: number; pendente: number }>();
    filteredCommissions.forEach((c) => {
      const k = c.brokerId || "—";
      const cur = map.get(k) ?? { name: c.brokerName || "—", pago: 0, pendente: 0 };
      if (c.status === "paid") cur.pago += c.commissionValue; else cur.pendente += c.commissionValue;
      map.set(k, cur);
    });
    return Array.from(map.values()).sort((a, b) => (b.pago + b.pendente) - (a.pago + a.pendente));
  }, [filteredCommissions]);

  // Period filter for tables: upcoming based on selected period
  const upcomingHorizon = useMemo(() => {
    const d = new Date();
    if (period === "all") d.setFullYear(d.getFullYear() + 5);
    else d.setDate(d.getDate() + Number(period));
    return d;
  }, [period]);

  const upcomingList = useMemo(
    () => filteredPayments
      .filter((p) => p.status !== "paid" && new Date(p.dueDate) >= now && new Date(p.dueDate) <= upcomingHorizon)
      .sort((a, b) => +new Date(a.dueDate) - +new Date(b.dueDate)),
    [filteredPayments, upcomingHorizon],
  );

  const exportOverdue = () => downloadCsv("inadimplencia.csv", overdueList.map((p) => ({
    cliente: p.clientName, unidade: p.unitNumber, tipo: p.type,
    parcela: p.installmentNumber ?? "", valor: p.amount,
    vencimento: new Date(p.dueDate).toLocaleDateString("pt-BR"),
    diasAtraso: Math.floor((now.getTime() - new Date(p.dueDate).getTime()) / 86400000),
  })));

  const exportUpcoming = () => downloadCsv("a-vencer.csv", upcomingList.map((p) => ({
    cliente: p.clientName, unidade: p.unitNumber, tipo: p.type,
    parcela: p.installmentNumber ?? "", valor: p.amount,
    vencimento: new Date(p.dueDate).toLocaleDateString("pt-BR"),
  })));

  const exportCommissions = () => downloadCsv("comissoes.csv", filteredCommissions.map((c) => ({
    corretor: c.brokerName, empreendimento: c.propertyName, unidade: c.unitNumber,
    venda: c.salePrice, percentual: c.commissionPercent, valor: c.commissionValue,
    status: c.status, pagoEm: c.paidAt ? new Date(c.paidAt).toLocaleDateString("pt-BR") : "",
  })));

  const labelType = (t: string, n?: number) =>
    t === "signal" ? "Sinal" : t === "balloon" ? "Balão" : `Parcela ${n ?? ""}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <h1 className="text-2xl font-display font-bold text-foreground">Dashboard Financeiro</h1>
        <div className="flex flex-wrap gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="30">Próximos 30 dias</SelectItem>
              <SelectItem value="90">Próximos 90 dias</SelectItem>
              <SelectItem value="180">Próximos 180 dias</SelectItem>
              <SelectItem value="365">Próximo ano</SelectItem>
              <SelectItem value="all">Tudo</SelectItem>
            </SelectContent>
          </Select>
          <Select value={selectedProperty} onValueChange={setSelectedProperty}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos empreendimentos</SelectItem>
              {properties.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedBroker} onValueChange={setSelectedBroker}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos corretores</SelectItem>
              {brokers.map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="p-2.5 rounded-lg bg-secondary">
                <kpi.icon className={`h-4 w-4 ${kpi.accent}`} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">{kpi.label}</p>
                <p className="text-base font-display font-bold text-foreground truncate">{kpi.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="font-display text-base">Fluxo de caixa projetado (12 meses)</CardTitle></CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cashflow}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Legend />
                  <Bar dataKey="recebido" name="Recebido" stackId="a" fill="hsl(160, 84%, 39%)" />
                  <Bar dataKey="previsto" name="Previsto" stackId="a" fill="hsl(38, 92%, 50%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="font-display text-base">Aging de inadimplência</CardTitle></CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={aging}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="value" name="Em atraso" fill="hsl(0, 84%, 60%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="font-display text-base">Top clientes inadimplentes</CardTitle></CardHeader>
          <CardContent>
            {topDebtors.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Nenhum cliente em atraso. 🎉</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-center">Parcelas</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topDebtors.map((d, i) => (
                    <TableRow key={i}>
                      <TableCell>{d.client}</TableCell>
                      <TableCell className="text-center">{d.count}</TableCell>
                      <TableCell className="text-right font-semibold text-destructive">{formatCurrency(d.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="font-display text-base">Comissões por corretor</CardTitle></CardHeader>
          <CardContent>
            {brokerCommissions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Sem comissões.</p>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={brokerCommissions} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    <Legend />
                    <Bar dataKey="pago" name="Pago" stackId="a" fill="hsl(160, 84%, 39%)" />
                    <Bar dataKey="pendente" name="Pendente" stackId="a" fill="hsl(38, 92%, 50%)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="font-display text-base text-destructive">
            Parcelas em atraso ({overdueList.length})
          </CardTitle>
          <Button variant="outline" size="sm" onClick={exportOverdue} disabled={overdueList.length === 0}>
            <Download className="h-4 w-4 mr-2" />Exportar CSV
          </Button>
        </CardHeader>
        <CardContent>
          {overdueList.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma parcela em atraso.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Unidade</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Atraso</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overdueList.map((p) => {
                  const days = Math.floor((now.getTime() - new Date(p.dueDate).getTime()) / 86400000);
                  return (
                    <TableRow key={p.id}>
                      <TableCell>{p.clientName}</TableCell>
                      <TableCell>{p.unitNumber}</TableCell>
                      <TableCell>{labelType(p.type, p.installmentNumber)}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(p.amount)}</TableCell>
                      <TableCell>{new Date(p.dueDate).toLocaleDateString("pt-BR")}</TableCell>
                      <TableCell><Badge variant="destructive">{days}d</Badge></TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => markPaymentPaid(p.id)}>
                          Marcar pago
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="font-display text-base">A vencer ({upcomingList.length})</CardTitle>
          <Button variant="outline" size="sm" onClick={exportUpcoming} disabled={upcomingList.length === 0}>
            <Download className="h-4 w-4 mr-2" />Exportar CSV
          </Button>
        </CardHeader>
        <CardContent>
          {upcomingList.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma parcela no horizonte selecionado.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Unidade</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {upcomingList.slice(0, 50).map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.clientName}</TableCell>
                    <TableCell>{p.unitNumber}</TableCell>
                    <TableCell>{labelType(p.type, p.installmentNumber)}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(p.amount)}</TableCell>
                    <TableCell>{new Date(p.dueDate).toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => markPaymentPaid(p.id)}>
                        Marcar pago
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="font-display text-base">Comissões pendentes</CardTitle>
          <Button variant="outline" size="sm" onClick={exportCommissions} disabled={filteredCommissions.length === 0}>
            <Download className="h-4 w-4 mr-2" />Exportar CSV
          </Button>
        </CardHeader>
        <CardContent>
          {filteredCommissions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Sem comissões.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Corretor</TableHead>
                  <TableHead>Unidade</TableHead>
                  <TableHead className="text-right">Venda</TableHead>
                  <TableHead className="text-right">%</TableHead>
                  <TableHead className="text-right">Comissão</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCommissions.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.brokerName}</TableCell>
                    <TableCell>{c.unitNumber}</TableCell>
                    <TableCell className="text-right">{formatCurrency(c.salePrice)}</TableCell>
                    <TableCell className="text-right">{c.commissionPercent}%</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(c.commissionValue)}</TableCell>
                    <TableCell>
                      <Badge variant={c.status === "paid" ? "default" : "secondary"}>
                        {c.status === "paid" ? "Pago" : "Pendente"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {c.status !== "paid" && (
                        <Button size="sm" variant="outline" onClick={() => markCommissionPaid(c.id)}>
                          Marcar pago
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {payments.length === 0 && commissions.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">{t("noFinancialData")}</p>
            <p className="text-sm mt-1">{t("noFinancialDataDesc")}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
