import {
  LINE_HEALTH_LINES,
  type LineHealthLine,
  type LineQuality,
} from "@/lib/leads-data";

export type LineHealthAlertSeverity = "critical" | "warning" | "info";

export type LineHealthAlert = {
  id: string;
  severity: LineHealthAlertSeverity;
  title: string;
  detail: string;
  time: string;
  lineId: string;
  tenantId: string;
  tenantName: string;
  level?: "MEDIUM" | "LOW";
  durationHours?: number;
  thresholdHours?: number;
  suggestion?: {
    kind: "pause" | "rotate" | "both";
    targetLineId?: string;
    targetLabel?: string;
  };
};

const STATUS_TIME: Record<LineHealthLine["status"], string> = {
  CONNECTED: "agora",
  FLAGGED: "há 18 min",
  PENDING_REVIEW: "há 1 h",
  RESTRICTED: "há 32 min",
};

// ---------------------------------------------------------------------------
// Preferences (compartilhadas com /settings/line-health)
// ---------------------------------------------------------------------------

export const LINE_HEALTH_PREFS_KEY = "line-health-prefs";

export type LineHealthPrefs = {
  durationAlertHours: { MEDIUM: number; LOW: number };
  suggestRotation: boolean;
};

export const DEFAULT_LINE_HEALTH_PREFS: LineHealthPrefs = {
  durationAlertHours: { MEDIUM: 6, LOW: 2 },
  suggestRotation: true,
};

export function loadLineHealthPrefs(): LineHealthPrefs {
  if (typeof window === "undefined") return DEFAULT_LINE_HEALTH_PREFS;
  try {
    const raw = window.localStorage.getItem(LINE_HEALTH_PREFS_KEY);
    if (!raw) return DEFAULT_LINE_HEALTH_PREFS;
    const parsed = JSON.parse(raw) as Partial<LineHealthPrefs>;
    return {
      durationAlertHours: {
        MEDIUM:
          parsed.durationAlertHours?.MEDIUM ??
          DEFAULT_LINE_HEALTH_PREFS.durationAlertHours.MEDIUM,
        LOW:
          parsed.durationAlertHours?.LOW ??
          DEFAULT_LINE_HEALTH_PREFS.durationAlertHours.LOW,
      },
      suggestRotation:
        parsed.suggestRotation ?? DEFAULT_LINE_HEALTH_PREFS.suggestRotation,
    };
  } catch {
    return DEFAULT_LINE_HEALTH_PREFS;
  }
}

export function saveLineHealthPrefs(prefs: LineHealthPrefs) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LINE_HEALTH_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Duração de degradação
// ---------------------------------------------------------------------------

const QUALITY_RANK: Record<LineQuality, number> = { LOW: 1, MEDIUM: 2, HIGH: 3 };

/**
 * Conta há quantas horas consecutivas (do fim do histórico para trás) a linha
 * está com qualidade <= `level`. Cada amostra do histórico cobre 24 h.
 */
export function computeDegradedDurationHours(
  line: LineHealthLine,
  level: "MEDIUM" | "LOW",
): number {
  const threshold = QUALITY_RANK[level];
  let days = 0;
  for (let i = line.history.length - 1; i >= 0; i--) {
    if (QUALITY_RANK[line.history[i].quality] <= threshold) days++;
    else break;
  }
  return days * 24;
}

function findRotationCandidate(line: LineHealthLine): LineHealthLine | null {
  const sameTenant = LINE_HEALTH_LINES.find(
    (l) =>
      l.id !== line.id &&
      l.tenantId === line.tenantId &&
      l.current === "HIGH" &&
      l.status === "CONNECTED",
  );
  if (sameTenant) return sameTenant;
  return (
    LINE_HEALTH_LINES.find(
      (l) => l.id !== line.id && l.current === "HIGH" && l.status === "CONNECTED",
    ) ?? null
  );
}

function formatDuration(hours: number): string {
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  return `há ${days} dia${days === 1 ? "" : "s"}`;
}

/**
 * Alertas baseados em tempo de permanência em MEDIUM/LOW.
 */
export function getDurationAlerts(
  prefs: LineHealthPrefs = loadLineHealthPrefs(),
  lines: LineHealthLine[] = LINE_HEALTH_LINES,
): LineHealthAlert[] {
  const alerts: LineHealthAlert[] = [];
  for (const line of lines) {
    if (line.current !== "MEDIUM" && line.current !== "LOW") continue;
    const level = line.current;
    const threshold = prefs.durationAlertHours[level];
    const hours = computeDegradedDurationHours(line, level);
    if (hours < threshold) continue;

    const candidate = prefs.suggestRotation ? findRotationCandidate(line) : null;
    const suggestion: LineHealthAlert["suggestion"] =
      level === "LOW"
        ? {
            kind: candidate ? "both" : "pause",
            targetLineId: candidate?.id,
            targetLabel: candidate?.displayName,
          }
        : candidate
          ? { kind: "rotate", targetLineId: candidate.id, targetLabel: candidate.displayName }
          : { kind: "pause" };

    alerts.push({
      id: `${line.id}-dur-${level}-${Math.ceil(hours)}`,
      severity: level === "LOW" ? "critical" : "warning",
      title: `Linha ${line.displayName} em ${level} ${formatDuration(hours)}`,
      detail:
        `${line.phone} · ${line.tenantName} — limiar configurado: ${threshold} h. ` +
        (candidate
          ? `Sugestão: ${level === "LOW" ? "pausar HSM e revezar" : "revezar"} para ${candidate.displayName}.`
          : `Sugestão: pausar HSM até a qualidade se recuperar.`),
      time: formatDuration(hours),
      lineId: line.id,
      tenantId: line.tenantId,
      tenantName: line.tenantName,
      level,
      durationHours: hours,
      thresholdHours: threshold,
      suggestion,
    });
  }
  return alerts;
}

/**
 * Alertas instantâneos a partir do status atual das linhas. Mantém compat
 * com o header de notificações; agora também inclui os alertas por duração
 * (deduplicados pelo `id`).
 */
export function getLineHealthAlerts(): LineHealthAlert[] {
  const alerts: LineHealthAlert[] = [];
  for (const l of LINE_HEALTH_LINES) {
    if (l.status === "RESTRICTED" || l.current === "LOW") {
      alerts.push({
        id: `${l.id}-low`,
        severity: "critical",
        title: `Linha ${l.displayName} em ${l.current === "LOW" ? "LOW" : "RESTRICTED"}`,
        detail: `${l.phone} · ${l.tenantName} — HSM bloqueado pelo guard de saúde.`,
        time: STATUS_TIME[l.status],
        lineId: l.id,
        tenantId: l.tenantId,
        tenantName: l.tenantName,
      });
      continue;
    }
    if (l.status === "PENDING_REVIEW") {
      alerts.push({
        id: `${l.id}-review`,
        severity: "warning",
        title: `Linha ${l.displayName} em PENDING_REVIEW`,
        detail: `${l.phone} · ${l.tenantName} — HSM suspenso até a Meta concluir a reavaliação.`,
        time: STATUS_TIME[l.status],
        lineId: l.id,
        tenantId: l.tenantId,
        tenantName: l.tenantName,
      });
      continue;
    }
    if (l.current === "MEDIUM") {
      alerts.push({
        id: `${l.id}-medium`,
        severity: "warning",
        title: `Qualidade caiu para MEDIUM — ${l.displayName}`,
        detail: `${l.phone} · ${l.tenantName} — lotes HSM limitados conforme política.`,
        time: STATUS_TIME[l.status],
        lineId: l.id,
        tenantId: l.tenantId,
        tenantName: l.tenantName,
      });
    }
  }

  // Mescla com alertas baseados em duração, evitando duplicar a mesma linha.
  const seenLines = new Set(alerts.map((a) => a.lineId + "-" + (a.level ?? "")));
  for (const a of getDurationAlerts()) {
    if (seenLines.has(a.lineId + "-" + (a.level ?? ""))) continue;
    alerts.push(a);
  }
  return alerts;
}
