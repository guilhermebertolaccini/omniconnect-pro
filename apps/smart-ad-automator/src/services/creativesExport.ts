import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { RankedCreative } from '@/hooks/useAdCreatives';
import { PLATFORM_LABELS, type AdPlatform } from '@/services/platformConfigService';

const COLUMNS = [
  '#',
  'Criativo',
  'Campanha',
  'Plataforma',
  'Formato',
  'Score',
  'CTR (%)',
  'Conv. (%)',
  'ThruPlay (%)',
  'CPC (R$)',
  'Spend (R$)',
  'Leads',
  'Impressões',
  'Cliques',
];

function rowFor(c: RankedCreative, i: number): (string | number)[] {
  return [
    i + 1,
    c.name,
    c.campaignName ?? '—',
    PLATFORM_LABELS[c.platform as AdPlatform] ?? c.platform,
    c.format,
    Math.round(c.intent * 100),
    c.ctr.toFixed(2),
    c.conversionRate.toFixed(2),
    c.thruPlayRate.toFixed(1),
    c.cpc.toFixed(2),
    c.spend.toFixed(2),
    c.leads,
    c.impressions,
    c.clicks,
  ];
}

function csvEscape(v: string | number): string {
  const s = String(v ?? '');
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportCreativesCsv(creatives: RankedCreative[]) {
  const lines = [
    COLUMNS.join(','),
    ...creatives.map((c, i) => rowFor(c, i).map(csvEscape).join(',')),
  ];
  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, `ranking-criativos-${Date.now()}.csv`);
}

export function exportCreativesPdf(creatives: RankedCreative[]) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const generatedAt = new Date().toLocaleString('pt-BR');

  doc.setFontSize(14);
  doc.text('Ranking de criativos · Score de intenção', 40, 40);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Gerado em ${generatedAt} · ${creatives.length} criativos`, 40, 56);
  doc.setTextColor(0);

  autoTable(doc, {
    head: [COLUMNS],
    body: creatives.map((c, i) => rowFor(c, i)),
    startY: 70,
    styles: { fontSize: 7, cellPadding: 4 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    columnStyles: {
      0: { cellWidth: 22, halign: 'right' },
      5: { halign: 'right', fontStyle: 'bold' },
      6: { halign: 'right' },
      7: { halign: 'right' },
      8: { halign: 'right' },
      9: { halign: 'right' },
      10: { halign: 'right' },
      11: { halign: 'right' },
      12: { halign: 'right' },
      13: { halign: 'right' },
    },
  });

  doc.save(`ranking-criativos-${Date.now()}.pdf`);
}
