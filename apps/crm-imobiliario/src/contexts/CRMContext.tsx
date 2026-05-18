import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Lead, LeadStage, Interaction, FollowUp } from "@/types/crm";
import { useAuth } from "@/contexts/AuthContext";
import { useClients } from "@/contexts/ClientContext";
import { useToast } from "@/hooks/use-toast";
import {
  createLead,
  createLeadFollowUp,
  createLeadInteraction,
  deleteLead as apiDeleteLead,
  listLeads,
  updateFollowUp,
  updateLead,
} from "@/lib/api/crm";

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

export function CRMProvider({ children }: { children: React.ReactNode }) {
  const { session, user } = useAuth();
  const { toast } = useToast();
  const { clients } = useClients();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setLeads(await listLeads());
    } catch (err) {
      toast({
        title: "Erro ao carregar CRM",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
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

  const addLead = async (lead: Lead) => {
    const client = clients.find((c) => c.id === lead.clientId);
    try {
      const created = await createLead(lead, client);
      setLeads((prev) => [created, ...prev]);
    } catch (err) {
      toast({
        title: "Erro ao criar lead",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
      throw err;
    }
  };

  const updateLeadStage = async (id: string, stage: LeadStage) => {
    setLeads((prev) =>
      prev.map((l) => (l.id === id ? { ...l, stage, updatedAt: new Date().toISOString() } : l))
    );
    try {
      await updateLead(id, { stage });
    } catch (err) {
      toast({
        title: "Erro ao mover lead",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
      await refresh();
    }
  };

  const addInteraction = async (leadId: string, interaction: Interaction) => {
    try {
      const newInt = await createLeadInteraction(leadId, interaction);
      setLeads((prev) =>
        prev.map((l) =>
          l.id === leadId
            ? { ...l, interactions: [...l.interactions, newInt], updatedAt: new Date().toISOString() }
            : l
        )
      );
    } catch (err) {
      toast({
        title: "Erro ao salvar interação",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
      throw err;
    }
  };

  const addFollowUp = async (leadId: string, followUp: FollowUp) => {
    try {
      const newFu = await createLeadFollowUp(leadId, followUp);
      setLeads((prev) =>
        prev.map((l) =>
          l.id === leadId
            ? { ...l, followUps: [...l.followUps, newFu], updatedAt: new Date().toISOString() }
            : l
        )
      );
    } catch (err) {
      toast({
        title: "Erro ao criar follow-up",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
      throw err;
    }
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
    try {
      await updateFollowUp(followUpId, { status: "done", completedAt });
    } catch (err) {
      toast({
        title: "Erro ao concluir follow-up",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
      await refresh();
    }
  };

  const getLeadByClient = (clientId: string) => leads.find((l) => l.clientId === clientId);

  const deleteLead = async (id: string) => {
    const prev = leads;
    setLeads((p) => p.filter((l) => l.id !== id));
    try {
      await apiDeleteLead(id);
    } catch (err) {
      toast({
        title: "Erro ao excluir lead",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
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
