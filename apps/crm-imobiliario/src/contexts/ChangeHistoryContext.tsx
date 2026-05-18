import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { ChangeRecord } from "@/types/property";
import { useAuth } from "@/contexts/AuthContext";

interface ChangeHistoryContextType {
  history: ChangeRecord[];
  loading: boolean;
  /**
   * Kept for API compatibility. Audit rows are now created by database triggers
   * (see migration: triggers on units, properties, leads). This client-side call
   * just refreshes the local cache so callers see the freshly-inserted row.
   */
  addChange: (record: Omit<ChangeRecord, "id" | "timestamp">) => Promise<void>;
  getEntityHistory: (entityId: string) => ChangeRecord[];
  refresh: () => Promise<void>;
}

const ChangeHistoryContext = createContext<ChangeHistoryContextType | null>(null);

export function ChangeHistoryProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [history, setHistory] = useState<ChangeRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setHistory([]); setLoading(false); return;
    }
    setLoading(true);
    // Backend Sprint 3 registra auditoria em SystemEvent/CrmChangeHistory,
    // mas ainda não há endpoint frontend-safe de listagem. Mantemos a API do
    // context e evitamos fallback Supabase durante o cutover.
    setHistory([]);
    setLoading(false);
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  const addChange = async (_record: Omit<ChangeRecord, "id" | "timestamp">) => {
    // No-op: triggers handle insertion. Refresh in case the caller wants the latest snapshot.
    await refresh();
  };

  const getEntityHistory = (entityId: string) => history.filter((h) => h.entityId === entityId);

  return (
    <ChangeHistoryContext.Provider value={{ history, loading, addChange, getEntityHistory, refresh }}>
      {children}
    </ChangeHistoryContext.Provider>
  );
}

export function useChangeHistory() {
  const ctx = useContext(ChangeHistoryContext);
  if (!ctx) throw new Error("useChangeHistory must be used within ChangeHistoryProvider");
  return ctx;
}
