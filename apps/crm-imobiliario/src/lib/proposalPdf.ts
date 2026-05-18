import jsPDF from "jspdf";
import { Proposal } from "@/types/property";

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function generateProposalPdf(p: Proposal): Blob {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 48;
  let y = margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("PROPOSTA COMERCIAL", margin, y);
  y += 24;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Emitida em: ${new Date(p.createdAt).toLocaleString("pt-BR")}`, margin, y);
  doc.text(`Validade: ${new Date(p.validUntil).toLocaleDateString("pt-BR")}`, margin + 280, y);
  y += 20;

  doc.setDrawColor(200);
  doc.line(margin, y, 595 - margin, y);
  y += 18;

  const section = (title: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(title, margin, y);
    y += 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
  };

  const row = (label: string, value: string) => {
    doc.setFont("helvetica", "bold");
    doc.text(`${label}:`, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(value, margin + 140, y, { maxWidth: 595 - margin - 140 });
    y += 16;
  };

  section("EMPREENDIMENTO");
  row("Imóvel", p.propertyName);
  row("Unidade", p.unitNumber);

  y += 6;
  section("CLIENTE");
  row("Nome", p.clientName);

  y += 6;
  section("VALORES");
  row("Preço original", formatBRL(p.originalPrice));
  row("Desconto", `${p.discountPercent}% (${formatBRL(p.discount)})`);
  doc.setFont("helvetica", "bold");
  doc.text("Preço final:", margin, y);
  doc.setFontSize(13);
  doc.text(formatBRL(p.finalPrice), margin + 140, y);
  doc.setFontSize(11);
  y += 22;

  section("CONDIÇÕES DE PAGAMENTO");
  const pc = p.paymentCondition;
  row("Entrada", `${formatBRL(pc.downPayment)} (${pc.downPaymentPercent}%)`);
  row("Parcelas", `${pc.installments}x ${formatBRL(pc.installmentValue)}`);
  if (pc.balloon > 0) row("Balão", `${formatBRL(pc.balloon)} (${pc.balloonPercent}%)`);
  row("Sistema", pc.method.toUpperCase());
  row("Juros mensal", `${pc.interestRate}%`);
  row("Indexador", pc.indexer === "none" ? "Nenhum" : pc.indexer.toUpperCase());

  if (p.notes) {
    y += 8;
    section("OBSERVAÇÕES");
    const lines = doc.splitTextToSize(p.notes, 595 - margin * 2);
    doc.text(lines, margin, y);
    y += lines.length * 14;
  }

  y = Math.max(y, 720);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Proposta gerada por ${p.createdBy}`, margin, y);

  return doc.output("blob");
}