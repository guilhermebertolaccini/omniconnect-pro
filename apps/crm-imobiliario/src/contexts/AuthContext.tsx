import React, { createContext, useContext, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { User, UserRole } from "@/types/property";
import { identifyUser } from "@/lib/sentry";
import { setLogContext, clearUserContext } from "@/lib/logContext";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  logout: () => Promise<void>;
  canEditPrice: boolean;
  canChangeStatus: boolean;
  canCreateProperty: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

async function loadUserProfile(userId: string, fallbackName: string, fallbackAvatar?: string): Promise<User> {
  // Profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, avatar_url")
    .eq("id", userId)
    .maybeSingle();

  // Highest-priority role: admin > manager > broker
  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  const roles = (roleRows ?? []).map((r) => r.role as UserRole);
  const role: UserRole = roles.includes("admin")
    ? "admin"
    : roles.includes("manager")
    ? "manager"
    : "broker";

  return {
    id: userId,
    name: profile?.full_name || fallbackName,
    role,
    avatar: profile?.avatar_url || fallbackAvatar,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      identifyUser({
        id: user.id,
        name: user.name,
        email: session?.user?.email,
        role: user.role,
      });
      setLogContext({
        user_id: user.id,
        user_email: session?.user?.email,
        user_role: user.role,
      });
    } else {
      identifyUser(null);
      clearUserContext();
    }
  }, [user, session]);

  useEffect(() => {
    // 1. Set up listener FIRST
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (!newSession?.user) {
        setUser(null);
        setLoading(false);
        return;
      }
      // Defer DB lookups to avoid deadlocks
      const meta = newSession.user.user_metadata || {};
      const fallbackName =
        (meta.full_name as string) ||
        (meta.name as string) ||
        newSession.user.email?.split("@")[0] ||
        "User";
      setTimeout(() => {
        loadUserProfile(newSession.user.id, fallbackName, meta.avatar_url as string | undefined)
          .then(setUser)
          .finally(() => setLoading(false));
      }, 0);
    });

    // 2. Then check existing session
    supabase.auth.getSession().then(({ data: { session: existing } }) => {
      setSession(existing);
      if (!existing?.user) {
        setLoading(false);
        return;
      }
      const meta = existing.user.user_metadata || {};
      const fallbackName =
        (meta.full_name as string) ||
        (meta.name as string) ||
        existing.user.email?.split("@")[0] ||
        "User";
      loadUserProfile(existing.user.id, fallbackName, meta.avatar_url as string | undefined)
        .then(setUser)
        .finally(() => setLoading(false));
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  };

  const canEditPrice = user?.role === "admin" || user?.role === "manager";
  const canChangeStatus = !!user;
  const canCreateProperty = user?.role === "admin" || user?.role === "manager";

  return (
    <AuthContext.Provider
      value={{ user, session, loading, logout, canEditPrice, canChangeStatus, canCreateProperty }}
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
