import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Payment, Commission, PropertyCommissionConfig } from "@/types/financial";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

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

function rowToPayment(r: any): Payment {
  return {
    id: r.id,
    contractId: r.contract_id,
    propertyId: r.property_id,
    propertyName: r.property_name,
    unitId: r.unit_id,
    unitNumber: r.unit_number,
    clientId: r.client_id,
    clientName: r.client_name,
    type: r.type,
    installmentNumber: r.installment_number ?? undefined,
    amount: Number(r.amount),
    dueDate: r.due_date,
    paidAt: r.paid_at ?? undefined,
    status: r.status,
  };
}

function rowToCommission(r: any): Commission {
  return {
    id: r.id,
    propertyId: r.property_id,
    propertyName: r.property_name,
    unitId: r.unit_id,
    unitNumber: r.unit_number,
    brokerId: r.broker_id,
    brokerName: r.broker_name ?? "",
    salePrice: Number(r.sale_price),
    commissionPercent: Number(r.commission_percent),
    commissionValue: Number(r.commission_value),
    status: r.status,
    paidAt: r.paid_at ?? undefined,
  };
}

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
    const [pRes, cRes, cfgRes] = await Promise.all([
      supabase.from("payments").select("*").order("due_date", { ascending: true }),
      supabase.from("commissions").select("*").order("created_at", { ascending: false }),
      supabase.from("commission_configs").select("*"),
    ]);
    setPayments((pRes.data ?? []).map(rowToPayment));
    setCommissions((cRes.data ?? []).map(rowToCommission));
    setCommissionConfigs((cfgRes.data ?? []).map((r: any) => ({
      propertyId: r.property_id,
      commissionPercent: Number(r.commission_percent),
    })));
    setLoading(false);
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  const addPayment = async (p: Payment) => {
    const { data, error } = await supabase.from("payments").insert({
      contract_id: p.contractId,
      property_id: p.propertyId,
      property_name: p.propertyName,
      unit_id: p.unitId,
      unit_number: p.unitNumber,
      client_id: p.clientId,
      client_name: p.clientName,
      type: p.type,
      installment_number: p.installmentNumber ?? null,
      amount: p.amount,
      due_date: p.dueDate,
      status: p.status,
      paid_at: p.paidAt ?? null,
    }).select().single();
    if (error || !data) {
      toast({ title: "Erro ao salvar pagamento", description: error?.message, variant: "destructive" });
      return;
    }
    setPayments((prev) => [...prev, rowToPayment(data)]);
  };

  const markPaymentPaid = async (id: string) => {
    const paidAt = new Date().toISOString();
    const prev = payments;
    setPayments((cur) => cur.map((p) => (p.id === id ? { ...p, status: "paid", paidAt } : p)));
    const { error } = await supabase.from("payments")
      .update({ status: "paid", paid_at: paidAt }).eq("id", id);
    if (error) {
      setPayments(prev);
      toast({ title: "Erro ao marcar pago", description: error.message, variant: "destructive" });
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
    const { error } = await supabase.from("commissions")
      .update({ status: "paid", paid_at: paidAt }).eq("id", id);
    if (error) {
      setCommissions(prev);
      toast({ title: "Erro ao marcar comissão paga", description: error.message, variant: "destructive" });
    }
  };

  const setCommissionConfig = async (propertyId: string, percent: number) => {
    const prev = commissionConfigs;
    setCommissionConfigs((cur) => {
      const exists = cur.find((c) => c.propertyId === propertyId);
      if (exists) return cur.map((c) => (c.propertyId === propertyId ? { ...c, commissionPercent: percent } : c));
      return [...cur, { propertyId, commissionPercent: percent }];
    });
    const { error } = await supabase.from("commission_configs")
      .upsert({ property_id: propertyId, commission_percent: percent, updated_by: user?.id ?? null });
    if (error) {
      setCommissionConfigs(prev);
      toast({ title: "Erro ao salvar % de comissão", description: error.message, variant: "destructive" });
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
