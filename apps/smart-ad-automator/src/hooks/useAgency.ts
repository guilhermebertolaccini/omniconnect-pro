import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface AgencyMembership {
  agency_id: string;
  role: 'owner' | 'admin' | 'operator';
  agency: {
    id: string;
    name: string;
    slug: string;
    plan: string;
    status: string;
  };
}

export function useAgencies() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['agency-memberships', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<AgencyMembership[]> => {
      const { data, error } = await supabase
        .from('agency_members')
        .select('agency_id, role, agency:agencies(id, name, slug, plan, status)')
        .eq('user_id', user!.id);
      if (error) throw error;
      return (data ?? []) as unknown as AgencyMembership[];
    },
  });
}

export function useCurrentAgency() {
  const { data: memberships, isLoading } = useAgencies();
  // For MVP: auto-select the first (and usually only) agency
  const current = memberships?.[0] ?? null;
  return {
    agency: current?.agency ?? null,
    agencyId: current?.agency_id ?? null,
    role: current?.role ?? null,
    isOwner: current?.role === 'owner',
    isAdmin: current?.role === 'owner' || current?.role === 'admin',
    isLoading,
  };
}
