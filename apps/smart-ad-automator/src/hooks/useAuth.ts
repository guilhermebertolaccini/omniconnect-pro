import { useEffect, useState } from 'react';
import {
  getAuthState,
  restoreSession,
  signOut as backendSignOut,
  subscribe,
  type AuthState,
  type SessionUser,
} from '@/lib/omniconnectClient';

interface UseAuthReturn extends AuthState {
  /** Indica que o boot ainda não tentou restaurar a sessão. */
  loading: boolean;
  /** Roles do user atual. Sprint 2.4: derivada apenas da role principal. */
  roles: string[];
  /** Role primary — mantém forma do hook anterior para compat de UI. */
  role: string | null;
  /** True se `role === 'admin'` ou `super_admin`. */
  isAdmin: boolean;
  /** True se o user pertence ao tenant especial 'platform' como admin. */
  isSuperAdmin: boolean;
  signOut: () => Promise<void>;
}

let bootPromise: Promise<SessionUser | null> | null = null;

/**
 * Hook de auth do SAA — Sprint 2.4.
 *
 * Substitui o supabase.auth.onAuthStateChange por subscribe() do
 * omniconnectClient. No primeiro mount, dispara restoreSession() UMA vez para
 * tentar reaproveitar o cookie HttpOnly de refresh; chamadas subsequentes
 * compartilham o mesmo Promise (sem rajada de /auth/refresh).
 */
export function useAuth(): UseAuthReturn {
  const [state, setState] = useState<AuthState>(getAuthState());
  const [loading, setLoading] = useState(state.status === 'anonymous');

  useEffect(() => {
    const unsub = subscribe(setState);

    if (!bootPromise) {
      bootPromise = restoreSession();
    }
    bootPromise.finally(() => setLoading(false));

    return unsub;
  }, []);

  const role = state.user?.role ?? null;
  const isSuperAdmin = !!state.user && state.user.tenantId === 'platform' && role === 'admin';
  const isAdmin = role === 'admin' || isSuperAdmin;
  const roles = role ? (isSuperAdmin ? ['super_admin', role] : [role]) : [];

  return {
    ...state,
    loading,
    roles,
    role,
    isAdmin,
    isSuperAdmin,
    signOut: backendSignOut,
  };
}

/** Reset interno de boot — exclusivo de testes. */
export function __resetAuthBoot(): void {
  bootPromise = null;
}
