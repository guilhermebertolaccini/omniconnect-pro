import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Proposal, ProposalStatus } from "@/types/property";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import {
  createProposal,
  listProposals,
  transitionProposal,
  updateProposalPdf,
} from "@/lib/api/crm";

interface ProposalContextType {
  proposals: Proposal[];
  loading: boolean;
  addProposal: (proposal: Omit<Proposal, "id">) => Promise<string | null>;
  updateProposalStatus: (id: string, status: ProposalStatus) => Promise<void>;
  updateProposalPdfUrl: (id: string, pdfUrl: string | null, sourcePdfUrl?: string | null) => Promise<void>;
  getProposalsByUnit: (unitId: string) => Proposal[];
  getProposalsByClient: (clientId: string) => Proposal[];
  getProposal: (id: string) => Proposal | undefined;
  refresh: () => Promise<void>;
}

const ProposalContext = createContext<ProposalContextType | null>(null);

export function ProposalProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setProposals([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setProposals(await listProposals());
    } catch (err) {
      toast({
        title: "Erro ao carregar propostas",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addProposal = async (p: Omit<Proposal, "id">): Promise<string | null> => {
    if (!user) return null;
    try {
      const created = await createProposal(p);
      setProposals((prev) => [created, ...prev]);
      return created.id;
    } catch (err) {
      toast({
        title: "Erro ao criar proposta",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
      return null;
    }
  };

  const updateProposalStatus = async (id: string, status: ProposalStatus) => {
    const prev = proposals;
    setProposals((cur) => cur.map((p) => (p.id === id ? { ...p, status } : p)));
    try {
      await transitionProposal(id, status);
    } catch (err) {
      setProposals(prev);
      toast({
        title: "Erro ao atualizar proposta",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  };

  const updateProposalPdfUrl = async (id: string, pdfUrl: string | null, sourcePdfUrl?: string | null) => {
    setProposals((cur) => cur.map((p) => (p.id === id
      ? { ...p, pdfUrl: pdfUrl ?? undefined, sourcePdfUrl: sourcePdfUrl === undefined ? p.sourcePdfUrl : (sourcePdfUrl ?? undefined) }
      : p)));
    try {
      await updateProposalPdf(id, pdfUrl);
    } catch (err) {
      toast({
        title: "Erro ao salvar PDF",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  };

  const getProposalsByUnit = (unitId: string) => proposals.filter((p) => p.unitId === unitId);
  const getProposalsByClient = (clientId: string) => proposals.filter((p) => p.clientId === clientId);
  const getProposal = (id: string) => proposals.find((p) => p.id === id);

  return (
    <ProposalContext.Provider
      value={{ proposals, loading, addProposal, updateProposalStatus, updateProposalPdfUrl, getProposalsByUnit, getProposalsByClient, getProposal, refresh }}
    >
      {children}
    </ProposalContext.Provider>
  );
}

export function useProposals() {
  const ctx = useContext(ProposalContext);
  if (!ctx) throw new Error("useProposals must be used within ProposalProvider");
  return ctx;
}
