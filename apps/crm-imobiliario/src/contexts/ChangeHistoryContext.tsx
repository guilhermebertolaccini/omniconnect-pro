import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { ChangeRecord } from "@/types/property";
import { supabase } from "@/integrations/supabase/client";
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

function rowToRecord(r: any): ChangeRecord {
  return {
    id: r.id,
    entityType: r.entity_type,
    entityId: r.entity_id,
    field: r.field,
    oldValue: r.old_value ?? "",
    newValue: r.new_value ?? "",
    userId: r.user_id ?? "",
    userName: r.user_name ?? "",
    timestamp: r.created_at,
  };
}

export function ChangeHistoryProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [history, setHistory] = useState<ChangeRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setHistory([]); setLoading(false); return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("change_history")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);
    setHistory((data ?? []).map(rowToRecord));
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
