import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Client } from "@/types/property";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface ClientContextType {
  clients: Client[];
  loading: boolean;
  addClient: (client: Client) => Promise<void>;
  updateClient: (id: string, data: Partial<Client>) => Promise<void>;
  deleteClient: (id: string) => Promise<void>;
  getClient: (id: string) => Client | undefined;
  refresh: () => Promise<void>;
}

const ClientContext = createContext<ClientContextType | null>(null);

function rowToClient(row: any): Client {
  return {
    id: row.id,
    name: row.name,
    cpfCnpj: row.cpf_cnpj ?? "",
    phone: row.phone ?? "",
    email: row.email ?? "",
    income: Number(row.income ?? 0),
    score: (row.score ?? "B") as Client["score"],
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
  };
}

export function ClientProvider({ children }: { children: React.ReactNode }) {
  const { session, user } = useAuth();
  const { toast } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Erro ao carregar clientes", description: error.message, variant: "destructive" });
    } else {
      setClients((data ?? []).map(rowToClient));
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    if (session) refresh();
    else {
      setClients([]);
      setLoading(false);
    }
  }, [session, refresh]);

  const addClient = async (client: Client) => {
    const { data, error } = await supabase
      .from("clients")
      .insert({
        name: client.name,
        cpf_cnpj: client.cpfCnpj,
        phone: client.phone,
        email: client.email,
        income: client.income,
        score: client.score,
        notes: client.notes,
        broker_id: user?.id,
      })
      .select()
      .single();
    if (error) {
      toast({ title: "Erro ao salvar cliente", description: error.message, variant: "destructive" });
      throw error;
    }
    setClients((prev) => [rowToClient(data), ...prev]);
  };

  const updateClient = async (id: string, data: Partial<Client>) => {
    setClients((prev) => prev.map((c) => (c.id === id ? { ...c, ...data } : c)));
    const patch: any = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.cpfCnpj !== undefined) patch.cpf_cnpj = data.cpfCnpj;
    if (data.phone !== undefined) patch.phone = data.phone;
    if (data.email !== undefined) patch.email = data.email;
    if (data.income !== undefined) patch.income = data.income;
    if (data.score !== undefined) patch.score = data.score;
    if (data.notes !== undefined) patch.notes = data.notes;
    if (Object.keys(patch).length === 0) return;
    const { error } = await supabase.from("clients").update(patch).eq("id", id);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      await refresh();
    }
  };

  const deleteClient = async (id: string) => {
    const prev = clients;
    setClients((p) => p.filter((c) => c.id !== id));
    const { error } = await supabase.from("clients").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
      setClients(prev);
    }
  };

  const getClient = (id: string) => clients.find((c) => c.id === id);

  return (
    <ClientContext.Provider value={{ clients, loading, addClient, updateClient, deleteClient, getClient, refresh }}>
      {children}
    </ClientContext.Provider>
  );
}

export function useClients() {
  const ctx = useContext(ClientContext);
  if (!ctx) throw new Error("useClients must be used within ClientProvider");
  return ctx;
}
