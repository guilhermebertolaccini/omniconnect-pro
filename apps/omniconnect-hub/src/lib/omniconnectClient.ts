/**
 * `omniconnectClient` — HTTP client para o backend `omniconnect-backend`.
 *
 * ADR-0003 (PR 3 — Sprint Hub). Mantém o access token em memória (volátil;
 * perdido no refresh da página) e delega a persistência da sessão ao
 * HttpOnly cookie de refresh, que o backend gerencia via /auth/refresh com
 * rotação. O frontend NUNCA enxerga o segredo de refresh; ele só observa
 * o lifecycle através de:
 *
 *   - `signIn` / `signUp` — entram em sessão e disparam onAuthChange.
 *   - `restoreSession` — chamado no boot para tentar reaproveitar o cookie.
 *   - `refresh` — usado pelo retry de 401 dentro de `request()`.
 *   - `signOut` / `signOutAll` — limpam memória + cookie + listeners.
 *
 * Espelha o cliente do `smart-ad-automator` (Sprint 2.4 Bloco C) — promover
 * para `@omniconnect/api-client` é trabalho futuro fora do escopo do PR 3.
 *
 * Não tem dependência do React — pode ser usado fora de componentes. O
 * `useAuth` (em `lib/auth-context.tsx`) consome via `subscribe()`.
 */

import type { BackendRole } from "./roleMapping";

const DEFAULT_BASE_URL = "/api";
const AUTH_REFRESH_TIMEOUT_MS = 8_000;

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
  role: BackendRole;
  /** `tenantId` do JWT atual — autoridade última de escopo. */
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

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { skipRefresh, raw, ...init } = options;
  let res = await rawRequest(path, init);

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
  const stateAtRefreshStart = state;
  refreshInFlight = (async () => {
    const controller = new AbortController();
    const timeoutId = globalThis.setTimeout(() => controller.abort(), AUTH_REFRESH_TIMEOUT_MS);

    try {
      const data = await request<{ access_token: string; access_expires_in: number }>(
        "/auth/refresh",
        { method: "POST", skipRefresh: true, signal: controller.signal },
      );
      if (!data?.access_token) return false;

      // A user action (login/logout) completed while this refresh was pending.
      // Its resulting session is authoritative and must not be overwritten.
      if (state !== stateAtRefreshStart) {
        return state.status === "authenticated";
      }

      setState({
        ...state,
        accessToken: data.access_token,
        status: state.user ? "authenticated" : state.status,
      });
      if (!state.user) {
        const stateWithRefreshedToken = state;
        try {
          const me = await request<SessionUser>("/auth/me", {
            skipRefresh: true,
            signal: controller.signal,
          });
          if (state !== stateWithRefreshedToken) {
            return state.status === "authenticated";
          }
          setState({ ...state, user: me, status: "authenticated" });
        } catch {
          /* boot sem user — só accessToken até a próxima chamada. */
        }
      }
      return true;
    } catch {
      if (state === stateAtRefreshStart) {
        clearLocalSession();
      }
      return state.status === "authenticated";
    } finally {
      globalThis.clearTimeout(timeoutId);
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

export async function switchTenantSession(tenantId: string): Promise<SessionUser> {
  const data = await request<SessionResponse>("/auth/switch-tenant", {
    method: "POST",
    body: JSON.stringify({ tenantId }),
    skipRefresh: true,
  });
  setState({ user: data.user, accessToken: data.access_token, status: "authenticated" });
  return data.user;
}

export async function signOut(): Promise<void> {
  try {
    await request("/auth/logout", { method: "POST", skipRefresh: true });
  } catch {
    /* logout best-effort. */
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

export async function restoreSession(): Promise<SessionUser | null> {
  const ok = await tryRefresh();
  if (!ok) return null;
  return state.user;
}

// ─── Tenants — memberships do user atual (ADR-0003 §2) ─────────────────────

export interface Membership {
  tenantId: string;
  tenantName: string;
  role: BackendRole;
  isActive: boolean;
}

export async function getMyMemberships(): Promise<Membership[]> {
  const res = await request<{ data: Membership[] }>("/tenants/me");
  return res.data;
}

// ─── Dashboards — pilot overview (ADR / pilot §7 A6) ───────────────────────

export type PilotOverviewOrigin = "all" | "ads" | "hsm" | "organic";

export interface PilotOverview {
  period: { from: string; to: string };
  origin: PilotOverviewOrigin;
  leadsIngested: number;
  conversationsCreated: number;
  botifyHandoffs: number;
  insightAnalyses: number;
  recoverableOpportunities: number;
  lossOrAbandonmentSignals: number;
  aiCost: { amount: number; currency: string };
}

export interface PilotOverviewQuery {
  days?: number;
  from?: string;
  to?: string;
  origin?: PilotOverviewOrigin;
}

export async function getPilotOverview(q: PilotOverviewQuery = {}): Promise<PilotOverview> {
  const params = new URLSearchParams();
  if (q.days != null) params.set("days", String(q.days));
  if (q.from) params.set("from", q.from);
  if (q.to) params.set("to", q.to);
  if (q.origin) params.set("origin", q.origin);
  const qs = params.toString();
  const path = `/dashboards/pilot-overview${qs ? `?${qs}` : ""}`;
  const res = await request<{ data: PilotOverview }>(path);
  return res.data;
}

// ─── InsightAI — dashboard + analyses + analyze (Sprint Hub / PR 5) ─────────

export interface InsightSummary {
  period: { from: string; to: string };
  periodDays: number;
  sampleCap: number;
  analyzedConversations: number;
  averageSellerQualityScore: number;
  averageResponseQualityScore: number;
  averageQualificationScore: number;
  averageFollowUpScore: number;
  lostOpportunities: number;
  sellerAbandonments: number;
  leadAbandonments: number;
  schedulingAttempts: number;
  proposalOrSimulationAttempts: number;
  byLeadIntent: Record<string, number>;
  byOpportunityStatus: Record<string, number>;
  byRisk: Record<string, number>;
  topObjections: Array<{ objection: string; count: number }>;
}

export interface InsightWindowQuery {
  days?: number;
  from?: string;
  to?: string;
  segment?: number;
}

export async function getInsightSummary(q: InsightWindowQuery = {}): Promise<InsightSummary> {
  return request<InsightSummary>(`/insight-ai/dashboard/summary${buildQs(q)}`);
}

export interface InsightUsageByProvider {
  modelProvider: string;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  estimatedCost: number;
}

export interface InsightUsageRow {
  id: number;
  createdAt: string;
  modelProvider: string;
  modelName: string;
  operationType: string;
  promptTokens: number;
  completionTokens: number;
  estimatedCost: number;
  currency: string;
  status: string;
  analysisId: number | null;
  conversationId: number | null;
}

export interface InsightUsage {
  period: { from: string; to: string; days: number };
  statusFilter: string;
  byProvider: InsightUsageByProvider[];
  totals: {
    calls: number;
    promptTokens: number;
    completionTokens: number;
    estimatedCost: number;
  };
  rows: InsightUsageRow[];
  meta: { total: number; limit: number; offset: number };
}

export interface InsightUsageQuery extends InsightWindowQuery {
  status?: "success" | "failed" | "all";
  limit?: number;
  offset?: number;
}

export async function getInsightUsage(q: InsightUsageQuery = {}): Promise<InsightUsage> {
  return request<InsightUsage>(`/insight-ai/dashboard/usage${buildQs(q)}`);
}

/**
 * Linha de `ConversationAIAnalysis`. Apenas os campos efetivamente usados
 * pelo Hub estão tipados; o backend devolve mais.
 */
export interface InsightAnalysis {
  id: number;
  createdAt: string;
  contactPhone: string;
  contactName: string | null;
  leadIntent: string;
  opportunityStatus: string;
  risk: string;
  mainObjection: string | null;
  qualificationScore: number;
  sellerQualityScore: number;
  followUpScore: number;
  lostOpportunity: boolean;
  hasLeadAbandonment: boolean;
  hasSellerAbandonment: boolean;
  nextBestAction: string;
  modelProvider: string;
  modelName: string;
}

export interface InsightAnalysesPage {
  items: InsightAnalysis[];
  meta: { total: number; limit: number; offset: number };
}

export interface InsightAnalysesQuery {
  from?: string;
  to?: string;
  segment?: number;
  contactPhone?: string;
  limit?: number;
  offset?: number;
}

export async function getInsightAnalyses(
  q: InsightAnalysesQuery = {},
): Promise<InsightAnalysesPage> {
  return request<InsightAnalysesPage>(`/insight-ai/analyses${buildQs(q)}`);
}

export interface AnalyzeConversationOptions {
  days?: number;
  limit?: number;
  segment?: number;
  userId?: number;
  persist?: boolean;
}

/**
 * Default async: devolve `{ jobId, ... }` quando enfileirado.
 * `sync=true`: devolve o resultado inline (uso admin/debug).
 */
export async function analyzeConversationByPhone(
  phone: string,
  body: AnalyzeConversationOptions = {},
  opts: { sync?: boolean } = {},
): Promise<unknown> {
  const qs = opts.sync ? "?sync=true" : "";
  return request<unknown>(`/insight-ai/analyze/${encodeURIComponent(phone)}${qs}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ─── Message Brokers — Sprint Foundation F1 (ADR-0005) ─────────────────────

export type MessageBrokerChannel = "sms" | "email" | "rcs";
export type MessageBrokerStatus = "connected" | "attention" | "disconnected";

export interface MessageBroker {
  id: string;
  tenantId: string;
  channel: MessageBrokerChannel;
  vendor: string;
  label: string;
  status: MessageBrokerStatus;
  autoDisableOnBounce: boolean;
  monthlyCostCents: number;
  fallbackBrokerId: string | null;
  statusMap: Record<string, string>;
  hasApiKey: boolean;
  hasApiSecret: boolean;
  hasWebhookSecret: boolean;
  apiKeyHint: string | null;
  createdAt: string;
  updatedAt: string;
  createdById: number | null;
}

export interface MessageBrokerCreateInput {
  channel: MessageBrokerChannel;
  vendor: string;
  label: string;
  status?: MessageBrokerStatus;
  autoDisableOnBounce?: boolean;
  monthlyCostCents?: number;
  fallbackBrokerId?: string;
  statusMap: Record<string, string>;
  apiKey?: string;
  apiSecret?: string;
  webhookSecret?: string;
}

export interface MessageBrokerUpdateInput {
  vendor?: string;
  label?: string;
  status?: MessageBrokerStatus;
  autoDisableOnBounce?: boolean;
  monthlyCostCents?: number;
  fallbackBrokerId?: string | null;
  statusMap?: Record<string, string>;
  apiKey?: string | null;
  apiSecret?: string | null;
  webhookSecret?: string | null;
}

export interface MessageBrokerTestResult {
  id: string;
  canDecrypt: boolean;
  status: MessageBrokerStatus;
}

export async function listMessageBrokers(
  filters: {
    channel?: MessageBrokerChannel;
    status?: MessageBrokerStatus;
  } = {},
): Promise<MessageBroker[]> {
  return request<MessageBroker[]>(`/message-brokers${buildQs(filters)}`);
}

export async function getMessageBroker(id: string): Promise<MessageBroker> {
  return request<MessageBroker>(`/message-brokers/${encodeURIComponent(id)}`);
}

export async function createMessageBroker(input: MessageBrokerCreateInput): Promise<MessageBroker> {
  return request<MessageBroker>("/message-brokers", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateMessageBroker(
  id: string,
  input: MessageBrokerUpdateInput,
): Promise<MessageBroker> {
  return request<MessageBroker>(`/message-brokers/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteMessageBroker(id: string): Promise<{ id: string }> {
  return request<{ id: string }>(`/message-brokers/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function testMessageBroker(id: string): Promise<MessageBrokerTestResult> {
  return request<MessageBrokerTestResult>(`/message-brokers/${encodeURIComponent(id)}/test`, {
    method: "POST",
  });
}

// ─── Tenant Wallet — Sprint Foundation F2 (ADR-0005) ───────────────────────

export type WalletGuardMode = "hard_block" | "soft_block";
export type WalletResetCycle = "monthly" | "weekly";
export type WalletTransactionType = "debit" | "credit" | "refund";

export interface WalletChannelCost {
  channel: string;
  costCents: number;
}

export interface TenantWallet {
  id: string;
  tenantId: string;
  totalBudgetCents: number;
  usedBudgetCents: number;
  remainingCents: number;
  resetCycle: WalletResetCycle;
  resetAt: string | null;
  guardMode: WalletGuardMode;
  realtimeDebit: boolean;
  channelCosts: WalletChannelCost[];
  createdAt: string;
  updatedAt: string;
}

export interface WalletTransaction {
  id: string;
  tenantId: string;
  walletId: string;
  type: WalletTransactionType;
  channel: string | null;
  amountCents: number;
  refType: string | null;
  refId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface UpdateWalletInput {
  totalBudgetCents?: number;
  resetCycle?: WalletResetCycle;
  resetAt?: string | null;
  guardMode?: WalletGuardMode;
  realtimeDebit?: boolean;
}

export interface CreditWalletInput {
  amountCents: number;
  channel?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface ListWalletTransactionsQuery {
  type?: WalletTransactionType;
  channel?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export interface WalletTransactionsPage {
  items: WalletTransaction[];
  meta: { total: number; limit: number; offset: number };
}

export async function getMyWallet(): Promise<TenantWallet> {
  return request<TenantWallet>("/tenant-wallets/me");
}

export async function updateMyWallet(input: UpdateWalletInput): Promise<TenantWallet> {
  return request<TenantWallet>("/tenant-wallets/me", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function upsertWalletChannelCost(
  channel: string,
  costCents: number,
): Promise<WalletChannelCost> {
  return request<WalletChannelCost>(`/tenant-wallets/me/channels/${encodeURIComponent(channel)}`, {
    method: "PUT",
    body: JSON.stringify({ costCents }),
  });
}

export async function creditMyWallet(
  input: CreditWalletInput,
): Promise<{ transactionId: string; remainingCents: number }> {
  return request<{ transactionId: string; remainingCents: number }>("/tenant-wallets/me/credits", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function listMyWalletTransactions(
  query: ListWalletTransactionsQuery = {},
): Promise<WalletTransactionsPage> {
  return request<WalletTransactionsPage>(`/tenant-wallets/me/transactions${buildQs(query)}`);
}

// ─── Anti-fatigue — Sprint Foundation F3 (ADR-0005) ────────────────────────

export type AntiFatigueAppliesTo = "phone" | "document" | "both";

export interface AntiFatigueRule {
  id: string;
  tenantId: string;
  enabled: boolean;
  windowHours: number;
  appliesTo: AntiFatigueAppliesTo;
  allowBypassForUrgent: boolean;
  businessHoursStart: string | null;
  businessHoursEnd: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertAntiFatigueRuleInput {
  enabled?: boolean;
  windowHours?: number;
  appliesTo?: AntiFatigueAppliesTo;
  allowBypassForUrgent?: boolean;
  businessHoursStart?: string | null;
  businessHoursEnd?: string | null;
}

export interface AntiFatigueDedupeLog {
  id: string;
  tenantId: string;
  contactKey: string;
  channel: string;
  blockedAt: string;
  refType: string | null;
  refId: string | null;
}

export interface ListAntiFatigueDedupeLogQuery {
  contactKey?: string;
  channel?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export interface AntiFatigueDedupeLogPage {
  items: AntiFatigueDedupeLog[];
  meta: { total: number; limit: number; offset: number };
}

export async function getMyAntiFatigueRule(): Promise<AntiFatigueRule> {
  return request<AntiFatigueRule>("/anti-fatigue/rule");
}

export async function upsertMyAntiFatigueRule(
  input: UpsertAntiFatigueRuleInput,
): Promise<AntiFatigueRule> {
  return request<AntiFatigueRule>("/anti-fatigue/rule", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function listAntiFatigueDedupeLog(
  query: ListAntiFatigueDedupeLogQuery = {},
): Promise<AntiFatigueDedupeLogPage> {
  return request<AntiFatigueDedupeLogPage>(`/anti-fatigue/dedupe-log${buildQs(query)}`);
}

// ─── Leads 360° — Sprint Quick-wins Q1 ─────────────────────────────────────

export type Lead360Temperature = "hot" | "warm" | "cold" | "unknown";

export interface Lead360Summary {
  contactId: number;
  name: string;
  phone: string;
  email: string | null;
  source: string | null;
  stage: string | null;
  brokerId: number | null;
  brokerName: string | null;
  crmLeadId: string | null;
  qualificationScore: number | null;
  leadIntent: string | null;
  temperature: Lead360Temperature;
  lostOpportunity: boolean;
  mainObjection: string | null;
  nextBestAction: string | null;
  modelProvider: string | null;
  conversationCount: number;
  analysisCount: number;
  handoffCount: number;
  lastTouchAt: string | null;
  contactCreatedAt: string;
}

export interface Lead360TimelineItem {
  kind: "conversation" | "analysis" | "handoff" | "crm_interaction";
  at: string;
  title: string;
  detail: string | null;
  meta?: Record<string, unknown>;
}

export interface Lead360Detail extends Lead360Summary {
  cpf: string | null;
  contract: string | null;
  segment: number | null;
  isCPC: boolean;
  contactUpdatedAt: string;
  crmLead: {
    id: string;
    estimatedValue: string | null;
    propertyInterest: string | null;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  latestAnalysis: {
    id: number;
    summary: string;
    leadIntent: string;
    opportunityStatus: string;
    risk: string;
    mainObjection: string | null;
    qualificationScore: number;
    sellerQualityScore: number;
    nextBestAction: string;
    modelProvider: string;
    modelName: string;
    createdAt: string;
  } | null;
  timeline: Lead360TimelineItem[];
}

export interface ListLeads360Query {
  search?: string;
  temperature?: Lead360Temperature;
  crm?: "matched" | "unmatched" | "all";
  brokerId?: number;
  limit?: number;
  offset?: number;
}

export interface Leads360Page {
  items: Lead360Summary[];
  meta: { total: number; limit: number; offset: number };
}

export async function listLeads360(query: ListLeads360Query = {}): Promise<Leads360Page> {
  return request<Leads360Page>(`/leads/360${buildQs(query)}`);
}

export async function getLead360(contactId: number): Promise<Lead360Detail> {
  return request<Lead360Detail>(`/leads/360/${contactId}`);
}

// ─── Line Health — Sprint Quick-wins Q2 ────────────────────────────────────

export type LineHealthAction = "none" | "throttle" | "block";

export interface LineHealthPolicy {
  id: string;
  tenantId: string;
  alertHoursMedium: number;
  alertHoursLow: number;
  autoActionOnCritical: LineHealthAction;
  autoActionOnHigh: LineHealthAction;
  suggestRotation: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertLineHealthPolicyInput {
  alertHoursMedium?: number;
  alertHoursLow?: number;
  autoActionOnCritical?: LineHealthAction;
  autoActionOnHigh?: LineHealthAction;
  suggestRotation?: boolean;
}

export interface LineHealthEntry {
  lineId: number;
  phone: string;
  status: "active" | "ban";
  numberId: string;
  appId: number;
  healthScore: number;
  blockRate: number;
  responseRate: number;
  messagesPerDay: number;
  lastCalculated: string;
  createdAt: string;
  updatedAt: string;
}

export async function listLineHealthLines(): Promise<LineHealthEntry[]> {
  return request<LineHealthEntry[]>("/line-health/lines");
}

export async function getLineHealthPolicy(): Promise<LineHealthPolicy> {
  return request<LineHealthPolicy>("/line-health/policy");
}

export async function upsertLineHealthPolicy(
  input: UpsertLineHealthPolicyInput,
): Promise<LineHealthPolicy> {
  return request<LineHealthPolicy>("/line-health/policy", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

// ─── Guards audit (system-events) — Sprint Quick-wins Q2 ───────────────────

export interface GuardEvent {
  id: number;
  tenantId: string;
  type: string;
  module: string;
  severity: string;
  data: Record<string, unknown> | null;
  userId: number | null;
  createdAt: string;
  user?: { id: number; name: string; email: string; role: string } | null;
}

export interface GuardEventsResponse {
  events: GuardEvent[];
  total: number;
}

export interface ListGuardEventsQuery {
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export async function listGuardEvents(
  query: ListGuardEventsQuery = {},
): Promise<GuardEventsResponse> {
  return request<GuardEventsResponse>(`/system-events/guards${buildQs(query)}`);
}

function buildQs(q: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v == null || v === "") continue;
    params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

// ─── Testing helper ────────────────────────────────────────────────────────

export function __resetForTests(): void {
  listeners.clear();
  refreshInFlight = null;
  state = { user: null, accessToken: null, status: "anonymous" };
}

export const __internals = { BASE_URL };
