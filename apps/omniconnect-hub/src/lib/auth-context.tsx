/**
 * Hub auth context — ADR-0003 (PR 3 — Sprint Hub).
 *
 * Caminho de produção (default): backend Omni via `omniconnectClient`.
 *  - Access token em memória; refresh em cookie HttpOnly rotativo.
 *  - Tenant ativo é o `tenantId` do JWT atual; tenant-selector vem de
 *    `GET /tenants/me`.
 *  - Papel canónico (backend `Role`) é mapeado para display (Hub) via
 *    `roleMapping`.
 *
 * Caminho preview / mock (Lovable):
 *  - Ativado APENAS quando `VITE_USE_MOCK_AUTH === "true"`.
 *  - Usa Supabase Auth + tabelas locais `tenants` / `tenant_members`.
 *  - **Nunca** em staging/produção.
 *
 * Contratos públicos (shape `AuthContextValue`) inalterados — componentes
 * existentes (`app-sidebar`, `app-header`, `module-gate`, dashboards) não
 * mudam.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  signIn as backendSignIn,
  signUp as backendSignUp,
  signOut as backendSignOut,
  subscribe as subscribeAuth,
  restoreSession,
  getMyMemberships,
  switchTenantSession as backendSwitchTenant,
  type Membership as BackendMembership,
  type SessionUser as BackendUser,
} from "./omniconnectClient";
import { backendToDisplayRole, type BackendRole } from "./roleMapping";
import type { Role } from "./permissions";

const USE_MOCK_AUTH = import.meta.env.VITE_USE_MOCK_AUTH === "true";

export type Tenant = {
  id: string;
  name: string;
  initials: string;
};

export type AppUser = {
  id: string;
  name: string;
  email: string;
  avatarColor: string;
};

type Language = "pt-BR" | "en" | "es";

type AuthContextValue = {
  user: AppUser;
  role: Role;
  tenant: Tenant;
  tenants: Tenant[];
  language: Language;
  isAuthenticated: boolean;
  loading: boolean;
  switchingTenant: boolean;
  tenantSessionReady: boolean;
  login: (email: string, password: string) => Promise<{ error?: string }>;
  signup: (email: string, password: string, fullName: string) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
  switchTenant: (id: string) => Promise<{ error?: string }>;
  switchRole: (role: Role) => void;
  setLanguage: (lang: Language) => void;
};

const LANGUAGE_KEY = "omniconnect.lang.v1";
const ACTIVE_TENANT_KEY = "omniconnect.active-tenant.v1";

const EMPTY_USER: AppUser = { id: "", name: "", email: "", avatarColor: "" };
const EMPTY_TENANT: Tenant = { id: "", name: "—", initials: "—" };

const AuthContext = createContext<AuthContextValue | null>(null);

function deriveAvatarColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const hue = (h % 360).toString();
  return `oklch(0.55 0.18 ${hue})`;
}

function deriveInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

// ───────────────────────────────────────────────────────────────────────────
// Provider — dispatch para o caminho real (default) ou mock (Lovable preview)
// ───────────────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  return USE_MOCK_AUTH ? (
    <MockSupabaseAuthProvider>{children}</MockSupabaseAuthProvider>
  ) : (
    <BackendAuthProvider>{children}</BackendAuthProvider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

// ───────────────────────────────────────────────────────────────────────────
// Caminho de produção: backend Omni (omniconnectClient)
// ───────────────────────────────────────────────────────────────────────────

function BackendAuthProvider({ children }: { children: ReactNode }) {
  const [backendUser, setBackendUser] = useState<BackendUser | null>(null);
  const [memberships, setMemberships] = useState<BackendMembership[]>([]);
  const [activeTenantId, setActiveTenantIdState] = useState<string>("");
  const [language, setLanguageState] = useState<Language>("pt-BR");
  const [loading, setLoading] = useState(true);
  const [membershipsResolvedForUserId, setMembershipsResolvedForUserId] = useState<number | null>(
    null,
  );
  const [switchingTenant, setSwitchingTenant] = useState(false);
  const [demoRoleOverride, setDemoRoleOverride] = useState<Role | null>(null);

  // Hidratação de preferências locais (browser only — TanStack Start é SSR).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const lang = window.localStorage.getItem(LANGUAGE_KEY) as Language | null;
      if (lang) setLanguageState(lang);
    } catch {
      /* noop */
    }
  }, []);

  // Subscrição ao state do client (signIn/signOut/refresh ⇒ broadcast).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const unsub = subscribeAuth((s) => {
      setBackendUser(s.user);
    });
    // Boot: tenta restaurar sessão a partir do cookie HttpOnly.
    restoreSession()
      .catch(() => null)
      .finally(() => setLoading(false));
    return unsub;
  }, []);

  // Carrega memberships quando o user muda.
  useEffect(() => {
    let cancelled = false;
    if (!backendUser) {
      setMemberships([]);
      setMembershipsResolvedForUserId(null);
      return;
    }
    getMyMemberships()
      .then((list) => {
        if (cancelled) return;
        setMemberships(list);
        const preferred = list.find((m) => m.tenantId === backendUser.tenantId);
        if (preferred) {
          // O JWT atual e a autoridade; preferencia local nao troca escopo.
          setActiveTenantIdState(preferred.tenantId);
          try {
            window.localStorage.setItem(ACTIVE_TENANT_KEY, preferred.tenantId);
          } catch {
            /* noop */
          }
        } else {
          setActiveTenantIdState("");
        }
      })
      .catch(() => {
        if (!cancelled) setMemberships([]);
      })
      .finally(() => {
        if (!cancelled) setMembershipsResolvedForUserId(backendUser.id);
      });
    return () => {
      cancelled = true;
    };
  }, [backendUser]);

  const tenants = useMemo<Tenant[]>(
    () =>
      memberships
        .filter((m) => m.isActive)
        .map((m) => ({
          id: m.tenantId,
          name: m.tenantName,
          initials: deriveInitials(m.tenantName),
        })),
    [memberships],
  );

  const activeMembership = useMemo<BackendMembership | null>(
    () => memberships.find((m) => m.tenantId === activeTenantId) ?? null,
    [memberships, activeTenantId],
  );

  const tenant: Tenant = useMemo(() => {
    if (!activeMembership) return EMPTY_TENANT;
    return {
      id: activeMembership.tenantId,
      name: activeMembership.tenantName,
      initials: deriveInitials(activeMembership.tenantName),
    };
  }, [activeMembership]);

  // Papel real (mapeado): UserTenant.role do tenant ativo → display Hub.
  // Demo override é UX-only e não passa pelo backend.
  const role: Role = useMemo(() => {
    if (demoRoleOverride) return demoRoleOverride;
    // Missing tenant context must never result in elevated UI permissions.
    const backendRole = (activeMembership?.role ?? "operator") as BackendRole;
    return backendToDisplayRole(backendRole);
  }, [activeMembership, demoRoleOverride]);

  const user: AppUser = useMemo(() => {
    if (!backendUser) return EMPTY_USER;
    return {
      id: String(backendUser.id),
      name: backendUser.name || backendUser.email?.split("@")[0] || "Usuário",
      email: backendUser.email,
      avatarColor: deriveAvatarColor(String(backendUser.id)),
    };
  }, [backendUser]);

  const tenantSessionReady =
    !!backendUser &&
    !!activeMembership?.isActive &&
    activeMembership.tenantId === backendUser.tenantId &&
    !switchingTenant;

  const login = useCallback(async (email: string, password: string) => {
    try {
      await backendSignIn(email, password);
      return {};
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao entrar";
      return { error: msg };
    }
  }, []);

  const signup = useCallback(async (email: string, password: string, fullName: string) => {
    try {
      // Backend `/auth/register` exige `tenantName`; derivamos do nome.
      const tenantName = `${fullName} workspace`;
      await backendSignUp({ name: fullName, email, password, tenantName });
      return {};
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao criar conta";
      return { error: msg };
    }
  }, []);

  const logout = useCallback(async () => {
    await backendSignOut();
    setActiveTenantIdState("");
    try {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(ACTIVE_TENANT_KEY);
      }
    } catch {
      /* noop */
    }
  }, []);

  const switchTenant = useCallback(
    async (id: string) => {
      const target = memberships.find(
        (membership) => membership.tenantId === id && membership.isActive,
      );
      if (!target) return { error: "Empresa indisponível para esta conta." };
      if (backendUser?.tenantId === id) return {};

      setSwitchingTenant(true);
      try {
        const switchedUser = await backendSwitchTenant(id);
        if (switchedUser.tenantId !== id) {
          return { error: "Não foi possível confirmar a empresa ativa." };
        }
        setActiveTenantIdState(id);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(ACTIVE_TENANT_KEY, id);
        }
        return {};
      } catch (err) {
        const message = err instanceof Error ? err.message : "Falha ao trocar empresa";
        return { error: message };
      } finally {
        setSwitchingTenant(false);
      }
    },
    [backendUser?.tenantId, memberships],
  );

  const switchRole = useCallback((r: Role) => setDemoRoleOverride(r), []);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LANGUAGE_KEY, lang);
      }
    } catch {
      /* noop */
    }
  }, []);

  const value: AuthContextValue = {
    user,
    role,
    tenant,
    tenants,
    language,
    isAuthenticated: !!backendUser,
    loading: loading || (!!backendUser && membershipsResolvedForUserId !== backendUser.id),
    switchingTenant,
    tenantSessionReady,
    login,
    signup,
    logout,
    switchTenant,
    switchRole,
    setLanguage,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ───────────────────────────────────────────────────────────────────────────
// Caminho mock (Lovable preview) — só ativo com VITE_USE_MOCK_AUTH=true.
// O cliente Supabase é importado dinamicamente para que o bundle de
// produção (flag false) não puxe `@supabase/supabase-js`.
// ───────────────────────────────────────────────────────────────────────────

type MockMembership = { tenant: Tenant; role: Role };
type MockSession = {
  user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> };
};

function MockSupabaseAuthProvider({ children }: { children: ReactNode }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [supabaseMod, setSupabaseMod] = useState<any>(null);
  const [session, setSession] = useState<MockSession | null>(null);
  const [memberships, setMemberships] = useState<MockMembership[]>([]);
  const [activeTenantId, setActiveTenantIdState] = useState<string>("");
  const [profileName, setProfileName] = useState<string>("");
  const [language, setLanguageState] = useState<Language>("pt-BR");
  const [loading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [demoRoleOverride, setDemoRoleOverride] = useState<Role | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const lang = window.localStorage.getItem(LANGUAGE_KEY) as Language | null;
      if (lang) setLanguageState(lang);
      const t = window.localStorage.getItem(ACTIVE_TENANT_KEY);
      if (t) setActiveTenantIdState(t);
    } catch {
      /* noop */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    (async () => {
      const mod = await import("@/integrations/supabase/client");
      if (cancelled) return;
      setSupabaseMod(mod);
      const {
        data: { subscription },
      } = mod.supabase.auth.onAuthStateChange((_event: unknown, newSession: MockSession | null) => {
        setSession(newSession);
      });
      const { data } = await mod.supabase.auth.getSession();
      if (cancelled) return;
      setSession(data.session as MockSession | null);
      setLoading(false);
      return () => subscription.unsubscribe();
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated]);

  useEffect(() => {
    if (!supabaseMod) return;
    let cancelled = false;
    if (!session?.user) {
      setMemberships([]);
      setProfileName("");
      return;
    }
    (async () => {
      const [{ data: members }, { data: profile }] = await Promise.all([
        supabaseMod.supabase
          .from("tenant_members")
          .select("role, tenant:tenants(id,name,initials)")
          .eq("user_id", session.user.id),
        supabaseMod.supabase
          .from("profiles")
          .select("full_name, default_tenant_id")
          .eq("id", session.user.id)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      const list: MockMembership[] = (members ?? [])
        .filter((m: { tenant: unknown }) => m.tenant)
        .map((m: { role: Role; tenant: Tenant | Tenant[] }) => ({
          role: m.role,
          tenant: Array.isArray(m.tenant) ? m.tenant[0] : m.tenant,
        }));
      setMemberships(list);
      setProfileName(profile?.full_name ?? "");
      if (!activeTenantId && list.length > 0) {
        const fallback = profile?.default_tenant_id ?? list[0].tenant.id;
        const found = list.find((m) => m.tenant.id === fallback) ?? list[0];
        setActiveTenantIdState(found.tenant.id);
        try {
          window.localStorage.setItem(ACTIVE_TENANT_KEY, found.tenant.id);
        } catch {
          /* noop */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, activeTenantId, supabaseMod]);

  const tenants = useMemo(() => memberships.map((m) => m.tenant), [memberships]);
  const activeMembership = useMemo(
    () => memberships.find((m) => m.tenant.id === activeTenantId) ?? memberships[0],
    [memberships, activeTenantId],
  );
  const tenant = activeMembership?.tenant ?? EMPTY_TENANT;
  const role: Role = demoRoleOverride ?? activeMembership?.role ?? "admin";

  const user: AppUser = useMemo(() => {
    if (!session?.user) return EMPTY_USER;
    const meta = session.user.user_metadata ?? {};
    const name =
      profileName ||
      (meta.full_name as string | undefined) ||
      (meta.name as string | undefined) ||
      session.user.email?.split("@")[0] ||
      "Usuário";
    return {
      id: session.user.id,
      name,
      email: session.user.email ?? "",
      avatarColor: deriveAvatarColor(session.user.id),
    };
  }, [session, profileName]);

  const login = useCallback(
    async (email: string, password: string) => {
      if (!supabaseMod) return { error: "Supabase mock não carregado" };
      const { error } = await supabaseMod.supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) return { error: error.message };
      return {};
    },
    [supabaseMod],
  );

  const signup = useCallback(
    async (email: string, password: string, fullName: string) => {
      if (!supabaseMod) return { error: "Supabase mock não carregado" };
      const { error } = await supabaseMod.supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: typeof window !== "undefined" ? `${window.location.origin}/` : undefined,
          data: { full_name: fullName },
        },
      });
      if (error) return { error: error.message };
      return {};
    },
    [supabaseMod],
  );

  const logout = useCallback(async () => {
    if (supabaseMod) await supabaseMod.supabase.auth.signOut();
    setActiveTenantIdState("");
    try {
      window.localStorage.removeItem(ACTIVE_TENANT_KEY);
    } catch {
      /* noop */
    }
  }, [supabaseMod]);

  const switchTenant = useCallback(
    async (id: string) => {
      if (!memberships.some((m) => m.tenant.id === id)) {
        return { error: "Empresa indisponível para esta conta." };
      }
      setActiveTenantIdState(id);
      try {
        window.localStorage.setItem(ACTIVE_TENANT_KEY, id);
      } catch {
        /* noop */
      }
      return {};
    },
    [memberships],
  );

  const switchRole = useCallback((r: Role) => setDemoRoleOverride(r), []);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    try {
      window.localStorage.setItem(LANGUAGE_KEY, lang);
    } catch {
      /* noop */
    }
  }, []);

  const value: AuthContextValue = {
    user,
    role,
    tenant,
    tenants,
    language,
    isAuthenticated: !!session?.user,
    loading,
    switchingTenant: false,
    tenantSessionReady: true,
    login,
    signup,
    logout,
    switchTenant,
    switchRole,
    setLanguage,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
