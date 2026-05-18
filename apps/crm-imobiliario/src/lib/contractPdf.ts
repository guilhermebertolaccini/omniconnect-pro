import jsPDF from "jspdf";
import { Contract } from "@/types/property";

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function generateContractPdf(c: Contract): Blob {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 48;
  const pageWidth = 595;
  let y = margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("CONTRATO PARTICULAR DE COMPRA E VENDA", pageWidth / 2, y, { align: "center" });
  y += 30;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  const intro =
    "Pelo presente instrumento particular, as partes abaixo qualificadas têm entre si justo e contratado o seguinte:";
  const lines = doc.splitTextToSize(intro, pageWidth - margin * 2);
  doc.text(lines, margin, y);
  y += lines.length * 14 + 8;

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
    doc.text(value, margin + 140, y, { maxWidth: pageWidth - margin - 140 });
    y += 16;
  };

  section("PARTES");
  row("Vendedor", "Tática Imóveis LTDA");
  row("Comprador", c.clientName);
  row("CPF/CNPJ", c.clientCpfCnpj || "—");

  y += 6;
  section("OBJETO");
  row("Empreendimento", c.propertyName);
  row("Unidade", c.unitNumber);

  y += 6;
  section("PREÇO E CONDIÇÕES");
  row("Preço total", formatBRL(c.finalPrice));
  const pc = c.paymentCondition;
  row("Entrada", `${formatBRL(pc.downPayment)} (${pc.downPaymentPercent}%)`);
  row("Parcelas", `${pc.installments}x ${formatBRL(pc.installmentValue)}`);
  if (pc.balloon > 0) row("Balão", `${formatBRL(pc.balloon)} (${pc.balloonPercent}%)`);
  row("Sistema", pc.method.toUpperCase());
  row("Juros mensal", `${pc.interestRate}%`);
  row("Indexador", pc.indexer === "none" ? "Nenhum" : pc.indexer.toUpperCase());

  y += 8;
  section("CLÁUSULAS");
  const clauses = [
    "1. O presente contrato regulamenta a venda da unidade descrita acima, conforme valores e condições aqui estabelecidas.",
    "2. O atraso no pagamento de qualquer parcela acarretará multa e juros conforme legislação vigente.",
    "3. As partes elegem o foro da comarca do imóvel para dirimir quaisquer dúvidas ou litígios decorrentes deste contrato.",
  ];
  for (const cl of clauses) {
    const cls = doc.splitTextToSize(cl, pageWidth - margin * 2);
    doc.text(cls, margin, y);
    y += cls.length * 14 + 4;
  }

  if (c.notes) {
    y += 4;
    section("OBSERVAÇÕES");
    const ns = doc.splitTextToSize(c.notes, pageWidth - margin * 2);
    doc.text(ns, margin, y);
    y += ns.length * 14;
  }

  // Signatures
  y = Math.max(y + 20, 680);
  const sigCols = 2;
  const colW = (pageWidth - margin * 2) / sigCols;
  c.signatures.forEach((s, idx) => {
    const col = idx % sigCols;
    const rowI = Math.floor(idx / sigCols);
    const x = margin + col * colW + 20;
    const yy = y + rowI * 70;
    doc.setDrawColor(0);
    doc.line(x, yy + 30, x + colW - 40, yy + 30);
    doc.setFontSize(10);
    const label = `${s.role.toUpperCase()}${s.name ? ": " + s.name : ""}${s.signed ? "  ✓ assinado" : ""}`;
    doc.text(label, x, yy + 44);
  });

  return doc.output("blob");
}