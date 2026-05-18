/**
 * `omniconnectClient` — HTTP client para o backend `omniconnect-backend`.
 *
 * Mantém o access token em memória (volátil; perdido no refresh da página) e
 * delega a persistência da sessão ao HttpOnly cookie de refresh, que o backend
 * gerencia via /auth/refresh com rotação. O frontend NUNCA enxerga o segredo
 * de refresh; ele só observa o lifecycle através de:
 *
 *   - `signIn` / `signUp` — entram em sessão e disparam onAuthChange.
 *   - `restoreSession` — chamado no boot para tentar reaproveitar o cookie.
 *   - `refresh` — usado pelo retry de 401 dentro de `request()`.
 *   - `signOut` / `signOutAll` — limpam memória + cookie + listeners.
 *
 * Não tem dependência do React — pode ser usado fora de componentes (ex.: em
 * scripts). O hook `useAuth` (Bloco D) consome via `subscribe()`.
 */

const DEFAULT_BASE_URL = "/api";

const BASE_URL = (
  import.meta.env.VITE_OMNICONNECT_API_URL ??
  import.meta.env.VITE_API_URL ??
  DEFAULT_BASE_URL
).replace(/\/$/, "");

// ─── Estado ────────────────────────────────────────────────────────────────

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
  status: "anonymous" | "authenticated";
}

let state: AuthState = { user: null, accessToken: null, status: "anonymous" };
const listeners = new Set<(s: AuthState) => void>();

function setState(next: AuthState): void {
  state = next;
  for (const l of listeners) {
    try {
      l(state);
    } catch (err) {
      // Listener defeituoso não pode estragar autenticação.
      // eslint-disable-next-line no-console
      console.error("[omniconnectClient] auth listener failed:", err);
    }
  }
}

export function subscribe(listener: (s: AuthState) => void): () => void {
  listeners.add(listener);
  listener(state);
  return () => {
    listeners.delete(listener);
  };
}

export function getAuthState(): AuthState {
  return state;
}

export function getAccessToken(): string | null {
  return state.accessToken;
}

// ─── HTTP core ─────────────────────────────────────────────────────────────

export interface RequestOptions extends RequestInit {
  /** Quando true, pula o auto-refresh on 401. Usado pelo próprio refresh(). */
  skipRefresh?: boolean;
  /** Quando true, devolve o Response cru sem desserializar JSON. */
  raw?: boolean;
}

export class OmniconnectError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "OmniconnectError";
    this.status = status;
    this.body = body;
  }
}

async function rawRequest(
  path: string,
  init: RequestInit & { skipRefresh?: boolean } = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (state.accessToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${state.accessToken}`);
  }
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`${BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
}

export async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { skipRefresh, raw, ...init } = options;
  let res = await rawRequest(path, init);

  // Auto-refresh on 401, exceto chamadas que JÁ são do próprio refresh.
  if (res.status === 401 && !skipRefresh && path !== "/auth/refresh") {
    const refreshed = await tryRefresh();
    if (refreshed) {
      res = await rawRequest(path, init);
    }
  }

  if (raw) {
    return res as unknown as T;
  }

  if (!res.ok) {
    let body: unknown = undefined;
    try {
      body = await res.clone().json();
    } catch {
      try {
        body = await res.text();
      } catch {
        /* ignore */
      }
    }
    const message =
      (body && typeof body === "object" && "message" in body
        ? String((body as Record<string, unknown>).message)
        : null) ?? `HTTP ${res.status}`;
    throw new OmniconnectError(message, res.status, body);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

// ─── Sessão ────────────────────────────────────────────────────────────────

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
      const data = await request<{ access_token: string; access_expires_in: number }>(
        "/auth/refresh",
        { method: "POST", skipRefresh: true },
      );
      if (!data?.access_token) return false;
      setState({
        ...state,
        accessToken: data.access_token,
        status: state.user ? "authenticated" : state.status,
      });
      // Se ainda não temos `user` (caso após restoreSession), preenchemos.
      if (!state.user) {
        try {
          const me = await request<SessionUser>("/auth/me", { skipRefresh: true });
          setState({ ...state, user: me, status: "authenticated" });
        } catch {
          /* boot sem user — manteremos só accessToken até a próxima chamada. */
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
  setState({ user: null, accessToken: null, status: "anonymous" });
}

export async function signIn(email: string, password: string): Promise<SessionUser> {
  const data = await request<SessionResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
    skipRefresh: true,
  });
  setState({ user: data.user, accessToken: data.access_token, status: "authenticated" });
  return data.user;
}

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  tenantName: string;
}

export async function signUp(payload: RegisterPayload): Promise<SessionUser> {
  const data = await request<SessionResponse & { tenant: { id: string; name: string } }>(
    "/auth/register",
    {
      method: "POST",
      body: JSON.stringify(payload),
      skipRefresh: true,
    },
  );
  setState({ user: data.user, accessToken: data.access_token, status: "authenticated" });
  return data.user;
}

export async function signOut(): Promise<void> {
  try {
    await request("/auth/logout", { method: "POST", skipRefresh: true });
  } catch {
    /* logout best-effort — não impede limpar o estado local. */
  }
  clearLocalSession();
}

export async function signOutAll(): Promise<void> {
  try {
    await request("/auth/logout-all", { method: "POST", skipRefresh: true });
  } catch {
    /* idem */
  }
  clearLocalSession();
}

/**
 * Tenta recuperar a sessão usando o cookie HttpOnly. Chamar no boot do app.
 * Não throws — devolve `null` quando não há sessão válida.
 */
export async function restoreSession(): Promise<SessionUser | null> {
  const ok = await tryRefresh();
  if (!ok) return null;
  return state.user;
}

// ─── Tenant invitations ────────────────────────────────────────────────────

export interface InvitationPreview {
  email: string;
  role: string;
  tenantId: string;
  tenantName: string;
  invitedByName: string | null;
  expiresAt: string;
  isExpired: boolean;
  isAccepted: boolean;
}

export interface AcceptInvitePayload {
  name?: string;
  password?: string;
}

export function previewInvitation(token: string): Promise<InvitationPreview> {
  return request<InvitationPreview>(
    `/tenant-invitations/by-token/${encodeURIComponent(token)}`,
    { skipRefresh: true },
  );
}

export async function acceptInvitation(
  token: string,
  payload: AcceptInvitePayload,
): Promise<SessionUser> {
  const data = await request<{
    user: SessionUser;
    tenantId: string;
    alreadyMember: boolean;
  }>(`/tenant-invitations/by-token/${encodeURIComponent(token)}/accept`, {
    method: "POST",
    body: JSON.stringify(payload),
    skipRefresh: true,
  });
  // Aceitar um invite NÃO autentica automaticamente o user — o backend não
  // emite refresh cookie nesse fluxo. O caller chama signIn(email, password)
  // depois (ou usa o redirect para a tela de login).
  return data.user;
}

// ─── OAuth de ad platforms ─────────────────────────────────────────────────

export type AdPlatform = "meta" | "google_ads" | "tiktok_ads";

export interface OAuthStartResponse {
  authorizeUrl: string;
  state: string;
  expiresAt: string;
}

export function startAdPlatformOAuth(
  platform: AdPlatform,
  params: { advertiserCompanyId: string; returnUrl?: string },
): Promise<OAuthStartResponse> {
  const qs = new URLSearchParams({
    advertiserCompanyId: params.advertiserCompanyId,
  });
  if (params.returnUrl) qs.set("returnUrl", params.returnUrl);
  return request<OAuthStartResponse>(`/oauth/${platform}/start?${qs.toString()}`);
}

// ─── Testing helper ────────────────────────────────────────────────────────

/** Reseta o estado interno. Uso EXCLUSIVO em testes. */
export function __resetForTests(): void {
  listeners.clear();
  refreshInFlight = null;
  state = { user: null, accessToken: null, status: "anonymous" };
}

export const __internals = { BASE_URL };
