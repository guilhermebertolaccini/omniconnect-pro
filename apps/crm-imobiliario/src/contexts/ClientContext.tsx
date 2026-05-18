import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Client } from "@/types/property";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  createClient,
  deleteClient as apiDeleteClient,
  listClients,
  updateClient as apiUpdateClient,
} from "@/lib/api/crm";

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

export function ClientProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const { toast } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setClients(await listClients());
    } catch (err) {
      toast({
        title: "Erro ao carregar clientes",
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
      setClients([]);
      setLoading(false);
    }
  }, [session, refresh]);

  const addClient = async (client: Client) => {
    try {
      const created = await createClient(client);
      setClients((prev) => [created, ...prev]);
    } catch (err) {
      toast({
        title: "Erro ao salvar cliente",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
      throw err;
    }
  };

  const updateClient = async (id: string, data: Partial<Client>) => {
    setClients((prev) => prev.map((c) => (c.id === id ? { ...c, ...data } : c)));
    try {
      await apiUpdateClient(id, data);
    } catch (err) {
      toast({
        title: "Erro ao salvar",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
      await refresh();
    }
  };

  const deleteClient = async (id: string) => {
    const prev = clients;
    setClients((p) => p.filter((c) => c.id !== id));
    try {
      await apiDeleteClient(id);
    } catch (err) {
      toast({
        title: "Erro ao excluir",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
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
