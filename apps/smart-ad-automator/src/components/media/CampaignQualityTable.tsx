import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { qualityBadge } from '@/services/mediaScoring';
import { PLATFORM_LABELS, type AdPlatform } from '@/services/platformConfigService';
import type { NormalizedCampaign } from '@/hooks/useMediaIndicators';

const fmtMoney = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtNum = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });

const TONE_CLASS: Record<'good' | 'mid' | 'low', string> = {
  good: 'bg-green-500/15 text-green-400 border-green-500/30',
  mid: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  low: 'bg-red-500/15 text-red-400 border-red-500/30',
};

export function CampaignQualityTable({ campaigns }: { campaigns: NormalizedCampaign[] }) {
  const ranked = [...campaigns].sort((a, b) => b.qualityScore - a.qualityScore).slice(0, 25);

  return (
    <Card className="bg-card/50 backdrop-blur border-border/50">
      <CardHeader>
        <CardTitle className="text-base">Campanhas com maior qualidade comercial</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {ranked.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem campanhas no período.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campanha</TableHead>
                <TableHead>Canal</TableHead>
                <TableHead className="text-right">Investimento</TableHead>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead className="text-right">CPL</TableHead>
                <TableHead className="text-right">Qualif.</TableHead>
                <TableHead className="text-right">Vendas</TableHead>
                <TableHead className="text-right">Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ranked.map((c) => {
                const badge = qualityBadge(c.qualityScore);
                return (
                  <TableRow key={`${c.platform}-${c.campaignId}`}>
                    <TableCell className="max-w-[260px] truncate font-medium">{c.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {PLATFORM_LABELS[c.platform as AdPlatform]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{fmtMoney(c.spend)}</TableCell>
                    <TableCell className="text-right">{fmtNum(c.leads)}</TableCell>
                    <TableCell className="text-right">{c.cpl > 0 ? fmtMoney(c.cpl) : '—'}</TableCell>
                    <TableCell className="text-right">{fmtNum(c.qualifiedLeads)}</TableCell>
                    <TableCell className="text-right">{fmtNum(c.sales)}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline" className={TONE_CLASS[badge.tone]}>
                        {badge.label} · {(c.qualityScore * 100).toFixed(0)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
