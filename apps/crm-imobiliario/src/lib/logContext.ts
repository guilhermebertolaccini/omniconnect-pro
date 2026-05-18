/**
 * Lightweight, mutable context attached to every shipped log entry.
 * Updated by AuthContext (user/role) and a route listener (current path).
 */

export interface LogContext {
  user_id?: string;
  user_email?: string;
  user_role?: string;
  tenant?: string;
  app_version?: string;
  route?: string;
  referrer?: string;
  viewport?: string;
  locale?: string;
}

let context: LogContext = {
  app_version: import.meta.env.VITE_APP_VERSION as string | undefined,
  tenant: (import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined) ?? "default",
};

export function setLogContext(patch: Partial<LogContext>) {
  context = { ...context, ...patch };
}

export function clearUserContext() {
  const { user_id: _u, user_email: _e, user_role: _r, ...rest } = context;
  context = rest;
}

export function getLogContext(): LogContext {
  if (typeof window !== "undefined") {
    context.route = window.location.pathname + window.location.search;
    context.referrer = document.referrer || undefined;
    context.viewport = `${window.innerWidth}x${window.innerHeight}`;
    context.locale = navigator.language;
  }
  return { ...context };
}