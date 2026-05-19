import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import type { MessageAnalytics, DeliveryMetrics, FailureReason, SpamReport } from '@/types/whatsapp';

interface ReportData {
  phoneNumber: string;
  period: string;
  analytics: MessageAnalytics[];
  metrics: DeliveryMetrics;
  failureReasons: FailureReason[];
  spamReports: SpamReport[];
  generatedAt: Date;
}

export function exportToPDF(data: ReportData): void {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Header
  doc.setFontSize(20);
  doc.setTextColor(33, 33, 33);
  doc.text('Relatório de Métricas WhatsApp', pageWidth / 2, 20, { align: 'center' });
  
  doc.setFontSize(12);
  doc.setTextColor(100, 100, 100);
  doc.text(`Número: ${data.phoneNumber}`, 14, 35);
  doc.text(`Período: ${data.period}`, 14, 42);
  doc.text(`Gerado em: ${data.generatedAt.toLocaleString('pt-BR')}`, 14, 49);
  
  // Summary Metrics
  doc.setFontSize(14);
  doc.setTextColor(33, 33, 33);
  doc.text('Resumo de Métricas', 14, 65);
  
  autoTable(doc, {
    startY: 70,
    head: [['Métrica', 'Valor', 'Percentual']],
    body: [
      ['Total Enviadas', data.metrics.totalSent.toLocaleString('pt-BR'), '100%'],
      ['Total Entregues', data.metrics.totalDelivered.toLocaleString('pt-BR'), `${data.metrics.deliveryRate.toFixed(1)}%`],
      ['Total Lidas', data.metrics.totalRead.toLocaleString('pt-BR'), `${data.metrics.readRate.toFixed(1)}%`],
      ['Total Falhas', data.metrics.totalFailed.toLocaleString('pt-BR'), `${data.metrics.failureRate.toFixed(1)}%`],
    ],
    theme: 'striped',
    headStyles: { fillColor: [59, 130, 246] },
    styles: { fontSize: 10 },
  });
  
  // Failure Reasons
  const finalY1 = (doc as any).lastAutoTable.finalY || 100;
  doc.setFontSize(14);
  doc.text('Motivos de Falha', 14, finalY1 + 15);
  
  autoTable(doc, {
    startY: finalY1 + 20,
    head: [['Código', 'Descrição', 'Quantidade', 'Percentual']],
    body: data.failureReasons.map((reason) => [
      reason.code,
      reason.description,
      reason.count.toLocaleString('pt-BR'),
      `${reason.percentage.toFixed(1)}%`,
    ]),
    theme: 'striped',
    headStyles: { fillColor: [239, 68, 68] },
    styles: { fontSize: 10 },
  });
  
  // Daily Analytics - New Page
  doc.addPage();
  doc.setFontSize(14);
  doc.text('Histórico Diário de Entregas', 14, 20);
  
  autoTable(doc, {
    startY: 25,
    head: [['Data', 'Enviadas', 'Entregues', 'Lidas', 'Falhas', 'Pendentes']],
    body: data.analytics.map((day) => [
      day.date,
      day.sent.toLocaleString('pt-BR'),
      day.delivered.toLocaleString('pt-BR'),
      day.read.toLocaleString('pt-BR'),
      day.failed.toLocaleString('pt-BR'),
      day.pending.toLocaleString('pt-BR'),
    ]),
    theme: 'striped',
    headStyles: { fillColor: [34, 197, 94] },
    styles: { fontSize: 9 },
  });
  
  // Spam Reports
  const finalY2 = (doc as any).lastAutoTable.finalY || 100;
  
  if (finalY2 + 60 > doc.internal.pageSize.getHeight()) {
    doc.addPage();
    doc.setFontSize(14);
    doc.text('Denúncias de Spam', 14, 20);
    
    autoTable(doc, {
      startY: 25,
      head: [['Data', 'Denúncias', 'Bloqueios', 'Impacto']],
      body: data.spamReports.map((report) => [
        report.date,
        report.reportsReceived.toString(),
        report.blockedUsers.toString(),
        report.qualityImpact,
      ]),
      theme: 'striped',
      headStyles: { fillColor: [249, 115, 22] },
      styles: { fontSize: 10 },
    });
  } else {
    doc.setFontSize(14);
    doc.text('Denúncias de Spam', 14, finalY2 + 15);
    
    autoTable(doc, {
      startY: finalY2 + 20,
      head: [['Data', 'Denúncias', 'Bloqueios', 'Impacto']],
      body: data.spamReports.map((report) => [
        report.date,
        report.reportsReceived.toString(),
        report.blockedUsers.toString(),
        report.qualityImpact,
      ]),
      theme: 'striped',
      headStyles: { fillColor: [249, 115, 22] },
      styles: { fontSize: 10 },
    });
  }
  
  // Footer on all pages
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Página ${i} de ${pageCount} - BotFlow Manager`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' }
    );
  }
  
  // Save
  const fileName = `relatorio-whatsapp-${data.phoneNumber.replace(/\D/g, '')}-${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}

export function exportToExcel(data: ReportData): void {
  const workbook = XLSX.utils.book_new();
  
  // Summary Sheet
  const summaryData = [
    ['Relatório de Métricas WhatsApp'],
    [],
    ['Número', data.phoneNumber],
    ['Período', data.period],
    ['Gerado em', data.generatedAt.toLocaleString('pt-BR')],
    [],
    ['RESUMO DE MÉTRICAS'],
    ['Métrica', 'Valor', 'Percentual'],
    ['Total Enviadas', data.metrics.totalSent, '100%'],
    ['Total Entregues', data.metrics.totalDelivered, `${data.metrics.deliveryRate.toFixed(1)}%`],
    ['Total Lidas', data.metrics.totalRead, `${data.metrics.readRate.toFixed(1)}%`],
    ['Total Falhas', data.metrics.totalFailed, `${data.metrics.failureRate.toFixed(1)}%`],
  ];
  
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  summarySheet['!cols'] = [{ wch: 20 }, { wch: 15 }, { wch: 15 }];
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumo');
  
  // Daily Analytics Sheet
  const analyticsData = [
    ['HISTÓRICO DIÁRIO DE ENTREGAS'],
    [],
    ['Data', 'Enviadas', 'Entregues', 'Lidas', 'Falhas', 'Pendentes'],
    ...data.analytics.map((day) => [
      day.date,
      day.sent,
      day.delivered,
      day.read,
      day.failed,
      day.pending,
    ]),
  ];
  
  const analyticsSheet = XLSX.utils.aoa_to_sheet(analyticsData);
  analyticsSheet['!cols'] = [
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
  ];
  XLSX.utils.book_append_sheet(workbook, analyticsSheet, 'Histórico Diário');
  
  // Failure Reasons Sheet
  const failureData = [
    ['MOTIVOS DE FALHA'],
    [],
    ['Código', 'Descrição', 'Quantidade', 'Percentual'],
    ...data.failureReasons.map((reason) => [
      reason.code,
      reason.description,
      reason.count,
      `${reason.percentage.toFixed(1)}%`,
    ]),
  ];
  
  const failureSheet = XLSX.utils.aoa_to_sheet(failureData);
  failureSheet['!cols'] = [{ wch: 12 }, { wch: 30 }, { wch: 12 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(workbook, failureSheet, 'Falhas');
  
  // Spam Reports Sheet
  const spamData = [
    ['DENÚNCIAS DE SPAM'],
    [],
    ['Data', 'Denúncias Recebidas', 'Usuários Bloqueados', 'Impacto na Qualidade'],
    ...data.spamReports.map((report) => [
      report.date,
      report.reportsReceived,
      report.blockedUsers,
      report.qualityImpact,
    ]),
  ];
  
  const spamSheet = XLSX.utils.aoa_to_sheet(spamData);
  spamSheet['!cols'] = [{ wch: 12 }, { wch: 20 }, { wch: 20 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(workbook, spamSheet, 'Spam');
  
  // Save
  const fileName = `relatorio-whatsapp-${data.phoneNumber.replace(/\D/g, '')}-${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(workbook, fileName);
}
