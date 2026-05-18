import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Payment, Commission, PropertyCommissionConfig } from "@/types/financial";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import {
  listCommissions,
  listPayments,
  markCommissionPaid as apiMarkCommissionPaid,
  markPaymentPaid as apiMarkPaymentPaid,
  setCommissionConfig as apiSetCommissionConfig,
} from "@/lib/api/crm";

interface FinancialContextType {
  payments: Payment[];
  commissions: Commission[];
  commissionConfigs: PropertyCommissionConfig[];
  loading: boolean;
  addPayment: (payment: Payment) => Promise<void>;
  markPaymentPaid: (id: string) => Promise<void>;
  addCommission: (commission: Commission) => Promise<void>;
  markCommissionPaid: (id: string) => Promise<void>;
  setCommissionConfig: (propertyId: string, percent: number) => Promise<void>;
  getCommissionConfig: (propertyId: string) => number;
  getPaymentsByContract: (contractId: string) => Payment[];
  getPaymentsByProperty: (propertyId: string) => Payment[];
  getCommissionsByProperty: (propertyId: string) => Commission[];
  /**
   * Now a no-op on the front: the database trigger generates payments and commissions
   * automatically when a contract status flips to 'signed'. Kept for API compatibility;
   * triggers a refresh so callers see the freshly-generated rows.
   */
  generatePaymentsFromContract: (contract: {
    id: string;
    propertyId: string;
    propertyName: string;
    unitId: string;
    unitNumber: string;
    clientId: string;
    clientName: string;
    finalPrice: number;
    paymentCondition: {
      downPayment: number;
      installments: number;
      installmentValue: number;
      balloon: number;
    };
  }) => Promise<void>;
  refresh: () => Promise<void>;
}

const FinancialContext = createContext<FinancialContextType | null>(null);

export function FinancialProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [commissionConfigs, setCommissionConfigs] = useState<PropertyCommissionConfig[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setPayments([]); setCommissions([]); setCommissionConfigs([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [paymentsRows, commissionRows] = await Promise.all([
        listPayments(),
        listCommissions(),
      ]);
      setPayments(paymentsRows);
      setCommissions(commissionRows);
      // Não há endpoint de listagem global dos configs no backend; mantemos
      // o estado local dos configs alterados nesta sessão e default 5%.
    } catch (err) {
      toast({
        title: "Erro ao carregar financeiro",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  const addPayment = async (p: Payment) => {
    void p;
    // Payments são gerados pelo trigger SQL quando contrato vira `signed`.
    await refresh();
  };

  const markPaymentPaid = async (id: string) => {
    const paidAt = new Date().toISOString();
    const prev = payments;
    setPayments((cur) => cur.map((p) => (p.id === id ? { ...p, status: "paid", paidAt } : p)));
    try {
      await apiMarkPaymentPaid(id);
    } catch (err) {
      setPayments(prev);
      toast({
        title: "Erro ao marcar pago",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  };

  const addCommission = async (_c: Commission) => {
    // No-op on the front — commissions are generated automatically by the DB trigger
    // when the contract status changes to 'signed'. Refresh to pull the freshly generated row.
    await refresh();
  };

  const markCommissionPaid = async (id: string) => {
    const paidAt = new Date().toISOString();
    const prev = commissions;
    setCommissions((cur) => cur.map((c) => (c.id === id ? { ...c, status: "paid", paidAt } : c)));
    try {
      await apiMarkCommissionPaid(id);
    } catch (err) {
      setCommissions(prev);
      toast({
        title: "Erro ao marcar comissão paga",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  };

  const setCommissionConfig = async (propertyId: string, percent: number) => {
    const prev = commissionConfigs;
    setCommissionConfigs((cur) => {
      const exists = cur.find((c) => c.propertyId === propertyId);
      if (exists) return cur.map((c) => (c.propertyId === propertyId ? { ...c, commissionPercent: percent } : c));
      return [...cur, { propertyId, commissionPercent: percent }];
    });
    try {
      await apiSetCommissionConfig(propertyId, percent);
    } catch (err) {
      setCommissionConfigs(prev);
      toast({
        title: "Erro ao salvar % de comissão",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  };

  const getCommissionConfig = (propertyId: string) =>
    commissionConfigs.find((c) => c.propertyId === propertyId)?.commissionPercent ?? 5;

  const getPaymentsByContract = (contractId: string) => payments.filter((p) => p.contractId === contractId);
  const getPaymentsByProperty = (propertyId: string) => payments.filter((p) => p.propertyId === propertyId);
  const getCommissionsByProperty = (propertyId: string) => commissions.filter((c) => c.propertyId === propertyId);

  // No-op: trigger handles this. Brief delay then refresh so UI shows new rows.
  const generatePaymentsFromContract = async (_contract: any) => {
    await new Promise((r) => setTimeout(r, 300));
    await refresh();
  };

  return (
    <FinancialContext.Provider
      value={{
        payments, commissions, commissionConfigs, loading,
        addPayment, markPaymentPaid, addCommission, markCommissionPaid,
        setCommissionConfig, getCommissionConfig,
        getPaymentsByContract, getPaymentsByProperty, getCommissionsByProperty,
        generatePaymentsFromContract, refresh,
      }}
    >
      {children}
    </FinancialContext.Provider>
  );
}

export function useFinancial() {
  const ctx = useContext(FinancialContext);
  if (!ctx) throw new Error("useFinancial must be used within FinancialProvider");
  return ctx;
}
