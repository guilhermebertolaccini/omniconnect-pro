import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  roles: string[];
}

async function fetchRoles(userId: string): Promise<string[]> {
  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId);
  return (data ?? []).map((r) => r.role as string);
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true,
    roles: [],
  });

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const user = session?.user ?? null;
        setState({ user, session, loading: false, roles: [] });
        if (user) {
          setTimeout(async () => {
            const roles = await fetchRoles(user.id);
            setState((prev) => ({ ...prev, roles }));
          }, 0);
        }
      }
    );

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const user = session?.user ?? null;
      if (user) {
        const roles = await fetchRoles(user.id);
        setState({ user, session, loading: false, roles });
      } else {
        setState({ user: null, session: null, loading: false, roles: [] });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setState({ user: null, session: null, loading: false, roles: [] });
  };

  // Backward-compat: expose primary role
  const role = state.roles.includes('super_admin')
    ? 'super_admin'
    : state.roles.includes('admin')
      ? 'admin'
      : state.roles[0] ?? null;

  const isSuperAdmin = state.roles.includes('super_admin');
  const isAdmin = state.roles.includes('admin') || isSuperAdmin;

  return { ...state, role, isSuperAdmin, isAdmin, signOut };
}
