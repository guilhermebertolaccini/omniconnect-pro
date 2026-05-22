import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  addEdge,
  reconnectEdge,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  type Node,
  type Edge,
  type EdgeChange,
  type Connection,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Play,
  Save,
  Layers,
  LayoutTemplate,
  Trash2,
  Undo2,
  Redo2,
  History,
  RotateCcw,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  AlertCircle,
  ShieldCheck,
  ListOrdered,
  CircleDot,
  CornerUpLeft,
  CornerUpRight,
} from "lucide-react";
import { JourneyNode, PaletteNode, NODE_CONFIG } from "./journey-node";
import type { JourneyNodeData, JourneyNodeType, MessageTemplate } from "@/lib/leads-data";
import { EMAIL_TEMPLATES, HSM_TEMPLATES } from "@/lib/leads-data";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type JourneyFlowNode = Node<JourneyNodeData & { selected?: boolean }>;

const PALETTE: { group: string; items: JourneyNodeType[] }[] = [
  { group: "Gatilhos", items: ["trigger"] },
  { group: "Lógica", items: ["delay", "condition", "pacing"] },
  { group: "Mensagens", items: ["email", "rcs", "sms", "hsm"] },
  { group: "Automação", items: ["bot", "stage", "notify"] },
];

/* -------------------------------------------------------------------------- */
/* Custom ReactFlow node — reuses the JourneyNode visual + adds handles       */
/* -------------------------------------------------------------------------- */

type ValidationLevel = "error" | "warning";

type JourneyNodePayload = JourneyNodeData & {
  onSelect?: () => void;
  onDelete?: () => void;
  __issueLevel?: ValidationLevel;
  __issueMessages?: string[];
};

function FlowJourneyNode({ data, selected }: NodeProps<Node<JourneyNodePayload>>) {
  const isTrigger = data.type === "trigger";
  const issue = data.__issueLevel;
  return (
    <>
      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Top}
          className={cn(
            "!h-3 !w-3 !border-2 !border-background",
            issue === "error" ? "!bg-destructive" : "!bg-muted-foreground",
          )}
        />
      )}
      <div
        className={cn(
          "rounded-xl transition-shadow",
          issue === "error" &&
            "ring-2 ring-destructive ring-offset-2 ring-offset-background shadow-[0_0_0_4px_color-mix(in_oklab,var(--destructive)_15%,transparent)]",
          issue === "warning" &&
            "ring-2 ring-amber-500 ring-offset-2 ring-offset-background",
        )}
        title={data.__issueMessages?.join("\n")}
      >
        <JourneyNode
          node={data}
          isSelected={selected}
          onSelect={data.onSelect}
          onDelete={data.onDelete}
        />
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className={cn(
          "!h-3 !w-3 !border-2 !border-background",
          issue === "error" ? "!bg-destructive" : "!bg-primary",
        )}
      />
    </>
  );
}

const nodeTypes = { journey: FlowJourneyNode };

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function toFlowNode(n: JourneyNodeData): JourneyFlowNode {
  return {
    id: n.id,
    type: "journey",
    position: n.position,
    data: { ...n },
  };
}

function buildDefaultEdges(nodes: JourneyNodeData[]): Edge[] {
  // Encadeia sequencialmente os nós iniciais (mesmo comportamento visual anterior).
  const edges: Edge[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    edges.push({
      id: `e-${nodes[i].id}-${nodes[i + 1].id}`,
      source: nodes[i].id,
      target: nodes[i + 1].id,
      type: "smoothstep",
      animated: true,
      style: { strokeWidth: 1.8, stroke: "var(--primary)" },
    });
  }
  return edges;
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

type ValidationIssue = {
  level: ValidationLevel;
  nodeId?: string;
  code:
    | "no-trigger"
    | "multiple-triggers"
    | "trigger-no-outgoing"
    | "orphan"
    | "logic-no-outgoing"
    | "condition-needs-branches"
    | "self-loop"
    | "empty";
  message: string;
};

// Types that MUST have an outgoing edge (otherwise the flow stalls).
const REQUIRES_OUTGOING = new Set<JourneyNodeType>(["trigger", "delay", "condition", "pacing"]);

function validateFlow(nodes: JourneyFlowNode[], edges: Edge[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (nodes.length === 0) {
    issues.push({ level: "warning", code: "empty", message: "Jornada vazia — adicione blocos para começar." });
    return issues;
  }

  const triggers = nodes.filter((n) => n.data.type === "trigger");
  if (triggers.length === 0) {
    issues.push({
      level: "error",
      code: "no-trigger",
      message: "Nenhum gatilho definido. Adicione um bloco de Gatilho para iniciar a jornada.",
    });
  } else if (triggers.length > 1) {
    for (const t of triggers.slice(1)) {
      issues.push({
        level: "error",
        nodeId: t.id,
        code: "multiple-triggers",
        message: `Gatilho duplicado: "${t.data.title}". Mantenha apenas um gatilho por jornada.`,
      });
    }
  }

  const outgoingBy = new Map<string, Edge[]>();
  const incomingBy = new Map<string, Edge[]>();
  for (const e of edges) {
    if (e.source === e.target) {
      issues.push({
        level: "error",
        nodeId: e.source,
        code: "self-loop",
        message: "Conexão inválida: o bloco aponta para si mesmo.",
      });
    }
    if (!outgoingBy.has(e.source)) outgoingBy.set(e.source, []);
    outgoingBy.get(e.source)!.push(e);
    if (!incomingBy.has(e.target)) incomingBy.set(e.target, []);
    incomingBy.get(e.target)!.push(e);
  }

  for (const n of nodes) {
    const isTrigger = n.data.type === "trigger";
    const out = outgoingBy.get(n.id)?.length ?? 0;
    const inc = incomingBy.get(n.id)?.length ?? 0;

    if (!isTrigger && inc === 0) {
      issues.push({
        level: "error",
        nodeId: n.id,
        code: "orphan",
        message: `Bloco órfão: "${n.data.title}" não tem conexão de entrada.`,
      });
    }

    if (isTrigger && out === 0) {
      issues.push({
        level: "error",
        nodeId: n.id,
        code: "trigger-no-outgoing",
        message: `Gatilho "${n.data.title}" não tem próximo passo conectado.`,
      });
    } else if (!isTrigger && REQUIRES_OUTGOING.has(n.data.type) && out === 0) {
      issues.push({
        level: "warning",
        nodeId: n.id,
        code: "logic-no-outgoing",
        message: `"${n.data.title}" precisa de uma saída — blocos de lógica não podem ser ponto final.`,
      });
    }

    if (n.data.type === "condition" && out < 2) {
      issues.push({
        level: "warning",
        nodeId: n.id,
        code: "condition-needs-branches",
        message: `Condição "${n.data.title}" deveria ter ao menos 2 ramificações (sim/não).`,
      });
    }
  }

  return issues;
}


/* -------------------------------------------------------------------------- */
/* Canvas                                                                     */
/* -------------------------------------------------------------------------- */

type AutosaveVersion = {
  at: number;
  label: string;
  nodes: JourneyNodeData[];
  edges: Edge[];
};

const AUTOSAVE_PREFIX = "journey-autosave:";
const AUTOSAVE_MAX = 20;
const AUTOSAVE_DEBOUNCE_MS = 1500;

function readAutosave(journeyId: string): AutosaveVersion[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(AUTOSAVE_PREFIX + journeyId);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AutosaveVersion[]) : [];
  } catch {
    return [];
  }
}

function writeAutosave(journeyId: string, versions: AutosaveVersion[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AUTOSAVE_PREFIX + journeyId, JSON.stringify(versions));
  } catch {
    // storage full or blocked — silently ignore
  }
}

function formatRelative(ts: number) {
  const diff = Math.max(0, Date.now() - ts);
  const s = Math.floor(diff / 1000);
  if (s < 5) return "agora";
  if (s < 60) return `há ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}

function JourneyCanvasInner({
  initialNodes = [],
  onSave,
  journeyId = "draft",
}: {
  initialNodes?: JourneyNodeData[];
  onSave?: (nodes: JourneyNodeData[]) => void;
  journeyId?: string;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance<JourneyFlowNode, Edge> | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<JourneyFlowNode>(
    initialNodes.map(toFlowNode),
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(buildDefaultEdges(initialNodes));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

  /* --------------------------------- History -------------------------------- */
  type Snapshot = { nodes: JourneyFlowNode[]; edges: Edge[] };
  type HistoryEntry = { label: string; at: number; snapshot: Snapshot };
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;

  const pastRef = useRef<HistoryEntry[]>([]);
  const futureRef = useRef<HistoryEntry[]>([]);
  const isRestoringRef = useRef(false);
  const editDebounceRef = useRef<number | null>(null);
  const editGroupKeyRef = useRef<string | null>(null);
  const [historyTick, setHistoryTick] = useState(0);
  const bumpHistory = () => setHistoryTick((t) => t + 1);

  const cloneSnapshot = (): Snapshot => ({
    nodes: nodesRef.current.map((n) => ({
      ...n,
      position: { ...n.position },
      data: { ...n.data, position: { ...n.data.position } },
    })),
    edges: edgesRef.current.map((e) => ({ ...e })),
  });

  // Ends any in-progress edit group, so the next change starts a fresh history entry.
  const flushEditGroup = useCallback(() => {
    if (editDebounceRef.current !== null) {
      window.clearTimeout(editDebounceRef.current);
      editDebounceRef.current = null;
    }
    editGroupKeyRef.current = null;
  }, []);

  const commit = useCallback((label: string = "Alteração") => {
    if (isRestoringRef.current) return;
    // A discrete commit always ends whatever edit group was open.
    if (editDebounceRef.current !== null) {
      window.clearTimeout(editDebounceRef.current);
      editDebounceRef.current = null;
    }
    editGroupKeyRef.current = null;
    pastRef.current.push({ label, at: Date.now(), snapshot: cloneSnapshot() });
    if (pastRef.current.length > 50) pastRef.current.shift();
    futureRef.current = [];
    bumpHistory();
  }, []);

  // Groups consecutive edits sharing the same `key` (e.g. node id + field) into
  // a single history step. A new key, an idle timeout, or any discrete action
  // closes the group so the next edit creates a new entry.
  const commitGrouped = useCallback(
    (key: string, label: string) => {
      if (isRestoringRef.current) return;
      if (editGroupKeyRef.current !== key) {
        // Different field/block — start a new history entry now.
        pastRef.current.push({ label, at: Date.now(), snapshot: cloneSnapshot() });
        if (pastRef.current.length > 50) pastRef.current.shift();
        futureRef.current = [];
        editGroupKeyRef.current = key;
        bumpHistory();
      }
      // Extend / reset the idle timer that closes the group.
      if (editDebounceRef.current !== null) window.clearTimeout(editDebounceRef.current);
      editDebounceRef.current = window.setTimeout(() => {
        editDebounceRef.current = null;
        editGroupKeyRef.current = null;
      }, 800);
    },
    [],
  );


  const restore = useCallback(
    (snap: Snapshot) => {
      isRestoringRef.current = true;
      setNodes(snap.nodes);
      setEdges(snap.edges);
      setSelectedId((cur) => (cur && snap.nodes.some((n) => n.id === cur) ? cur : null));
      setTimeout(() => {
        isRestoringRef.current = false;
      }, 0);
    },
    [setNodes, setEdges],
  );

  const undo = useCallback(() => {
    const prev = pastRef.current.pop();
    if (!prev) return;
    futureRef.current.push({
      label: prev.label,
      at: Date.now(),
      snapshot: cloneSnapshot(),
    });
    restore(prev.snapshot);
    bumpHistory();
  }, [restore]);

  const redo = useCallback(() => {
    const next = futureRef.current.pop();
    if (!next) return;
    pastRef.current.push({
      label: next.label,
      at: Date.now(),
      snapshot: cloneSnapshot(),
    });
    restore(next.snapshot);
    bumpHistory();
  }, [restore]);

  // Jump to an absolute point in the past stack (0 = oldest snapshot still kept).
  const jumpToPast = useCallback(
    (index: number) => {
      const steps = pastRef.current.length - index;
      for (let i = 0; i < steps; i++) {
        const prev = pastRef.current.pop();
        if (!prev) break;
        futureRef.current.push({
          label: prev.label,
          at: Date.now(),
          snapshot: cloneSnapshot(),
        });
        // apply snapshot synchronously into refs so the next iteration clones it
        nodesRef.current = prev.snapshot.nodes;
        edgesRef.current = prev.snapshot.edges;
      }
      // Single React state update to the final target
      const target = { nodes: nodesRef.current, edges: edgesRef.current };
      restore(target);
      bumpHistory();
    },
    [restore],
  );

  // Jump forward — index here is position in future stack (0 = oldest future = next redo target's far end).
  const jumpToFuture = useCallback(
    (index: number) => {
      // future is a stack: top is the most-recently-undone (next redo).
      // We want to redo until future.length === index.
      const steps = futureRef.current.length - index;
      for (let i = 0; i < steps; i++) {
        const next = futureRef.current.pop();
        if (!next) break;
        pastRef.current.push({
          label: next.label,
          at: Date.now(),
          snapshot: cloneSnapshot(),
        });
        nodesRef.current = next.snapshot.nodes;
        edgesRef.current = next.snapshot.edges;
      }
      restore({ nodes: nodesRef.current, edges: edgesRef.current });
      bumpHistory();
    },
    [restore],
  );

  const canUndo = pastRef.current.length > 0;
  const canRedo = futureRef.current.length > 0;
  void historyTick;


  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.key === "z" && e.shiftKey) || e.key === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  /* --------------------------------- Autosave ------------------------------- */
  const [versions, setVersions] = useState<AutosaveVersion[]>(() => readAutosave(journeyId));
  const [autosaveState, setAutosaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(
    () => readAutosave(journeyId)[0]?.at ?? null,
  );
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const autosaveTimerRef = useRef<number | null>(null);
  const lastSerializedRef = useRef<string>("");
  const hasMountedRef = useRef(false);

  // On mount: offer recovery if the latest autosaved version differs from the
  // initial nodes we were handed.
  useEffect(() => {
    const stored = readAutosave(journeyId);
    if (stored.length === 0) return;
    const latest = stored[0];
    const initialSerialized = JSON.stringify({
      nodes: initialNodes,
      edges: buildDefaultEdges(initialNodes),
    });
    const latestSerialized = JSON.stringify({ nodes: latest.nodes, edges: latest.edges });
    if (initialSerialized !== latestSerialized) setRecoveryOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journeyId]);

  const pushAutosaveVersion = useCallback(
    (label: string) => {
      const snapshotNodes: JourneyNodeData[] = nodesRef.current.map((n) => ({
        ...n.data,
        position: { ...n.position },
      }));
      const snapshotEdges: Edge[] = edgesRef.current.map((e) => ({ ...e }));
      const serialized = JSON.stringify({ nodes: snapshotNodes, edges: snapshotEdges });
      if (serialized === lastSerializedRef.current) {
        setAutosaveState("saved");
        return;
      }
      lastSerializedRef.current = serialized;
      const entry: AutosaveVersion = {
        at: Date.now(),
        label,
        nodes: snapshotNodes,
        edges: snapshotEdges,
      };
      setVersions((prev) => {
        const next = [entry, ...prev].slice(0, AUTOSAVE_MAX);
        writeAutosave(journeyId, next);
        return next;
      });
      setLastSavedAt(entry.at);
      setAutosaveState("saved");
    },
    [journeyId],
  );

  // Debounced autosave triggered by any node/edge change.
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      lastSerializedRef.current = JSON.stringify({
        nodes: nodes.map((n) => ({ ...n.data, position: n.position })),
        edges,
      });
      return;
    }
    setAutosaveState("saving");
    if (autosaveTimerRef.current !== null) window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = window.setTimeout(() => {
      pushAutosaveVersion("Autosave");
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (autosaveTimerRef.current !== null) window.clearTimeout(autosaveTimerRef.current);
    };
  }, [nodes, edges, pushAutosaveVersion]);

  // Flush pending autosave before the page unloads.
  useEffect(() => {
    const onBeforeUnload = () => {
      if (autosaveTimerRef.current !== null) {
        window.clearTimeout(autosaveTimerRef.current);
        pushAutosaveVersion("Autosave");
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [pushAutosaveVersion]);

  const restoreVersion = useCallback(
    (v: AutosaveVersion) => {
      commit(`Restaurou versão ${formatRelative(v.at)}`);
      isRestoringRef.current = true;
      const flowNodes = v.nodes.map(toFlowNode);
      setNodes(flowNodes);
      setEdges(v.edges.map((e) => ({ ...e })));
      setSelectedId(null);
      setTimeout(() => {
        isRestoringRef.current = false;
      }, 0);
      setVersionsOpen(false);
      setRecoveryOpen(false);
      toast.success(`Restaurado: ${v.label} · ${formatRelative(v.at)}`);
    },
    [commit, setNodes, setEdges],
  );

  const discardAutosave = useCallback(() => {
    writeAutosave(journeyId, []);
    setVersions([]);
    setLastSavedAt(null);
    setRecoveryOpen(false);
    lastSerializedRef.current = "";
    toast.message("Histórico de autosave descartado");
  }, [journeyId]);

  /* ------------------------------ Node helpers ------------------------------ */


  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedId)?.data,
    [nodes, selectedId],
  );

  // Switching selection closes any open inspector edit group so the next
  // edit on a different block creates a fresh history entry.
  useEffect(() => {
    flushEditGroup();
  }, [selectedId, flushEditGroup]);

  const updateNodeData = useCallback(
    (id: string, patch: Partial<JourneyNodeData>) => {
      // Group by node + the set of fields being changed so that typing in one
      // field collapses into a single history entry, but switching to another
      // field (or another block) starts a fresh one.
      const fieldKey = Object.keys(patch).sort().join(",");
      const labelMap: Record<string, string> = {
        title: "Renomeou bloco",
        description: "Editou descrição",
      };
      const label = labelMap[fieldKey] ?? "Editou configuração do bloco";
      commitGrouped(`edit:${id}:${fieldKey}`, label);
      setNodes((nds) =>
        nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)),
      );
    },
    [setNodes, commitGrouped],
  );

  const removeNode = useCallback(
    (id: string) => {
      commit("Removeu bloco");
      setNodes((nds) => nds.filter((n) => n.id !== id));
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
      setSelectedId((cur) => (cur === id ? null : cur));
    },
    [setNodes, setEdges, commit],
  );

  const onConnect = useCallback(
    (params: Connection) => {
      commit("Conectou blocos");
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            type: "smoothstep",
            animated: true,
            style: { strokeWidth: 1.8, stroke: "var(--primary)" },
          },
          eds,
        ),
      );
    },
    [setEdges, commit],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const addNodeAt = useCallback(
    (type: JourneyNodeType, position: { x: number; y: number }) => {
      commit(`Adicionou bloco "${NODE_CONFIG[type].label}"`);
      const id = `n-${Date.now()}`;
      const data: JourneyNodeData = {
        id,
        type,
        title: NODE_CONFIG[type].label,
        description: "Clique para configurar",
        position,
      };
      setNodes((nds) => nds.concat(toFlowNode(data)));
      setSelectedId(id);
      return id;
    },
    [setNodes, commit],
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData("application/reactflow") as JourneyNodeType;
      if (!type || !rfInstance) return;
      const position = rfInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      addNodeAt(type, position);
    },
    [rfInstance, addNodeAt],
  );

  const addNodeFromPalette = useCallback(
    (type: JourneyNodeType) => {
      const offset = nodes.length * 24;
      addNodeAt(type, { x: 120 + offset, y: 80 + offset });
      setPaletteOpen(false);
    },
    [nodes.length, addNodeAt],
  );

  // Sync drag positions back into data and commit on drag end / node removal.
  const handleNodesChange: typeof onNodesChange = useCallback(
    (changes) => {
      for (const c of changes) {
        if (c.type === "remove") {
          commit("Removeu bloco");
          break;
        }
        if (c.type === "position" && c.dragging === false) {
          commit("Moveu bloco");
          break;
        }
      }
      onNodesChange(changes);
      setNodes((nds) =>
        nds.map((n) => {
          if (n.position.x === n.data.position.x && n.position.y === n.data.position.y) return n;
          return { ...n, data: { ...n.data, position: n.position } };
        }),
      );
    },
    [onNodesChange, setNodes, commit],
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      if (changes.some((c) => c.type === "remove")) commit("Removeu conexão");
      onEdgesChange(changes);
    },
    [onEdgesChange, commit],
  );

  const reconnectSuccessfulRef = useRef(true);
  const onReconnectStart = useCallback(() => {
    reconnectSuccessfulRef.current = false;
  }, []);
  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      reconnectSuccessfulRef.current = true;
      commit("Reconectou conexão");
      setEdges((eds) => reconnectEdge(oldEdge, newConnection, eds));
    },
    [setEdges, commit],
  );
  const onReconnectEnd = useCallback(
    (_evt: MouseEvent | TouchEvent, edge: Edge) => {
      if (!reconnectSuccessfulRef.current) {
        commit("Removeu conexão");
        setEdges((eds) => eds.filter((e) => e.id !== edge.id));
      }
      reconnectSuccessfulRef.current = true;
    },
    [setEdges, commit],
  );

  const handleSave = useCallback(() => {
    const payload: JourneyNodeData[] = nodes.map((n) => ({
      ...n.data,
      position: n.position,
    }));
    onSave?.(payload);
    pushAutosaveVersion("Salvamento manual");
  }, [nodes, onSave, pushAutosaveVersion]);

  const handleDeleteSelected = useCallback(() => {
    if (!selectedId) {
      toast.error("Nenhum bloco selecionado");
      return;
    }
    removeNode(selectedId);
  }, [selectedId, removeNode]);

  // Injeta callbacks por nó (select/delete) sem causar loop.
  /* -------------------------------- Validation ------------------------------ */
  const issues = useMemo(() => validateFlow(nodes, edges), [nodes, edges]);
  const errorCount = issues.filter((i) => i.level === "error").length;
  const warningCount = issues.filter((i) => i.level === "warning").length;
  const hasBlockingErrors = errorCount > 0;
  const [issuesOpen, setIssuesOpen] = useState(false);

  const issuesByNode = useMemo(() => {
    const map = new Map<string, { level: ValidationLevel; messages: string[] }>();
    for (const i of issues) {
      if (!i.nodeId) continue;
      const cur = map.get(i.nodeId) ?? { level: "warning" as ValidationLevel, messages: [] };
      cur.messages.push(i.message);
      if (i.level === "error") cur.level = "error";
      map.set(i.nodeId, cur);
    }
    return map;
  }, [issues]);

  const focusNode = useCallback(
    (id: string) => {
      setSelectedId(id);
      const n = nodes.find((x) => x.id === id);
      if (n && rfInstance) {
        rfInstance.setCenter(n.position.x + 110, n.position.y + 60, {
          zoom: Math.max(rfInstance.getZoom(), 0.9),
          duration: 350,
        });
      }
      setIssuesOpen(false);
    },
    [nodes, rfInstance],
  );

  const nodesWithCallbacks = useMemo<JourneyFlowNode[]>(
    () =>
      nodes.map((n) => {
        const issue = issuesByNode.get(n.id);
        return {
          ...n,
          data: {
            ...n.data,
            onSelect: () => setSelectedId(n.id),
            onDelete: () => removeNode(n.id),
            __issueLevel: issue?.level,
            __issueMessages: issue?.messages,
          },
        };
      }),
    [nodes, removeNode, issuesByNode],
  );


  return (
    <div className="flex h-[calc(100vh-9rem)] min-h-[520px] w-full overflow-hidden rounded-xl border bg-card">
      {/* Palette — desktop */}
      <aside className="hidden w-64 shrink-0 border-r bg-muted/30 lg:block">
        <div className="border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Blocos</h3>
          <p className="text-xs text-muted-foreground">Arraste para o canvas</p>
        </div>
        <ScrollArea className="h-[calc(100%-3.5rem)] px-3 py-3">
          <div className="space-y-5">
            {PALETTE.map((g) => (
              <div key={g.group}>
                <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {g.group}
                </div>
                <div className="space-y-1.5">
                  {g.items.map((t) => (
                    <PaletteNode key={t} type={t} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </aside>

      {/* Canvas */}
      <div className="flex flex-1 flex-col min-w-0">
        <div className="flex h-12 items-center justify-between gap-2 border-b px-2 sm:px-4">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 lg:hidden"
              onClick={() => setPaletteOpen(true)}
            >
              <Layers className="h-3.5 w-3.5" /> Blocos
            </Button>
            <div
              className="hidden items-center gap-1.5 text-[11px] text-muted-foreground sm:flex"
              aria-live="polite"
            >
              {autosaveState === "saving" ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Salvando…
                </>
              ) : lastSavedAt ? (
                <>
                  <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                  Salvo {formatRelative(lastSavedAt)}
                </>
              ) : (
                <span>Autosave ativado</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {(() => {
              const isMac =
                typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
              const mod = isMac ? "⌘" : "Ctrl";
              const undoHint = `${mod}+Z`;
              const redoHint = isMac ? `${mod}+⇧+Z` : `${mod}+Shift+Z`;
              return (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 px-2"
                    onClick={undo}
                    disabled={!canUndo}
                    title={`Desfazer (${undoHint})`}
                    aria-label={`Desfazer (${undoHint})`}
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                    <kbd className="hidden sm:inline-flex items-center rounded border border-border bg-muted px-1 font-mono text-[10px] text-muted-foreground">
                      {undoHint}
                    </kbd>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 px-2"
                    onClick={redo}
                    disabled={!canRedo}
                    title={`Refazer (${redoHint})`}
                    aria-label={`Refazer (${redoHint})`}
                  >
                    <Redo2 className="h-3.5 w-3.5" />
                    <kbd className="hidden sm:inline-flex items-center rounded border border-border bg-muted px-1 font-mono text-[10px] text-muted-foreground">
                      {redoHint}
                    </kbd>
                  </Button>
                </>
              );
            })()}
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => setVersionsOpen(true)}
              title="Versões salvas"
            >
              <History className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Versões</span>
              {versions.length > 0 && (
                <span className="rounded-full bg-secondary px-1.5 text-[10px] font-medium text-muted-foreground">
                  {versions.length}
                </span>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => setHistoryOpen(true)}
              title="Histórico de alterações"
            >
              <ListOrdered className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Histórico</span>
              {(pastRef.current.length + futureRef.current.length) > 0 && (
                <span className="rounded-full bg-secondary px-1.5 text-[10px] font-medium text-muted-foreground">
                  {pastRef.current.length + futureRef.current.length}
                </span>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              onClick={handleDeleteSelected}
              disabled={!selectedId}
            >
              <Trash2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Excluir</span>
            </Button>
            <Popover open={issuesOpen} onOpenChange={setIssuesOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "h-8 gap-1.5",
                    errorCount > 0 && "border-destructive/60 text-destructive hover:text-destructive",
                    errorCount === 0 && warningCount > 0 && "border-amber-500/60 text-amber-700",
                  )}
                  title="Validação da jornada"
                >
                  {errorCount > 0 ? (
                    <AlertCircle className="h-3.5 w-3.5" />
                  ) : warningCount > 0 ? (
                    <AlertTriangle className="h-3.5 w-3.5" />
                  ) : (
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                  )}
                  <span className="hidden sm:inline">Validação</span>
                  {(errorCount > 0 || warningCount > 0) && (
                    <span
                      className={cn(
                        "rounded-full px-1.5 text-[10px] font-medium",
                        errorCount > 0
                          ? "bg-destructive/15 text-destructive"
                          : "bg-amber-500/15 text-amber-700",
                      )}
                    >
                      {errorCount + warningCount}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[340px] p-0">
                <div className="border-b px-3 py-2">
                  <div className="text-sm font-semibold">Validação da jornada</div>
                  <div className="text-[11px] text-muted-foreground">
                    {issues.length === 0
                      ? "Tudo certo para ativar."
                      : `${errorCount} erro(s) e ${warningCount} alerta(s) encontrados.`}
                  </div>
                </div>
                <ScrollArea className="max-h-[280px]">
                  {issues.length === 0 ? (
                    <div className="flex items-center gap-2 px-3 py-4 text-xs text-emerald-700">
                      <ShieldCheck className="h-4 w-4" />
                      Nenhum problema detectado.
                    </div>
                  ) : (
                    <ul className="divide-y">
                      {issues.map((i, idx) => (
                        <li key={idx}>
                          <button
                            type="button"
                            onClick={() => (i.nodeId ? focusNode(i.nodeId) : setIssuesOpen(false))}
                            className="flex w-full items-start gap-2 px-3 py-2 text-left text-xs transition hover:bg-muted/60"
                          >
                            {i.level === "error" ? (
                              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                            ) : (
                              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                            )}
                            <span className="leading-snug">{i.message}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </ScrollArea>
              </PopoverContent>
            </Popover>
            <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={handleSave}>
              <Save className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Salvar</span>
            </Button>
            <Button
              size="sm"
              className="h-8 gap-1.5"
              disabled={hasBlockingErrors}
              title={
                hasBlockingErrors
                  ? "Resolva os erros de validação antes de ativar"
                  : "Ativar jornada"
              }
              onClick={() => {
                if (hasBlockingErrors) {
                  setIssuesOpen(true);
                  toast.error("Resolva os erros destacados antes de ativar.");
                  return;
                }
                toast.success("Jornada validada e pronta para ativar.");
              }}
            >
              <Play className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Ativar</span>
            </Button>
          </div>
        </div>

        <div ref={wrapperRef} className="relative flex-1">
          <ReactFlow<JourneyFlowNode>

            nodes={nodesWithCallbacks}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={onConnect}
            onReconnect={onReconnect}
            onReconnectStart={onReconnectStart}
            onReconnectEnd={onReconnectEnd}
            edgesReconnectable
            onInit={setRfInstance}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onPaneClick={() => setSelectedId(null)}
            nodeTypes={nodeTypes}
            fitView
            snapToGrid
            snapGrid={[15, 15]}
            defaultEdgeOptions={{
              type: "smoothstep",
              animated: true,
              style: { strokeWidth: 1.8, stroke: "var(--primary)" },
            }}
            proOptions={{ hideAttribution: true }}
          >
            <Controls className="!bg-card !border !border-border !shadow-sm" />
            <MiniMap
              pannable
              zoomable
              className="!bg-card !border !border-border"
              nodeColor={(node) => {
                const t = (node.data as JourneyNodeData)?.type;
                return t ? NODE_CONFIG[t].color : "var(--muted)";
              }}
            />
            <Background variant={BackgroundVariant.Dots} gap={22} size={1} />
          </ReactFlow>

          {nodes.length === 0 && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center px-4">
              <div className="rounded-xl border-2 border-dashed bg-card/60 px-6 py-8 text-center sm:px-10">
                <p className="text-sm font-medium">Comece sua jornada</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  <span className="hidden lg:inline">
                    Arraste um <span className="font-medium">Gatilho</span> da esquerda para começar.
                  </span>
                  <span className="lg:hidden">
                    Toque em <span className="font-medium">Blocos</span> e selecione um Gatilho.
                  </span>
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Inspector — desktop */}
      <aside className="hidden w-72 shrink-0 border-l bg-muted/20 lg:block">
        <div className="border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Configurações</h3>
          <p className="text-xs text-muted-foreground">
            {selectedNode ? "Editando bloco selecionado" : "Selecione um bloco"}
          </p>
        </div>
        <InspectorBody selectedNode={selectedNode} onUpdate={updateNodeData} />
      </aside>

      {/* Palette — mobile sheet (tap to add) */}
      <Sheet open={paletteOpen} onOpenChange={setPaletteOpen}>
        <SheetContent side="left" className="w-[85vw] max-w-sm p-0">
          <SheetHeader className="border-b px-4 py-3 text-left">
            <SheetTitle className="text-base">Blocos</SheetTitle>
            <SheetDescription className="text-xs">
              Toque para adicionar ao canvas
            </SheetDescription>
          </SheetHeader>
          <ScrollArea className="h-[calc(100%-4rem)] px-3 py-3">
            <div className="space-y-5">
              {PALETTE.map((g) => (
                <div key={g.group}>
                  <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {g.group}
                  </div>
                  <div className="space-y-1.5">
                    {g.items.map((t) => {
                      const cfg = NODE_CONFIG[t];
                      const Icon = cfg.icon;
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => addNodeFromPalette(t)}
                          className="flex w-full items-center gap-2.5 rounded-lg border bg-card px-3 py-3 text-left transition active:scale-[0.98] hover:border-primary/40"
                        >
                          <div
                            className={cn(
                              "grid h-9 w-9 place-items-center rounded-md bg-secondary",
                              cfg.ring,
                            )}
                          >
                            <Icon className="h-4 w-4" />
                          </div>
                          <span className="text-sm font-medium">{cfg.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Inspector — mobile bottom sheet */}
      <Sheet
        open={!!selectedNode && typeof window !== "undefined" && window.innerWidth < 1024}
        onOpenChange={(o) => !o && setSelectedId(null)}
      >
        <SheetContent side="bottom" className="max-h-[80vh] p-0 lg:hidden">
          <SheetHeader className="border-b px-4 py-3 text-left">
            <SheetTitle className="text-base">Configurações</SheetTitle>
            <SheetDescription className="text-xs">Editando bloco selecionado</SheetDescription>
          </SheetHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            <InspectorBody selectedNode={selectedNode} onUpdate={updateNodeData} />
          </div>
        </SheetContent>
      </Sheet>

      {/* Recovery prompt */}
      <Dialog open={recoveryOpen} onOpenChange={setRecoveryOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Recuperar alterações não salvas?</DialogTitle>
            <DialogDescription>
              Encontramos uma versão salva automaticamente desta jornada
              {versions[0] ? ` ${formatRelative(versions[0].at)}` : ""}. Deseja restaurá-la?
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={discardAutosave}>
              Descartar
            </Button>
            <Button variant="outline" size="sm" onClick={() => setRecoveryOpen(false)}>
              Manter atual
            </Button>
            <Button
              size="sm"
              onClick={() => versions[0] && restoreVersion(versions[0])}
              disabled={!versions[0]}
            >
              <RotateCcw className="h-3.5 w-3.5" /> Restaurar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Versions dialog */}
      <Dialog open={versionsOpen} onOpenChange={setVersionsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Versões automáticas</DialogTitle>
            <DialogDescription>
              Últimas {AUTOSAVE_MAX} versões salvas automaticamente. Restaurar substitui o estado
              atual (você ainda pode desfazer com Ctrl+Z).
            </DialogDescription>
          </DialogHeader>
          {versions.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma versão salva ainda. Edite algo para começar.
            </p>
          ) : (
            <ScrollArea className="max-h-[60vh] pr-2">
              <ul className="space-y-1.5">
                {versions.map((v, i) => (
                  <li
                    key={v.at}
                    className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        {v.label}
                        {i === 0 && (
                          <span className="rounded-full bg-emerald-100 px-1.5 text-[10px] font-semibold uppercase text-emerald-700">
                            mais recente
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {new Date(v.at).toLocaleString("pt-BR")} · {formatRelative(v.at)} ·{" "}
                        {v.nodes.length} blocos · {v.edges.length} conexões
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => restoreVersion(v)}>
                      <RotateCcw className="h-3.5 w-3.5" /> Restaurar
                    </Button>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
          <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
            <span>
              {lastSavedAt
                ? `Última gravação: ${new Date(lastSavedAt).toLocaleTimeString("pt-BR")}`
                : "Sem gravações"}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={discardAutosave}
              disabled={versions.length === 0}
            >
              Limpar histórico
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* History panel — change log with jump-to */}
      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent side="right" className="w-[380px] p-0 sm:max-w-[380px]">
          <SheetHeader className="border-b px-4 py-3 text-left">
            <SheetTitle className="text-base">Histórico de alterações</SheetTitle>
            <SheetDescription className="text-xs">
              Clique em qualquer alteração para voltar para aquele estado. Mantém{" "}
              {pastRef.current.length} passos anteriores e {futureRef.current.length} refazíveis.
            </SheetDescription>
          </SheetHeader>
          <div className="flex items-center gap-1.5 border-b px-3 py-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 flex-1 gap-1.5"
              onClick={undo}
              disabled={!canUndo}
            >
              <CornerUpLeft className="h-3.5 w-3.5" /> Desfazer
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 flex-1 gap-1.5"
              onClick={redo}
              disabled={!canRedo}
            >
              <CornerUpRight className="h-3.5 w-3.5" /> Refazer
            </Button>
          </div>
          <ScrollArea className="h-[calc(100%-8.5rem)]">
            {pastRef.current.length === 0 && futureRef.current.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-muted-foreground">
                Nenhuma alteração registrada ainda. Edite a jornada para começar o histórico.
              </div>
            ) : (
              <ol className="relative">
                {/* Future (redoable) — newest of future first */}
                {futureRef.current
                  .slice()
                  .reverse()
                  .map((entry, idxFromTop) => {
                    // index inside futureRef stack (0 = bottom). We want the target
                    // future.length AFTER jump to equal this index's stack position.
                    const stackIndex = futureRef.current.length - 1 - idxFromTop;
                    return (
                      <li key={`f-${entry.at}-${idxFromTop}`}>
                        <button
                          type="button"
                          onClick={() => {
                            jumpToFuture(stackIndex);
                            setHistoryOpen(false);
                          }}
                          className="flex w-full items-start gap-3 px-4 py-2 text-left transition hover:bg-muted/60"
                        >
                          <CornerUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <div className="min-w-0">
                            <div className="text-sm text-muted-foreground line-through decoration-muted-foreground/40">
                              {entry.label}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              refazível · {formatRelative(entry.at)}
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}

                {/* Current marker */}
                <li className="bg-primary/5">
                  <div className="flex items-start gap-3 px-4 py-2">
                    <CircleDot className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-primary">Estado atual</div>
                      <div className="text-[11px] text-muted-foreground">
                        {nodes.length} blocos · {edges.length} conexões
                      </div>
                    </div>
                  </div>
                </li>

                {/* Past (undoable) — newest first */}
                {pastRef.current
                  .slice()
                  .reverse()
                  .map((entry, idxFromTop) => {
                    // index inside pastRef stack: 0 = oldest, length-1 = top
                    const stackIndex = pastRef.current.length - 1 - idxFromTop;
                    return (
                      <li key={`p-${entry.at}-${idxFromTop}`}>
                        <button
                          type="button"
                          onClick={() => {
                            jumpToPast(stackIndex);
                            setHistoryOpen(false);
                          }}
                          className="flex w-full items-start gap-3 border-t px-4 py-2 text-left transition hover:bg-muted/60"
                        >
                          <CornerUpLeft className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <div className="min-w-0">
                            <div className="text-sm">{entry.label}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {formatRelative(entry.at)}
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
              </ol>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>

  );
}

export function JourneyCanvas(props: {
  initialNodes?: JourneyNodeData[];
  onSave?: (nodes: JourneyNodeData[]) => void;
  journeyId?: string;
}) {
  return (
    <ReactFlowProvider>
      <JourneyCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

/* -------------------------------------------------------------------------- */
/* Inspector                                                                  */
/* -------------------------------------------------------------------------- */

function InspectorBody({
  selectedNode,
  onUpdate,
}: {
  selectedNode: JourneyNodeData | undefined;
  onUpdate: (id: string, patch: Partial<JourneyNodeData>) => void;
}) {
  return (
    <div className="space-y-4 p-4 text-sm">
      {selectedNode ? (
        <>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Tipo</label>
            <div className="mt-1 rounded-md border bg-card px-2.5 py-2 text-sm">
              {NODE_CONFIG[selectedNode.type].label}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Título</label>
            <input
              className="mt-1 w-full rounded-md border bg-card px-2.5 py-2 text-base outline-none focus:border-primary sm:text-sm"
              value={selectedNode.title}
              onChange={(e) => onUpdate(selectedNode.id, { title: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Descrição</label>
            <textarea
              className="mt-1 w-full rounded-md border bg-card px-2.5 py-2 text-base outline-none focus:border-primary sm:text-sm"
              rows={3}
              value={selectedNode.description || ""}
              onChange={(e) => onUpdate(selectedNode.id, { description: e.target.value })}
            />
          </div>
          {selectedNode.type === "delay" && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">Aguardar</label>
              <div className="mt-1 flex gap-2">
                <input
                  defaultValue={2}
                  className="w-20 rounded-md border bg-card px-2.5 py-2 text-base sm:text-sm"
                />
                <select className="flex-1 rounded-md border bg-card px-2.5 py-2 text-base sm:text-sm">
                  <option>dias</option>
                  <option>horas</option>
                  <option>minutos</option>
                </select>
              </div>
            </div>
          )}

          {selectedNode.type === "pacing" && <PacingInspector />}

          {selectedNode.type === "condition" && (
            <div className="space-y-3 rounded-md border bg-sky-50/40 p-3">
              <label className="text-xs font-medium text-muted-foreground">Tipo de condição</label>
              <select className="w-full rounded-md border bg-card px-2.5 py-2 text-base sm:text-sm">
                <option>Abriu o e-mail?</option>
                <option>Respondeu mensagem?</option>
                <option>Melhor canal do lead</option>
                <option>Score mínimo</option>
              </select>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">Canal</label>
                  <select className="mt-1 w-full rounded-md border bg-card px-2 py-2 text-sm">
                    <option>WhatsApp</option>
                    <option>E-mail</option>
                    <option>SMS</option>
                    <option>RCS</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Tier mínimo</label>
                  <select className="mt-1 w-full rounded-md border bg-card px-2 py-2 text-sm">
                    <option>Altíssima</option>
                    <option>Alta</option>
                    <option>Média</option>
                    <option>Baixa</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {(selectedNode.type === "email" ||
            selectedNode.type === "hsm" ||
            selectedNode.type === "rcs") && (
            <>
              {(selectedNode.type === "hsm" || selectedNode.type === "rcs") &&
                !/—\s/.test(selectedNode.title) && (
                  <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900">
                    <span className="mt-0.5">⚠</span>
                    <div>
                      <div className="font-semibold">Template obrigatório</div>
                      Canais oficiais ({selectedNode.type.toUpperCase()}) bloqueiam texto livre fora
                      da janela de 24h. Selecione um template aprovado para liberar este disparo.
                    </div>
                  </div>
                )}
              <TemplatePicker
                channel={selectedNode.type === "email" ? "email" : "hsm"}
                onPick={(t) =>
                  onUpdate(selectedNode.id, {
                    title: `${
                      selectedNode.type === "email"
                        ? "E-mail"
                        : selectedNode.type === "rcs"
                          ? "RCS"
                          : "HSM"
                    } — ${t.name}`,
                    description: t.preview,
                  })
                }
              />
            </>
          )}
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          Toque em um bloco no canvas para configurar canal, mensagem, condições ou tempo de espera.
        </p>
      )}
    </div>
  );
}

function PacingInspector() {
  const [mode, setMode] = useState<"fixed" | "random">("fixed");
  return (
    <div className="space-y-3 rounded-md border bg-fuchsia-50/40 p-3">
      <div>
        <label className="text-xs font-medium text-muted-foreground">Janela útil</label>
        <div className="mt-1 flex items-center gap-2">
          <input
            type="time"
            defaultValue="08:00"
            className="flex-1 rounded-md border bg-card px-2.5 py-2 text-base sm:text-sm"
          />
          <span className="text-xs text-muted-foreground">até</span>
          <input
            type="time"
            defaultValue="20:00"
            className="flex-1 rounded-md border bg-card px-2.5 py-2 text-base sm:text-sm"
          />
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Fora dessa janela a fila pausa automaticamente.
        </p>
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground">Modo de throttling</label>
        <div className="mt-1 flex gap-2">
          {(["fixed", "random"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "flex-1 rounded-md border px-3 py-1.5 text-xs font-medium transition",
                mode === m
                  ? "border-primary bg-primary/10 text-primary"
                  : "bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {m === "fixed" ? "Fixed" : "Random (warm-up)"}
            </button>
          ))}
        </div>
      </div>

      {mode === "fixed" ? (
        <div>
          <label className="text-xs font-medium text-muted-foreground">Volume por ciclo</label>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="number"
              defaultValue={50}
              className="w-20 rounded-md border bg-card px-2.5 py-2 text-base sm:text-sm"
            />
            <span className="text-xs text-muted-foreground">envios a cada</span>
            <input
              type="number"
              defaultValue={30}
              className="w-20 rounded-md border bg-card px-2.5 py-2 text-base sm:text-sm"
            />
            <span className="text-xs text-muted-foreground">min</span>
          </div>
        </div>
      ) : (
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            Delay aleatório entre envios
          </label>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="number"
              defaultValue={20}
              className="w-20 rounded-md border bg-card px-2.5 py-2 text-base sm:text-sm"
            />
            <span className="text-xs text-muted-foreground">a</span>
            <input
              type="number"
              defaultValue={45}
              className="w-20 rounded-md border bg-card px-2.5 py-2 text-base sm:text-sm"
            />
            <span className="text-xs text-muted-foreground">segundos</span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Sorteia um delay no intervalo para emular digitação humana e driblar anti-bot.
          </p>
        </div>
      )}

      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" defaultChecked className="h-3.5 w-3.5" />
        Respeitar fuso horário do lead
      </label>
    </div>
  );
}

function TemplatePicker({
  channel,
  onPick,
}: {
  channel: "email" | "hsm";
  onPick: (t: MessageTemplate) => void;
}) {
  const [open, setOpen] = useState(false);
  const templates = channel === "email" ? EMAIL_TEMPLATES : HSM_TEMPLATES;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full gap-1.5">
          <LayoutTemplate className="h-3.5 w-3.5" />
          Escolher template
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Biblioteca de templates {channel === "email" ? "de e-mail" : "HSM WhatsApp"}
          </DialogTitle>
          <DialogDescription>Selecione um modelo pronto por objetivo.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                onPick(t);
                setOpen(false);
              }}
              className="rounded-lg border bg-card p-3 text-left transition hover:border-primary/60 hover:shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t.objective}
                </span>
              </div>
              <div className="mt-1 text-sm font-semibold">{t.name}</div>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{t.preview}</p>
              <div className="mt-2 inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                CTA: {t.cta}
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
