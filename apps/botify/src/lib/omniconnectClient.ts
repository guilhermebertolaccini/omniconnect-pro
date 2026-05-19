/**
 * HTTP client for omniconnect-backend (Botify E1 — JWT + refresh cookie).
 * Pattern aligned with apps/crm-imobiliario/src/lib/omniconnectClient.ts
 */

const DEFAULT_BASE_URL = '/api';

const BASE_URL = (
  import.meta.env.VITE_OMNICONNECT_API_URL ?? DEFAULT_BASE_URL
).replace(/\/$/, '');

export interface SessionUser {
  id: number;
  name: string;
  email: string;
  role: string;
  tenantId: string;
}

export interface AuthState {
  user: SessionUser | null;
  accessToken: string | null;
  status: 'anonymous' | 'authenticated';
}

let state: AuthState = { user: null, accessToken: null, status: 'anonymous' };
const listeners = new Set<(s: AuthState) => void>();

function setState(next: AuthState): void {
  state = next;
  for (const l of listeners) {
    try {
      l(state);
    } catch (err) {
      console.error('[omniconnectClient] auth listener failed:', err);
    }
  }
}

export function subscribe(listener: (s: AuthState) => void): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

export function getAuthState(): AuthState {
  return state;
}

export function getAccessToken(): string | null {
  return state.accessToken;
}

export class OmniconnectError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'OmniconnectError';
    this.status = status;
    this.body = body;
  }
}

async function rawRequest(
  path: string,
  init: RequestInit & { skipRefresh?: boolean; noJsonHeader?: boolean } = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (state.accessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${state.accessToken}`);
  }
  if (
    init.body &&
    !headers.has('Content-Type') &&
    !init.noJsonHeader &&
    typeof init.body === 'string'
  ) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(`${BASE_URL}${path}`, { ...init, headers, credentials: 'include' });
}

export async function request<T>(
  path: string,
  options: RequestInit & { skipRefresh?: boolean } = {},
): Promise<T> {
  const { skipRefresh, ...init } = options;
  let res = await rawRequest(path, { ...init, skipRefresh });

  if (res.status === 401 && !skipRefresh && path !== '/auth/refresh') {
    const refreshed = await tryRefresh();
    if (refreshed) {
      res = await rawRequest(path, { ...init, skipRefresh });
    }
  }

  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.clone().json();
    } catch {
      body = await res.text().catch(() => undefined);
    }
    const message =
      body && typeof body === 'object' && 'message' in body
        ? String((body as Record<string, unknown>).message)
        : `HTTP ${res.status}`;
    throw new OmniconnectError(message, res.status, body);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

interface SessionResponse {
  access_token: string;
  access_expires_in: number;
  user: SessionUser;
}

let refreshInFlight: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const data = await request<{ access_token: string }>('/auth/refresh', {
        method: 'POST',
        skipRefresh: true,
      });
      if (!data?.access_token) return false;
      setState({
        ...state,
        accessToken: data.access_token,
        status: state.user ? 'authenticated' : state.status,
      });
      if (!state.user) {
        try {
          const me = await request<SessionUser>('/auth/me', { skipRefresh: true });
          setState({ ...state, user: me, status: 'authenticated' });
        } catch {
          /* keep token only */
        }
      }
      return true;
    } catch {
      clearLocalSession();
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

function clearLocalSession(): void {
  setState({ user: null, accessToken: null, status: 'anonymous' });
}

export async function signIn(email: string, password: string): Promise<SessionUser> {
  const data = await request<SessionResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
    skipRefresh: true,
  });
  setState({ user: data.user, accessToken: data.access_token, status: 'authenticated' });
  return data.user;
}

export async function signOut(): Promise<void> {
  try {
    await request('/auth/logout', { method: 'POST', skipRefresh: true });
  } catch {
    /* best-effort */
  }
  clearLocalSession();
}

/** Bootstrap session on app load (refresh cookie → access token). */
export async function bootstrapSession(): Promise<SessionUser | null> {
  const ok = await tryRefresh();
  if (!ok || !state.user) return null;
  return state.user;
}

export type BotifyAuthSource = 'wordpress' | 'omniconnect';

export function getBotifyAuthSource(): BotifyAuthSource {
  const v = (import.meta.env.VITE_BOTIFY_AUTH_SOURCE || 'omniconnect').toLowerCase();
  return v === 'wordpress' ? 'wordpress' : 'omniconnect';
}
