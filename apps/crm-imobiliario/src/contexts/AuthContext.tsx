import React, { createContext, useContext, useEffect, useState } from "react";
import {
  getAuthState,
  restoreSession,
  signOut as clientSignOut,
  subscribe,
  type AuthState,
  type SessionUser,
} from "@/lib/omniconnectClient";
import { User, UserRole } from "@/types/property";
import { identifyUser } from "@/lib/sentry";
import { setLogContext, clearUserContext } from "@/lib/logContext";

/**
 * AuthContext (Sprint 3.1) — agora consome `omniconnectClient`. A sessão
 * real vive em memória dentro do client; este context apenas a expõe ao React
 * + casa a forma do
 * `User` legado que o CRM já consumia.
 *
 * Compat:
 *  - `session` permanece exposto como `{ user: { id, email } } | null`
 *    porque muitos contexts antigos checavam `if (session) { ... }`
 *    para decidir se devem buscar dados. Aqui ele é deriva do estado
 *    do client (null quando anônimo).
 *  - `user.role` mapeia a Role canônica do backend (admin / supervisor /
 *    broker) para a Role legada do CRM (admin / manager / broker).
 *  - Avatar não está no JWT — fica null por enquanto. Quando o backend
 *    expuser /auth/me com avatar/profile, retornamos a popular esse
 *    campo. Não é bloqueante.
 */

interface CrmAuthSession {
  user: { id: string; email: string };
}

interface AuthContextType {
  user: User | null;
  session: CrmAuthSession | null;
  loading: boolean;
  logout: () => Promise<void>;
  canEditPrice: boolean;
  canChangeStatus: boolean;
  canCreateProperty: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

function mapBackendRoleToCrmRole(role: string): UserRole {
  switch (role) {
    case "admin":
      return "admin";
    case "supervisor":
      return "manager";
    case "broker":
      return "broker";
    case "operator":
    case "digital":
    case "ativador":
    default:
      // Roles que não fazem sentido no CRM caem em `broker` (menor
      // privilégio dentro do escopo CRM) para que a UI continue
      // funcionando — guards de criação/preço bloqueiam o suficiente.
      return "broker";
  }
}

function mapSessionUser(u: SessionUser | null): User | null {
  if (!u) return null;
  return {
    id: String(u.id),
    name: u.name,
    role: mapBackendRoleToCrmRole(u.role),
    avatar: undefined,
  };
}

function mapSession(u: SessionUser | null): CrmAuthSession | null {
  if (!u) return null;
  return { user: { id: String(u.id), email: u.email } };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>(() => getAuthState());
  const [loading, setLoading] = useState(true);

  // Boot: tenta recuperar a sessão via cookie HttpOnly.
  useEffect(() => {
    let active = true;
    restoreSession()
      .catch(() => null)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Mantém o estado React em sincronia com o cliente (signIn/signOut em
  // outras abas, refresh do token, etc).
  useEffect(() => subscribe(setAuthState), []);

  // Side effects de telemetria — preservamos o pattern legado.
  useEffect(() => {
    if (authState.user) {
      identifyUser({
        id: String(authState.user.id),
        name: authState.user.name,
        email: authState.user.email,
        role: authState.user.role,
      });
      setLogContext({
        user_id: String(authState.user.id),
        user_email: authState.user.email,
        user_role: authState.user.role,
      });
    } else {
      identifyUser(null);
      clearUserContext();
    }
  }, [authState.user]);

  const user = mapSessionUser(authState.user);
  const session = mapSession(authState.user);

  const logout = async () => {
    await clientSignOut();
  };

  const canEditPrice = user?.role === "admin" || user?.role === "manager";
  const canChangeStatus = !!user;
  const canCreateProperty =
    user?.role === "admin" || user?.role === "manager";

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        logout,
        canEditPrice,
        canChangeStatus,
        canCreateProperty,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
