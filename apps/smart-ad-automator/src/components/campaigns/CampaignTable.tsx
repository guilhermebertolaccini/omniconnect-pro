import { useState, useMemo } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { MoreHorizontal, Play, Pause, Sparkles, Building2 } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Campaign } from '@/types/campaign';
import { cn } from '@/lib/utils';

interface CampaignTableProps {
  campaigns: Campaign[];
  onAnalyze: (campaign: Campaign) => void;
}

const statusConfig = {
  active: { label: 'Ativa', class: 'bg-success/20 text-success border-success/30' },
  paused: { label: 'Pausada', class: 'bg-warning/20 text-warning border-warning/30' },
  ended: { label: 'Encerrada', class: 'bg-muted text-muted-foreground border-muted' },
  issue: { label: 'Problema', class: 'bg-destructive/20 text-destructive border-destructive/30' },
};

function groupByAccount(campaigns: Campaign[]) {
  const groups: Record<string, Campaign[]> = {};
  for (const c of campaigns) {
    if (!groups[c.accountName]) groups[c.accountName] = [];
    groups[c.accountName].push(c);
  }
  return Object.entries(groups);
}

function accountMetrics(campaigns: Campaign[]) {
  const totalSpent = campaigns.reduce((s, c) => s + c.spent, 0);
  const totalConversions = campaigns.reduce((s, c) => s + c.conversions, 0);
  const totalWhatsapp = campaigns.reduce((s, c) => s + c.whatsappConversations, 0);
  const totalMqls = campaigns.reduce((s, c) => s + c.mqls, 0);
  const roasValues = campaigns.filter((c) => c.roas > 0);
  const avgRoas = roasValues.length > 0
    ? roasValues.reduce((s, c) => s + c.roas, 0) / roasValues.length
    : 0;
  return { totalSpent, totalConversions, totalWhatsapp, totalMqls, avgRoas };
}

export function CampaignTable({ campaigns, onAnalyze }: CampaignTableProps) {
  const isMobile = useIsMobile();
  const grouped = useMemo(() => groupByAccount(campaigns), [campaigns]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);

  if (campaigns.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8 text-sm text-muted-foreground">
          Nenhuma campanha encontrada.
        </CardContent>
      </Card>
    );
  }

  if (isMobile) {
    return (
      <div className="space-y-6">
        {grouped.map(([accountName, accountCampaigns]) => (
          <div key={accountName}>
            {(() => {
              const m = accountMetrics(accountCampaigns);
              return (
                <div className="mb-3 rounded-lg border border-border bg-muted/30 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm font-semibold">{accountName}</p>
                    <Badge variant="secondary" className="text-xs">
                      {accountCampaigns.length}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-xs mb-2">
                    <div>
                      <p className="text-muted-foreground">Total gasto</p>
                      <p className="font-semibold">{formatCurrency(m.totalSpent)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Conversões</p>
                      <p className="font-semibold">{m.totalConversions}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">ROAS médio</p>
                      <p className="font-semibold">{m.avgRoas > 0 ? `${m.avgRoas.toFixed(1)}x` : '-'}</p>
                    </div>
                  </div>
                  {m.totalWhatsapp > 0 && (
                    <div className="grid grid-cols-2 gap-3 text-xs border-t border-border pt-2">
                      <div>
                        <p className="text-muted-foreground">WhatsApp</p>
                        <p className="font-semibold text-success">{m.totalWhatsapp}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">MQLs</p>
                        <p className="font-semibold text-accent">{m.totalMqls}</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
            <div className="space-y-3">
              {accountCampaigns.map((campaign) => {
                const status = statusConfig[campaign.status];
                return (
                  <Card key={campaign.id} className="overflow-hidden">
                    <CardContent className="p-4">
                      <div className="mb-3 flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{campaign.name}</p>
                        </div>
                        <Badge variant="outline" className={cn('shrink-0', status.class)}>
                          {status.label}
                        </Badge>
                      </div>

                      <div className="mb-3 grid grid-cols-3 gap-3 text-sm">
                        <div>
                          <p className="text-muted-foreground">Gasto</p>
                          <p className="font-medium">{formatCurrency(campaign.spent)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">ROAS</p>
                          <p
                            className={cn(
                              'font-medium',
                              campaign.roas >= 4 && 'text-success',
                              campaign.roas > 0 && campaign.roas < 2 && 'text-destructive'
                            )}
                          >
                            {campaign.roas > 0 ? `${campaign.roas.toFixed(1)}x` : '-'}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Conversões</p>
                          <p className="font-medium">{campaign.conversions}</p>
                        </div>
                      </div>

                      {campaign.whatsappConversations > 0 && (
                        <div className="mb-3 grid grid-cols-2 gap-3 text-sm border-t border-border pt-2">
                          <div>
                            <p className="text-muted-foreground">WhatsApp</p>
                            <p className="font-medium text-success">{campaign.whatsappConversations}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">MQL</p>
                            <p className="font-medium text-accent">{campaign.mqls}</p>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 gap-2"
                          onClick={() => onAnalyze(campaign)}
                        >
                          <Sparkles className="h-4 w-4 text-primary" />
                          Analisar com IA
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>
                              <Play className="mr-2 h-4 w-4" /> Ativar
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Pause className="mr-2 h-4 w-4" /> Pausar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {grouped.map(([accountName, accountCampaigns]) => (
        <div key={accountName} className="rounded-lg border border-border bg-card overflow-hidden">
          {(() => {
            const m = accountMetrics(accountCampaigns);
            return (
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-border bg-muted/50 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-semibold">{accountName}</p>
                  <Badge variant="secondary" className="text-xs">
                    {accountCampaigns.length} campanha{accountCampaigns.length !== 1 ? 's' : ''}
                  </Badge>
                </div>
                <div className="ml-auto flex items-center gap-5 text-xs text-muted-foreground">
                  <span>Gasto: <strong className="text-foreground">{formatCurrency(m.totalSpent)}</strong></span>
                  <span>Conversões: <strong className="text-foreground">{m.totalConversions}</strong></span>
                  {m.totalWhatsapp > 0 && <span>WhatsApp: <strong className="text-success">{m.totalWhatsapp}</strong></span>}
                  {m.totalMqls > 0 && <span>MQLs: <strong className="text-accent">{m.totalMqls}</strong></span>}
                  <span>ROAS médio: <strong className="text-foreground">{m.avgRoas > 0 ? `${m.avgRoas.toFixed(1)}x` : '-'}</strong></span>
                </div>
              </div>
            );
          })()}
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[280px]">Campanha</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Gasto</TableHead>
                <TableHead className="text-right">Conversões</TableHead>
                <TableHead className="text-right">WhatsApp</TableHead>
                <TableHead className="text-right">MQL</TableHead>
                <TableHead className="text-right">ROAS</TableHead>
                <TableHead className="text-right">CPA</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accountCampaigns.map((campaign) => {
                const status = statusConfig[campaign.status];
                return (
                  <TableRow key={campaign.id}>
                    <TableCell>
                      <p className="font-medium">{campaign.name}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn(status.class)}>
                        {status.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(campaign.spent)}
                    </TableCell>
                    <TableCell className="text-right">{campaign.conversions}</TableCell>
                    <TableCell className="text-right">
                      {campaign.whatsappConversations > 0 ? (
                        <span className="text-success font-medium">{campaign.whatsappConversations}</span>
                      ) : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      {campaign.mqls > 0 ? (
                        <span className="text-accent font-medium">{campaign.mqls}</span>
                      ) : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={cn(
                          'font-medium',
                          campaign.roas >= 4 && 'text-success',
                          campaign.roas > 0 && campaign.roas < 2 && 'text-destructive'
                        )}
                      >
                        {campaign.roas > 0 ? `${campaign.roas.toFixed(1)}x` : '-'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {campaign.cpa > 0 ? formatCurrency(campaign.cpa) : '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => onAnalyze(campaign)}
                        >
                          <Sparkles className="h-4 w-4 text-primary" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>
                              <Play className="mr-2 h-4 w-4" /> Ativar
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Pause className="mr-2 h-4 w-4" /> Pausar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onAnalyze(campaign)}>
                              <Sparkles className="mr-2 h-4 w-4" /> Analisar com IA
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ))}
    </div>
  );
}
