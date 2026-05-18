import { useState, useMemo, useRef, useEffect, DragEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useI18n } from "@/i18n/useI18n";
import { useCRM } from "@/contexts/CRMContext";
import { useClients } from "@/contexts/ClientContext";
import { useProperties } from "@/contexts/PropertyContext";
import { useProposals } from "@/contexts/ProposalContext";
import { useContracts } from "@/contexts/ContractContext";
import { useAuth } from "@/contexts/AuthContext";
import { LeadStage, Interaction, FollowUp } from "@/types/crm";
import {
  Phone, Mail, MapPin, Users, MessageSquare, Calendar, Plus,
  CheckCircle2, Clock, ChevronRight, Filter, FileText, Eye,
  PhoneCall, MessageCircle, Building2, StickyNote, AlertCircle,
  ExternalLink, Megaphone, GripVertical, DollarSign, BarChart3, Kanban,
  CalendarIcon, RotateCcw, Download, FileSignature
} from "lucide-react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { MultiSelect } from "@/components/ui/multi-select";
import { ResponsiveContainer, FunnelChart, Funnel, Tooltip, LabelList, Cell } from "recharts";
import { getOmniHubUrl, getAdsManagerUrl } from "@/lib/externalApps";
import { PdfVersionsList } from "@/components/PdfVersionsList";
import { TrackedPdfLink } from "@/components/TrackedPdfLink";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

const stages: { key: LeadStage; color: string; bgColumn: string }[] = [
  { key: "new", color: "bg-blue-100 text-blue-700", bgColumn: "border-t-blue-500" },
  { key: "contacted", color: "bg-indigo-100 text-indigo-700", bgColumn: "border-t-indigo-500" },
  { key: "qualified", color: "bg-purple-100 text-purple-700", bgColumn: "border-t-purple-500" },
  { key: "visit", color: "bg-amber-100 text-amber-700", bgColumn: "border-t-amber-500" },
  { key: "negotiation", color: "bg-orange-100 text-orange-700", bgColumn: "border-t-orange-500" },
  { key: "closed_won", color: "bg-green-100 text-green-700", bgColumn: "border-t-green-500" },
  { key: "closed_lost", color: "bg-red-100 text-red-700", bgColumn: "border-t-red-500" },
];

const interactionIcons: Record<string, typeof Phone> = {
  call: PhoneCall,
  email: Mail,
  visit: MapPin,
  meeting: Users,
  whatsapp: MessageCircle,
  note: StickyNote,
};

export default function CRM() {
  const { t } = useI18n();
  const { leads, addLead, updateLeadStage, addInteraction, addFollowUp, completeFollowUp } = useCRM();
  const { getProposalsByClient } = useProposals();
  const { contracts: allContracts } = useContracts();
  const { clients } = useClients();
  const { properties } = useProperties();
  const { user } = useAuth();

  const [searchParams, setSearchParams] = useSearchParams();

  const [selectedLead, setSelectedLead] = useState<string | null>(null);
  const [newLeadOpen, setNewLeadOpen] = useState(false);
  const [interactionOpen, setInteractionOpen] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [dragOverStage, setDragOverStage] = useState<LeadStage | null>(null);
  const [viewMode, setViewMode] = useState<"kanban" | "funnel">(() => {
    const v = searchParams.get("view");
    return v === "funnel" ? "funnel" : "kanban";
  });
  const draggedLeadId = useRef<string | null>(null);

  // Drill-down state
  const [drillDownStage, setDrillDownStage] = useState<{
    stage: LeadStage;
    stageName: string;
    current: typeof leads;
    previous: typeof leads;
    rate: number;
    fill: string;
  } | null>(null);

  // Funnel filters — restore from URL with validation + safe fallbacks
  const ALLOWED_PERIODS = ["all", "7", "30", "90", "custom"] as const;
  const parseCsv = (raw: string | null): string[] => {
    if (!raw) return [];
    return Array.from(
      new Set(
        raw
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
      )
    );
  };
  const parseDate = (raw: string | null): Date | null => {
    if (!raw) return null;
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  };

  const [filterPeriod, setFilterPeriod] = useState<string>(() => {
    const p = searchParams.get("period");
    return p && (ALLOWED_PERIODS as readonly string[]).includes(p) ? p : "all";
  });
  const [filterBrokers, setFilterBrokers] = useState<string[]>(() =>
    parseCsv(searchParams.get("brokers"))
  );
  const [filterProperties, setFilterProperties] = useState<string[]>(() =>
    parseCsv(searchParams.get("properties"))
  );
  const [customRange, setCustomRange] = useState<DateRange | undefined>(() => {
    const from = parseDate(searchParams.get("from"));
    const to = parseDate(searchParams.get("to"));
    if (!from) return undefined;
    // ensure to >= from; if invalid order, fallback to single day
    if (to && to.getTime() < from.getTime()) return { from, to: from };
    return { from, to: to ?? from };
  });

  // If period=custom was set in URL but no valid dates, fall back to "all"
  useEffect(() => {
    if (filterPeriod === "custom" && !customRange?.from) {
      setFilterPeriod("all");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync filter state back to URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (viewMode !== "kanban") params.set("view", viewMode);
    if (filterPeriod !== "all") params.set("period", filterPeriod);
    if (filterBrokers.length > 0) params.set("brokers", filterBrokers.join(","));
    if (filterProperties.length > 0) params.set("properties", filterProperties.join(","));
    if (customRange?.from) {
      params.set("from", format(customRange.from, "yyyy-MM-dd"));
      if (customRange.to) {
        params.set("to", format(customRange.to, "yyyy-MM-dd"));
      }
    }
    setSearchParams(params, { replace: true });
  }, [viewMode, filterPeriod, filterBrokers, filterProperties, customRange, setSearchParams]);

  const [newLeadForm, setNewLeadForm] = useState({ clientId: "", source: "website" as string, propertyInterest: "" });
  const [interactionForm, setInteractionForm] = useState({ type: "call" as string, description: "" });
  const [followUpForm, setFollowUpForm] = useState({ title: "", dueDate: "" });

  const activeLead = leads.find((l) => l.id === selectedLead);

  const brokerOptions = useMemo(() => {
    const map = new Map<string, string>();
    leads.forEach((l) => { if (l.assignedTo) map.set(l.assignedTo, l.assignedToName); });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [leads]);

  const filteredLeads = useMemo(() => {
    const now = Date.now();
    const days = filterPeriod === "7" ? 7 : filterPeriod === "30" ? 30 : filterPeriod === "90" ? 90 : null;
    return leads.filter((l) => {
      const created = new Date(l.createdAt).getTime();
      if (filterPeriod === "custom" && customRange?.from) {
        const from = customRange.from.getTime();
        const to = (customRange.to ?? customRange.from).getTime() + 86400000 - 1;
        if (created < from || created > to) return false;
      } else if (days !== null) {
        if (now - created > days * 86400000) return false;
      }
      if (filterBrokers.length > 0 && !filterBrokers.includes(l.assignedTo)) return false;
      if (filterProperties.length > 0 && !filterProperties.includes(l.propertyInterest)) return false;
      return true;
    });
  }, [leads, filterPeriod, filterBrokers, filterProperties, customRange]);

  const leadsByStage = useMemo(() => {
    const map: Record<LeadStage, typeof leads> = {
      new: [], contacted: [], qualified: [], visit: [],
      negotiation: [], closed_won: [], closed_lost: [],
    };
    filteredLeads.forEach((l) => map[l.stage].push(l));
    return map;
  }, [filteredLeads]);

  const overdueFollowUps = useMemo(() => {
    const now = new Date();
    return filteredLeads.flatMap((l) =>
      l.followUps.filter((f) => !f.completed && new Date(f.dueDate) < now).map((f) => ({ ...f, leadId: l.id, clientName: l.clientName }))
    );
  }, [filteredLeads]);

  // KPIs derived from filteredLeads / leadsByStage (same dataset as funnel)
  const kpis = useMemo(() => {
    const total = filteredLeads.length;
    const won = leadsByStage.closed_won.length;
    const lost = leadsByStage.closed_lost.length;
    const closed = won + lost;
    const active = total - closed;
    const totalVGV = filteredLeads.reduce((s, l) => s + (l.estimatedValue || 0), 0);
    const wonVGV = leadsByStage.closed_won.reduce((s, l) => s + (l.estimatedValue || 0), 0);
    const winRate = closed > 0 ? Math.round((won / closed) * 100) : 0;
    const overallConversion = total > 0 ? Math.round((won / total) * 100) : 0;
    const avgTicket = won > 0 ? wonVGV / won : 0;
    return { total, active, won, lost, totalVGV, wonVGV, winRate, overallConversion, avgTicket };
  }, [filteredLeads, leadsByStage]);

  const funnelData = useMemo(() => {
    const funnelStages: LeadStage[] = ["new", "contacted", "qualified", "visit", "negotiation", "closed_won"];
    const colors = ["hsl(217, 91%, 60%)", "hsl(239, 84%, 67%)", "hsl(271, 91%, 65%)", "hsl(38, 92%, 50%)", "hsl(25, 95%, 53%)", "hsl(142, 71%, 45%)"];
    return funnelStages.map((key, i) => {
      const count = leadsByStage[key].length;
      const value = leadsByStage[key].reduce((sum, l) => sum + (l.estimatedValue || 0), 0);
      const prevCount = i === 0 ? filteredLeads.filter(l => l.stage !== "closed_lost").length : leadsByStage[funnelStages[i - 1]].length;
      const rate = prevCount > 0 && i > 0 ? Math.round((count / prevCount) * 100) : 100;
      return { name: t(key as any), value: count, fill: colors[i], totalValue: value, conversionRate: rate, stage: key };
    });
  }, [filteredLeads, leadsByStage, t]);

  // Drag handlers
  const handleDragStart = (e: DragEvent, leadId: string) => {
    draggedLeadId.current = leadId;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", leadId);
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "0.5";
    }
  };

  const handleDragEnd = (e: DragEvent) => {
    draggedLeadId.current = null;
    setDragOverStage(null);
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "1";
    }
  };

  const handleDragOver = (e: DragEvent, stage: LeadStage) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverStage(stage);
  };

  const handleDragLeave = (e: DragEvent) => {
    // Only clear if leaving the column itself
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (!e.currentTarget.contains(relatedTarget)) {
      setDragOverStage(null);
    }
  };

  const handleDrop = (e: DragEvent, stage: LeadStage) => {
    e.preventDefault();
    setDragOverStage(null);
    const leadId = e.dataTransfer.getData("text/plain");
    if (leadId) {
      updateLeadStage(leadId, stage);
    }
  };

  const handleCreateLead = () => {
    const client = clients.find((c) => c.id === newLeadForm.clientId);
    if (!client) return;
    addLead({
      id: `lead-${Date.now()}`,
      clientId: client.id,
      clientName: client.name,
      stage: "new",
      source: newLeadForm.source as any,
      propertyInterest: newLeadForm.propertyInterest || undefined,
      assignedTo: user?.id || "",
      assignedToName: user?.name || "",
      interactions: [],
      followUps: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    setNewLeadOpen(false);
    setNewLeadForm({ clientId: "", source: "website", propertyInterest: "" });
  };

  const handleAddInteraction = () => {
    if (!activeLead || !interactionForm.description) return;
    addInteraction(activeLead.id, {
      id: `int-${Date.now()}`,
      clientId: activeLead.clientId,
      type: interactionForm.type as any,
      description: interactionForm.description,
      createdAt: new Date().toISOString(),
      createdBy: user?.name || "",
    });
    setInteractionOpen(false);
    setInteractionForm({ type: "call", description: "" });
  };

  const handleAddFollowUp = () => {
    if (!activeLead || !followUpForm.title || !followUpForm.dueDate) return;
    addFollowUp(activeLead.id, {
      id: `fu-${Date.now()}`,
      clientId: activeLead.clientId,
      title: followUpForm.title,
      dueDate: followUpForm.dueDate,
      completed: false,
      createdAt: new Date().toISOString(),
      createdBy: user?.name || "",
    });
    setFollowUpOpen(false);
    setFollowUpForm({ title: "", dueDate: "" });
  };

  return (
    <div className="space-y-4 h-full flex flex-col">
      <div className="flex items-center justify-between shrink-0">
        <h1 className="text-2xl font-display font-bold text-foreground">CRM</h1>
        <Button onClick={() => setNewLeadOpen(true)} className="gap-2 font-display">
          <Plus className="h-4 w-4" /> {t("newLead")}
        </Button>
      </div>

      {/* Overdue follow-ups alert */}
      {overdueFollowUps.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5 shrink-0">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="h-4 w-4 text-destructive" />
              <p className="font-medium text-destructive">{t("overdueFollowUps")} ({overdueFollowUps.length})</p>
            </div>
            <div className="space-y-1">
              {overdueFollowUps.slice(0, 3).map((f) => (
                <div key={f.id} className="flex items-center justify-between text-sm">
                  <span className="text-foreground"><strong>{f.clientName}</strong>: {f.title}</span>
                  <Button size="sm" variant="outline" onClick={() => setSelectedLead(f.leadId)}>
                    <Eye className="h-3 w-3 mr-1" /> {t("view")}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* View Mode Toggle */}
      <div className="flex items-center gap-2 shrink-0">
        <Button
          variant={viewMode === "kanban" ? "default" : "outline"}
          size="sm"
          onClick={() => setViewMode("kanban")}
          className="gap-1.5"
        >
          <Kanban className="h-4 w-4" /> {t("kanbanView")}
        </Button>
        <Button
          variant={viewMode === "funnel" ? "default" : "outline"}
          size="sm"
          onClick={() => setViewMode("funnel")}
          className="gap-1.5"
        >
          <BarChart3 className="h-4 w-4" /> {t("funnelView")}
        </Button>
      </div>

      {/* KPI Cards — driven by filteredLeads (same as funnel) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 shrink-0">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <Users className="h-3.5 w-3.5" /> {t("totalLeadsKpi")}
            </div>
            <p className="text-xl font-display font-bold text-foreground mt-1">{kpis.total}</p>
            <p className="text-[11px] text-muted-foreground">{kpis.active} {t("activeLeads")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <DollarSign className="h-3.5 w-3.5" /> {t("totalVgvKpi")}
            </div>
            <p className="text-xl font-display font-bold text-foreground mt-1">
              {kpis.totalVGV.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}
            </p>
            <p className="text-[11px] text-muted-foreground">{t("inFunnel")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <CheckCircle2 className="h-3.5 w-3.5" /> {t("wonVgvKpi")}
            </div>
            <p className="text-xl font-display font-bold text-foreground mt-1">
              {kpis.wonVGV.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}
            </p>
            <p className="text-[11px] text-muted-foreground">{kpis.won} {t("closed_won").toLowerCase()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <BarChart3 className="h-3.5 w-3.5" /> {t("overallConversionKpi")}
            </div>
            <p className="text-xl font-display font-bold text-foreground mt-1">{kpis.overallConversion}%</p>
            <p className="text-[11px] text-muted-foreground">{kpis.won}/{kpis.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <BarChart3 className="h-3.5 w-3.5" /> {t("winRateKpi")}
            </div>
            <p className="text-xl font-display font-bold text-foreground mt-1">{kpis.winRate}%</p>
            <p className="text-[11px] text-muted-foreground">{kpis.won} / {kpis.won + kpis.lost} {t("closed").toLowerCase()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <DollarSign className="h-3.5 w-3.5" /> {t("avgTicketKpi")}
            </div>
            <p className="text-xl font-display font-bold text-foreground mt-1">
              {kpis.avgTicket.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}
            </p>
            <p className="text-[11px] text-muted-foreground">{t("perWonDeal")}</p>
          </CardContent>
        </Card>
      </div>

      {viewMode === "kanban" ? (
        /* Horizontal Kanban Board */
        <>
        <FunnelFiltersCard
          t={t}
          filterPeriod={filterPeriod}
          setFilterPeriod={setFilterPeriod}
          customRange={customRange}
          setCustomRange={setCustomRange}
          brokerOptions={brokerOptions}
          filterBrokers={filterBrokers}
          setFilterBrokers={setFilterBrokers}
          properties={properties}
          filterProperties={filterProperties}
          setFilterProperties={setFilterProperties}
        />
        <div className="flex-1 min-h-0">
          <ScrollArea className="w-full h-full">
            <div className="flex gap-4 pb-4 min-h-[500px]" style={{ minWidth: `${stages.length * 280}px` }}>
              {stages.map((stage) => (
                <div
                  key={stage.key}
                  className={`flex flex-col w-[260px] shrink-0 rounded-xl border-t-4 ${stage.bgColumn} bg-muted/30 transition-colors ${
                    dragOverStage === stage.key ? "bg-accent/50 ring-2 ring-primary/30" : ""
                  }`}
                  onDragOver={(e) => handleDragOver(e, stage.key)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, stage.key)}
                >
                  {/* Column header */}
                  <div className="px-3 py-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge className={`${stage.color} text-xs`}>{t(stage.key as any)}</Badge>
                        <span className="text-xs font-medium text-muted-foreground">
                          {leadsByStage[stage.key].length}
                        </span>
                      </div>
                    </div>
                    {(() => {
                      const total = leadsByStage[stage.key].reduce((sum, l) => sum + (l.estimatedValue || 0), 0);
                      return total > 0 ? (
                        <p className="text-xs font-semibold text-foreground flex items-center gap-1 pl-0.5">
                          <DollarSign className="h-3 w-3 text-muted-foreground" />
                          {total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </p>
                      ) : null;
                    })()}
                  </div>

                  {/* Column cards */}
                  <div className="flex-1 px-2 pb-2 space-y-2 overflow-y-auto">
                    {leadsByStage[stage.key].length === 0 ? (
                      <div className="flex items-center justify-center h-20 text-xs text-muted-foreground opacity-50">
                        {t("noLeads")}
                      </div>
                    ) : (
                      leadsByStage[stage.key].map((lead) => (
                        <div
                          key={lead.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, lead.id)}
                          onDragEnd={handleDragEnd}
                          className={`group cursor-grab active:cursor-grabbing rounded-lg border bg-card p-3 shadow-sm hover:shadow-md transition-all ${
                            selectedLead === lead.id ? "ring-2 ring-primary" : ""
                          }`}
                          onClick={() => setSelectedLead(lead.id)}
                        >
                          <div className="flex items-start gap-2">
                            <GripVertical className="h-4 w-4 text-muted-foreground/40 mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm text-foreground truncate">{lead.clientName}</p>
                              {lead.propertyInterest && (
                                <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5 truncate">
                                  <Building2 className="h-3 w-3 shrink-0" /> {lead.propertyInterest}
                                </p>
                              )}
                              <div className="flex items-center gap-2 mt-2 text-[11px] text-muted-foreground">
                                <span className="flex items-center gap-0.5"><MessageSquare className="h-3 w-3" /> {lead.interactions.length}</span>
                                <span className="flex items-center gap-0.5"><Calendar className="h-3 w-3" /> {lead.followUps.filter((f) => !f.completed).length}</span>
                                <span className="ml-auto text-[10px]">{t(lead.source as any)}</span>
                              </div>
                              {lead.estimatedValue && (
                                <p className="text-[11px] font-semibold text-foreground mt-1">
                                  {lead.estimatedValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                                </p>
                              )}
                              <div className="flex items-center gap-2 mt-1.5">
                                <a
                                  href={getOmniHubUrl(`/conversations?client=${lead.clientName}`)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-0.5 text-[10px] text-primary hover:underline"
                                >
                                  <MessageSquare className="h-2.5 w-2.5" /> OmniHub
                                </a>
                                {lead.source === "ads" && (
                                  <a
                                    href={getAdsManagerUrl(`/campaigns`)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="inline-flex items-center gap-0.5 text-[10px] text-primary hover:underline"
                                  >
                                    <Megaphone className="h-2.5 w-2.5" /> Ads
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>
        </>
      ) : (
        /* Sales Funnel View */
        <div className="flex-1 min-h-0 flex flex-col gap-4">
          <FunnelFiltersCard
            t={t}
            filterPeriod={filterPeriod}
            setFilterPeriod={setFilterPeriod}
            customRange={customRange}
            setCustomRange={setCustomRange}
            brokerOptions={brokerOptions}
            filterBrokers={filterBrokers}
            setFilterBrokers={setFilterBrokers}
            properties={properties}
            filterProperties={filterProperties}
            setFilterProperties={setFilterProperties}
          />

          <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-display">{t("salesFunnel")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <FunnelChart>
                    <Tooltip
                      content={({ payload }) => {
                        if (!payload?.[0]) return null;
                        const data = payload[0].payload;
                        const stageIndex = funnelData.findIndex((s) => s.stage === data.stage);
                        const prevName = stageIndex > 0 ? funnelData[stageIndex - 1].name : t("totalEntered");
                        const prevCount = stageIndex > 0 ? funnelData[stageIndex - 1].value : filteredLeads.filter(l => l.stage !== "closed_lost").length;
                        return (
                          <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm max-w-xs">
                            <p className="font-semibold text-foreground">{data.name}</p>
                            <p className="text-muted-foreground">{t("leadsCount")}: {data.value}</p>
                            <p className="text-muted-foreground">{t("totalValue")}: {data.totalValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
                            <p className="text-muted-foreground">{t("conversionRate")}: {data.conversionRate}%</p>
                            <p className="text-[11px] text-muted-foreground mt-1 italic">
                              {stageIndex === 0
                                ? `${data.value} ${t("enteredFromTotal")} ${prevCount}`
                                : `${data.value} ${t("convertedFromPrev")} ${prevName} (${prevCount})`}
                            </p>
                          </div>
                        );
                      }}
                    />
                    <Funnel dataKey="value" data={funnelData} isAnimationActive>
                      <LabelList position="right" fill="hsl(var(--foreground))" stroke="none" dataKey="name" className="text-xs" />
                      <LabelList position="center" fill="#fff" stroke="none" dataKey="value" className="text-sm font-bold" />
                      {funnelData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Funnel>
                  </FunnelChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-3">
            {funnelData.map((item, i) => (
              <Card
                key={item.stage}
                className="overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => {
                  const stageKey = item.stage as LeadStage;
                  const prevStage = i > 0 ? (funnelData[i - 1].stage as LeadStage) : null;
                  setDrillDownStage({
                    stage: stageKey,
                    stageName: item.name,
                    current: leadsByStage[stageKey],
                    previous: prevStage ? leadsByStage[prevStage] : filteredLeads.filter((l) => l.stage !== "closed_lost"),
                    rate: item.conversionRate,
                    fill: item.fill,
                  });
                }}
              >
                <div className="flex items-stretch">
                  <div className="w-1.5" style={{ backgroundColor: item.fill }} />
                  <div className="flex-1 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-foreground">{item.name}</p>
                      <Badge variant="secondary" className="text-xs">{item.value} {t("leadsCount").toLowerCase()}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {item.totalValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </p>
                    {i > 0 && (
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${item.conversionRate}%`, backgroundColor: item.fill }} />
                        </div>
                        <span className="text-[11px] font-medium text-muted-foreground">{item.conversionRate}%</span>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
          </div>
        </div>
      )}

      {/* Lead Detail Dialog */}
      <Dialog open={!!activeLead} onOpenChange={(open) => { if (!open) setSelectedLead(null); }}>
        {activeLead && (
          <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle className="font-display text-xl">{activeLead.clientName}</DialogTitle>
                <Select value={activeLead.stage} onValueChange={(v) => updateLeadStage(activeLead.id, v as LeadStage)}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {stages.map((s) => (
                      <SelectItem key={s.key} value={s.key}>{t(s.key as any)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>{t("source")}: {t(activeLead.source as any)}</span>
                {activeLead.propertyInterest && <span>{t("interest")}: {activeLead.propertyInterest}</span>}
                <span>{t("assignedTo")}: {activeLead.assignedToName}</span>
              </div>
            </DialogHeader>

            <Tabs defaultValue="interactions">
              <TabsList className="mb-4">
                <TabsTrigger value="interactions">{t("interactions")} ({activeLead.interactions.length})</TabsTrigger>
                <TabsTrigger value="followups">{t("followUps")} ({activeLead.followUps.filter((f) => !f.completed).length})</TabsTrigger>
                <TabsTrigger value="documents">Documentos ({getProposalsByClient(activeLead.clientId).length + allContracts.filter((c) => c.clientId === activeLead.clientId).length})</TabsTrigger>
              </TabsList>

              <TabsContent value="interactions" className="space-y-3">
                <Button size="sm" variant="outline" onClick={() => setInteractionOpen(true)} className="gap-1">
                  <Plus className="h-3 w-3" /> {t("addInteraction")}
                </Button>
                {activeLead.interactions.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">{t("noInteractions")}</p>
                ) : (
                  <div className="space-y-3">
                    {[...activeLead.interactions].reverse().map((inter) => {
                      const Icon = interactionIcons[inter.type] || StickyNote;
                      return (
                        <div key={inter.id} className="flex gap-3 items-start">
                          <div className="p-2 rounded-lg bg-secondary shrink-0">
                            <Icon className="h-4 w-4 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[10px]">{t(inter.type as any)}</Badge>
                              <span className="text-xs text-muted-foreground">{new Date(inter.createdAt).toLocaleString("pt-BR")}</span>
                            </div>
                            <p className="text-sm text-foreground mt-1">{inter.description}</p>
                            <p className="text-xs text-muted-foreground">{inter.createdBy}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="followups" className="space-y-3">
                <Button size="sm" variant="outline" onClick={() => setFollowUpOpen(true)} className="gap-1">
                  <Plus className="h-3 w-3" /> {t("addFollowUp")}
                </Button>
                {activeLead.followUps.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">{t("noFollowUps")}</p>
                ) : (
                  <div className="space-y-2">
                    {[...activeLead.followUps].sort((a, b) => (a.completed === b.completed ? 0 : a.completed ? 1 : -1)).map((fu) => {
                      const isOverdue = !fu.completed && new Date(fu.dueDate) < new Date();
                      return (
                        <div key={fu.id} className={`flex items-center gap-3 p-3 rounded-lg border ${fu.completed ? "bg-muted/50 opacity-60" : isOverdue ? "border-destructive/50 bg-destructive/5" : "bg-background"}`}>
                          {fu.completed ? (
                            <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                          ) : (
                            <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={() => completeFollowUp(activeLead.id, fu.id)}>
                              <Clock className={`h-5 w-5 ${isOverdue ? "text-destructive" : "text-muted-foreground"}`} />
                            </Button>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm ${fu.completed ? "line-through text-muted-foreground" : "text-foreground"}`}>{fu.title}</p>
                            <p className={`text-xs ${isOverdue ? "text-destructive" : "text-muted-foreground"}`}>
                              {new Date(fu.dueDate).toLocaleDateString("pt-BR")}
                              {isOverdue && ` • ${t("overdue")}`}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="documents" className="space-y-4">
                {(() => {
                  const proposals = getProposalsByClient(activeLead.clientId);
                  const contracts = allContracts.filter((c) => c.clientId === activeLead.clientId);
                  if (proposals.length === 0 && contracts.length === 0) {
                    return <p className="text-sm text-muted-foreground py-4 text-center">Nenhum documento vinculado a este cliente.</p>;
                  }
                  return (
                    <>
                      {proposals.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-xs font-display font-semibold text-muted-foreground uppercase tracking-wide">Propostas ({proposals.length})</h4>
                          {proposals.map((p) => (
                            <details key={p.id} className="group rounded-lg border bg-background">
                              <summary className="flex items-center justify-between p-3 cursor-pointer list-none">
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium truncate">{p.propertyName} • Unidade {p.unitNumber}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {new Date(p.createdAt).toLocaleDateString("pt-BR")} • {p.status} • R$ {p.finalPrice.toLocaleString("pt-BR")}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1">
                                  {p.pdfUrl && (
                                    <Button variant="ghost" size="sm" asChild onClick={(e) => e.stopPropagation()}>
                                      <TrackedPdfLink href={p.pdfUrl} parentType="proposal" parentId={p.id} action="downloaded" title="Baixar PDF"><Download className="h-4 w-4" /></TrackedPdfLink>
                                    </Button>
                                  )}
                                  <Button variant="ghost" size="sm" asChild onClick={(e) => e.stopPropagation()}>
                                    <a href={`/proposals/${p.id}`}><Eye className="h-4 w-4" /></a>
                                  </Button>
                                </div>
                              </summary>
                              <div className="p-3 pt-0 border-t">
                                <p className="text-xs font-display font-semibold text-muted-foreground uppercase tracking-wide mb-2">Versões do PDF</p>
                                <PdfVersionsList parentType="proposal" parentId={p.id} compact />
                              </div>
                            </details>
                          ))}
                        </div>
                      )}
                      {contracts.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-xs font-display font-semibold text-muted-foreground uppercase tracking-wide">Contratos ({contracts.length})</h4>
                          {contracts.map((c) => (
                            <details key={c.id} className="group rounded-lg border bg-background">
                              <summary className="flex items-center justify-between p-3 cursor-pointer list-none">
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium truncate flex items-center gap-2">
                                    <FileSignature className="h-3.5 w-3.5 text-muted-foreground" />
                                    {c.propertyName} • Unidade {c.unitNumber}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {new Date(c.createdAt).toLocaleDateString("pt-BR")} • {c.status} • R$ {c.finalPrice.toLocaleString("pt-BR")}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1">
                                  {c.pdfUrl && (
                                    <Button variant="ghost" size="sm" asChild onClick={(e) => e.stopPropagation()}>
                                      <TrackedPdfLink href={c.pdfUrl} parentType="contract" parentId={c.id} action="downloaded" title="Baixar PDF"><Download className="h-4 w-4" /></TrackedPdfLink>
                                    </Button>
                                  )}
                                  <Button variant="ghost" size="sm" asChild onClick={(e) => e.stopPropagation()}>
                                    <a href={`/contracts/${c.id}`}><Eye className="h-4 w-4" /></a>
                                  </Button>
                                </div>
                              </summary>
                              <div className="p-3 pt-0 border-t">
                                <p className="text-xs font-display font-semibold text-muted-foreground uppercase tracking-wide mb-2">Versões do PDF</p>
                                <PdfVersionsList parentType="contract" parentId={c.id} compact />
                              </div>
                            </details>
                          ))}
                        </div>
                      )}
                    </>
                  );
                })()}
              </TabsContent>
            </Tabs>
          </DialogContent>
        )}
      </Dialog>

      {/* New Lead Dialog */}
      <Dialog open={newLeadOpen} onOpenChange={setNewLeadOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">{t("newLead")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t("client")}</Label>
              <Select value={newLeadForm.clientId} onValueChange={(v) => setNewLeadForm({ ...newLeadForm, clientId: v })}>
                <SelectTrigger><SelectValue placeholder={t("selectClient")} /></SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("source")}</Label>
              <Select value={newLeadForm.source} onValueChange={(v) => setNewLeadForm({ ...newLeadForm, source: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="website">{t("website")}</SelectItem>
                  <SelectItem value="referral">{t("referral")}</SelectItem>
                  <SelectItem value="social">{t("social")}</SelectItem>
                  <SelectItem value="ads">{t("ads")}</SelectItem>
                  <SelectItem value="walk_in">{t("walk_in")}</SelectItem>
                  <SelectItem value="other">{t("other")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("propertyInterest")}</Label>
              <Select value={newLeadForm.propertyInterest} onValueChange={(v) => setNewLeadForm({ ...newLeadForm, propertyInterest: v })}>
                <SelectTrigger><SelectValue placeholder={t("selectProperty")} /></SelectTrigger>
                <SelectContent>
                  {properties.map((p) => (
                    <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewLeadOpen(false)}>{t("cancel")}</Button>
            <Button onClick={handleCreateLead}>{t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Interaction Dialog */}
      <Dialog open={interactionOpen} onOpenChange={setInteractionOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">{t("addInteraction")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t("interactionType")}</Label>
              <Select value={interactionForm.type} onValueChange={(v) => setInteractionForm({ ...interactionForm, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="call">{t("call")}</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="visit">{t("visitType")}</SelectItem>
                  <SelectItem value="meeting">{t("meetingType")}</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="note">{t("noteType")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("description")}</Label>
              <Textarea
                value={interactionForm.description}
                onChange={(e) => setInteractionForm({ ...interactionForm, description: e.target.value })}
                placeholder={t("interactionDesc")}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInteractionOpen(false)}>{t("cancel")}</Button>
            <Button onClick={handleAddInteraction}>{t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Follow-up Dialog */}
      <Dialog open={followUpOpen} onOpenChange={setFollowUpOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">{t("addFollowUp")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t("taskTitle")}</Label>
              <Input
                value={followUpForm.title}
                onChange={(e) => setFollowUpForm({ ...followUpForm, title: e.target.value })}
                placeholder={t("followUpPlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("dueDate")}</Label>
              <Input
                type="date"
                value={followUpForm.dueDate}
                onChange={(e) => setFollowUpForm({ ...followUpForm, dueDate: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFollowUpOpen(false)}>{t("cancel")}</Button>
            <Button onClick={handleAddFollowUp}>{t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Drill-down Dialog */}
      <Dialog open={!!drillDownStage} onOpenChange={(open) => { if (!open) setDrillDownStage(null); }}>
        {drillDownStage && (
          <DialogContent className="sm:max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display text-xl flex items-center gap-2">
                <BarChart3 className="h-5 w-5" style={{ color: drillDownStage.fill }} />
                {t("drillDownTitle")}: {drillDownStage.stageName}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {/* Rate summary */}
              <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
                <div className="text-2xl font-bold" style={{ color: drillDownStage.fill }}>
                  {drillDownStage.rate}%
                </div>
                <div className="text-sm text-muted-foreground">
                  {drillDownStage.current.length} {t("leadsInStage")} {drillDownStage.previous.length > 0 && `• ${drillDownStage.previous.length} ${t("denominator").toLowerCase()}`}
                </div>
              </div>

              {/* Numerator */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: drillDownStage.fill }} />
                  {t("numerator")} ({drillDownStage.current.length})
                </h4>
                {drillDownStage.current.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">{t("noLeadsInStage")}</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {drillDownStage.current.map((lead) => (
                      <button
                        key={lead.id}
                        onClick={() => {
                          setSelectedLead(lead.id);
                          setDrillDownStage(null);
                        }}
                        className="text-left p-2 rounded-md border bg-card hover:bg-accent/50 transition-colors"
                      >
                        <p className="text-sm font-medium text-foreground">{lead.clientName}</p>
                        <p className="text-xs text-muted-foreground">{lead.assignedToName}</p>
                        {lead.estimatedValue && (
                          <p className="text-xs font-medium text-foreground mt-0.5">
                            {lead.estimatedValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Denominator */}
              {drillDownStage.previous.length > 0 && drillDownStage.previous !== drillDownStage.current && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-muted-foreground" />
                    {t("denominator")} ({drillDownStage.previous.length})
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {drillDownStage.previous.map((lead) => (
                      <button
                        key={lead.id}
                        onClick={() => {
                          setSelectedLead(lead.id);
                          setDrillDownStage(null);
                        }}
                        className="text-left p-2 rounded-md border bg-card hover:bg-accent/50 transition-colors"
                      >
                        <p className="text-sm font-medium text-foreground">{lead.clientName}</p>
                        <p className="text-xs text-muted-foreground">{lead.assignedToName}</p>
                        {lead.estimatedValue && (
                          <p className="text-xs font-medium text-foreground mt-0.5">
                            {lead.estimatedValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

interface FunnelFiltersCardProps {
  t: (k: any) => string;
  filterPeriod: string;
  setFilterPeriod: (v: string) => void;
  customRange: DateRange | undefined;
  setCustomRange: (v: DateRange | undefined) => void;
  brokerOptions: { id: string; name: string }[];
  filterBrokers: string[];
  setFilterBrokers: (v: string[]) => void;
  properties: { id: string; name: string }[];
  filterProperties: string[];
  setFilterProperties: (v: string[]) => void;
}

function FunnelFiltersCard({
  t, filterPeriod, setFilterPeriod, customRange, setCustomRange,
  brokerOptions, filterBrokers, setFilterBrokers,
  properties, filterProperties, setFilterProperties,
}: FunnelFiltersCardProps) {
  const hasActive = filterPeriod !== "all" || filterBrokers.length > 0 || filterProperties.length > 0;
  return (
    <Card className="shrink-0">
      <CardContent className="p-3 flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <Filter className="h-4 w-4" /> {t("filters")}:
        </div>
        <div className="space-y-1 min-w-[160px]">
          <Label className="text-xs">{t("period")}</Label>
          <Select value={filterPeriod} onValueChange={setFilterPeriod}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allPeriods")}</SelectItem>
              <SelectItem value="7">{t("last7Days")}</SelectItem>
              <SelectItem value="30">{t("last30Days")}</SelectItem>
              <SelectItem value="90">{t("last90Days")}</SelectItem>
              <SelectItem value="custom">{t("customRange")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {filterPeriod === "custom" && (
          <div className="space-y-1 min-w-[260px]">
            <Label className="text-xs">{t("dateRange")}</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "h-9 w-full justify-start text-left font-normal",
                    !customRange?.from && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {customRange?.from ? (
                    customRange.to ? (
                      <>{format(customRange.from, "dd/MM/yyyy")} - {format(customRange.to, "dd/MM/yyyy")}</>
                    ) : (
                      format(customRange.from, "dd/MM/yyyy")
                    )
                  ) : (
                    <span>{t("pickDates")}</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarUI
                  mode="range"
                  selected={customRange}
                  onSelect={setCustomRange}
                  numberOfMonths={2}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>
        )}
        <div className="space-y-1 min-w-[180px]">
          <Label className="text-xs">{t("broker")}</Label>
          <MultiSelect
            options={brokerOptions.map((b) => ({ value: b.id, label: b.name }))}
            value={filterBrokers}
            onChange={setFilterBrokers}
            allLabel={t("allBrokers")}
          />
        </div>
        <div className="space-y-1 min-w-[200px]">
          <Label className="text-xs">{t("property")}</Label>
          <MultiSelect
            options={properties.map((p) => ({ value: p.name, label: p.name }))}
            value={filterProperties}
            onChange={setFilterProperties}
            allLabel={t("allProperties")}
          />
        </div>
        <Button
          variant={hasActive ? "default" : "outline"}
          size="sm"
          disabled={!hasActive}
          onClick={() => {
            setFilterPeriod("all");
            setFilterBrokers([]);
            setFilterProperties([]);
            setCustomRange(undefined);
          }}
          className="gap-1.5"
        >
          <RotateCcw className="h-3.5 w-3.5" /> {t("resetFilters")}
        </Button>
      </CardContent>
    </Card>
  );
}
