import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Contract, ContractStatus, PaymentCondition, SignatureEntry } from "@/types/property";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

interface ContractContextType {
  contracts: Contract[];
  loading: boolean;
  addContract: (contract: Omit<Contract, "id">) => Promise<string | null>;
  updateContractStatus: (id: string, status: ContractStatus) => Promise<void>;
  signContract: (id: string, role: string) => Promise<void>;
  updateContractPdfUrl: (id: string, pdfUrl: string | null, sourcePdfUrl?: string | null) => Promise<void>;
  getContractsByUnit: (unitId: string) => Contract[];
  getContract: (id: string) => Contract | undefined;
  refresh: () => Promise<void>;
}

const ContractContext = createContext<ContractContextType | null>(null);

function rowToContract(r: any): Contract {
  return {
    id: r.id,
    proposalId: r.proposal_id ?? "",
    propertyId: r.property_id,
    propertyName: r.property_name,
    unitId: r.unit_id,
    unitNumber: r.unit_number,
    clientId: r.client_id,
    clientName: r.client_name,
    clientCpfCnpj: r.client_cpf_cnpj ?? "",
    finalPrice: Number(r.final_price ?? 0),
    paymentCondition: (r.payment_condition ?? {}) as PaymentCondition,
    status: r.status as ContractStatus,
    signatures: (r.signatures ?? []) as SignatureEntry[],
    createdAt: r.created_at,
    createdBy: r.broker_name ?? "",
    notes: r.notes ?? undefined,
    pdfUrl: r.pdf_url ?? undefined,
    sourcePdfUrl: r.source_pdf_url ?? undefined,
    externalEnvelopeId: r.external_envelope_id ?? undefined,
    externalEnvelopeUrl: r.external_envelope_url ?? undefined,
    externalProvider: r.external_provider ?? undefined,
  };
}

export function ContractProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setContracts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("contracts")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Erro ao carregar contratos", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    setContracts((data ?? []).map(rowToContract));
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addContract = async (c: Omit<Contract, "id">): Promise<string | null> => {
    if (!user) return null;
    const { data, error } = await supabase
      .from("contracts")
      .insert({
        proposal_id: c.proposalId || null,
        property_id: c.propertyId,
        property_name: c.propertyName,
        unit_id: c.unitId,
        unit_number: c.unitNumber,
        client_id: c.clientId,
        client_name: c.clientName,
        client_cpf_cnpj: c.clientCpfCnpj || null,
        broker_id: user.id,
        broker_name: c.createdBy || user.name,
        final_price: c.finalPrice,
        payment_condition: c.paymentCondition as any,
        status: c.status,
        signatures: c.signatures as any,
        notes: c.notes ?? null,
        pdf_url: c.pdfUrl ?? null,
        source_pdf_url: c.sourcePdfUrl ?? null,
      })
      .select()
      .single();
    if (error || !data) {
      toast({ title: "Erro ao criar contrato", description: error?.message, variant: "destructive" });
      return null;
    }
    setContracts((prev) => [rowToContract(data), ...prev]);
    return data.id;
  };

  const updateContractStatus = async (id: string, status: ContractStatus) => {
    const prev = contracts;
    setContracts((cur) => cur.map((c) => (c.id === id ? { ...c, status } : c)));
    const { error } = await supabase.from("contracts").update({ status }).eq("id", id);
    if (error) {
      setContracts(prev);
      toast({ title: "Erro ao atualizar contrato", description: error.message, variant: "destructive" });
    }
  };

  const signContract = async (contractId: string, role: string) => {
    const target = contracts.find((c) => c.id === contractId);
    if (!target) return;
    const sig = target.signatures.find((s) => s.role === role);
    const signedAt = new Date().toISOString();
    // Compute a simple client-side hash for audit (role + name + timestamp + contract id)
    const hashInput = `${contractId}|${role}|${sig?.name ?? ""}|${signedAt}`;
    let signature_hash = "";
    try {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(hashInput));
      signature_hash = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch {
      signature_hash = btoa(hashInput);
    }

    const { error } = await supabase
      .from("signatures")
      .update({ status: "signed", signed_at: signedAt, signature_hash })
      .eq("contract_id", contractId)
      .eq("role", role);
    if (error) {
      toast({ title: "Erro ao assinar contrato", description: error.message, variant: "destructive" });
      return;
    }
    // The DB trigger updates contracts.signatures jsonb and status; refresh local state from DB.
    await refresh();
  };

  const updateContractPdfUrl = async (id: string, pdfUrl: string | null, sourcePdfUrl?: string | null) => {
    const patch: any = { pdf_url: pdfUrl };
    if (sourcePdfUrl !== undefined) patch.source_pdf_url = sourcePdfUrl;
    setContracts((cur) => cur.map((c) => (c.id === id
      ? { ...c, pdfUrl: pdfUrl ?? undefined, sourcePdfUrl: sourcePdfUrl === undefined ? c.sourcePdfUrl : (sourcePdfUrl ?? undefined) }
      : c)));
    const { error } = await supabase.from("contracts").update(patch).eq("id", id);
    if (error) toast({ title: "Erro ao salvar PDF", description: error.message, variant: "destructive" });
  };

  const getContractsByUnit = (unitId: string) => contracts.filter((c) => c.unitId === unitId);
  const getContract = (id: string) => contracts.find((c) => c.id === id);

  return (
    <ContractContext.Provider
      value={{ contracts, loading, addContract, updateContractStatus, signContract, updateContractPdfUrl, getContractsByUnit, getContract, refresh }}
    >
      {children}
    </ContractContext.Provider>
  );
}

export function useContracts() {
  const ctx = useContext(ContractContext);
  if (!ctx) throw new Error("useContracts must be used within ContractProvider");
  return ctx;
}
