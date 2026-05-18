import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AuditLogFilters {
  agencyId?: string;
  companyId?: string;
  platform?: 'meta' | 'google_ads' | 'tiktok_ads';
  category?: string;
  severity?: 'info' | 'warning' | 'error' | 'critical';
  since?: string; // ISO date
  search?: string;
  limit?: number;
}

export interface AuditLogRow {
  id: string;
  agency_id: string;
  company_id: string | null;
  actor_user_id: string | null;
  actor_type: 'user' | 'system' | 'webhook' | 'cron';
  category: string;
  action: string;
  platform: 'meta' | 'google_ads' | 'tiktok_ads' | null;
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  metadata: Record<string, any>;
  created_at: string;
}

export function useAuditLogs(filters: AuditLogFilters = {}) {
  return useQuery({
    queryKey: ['audit-logs', filters],
    queryFn: async () => {
      let q = supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(filters.limit ?? 200);

      if (filters.agencyId) q = q.eq('agency_id', filters.agencyId);
      if (filters.companyId) q = q.eq('company_id', filters.companyId);
      if (filters.platform) q = q.eq('platform', filters.platform);
      if (filters.category) q = q.eq('category', filters.category);
      if (filters.severity) q = q.eq('severity', filters.severity);
      if (filters.since) q = q.gte('created_at', filters.since);
      if (filters.search) q = q.ilike('message', `%${filters.search}%`);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as AuditLogRow[];
    },
    refetchInterval: 30_000,
  });
}

export function useUnresolvedAlertsCount() {
  return useQuery({
    queryKey: ['audit-alerts-count'],
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { count, error } = await supabase
        .from('audit_logs')
        .select('id', { count: 'exact', head: true })
        .in('severity', ['error', 'critical'])
        .gte('created_at', since);
      if (error) throw error;
      return count ?? 0;
    },
    refetchInterval: 60_000,
  });
}

// ============================================================================
// Singleton realtime channel for audit_logs
// Garante UMA assinatura por aba/usuário, compartilhada entre todos os hooks.
// ============================================================================
type AuditSubscriber = (row: AuditLogRow) => void;

let auditChannel: ReturnType<typeof supabase.channel> | null = null;
const auditSubscribers = new Set<AuditSubscriber>();
let auditRefCount = 0;

function ensureAuditChannel(qc: ReturnType<typeof useQueryClient>) {
  if (auditChannel) return;
  auditChannel = supabase
    .channel('audit-logs-stream')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'audit_logs' },
      (payload) => {
        const row = payload.new as AuditLogRow;
        qc.invalidateQueries({ queryKey: ['audit-logs'] });
        qc.invalidateQueries({ queryKey: ['audit-alerts-count'] });
        auditSubscribers.forEach((cb) => {
          try { cb(row); } catch (e) { console.error('[useRealtimeAuditLogs] subscriber error', e); }
        });
      },
    )
    .subscribe();
}

function releaseAuditChannel() {
  if (auditRefCount > 0) auditRefCount -= 1;
  if (auditRefCount === 0 && auditChannel) {
    supabase.removeChannel(auditChannel);
    auditChannel = null;
  }
}

export function useRealtimeAuditLogs(onInsert: (row: AuditLogRow) => void) {
  const qc = useQueryClient();
  const cbRef = useRef(onInsert);
  useEffect(() => { cbRef.current = onInsert; }, [onInsert]);

  useEffect(() => {
    const subscriber: AuditSubscriber = (row) => cbRef.current(row);
    ensureAuditChannel(qc);
    auditSubscribers.add(subscriber);
    auditRefCount += 1;
    return () => {
      auditSubscribers.delete(subscriber);
      releaseAuditChannel();
    };
  }, [qc]);
}
