import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Lead, LeadStage, Interaction, FollowUp } from "@/types/crm";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useClients } from "@/contexts/ClientContext";
import { useToast } from "@/hooks/use-toast";

interface CRMContextType {
  leads: Lead[];
  loading: boolean;
  addLead: (lead: Lead) => Promise<void>;
  updateLeadStage: (id: string, stage: LeadStage) => Promise<void>;
  addInteraction: (leadId: string, interaction: Interaction) => Promise<void>;
  addFollowUp: (leadId: string, followUp: FollowUp) => Promise<void>;
  completeFollowUp: (leadId: string, followUpId: string) => Promise<void>;
  getLeadByClient: (clientId: string) => Lead | undefined;
  deleteLead: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const CRMContext = createContext<CRMContextType | null>(null);

function rowToInteraction(row: any, fallbackName: string): Interaction {
  return {
    id: row.id,
    clientId: row.client_id ?? "",
    type: (row.type ?? "note") as Interaction["type"],
    description: row.content ?? "",
    createdAt: row.created_at,
    createdBy: row.created_by_name ?? fallbackName,
  };
}

function rowToFollowUp(row: any, fallbackName: string): FollowUp {
  return {
    id: row.id,
    clientId: row.client_id ?? "",
    title: row.title ?? row.notes ?? "",
    dueDate: row.scheduled_at,
    completed: row.status === "done" || !!row.completed_at,
    completedAt: row.completed_at ?? undefined,
    createdAt: row.created_at,
    createdBy: row.created_by_name ?? fallbackName,
  };
}

function rowToLead(row: any, interactions: Interaction[], followUps: FollowUp[]): Lead {
  return {
    id: row.id,
    clientId: row.client_id ?? "",
    clientName: row.name,
    stage: (row.stage ?? "new") as LeadStage,
    source: (row.source ?? "other") as Lead["source"],
    propertyInterest: row.property_interest ?? undefined,
    estimatedValue: row.estimated_value != null ? Number(row.estimated_value) : undefined,
    assignedTo: row.broker_id ?? "",
    assignedToName: row.broker_name ?? "",
    interactions,
    followUps,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function CRMProvider({ children }: { children: React.ReactNode }) {
  const { session, user } = useAuth();
  const { toast } = useToast();
  const { clients } = useClients();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: leadRows, error: e1 }, { data: intRows, error: e2 }, { data: fuRows, error: e3 }] =
        await Promise.all([
          supabase.from("leads").select("*").order("created_at", { ascending: false }),
          supabase.from("interactions").select("*").order("created_at", { ascending: true }),
          supabase.from("follow_ups").select("*").order("scheduled_at", { ascending: true }),
        ]);
      if (e1) throw e1;
      if (e2) throw e2;
      if (e3) throw e3;

      const intsByLead = new Map<string, Interaction[]>();
      (intRows ?? []).forEach((r: any) => {
        const lead = (leadRows ?? []).find((l: any) => l.id === r.lead_id);
        const interaction = rowToInteraction({ ...r, client_id: lead?.client_id }, "");
        const arr = intsByLead.get(r.lead_id) ?? [];
        arr.push(interaction);
        intsByLead.set(r.lead_id, arr);
      });

      const fusByLead = new Map<string, FollowUp[]>();
      (fuRows ?? []).forEach((r: any) => {
        const lead = (leadRows ?? []).find((l: any) => l.id === r.lead_id);
        const fu = rowToFollowUp({ ...r, client_id: lead?.client_id }, "");
        const arr = fusByLead.get(r.lead_id) ?? [];
        arr.push(fu);
        fusByLead.set(r.lead_id, arr);
      });

      const list = (leadRows ?? []).map((r: any) =>
        rowToLead(r, intsByLead.get(r.id) ?? [], fusByLead.get(r.id) ?? [])
      );
      setLeads(list);
    } catch (err: any) {
      toast({ title: "Erro ao carregar CRM", description: err?.message ?? String(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (session) refresh();
    else {
      setLeads([]);
      setLoading(false);
    }
  }, [session, refresh]);

  // Realtime: keep CRM Kanban in sync across users.
  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel("crm-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, (payload) => {
        setLeads((prev) => {
          if (payload.eventType === "DELETE") {
            return prev.filter((l) => l.id !== (payload.old as any).id);
          }
          const row: any = payload.new;
          const existing = prev.find((l) => l.id === row.id);
          const merged = rowToLead(row, existing?.interactions ?? [], existing?.followUps ?? []);
          if (payload.eventType === "INSERT") {
            if (existing) return prev.map((l) => (l.id === row.id ? merged : l));
            return [merged, ...prev];
          }
          // UPDATE
          return prev.map((l) => (l.id === row.id ? merged : l));
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "interactions" }, (payload) => {
        setLeads((prev) => prev.map((l) => {
          if (payload.eventType === "DELETE") {
            const oldId = (payload.old as any).id;
            if (!l.interactions.some((i) => i.id === oldId)) return l;
            return { ...l, interactions: l.interactions.filter((i) => i.id !== oldId) };
          }
          const row: any = payload.new;
          if (row.lead_id !== l.id) return l;
          const item = rowToInteraction({ ...row, client_id: l.clientId }, "");
          const exists = l.interactions.some((i) => i.id === item.id);
          const next = exists
            ? l.interactions.map((i) => (i.id === item.id ? item : i))
            : [...l.interactions, item];
          return { ...l, interactions: next };
        }));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "follow_ups" }, (payload) => {
        setLeads((prev) => prev.map((l) => {
          if (payload.eventType === "DELETE") {
            const oldId = (payload.old as any).id;
            if (!l.followUps.some((f) => f.id === oldId)) return l;
            return { ...l, followUps: l.followUps.filter((f) => f.id !== oldId) };
          }
          const row: any = payload.new;
          if (row.lead_id !== l.id) return l;
          const item = rowToFollowUp({ ...row, client_id: l.clientId }, "");
          const exists = l.followUps.some((f) => f.id === item.id);
          const next = exists
            ? l.followUps.map((f) => (f.id === item.id ? item : f))
            : [...l.followUps, item];
          return { ...l, followUps: next };
        }));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [session]);

  const addLead = async (lead: Lead) => {
    const client = clients.find((c) => c.id === lead.clientId);
    const { data, error } = await supabase
      .from("leads")
      .insert({
        name: lead.clientName || client?.name || "Lead",
        email: client?.email,
        phone: client?.phone,
        client_id: lead.clientId || null,
        source: lead.source,
        stage: lead.stage,
        property_interest: lead.propertyInterest,
        estimated_value: lead.estimatedValue,
        broker_id: user?.id,
        broker_name: user?.name,
      })
      .select()
      .single();
    if (error) {
      toast({ title: "Erro ao criar lead", description: error.message, variant: "destructive" });
      throw error;
    }
    setLeads((prev) => [rowToLead(data, [], []), ...prev]);
  };

  const updateLeadStage = async (id: string, stage: LeadStage) => {
    setLeads((prev) =>
      prev.map((l) => (l.id === id ? { ...l, stage, updatedAt: new Date().toISOString() } : l))
    );
    const { error } = await supabase.from("leads").update({ stage }).eq("id", id);
    if (error) {
      toast({ title: "Erro ao mover lead", description: error.message, variant: "destructive" });
      await refresh();
    }
  };

  const addInteraction = async (leadId: string, interaction: Interaction) => {
    const { data, error } = await supabase
      .from("interactions")
      .insert({
        lead_id: leadId,
        type: interaction.type,
        content: interaction.description,
        created_by: user?.id,
      })
      .select()
      .single();
    if (error) {
      toast({ title: "Erro ao salvar interação", description: error.message, variant: "destructive" });
      throw error;
    }
    const newInt: Interaction = {
      ...interaction,
      id: data.id,
      createdAt: data.created_at,
    };
    setLeads((prev) =>
      prev.map((l) =>
        l.id === leadId
          ? { ...l, interactions: [...l.interactions, newInt], updatedAt: new Date().toISOString() }
          : l
      )
    );
  };

  const addFollowUp = async (leadId: string, followUp: FollowUp) => {
    const { data, error } = await supabase
      .from("follow_ups")
      .insert({
        lead_id: leadId,
        title: followUp.title,
        scheduled_at: followUp.dueDate,
        status: "pending",
        notes: followUp.title,
        created_by: user?.id,
      })
      .select()
      .single();
    if (error) {
      toast({ title: "Erro ao criar follow-up", description: error.message, variant: "destructive" });
      throw error;
    }
    const newFu: FollowUp = {
      ...followUp,
      id: data.id,
      createdAt: data.created_at,
    };
    setLeads((prev) =>
      prev.map((l) =>
        l.id === leadId
          ? { ...l, followUps: [...l.followUps, newFu], updatedAt: new Date().toISOString() }
          : l
      )
    );
  };

  const completeFollowUp = async (leadId: string, followUpId: string) => {
    const completedAt = new Date().toISOString();
    setLeads((prev) =>
      prev.map((l) =>
        l.id === leadId
          ? {
              ...l,
              followUps: l.followUps.map((f) =>
                f.id === followUpId ? { ...f, completed: true, completedAt } : f
              ),
            }
          : l
      )
    );
    const { error } = await supabase
      .from("follow_ups")
      .update({ status: "done", completed_at: completedAt })
      .eq("id", followUpId);
    if (error) {
      toast({ title: "Erro ao concluir follow-up", description: error.message, variant: "destructive" });
      await refresh();
    }
  };

  const getLeadByClient = (clientId: string) => leads.find((l) => l.clientId === clientId);

  const deleteLead = async (id: string) => {
    const prev = leads;
    setLeads((p) => p.filter((l) => l.id !== id));
    const { error } = await supabase.from("leads").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao excluir lead", description: error.message, variant: "destructive" });
      setLeads(prev);
    }
  };

  return (
    <CRMContext.Provider
      value={{
        leads,
        loading,
        addLead,
        updateLeadStage,
        addInteraction,
        addFollowUp,
        completeFollowUp,
        getLeadByClient,
        deleteLead,
        refresh,
      }}
    >
      {children}
    </CRMContext.Provider>
  );
}

export function useCRM() {
  const ctx = useContext(CRMContext);
  if (!ctx) throw new Error("useCRM must be used within CRMProvider");
  return ctx;
}
