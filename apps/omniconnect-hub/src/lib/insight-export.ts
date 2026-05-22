import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export type ExportLeadResult = {
  id: string;
  name: string;
  stage: string;
  text: string;
  matchedCount: number;
  citationCount: number;
};

export type ExportPayload = {
  createdAt: number;
  presetLabel: string;
  mode: "single" | "batch";
  prompt: string;
  context: string;
  canceled?: boolean;
  selectedNames: string[];
  leadResults: ExportLeadResult[];
};

type ParsedCitation = {
  idx: number;
  lead: string;
  channel: string;
  at: string;
  by: string;
  matched: boolean;
  text: string;
};

type ParsedLead = {
  name: string;
  stage: string;
  matchedCount: number;
  citationCount: number;
  citations: ParsedCitation[];
  signals: string[];
};

function parseLeadResult(r: ExportLeadResult): ParsedLead {
  const lines = r.text.split("\n");
  const citations: ParsedCitation[] = [];
  const signals: string[] = [];
  for (const ln of lines) {
    if (ln.startsWith("@@CITE|")) {
      const [, idx, lead, channel, at, by, matched, ...rest] = ln.split("|");
      citations.push({
        idx: Number(idx),
        lead,
        channel: channel || "",
        at: at || "",
        by: by || "",
        matched: matched === "1",
        text: rest.join("|"),
      });
    } else if (ln.startsWith("- ")) {
      signals.push(ln.slice(2));
    }
  }
  return {
    name: r.name,
    stage: r.stage,
    matchedCount: r.matchedCount,
    citationCount: r.citationCount,
    citations,
    signals,
  };
}

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function fileStamp(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export function exportAnalysisCSV(payload: ExportPayload) {
  const rows: string[] = [];
  rows.push(
    ["lead", "stage", "citation_index", "channel", "at", "by", "matched", "text"]
      .map(csvEscape)
      .join(","),
  );
  for (const r of payload.leadResults) {
    const parsed = parseLeadResult(r);
    if (parsed.citations.length === 0) {
      rows.push(
        [parsed.name, parsed.stage, "", "", "", "", "", "(sem citações)"]
          .map(csvEscape)
          .join(","),
      );
      continue;
    }
    for (const c of parsed.citations) {
      rows.push(
        [
          parsed.name,
          parsed.stage,
          c.idx,
          c.channel,
          c.at,
          c.by,
          c.matched ? "yes" : "no",
          c.text,
        ]
          .map(csvEscape)
          .join(","),
      );
    }
  }
  // Summary rows
  rows.push("");
  rows.push(["lead", "stage", "citations", "matches", "signals"].map(csvEscape).join(","));
  for (const r of payload.leadResults) {
    const parsed = parseLeadResult(r);
    rows.push(
      [
        parsed.name,
        parsed.stage,
        parsed.citationCount,
        parsed.matchedCount,
        parsed.signals.join(" | "),
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  const blob = new Blob(["\uFEFF" + rows.join("\n")], { type: "text/csv;charset=utf-8" });
  triggerDownload(blob, `insightai-${fileStamp(payload.createdAt)}.csv`);
}

export function exportAnalysisPDF(payload: ExportPayload) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;
  let y = margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("InsightAI — Análise de conversas", margin, y);
  y += 22;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(90);
  const meta = [
    `Gerado em ${new Date(payload.createdAt).toLocaleString("pt-BR")}`,
    `Modelo: ${payload.presetLabel}`,
    `Modo: ${payload.mode === "single" ? "Individual" : "Em lote"} · ${payload.leadResults.length} conversa(s)`,
    payload.context ? `Contexto de busca: ${payload.context}` : null,
    payload.canceled ? "Status: execução cancelada (resultados parciais)" : null,
  ].filter(Boolean) as string[];
  meta.forEach((m) => {
    doc.text(m, margin, y);
    y += 13;
  });
  y += 4;

  doc.setTextColor(20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Prompt", margin, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const promptLines = doc.splitTextToSize(payload.prompt || "(vazio)", pageWidth - margin * 2);
  doc.text(promptLines, margin, y);
  y += promptLines.length * 12 + 8;

  // Summary table
  autoTable(doc, {
    startY: y,
    head: [["Conversa", "Etapa", "Citações", "Matches"]],
    body: payload.leadResults.map((r) => [
      r.name,
      r.stage,
      String(r.citationCount),
      String(r.matchedCount),
    ]),
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [240, 240, 245], textColor: 30 },
    margin: { left: margin, right: margin },
  });

  // Per-lead detail
  for (const r of payload.leadResults) {
    const parsed = parseLeadResult(r);
    const lastY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
    let cursor = lastY + 24;
    if (cursor > doc.internal.pageSize.getHeight() - 120) {
      doc.addPage();
      cursor = margin;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(20);
    doc.text(`${parsed.name} · ${parsed.stage}`, margin, cursor);
    cursor += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.text(
      `${parsed.citationCount} citações · ${parsed.matchedCount} match(es)`,
      margin,
      cursor,
    );
    cursor += 6;

    autoTable(doc, {
      startY: cursor,
      head: [["#", "Canal", "Quando", "Por", "Match", "Trecho"]],
      body: parsed.citations.map((c) => [
        String(c.idx),
        c.channel,
        c.at,
        c.by,
        c.matched ? "Sim" : "—",
        c.text,
      ]),
      styles: { fontSize: 8, cellPadding: 3, valign: "top" },
      headStyles: { fillColor: [245, 245, 250], textColor: 40 },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 60 },
        2: { cellWidth: 90 },
        3: { cellWidth: 70 },
        4: { cellWidth: 40 },
        5: { cellWidth: "auto" },
      },
      margin: { left: margin, right: margin },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 4 && data.cell.raw === "Sim") {
          data.cell.styles.textColor = [16, 122, 87];
          data.cell.styles.fontStyle = "bold";
        }
      },
    });

    if (parsed.signals.length) {
      const afterY =
        (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? cursor;
      let sy = afterY + 10;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(40);
      doc.text("Sinais e próximos passos", margin, sy);
      sy += 12;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(60);
      for (const s of parsed.signals) {
        const wrapped = doc.splitTextToSize(`• ${s}`, pageWidth - margin * 2);
        if (sy + wrapped.length * 11 > doc.internal.pageSize.getHeight() - margin) {
          doc.addPage();
          sy = margin;
        }
        doc.text(wrapped, margin, sy);
        sy += wrapped.length * 11 + 2;
      }
    }
  }

  doc.save(`insightai-${fileStamp(payload.createdAt)}.pdf`);
}
