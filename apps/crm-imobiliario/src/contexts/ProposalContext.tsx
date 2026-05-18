import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Proposal, ProposalStatus, PaymentCondition } from "@/types/property";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

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

function rowToProposal(r: any): Proposal {
  return {
    id: r.id,
    propertyId: r.property_id,
    propertyName: r.property_name,
    unitId: r.unit_id,
    unitNumber: r.unit_number,
    clientId: r.client_id,
    clientName: r.client_name,
    originalPrice: Number(r.original_price ?? 0),
    discount: Number(r.discount ?? 0),
    discountPercent: Number(r.discount_percent ?? 0),
    finalPrice: Number(r.final_price ?? 0),
    paymentCondition: (r.payment_condition ?? {}) as PaymentCondition,
    status: r.status as ProposalStatus,
    validUntil: r.valid_until ?? new Date().toISOString(),
    createdAt: r.created_at,
    createdBy: r.broker_name ?? "",
    notes: r.notes ?? undefined,
    pdfUrl: r.pdf_url ?? undefined,
    sourcePdfUrl: r.source_pdf_url ?? undefined,
  };
}

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
    const { data, error } = await supabase
      .from("proposals")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Erro ao carregar propostas", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    setProposals((data ?? []).map(rowToProposal));
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addProposal = async (p: Omit<Proposal, "id">): Promise<string | null> => {
    if (!user) return null;
    const { data, error } = await supabase
      .from("proposals")
      .insert({
        property_id: p.propertyId,
        property_name: p.propertyName,
        unit_id: p.unitId,
        unit_number: p.unitNumber,
        client_id: p.clientId,
        client_name: p.clientName,
        broker_id: user.id,
        broker_name: p.createdBy || user.name,
        original_price: p.originalPrice,
        discount: p.discount,
        discount_percent: p.discountPercent,
        final_price: p.finalPrice,
        payment_condition: p.paymentCondition as any,
        status: p.status,
        valid_until: p.validUntil,
        notes: p.notes ?? null,
        pdf_url: p.pdfUrl ?? null,
        source_pdf_url: p.sourcePdfUrl ?? null,
      })
      .select()
      .single();
    if (error || !data) {
      toast({ title: "Erro ao criar proposta", description: error?.message, variant: "destructive" });
      return null;
    }
    setProposals((prev) => [rowToProposal(data), ...prev]);
    return data.id;
  };

  const updateProposalStatus = async (id: string, status: ProposalStatus) => {
    const prev = proposals;
    setProposals((cur) => cur.map((p) => (p.id === id ? { ...p, status } : p)));
    const { error } = await supabase.from("proposals").update({ status }).eq("id", id);
    if (error) {
      setProposals(prev);
      toast({ title: "Erro ao atualizar proposta", description: error.message, variant: "destructive" });
    }
  };

  const updateProposalPdfUrl = async (id: string, pdfUrl: string | null, sourcePdfUrl?: string | null) => {
    const patch: any = { pdf_url: pdfUrl };
    if (sourcePdfUrl !== undefined) patch.source_pdf_url = sourcePdfUrl;
    setProposals((cur) => cur.map((p) => (p.id === id
      ? { ...p, pdfUrl: pdfUrl ?? undefined, sourcePdfUrl: sourcePdfUrl === undefined ? p.sourcePdfUrl : (sourcePdfUrl ?? undefined) }
      : p)));
    const { error } = await supabase.from("proposals").update(patch).eq("id", id);
    if (error) toast({ title: "Erro ao salvar PDF", description: error.message, variant: "destructive" });
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
