import { useAuth } from './useAuth';

/**
 * Sprint 2.4 cutover: o tenant ativo agora vive no JWT (state.user.tenantId).
 * O modelo legado de "memberships com vários agencies" foi mapeado para
 * UserTenant no backend, mas o frontend SAA hoje só usa o tenant ativo do
 * próprio JWT. Manter o shape de saída facilita o consumo dos componentes que
 * já leem `useCurrentAgency()`.
 */
export interface AgencyMembership {
  agency_id: string;
  role: string;
  agency: {
    id: string;
    name: string;
    slug: string;
    plan: string;
    status: string;
  };
}

export function useAgencies() {
  const { user, loading } = useAuth();
  const memberships: AgencyMembership[] = user
    ? [
        {
          agency_id: user.tenantId,
          role: user.role,
          agency: {
            id: user.tenantId,
            name: user.tenantId,
            slug: user.tenantId,
            plan: 'default',
            status: 'active',
          },
        },
      ]
    : [];

  return {
    data: memberships,
    isLoading: loading,
    error: null as unknown,
  };
}

export function useCurrentAgency() {
  const { user, loading } = useAuth();
  if (!user) {
    return {
      agency: null,
      agencyId: null,
      role: null,
      isOwner: false,
      isAdmin: false,
      isLoading: loading,
    };
  }
  return {
    agency: {
      id: user.tenantId,
      name: user.tenantId,
      slug: user.tenantId,
      plan: 'default',
      status: 'active',
    },
    agencyId: user.tenantId,
    role: user.role,
    isOwner: user.role === 'admin',
    isAdmin: user.role === 'admin' || user.role === 'supervisor',
    isLoading: loading,
  };
}
