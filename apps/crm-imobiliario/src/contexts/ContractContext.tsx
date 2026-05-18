import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Contract, ContractStatus } from "@/types/property";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import {
  createContract,
  listContracts,
  transitionContract,
  updateContractPdf,
} from "@/lib/api/crm";

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
    try {
      setContracts(await listContracts());
    } catch (err) {
      toast({
        title: "Erro ao carregar contratos",
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

  const addContract = async (c: Omit<Contract, "id">): Promise<string | null> => {
    if (!user) return null;
    try {
      const created = await createContract(c);
      setContracts((prev) => [created, ...prev]);
      return created.id;
    } catch (err) {
      toast({
        title: "Erro ao criar contrato",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
      return null;
    }
  };

  const updateContractStatus = async (id: string, status: ContractStatus) => {
    const prev = contracts;
    setContracts((cur) => cur.map((c) => (c.id === id ? { ...c, status } : c)));
    try {
      await transitionContract(id, status);
    } catch (err) {
      setContracts(prev);
      toast({
        title: "Erro ao atualizar contrato",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  };

  const signContract = async (contractId: string, role: string) => {
    void contractId;
    void role;
    toast({
      title: "Assinatura via Clicksign",
      description:
        "A assinatura manual no navegador foi substituída pelo envelope Clicksign. Use o fluxo de envio de envelope na tela do contrato.",
    });
    await refresh();
  };

  const updateContractPdfUrl = async (id: string, pdfUrl: string | null, sourcePdfUrl?: string | null) => {
    setContracts((cur) => cur.map((c) => (c.id === id
      ? { ...c, pdfUrl: pdfUrl ?? undefined, sourcePdfUrl: sourcePdfUrl === undefined ? c.sourcePdfUrl : (sourcePdfUrl ?? undefined) }
      : c)));
    try {
      await updateContractPdf(id, pdfUrl);
    } catch (err) {
      toast({
        title: "Erro ao salvar PDF",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
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
