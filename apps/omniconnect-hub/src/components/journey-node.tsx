import { useRef } from "react";
import {
  Zap,
  Clock,
  GitBranch,
  Mail,
  MessageSquare,
  Smartphone,
  Bot,
  ArrowRightLeft,
  Bell,
  GripVertical,
  X,
  Radio,
  Gauge,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { JourneyNodeData, JourneyNodeType } from "@/lib/leads-data";

/**
 * Distância (em px) que o ponteiro pode percorrer entre pointerdown e click
 * sem que o click seja considerado um arrasto. Acima deste limiar, cliques
 * de seleção são suprimidos para evitar disparos acidentais ao panning/drag.
 */
export const CLICK_MOVEMENT_THRESHOLD_PX = 6;

export const NODE_CONFIG: Record<
  JourneyNodeType,
  { icon: React.ComponentType<{ className?: string }>; label: string; bg: string; ring: string; color: string }
> = {
  trigger: { icon: Zap, label: "Gatilho", bg: "bg-amber-50 border-amber-200", ring: "text-amber-600", color: "#f59e0b" },
  delay: { icon: Clock, label: "Aguardar tempo", bg: "bg-violet-50 border-violet-200", ring: "text-violet-600", color: "#8b5cf6" },
  condition: { icon: GitBranch, label: "Condição", bg: "bg-sky-50 border-sky-200", ring: "text-sky-600", color: "#0ea5e9" },
  pacing: { icon: Gauge, label: "Pacing / Throttle", bg: "bg-fuchsia-50 border-fuchsia-200", ring: "text-fuchsia-600", color: "#d946ef" },
  email: { icon: Mail, label: "E-mail marketing", bg: "bg-blue-50 border-blue-200", ring: "text-blue-600", color: "#3b82f6" },
  sms: { icon: Smartphone, label: "SMS", bg: "bg-emerald-50 border-emerald-200", ring: "text-emerald-600", color: "#10b981" },
  rcs: { icon: Radio, label: "RCS", bg: "bg-teal-50 border-teal-200", ring: "text-teal-600", color: "#14b8a6" },
  hsm: { icon: MessageSquare, label: "HSM WhatsApp", bg: "bg-green-50 border-green-200", ring: "text-green-600", color: "#22c55e" },
  bot: { icon: Bot, label: "Fluxo de bot", bg: "bg-pink-50 border-pink-200", ring: "text-pink-600", color: "#ec4899" },
  stage: { icon: ArrowRightLeft, label: "Mover etapa no CRM", bg: "bg-indigo-50 border-indigo-200", ring: "text-indigo-600", color: "#6366f1" },
  notify: { icon: Bell, label: "Notificar corretor", bg: "bg-orange-50 border-orange-200", ring: "text-orange-600", color: "#f97316" },
};

export function JourneyNode({
  node,
  isSelected,
  isDragging,
  onSelect,
  onDelete,
}: {
  node: JourneyNodeData;
  isSelected?: boolean;
  isDragging?: boolean;
  onSelect?: () => void;
  onDelete?: () => void;
}) {
  const cfg = NODE_CONFIG[node.type];
  const Icon = cfg.icon;
  const downPos = useRef<{ x: number; y: number } | null>(null);
  return (
    <div
      onPointerDown={(e) => {
        downPos.current = { x: e.clientX, y: e.clientY };
      }}
      onClick={(e) => {
        e.stopPropagation();
        const start = downPos.current;
        downPos.current = null;
        if (start) {
          const dist = Math.hypot(e.clientX - start.x, e.clientY - start.y);
          if (dist > CLICK_MOVEMENT_THRESHOLD_PX) return;
        }
        onSelect?.();
      }}
      className={cn(
        "relative w-60 rounded-xl border bg-card p-3.5 shadow-sm transition-all hover:shadow-md",
        cfg.bg,
        isSelected &&
          "ring-2 ring-primary ring-offset-2 ring-offset-background shadow-[0_0_0_6px_color-mix(in_oklab,var(--primary)_18%,transparent),0_12px_30px_-8px_color-mix(in_oklab,var(--primary)_45%,transparent)] border-primary/60 -translate-y-0.5",
        isDragging && "opacity-60 scale-105 shadow-xl",
      )}
    >
      <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 grid h-5 w-7 place-items-center rounded-md bg-card border shadow-sm cursor-grab active:cursor-grabbing">
        <GripVertical className="h-3 w-3 text-muted-foreground" />
      </div>
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute -right-2 -top-2 grid h-5 w-5 place-items-center rounded-full bg-destructive text-destructive-foreground shadow hover:scale-110 transition z-10"
        >
          <X className="h-3 w-3" />
        </button>
      )}
      <div className="flex items-start gap-3">
        <div className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/70", cfg.ring)}>
          <Icon className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {cfg.label}
          </div>
          <div className="text-sm font-medium leading-tight mt-0.5 truncate">{node.title}</div>
          {node.description && (
            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{node.description}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function PaletteNode({
  type,
  onDragStart,
  onClick,
}: {
  type: JourneyNodeType;
  onDragStart?: (event: React.DragEvent, nodeType: JourneyNodeType) => void;
  onClick?: (type: JourneyNodeType) => void;
}) {
  const cfg = NODE_CONFIG[type];
  const Icon = cfg.icon;
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("application/reactflow", type);
        e.dataTransfer.effectAllowed = "move";
        onDragStart?.(e, type);
      }}
      onClick={() => onClick?.(type)}
      className={cn(
        "flex items-center gap-2.5 rounded-lg border bg-card px-3 py-2 cursor-grab active:cursor-grabbing transition hover:border-primary/40 hover:bg-accent select-none",
      )}
    >
      <div className={cn("grid h-7 w-7 place-items-center rounded-md", cfg.ring, "bg-secondary")}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <span className="text-sm">{cfg.label}</span>
    </div>
  );
}
