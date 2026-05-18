/**
 * Async shipper that batches captured logs and posts them to the
 * `ingest-logs` edge function. Respects user consent and a client-side
 * rate limit, and flushes on page unload via sendBeacon.
 */
import { subscribe, type LogEntry } from "./errorLogger";
import { hasUserConsent } from "./sentry";
import { supabase } from "@/integrations/supabase/client";
import { getLogContext } from "./logContext";

const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ingest-logs`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const SESSION_KEY = "app:log-session-id";
const SHIPPED_KEY = "app:log-shipped-ids";

const BATCH_SIZE = 20;
const FLUSH_INTERVAL_MS = 10_000;
const CLIENT_RATE_LIMIT = 30; // max requests per minute from this tab
const RATE_WINDOW_MS = 60_000;

let installed = false;
let queue: LogEntry[] = [];
let timer: number | null = null;
let inFlight = false;
let requestTimestamps: number[] = [];
let shipped: Set<string> = new Set();

function getSessionId(): string {
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

function loadShipped() {
  try {
    const raw = sessionStorage.getItem(SHIPPED_KEY);
    if (raw) shipped = new Set(JSON.parse(raw));
  } catch { shipped = new Set(); }
}
function persistShipped() {
  try {
    // keep only last 500 ids to avoid quota
    const arr = Array.from(shipped).slice(-500);
    sessionStorage.setItem(SHIPPED_KEY, JSON.stringify(arr));
    shipped = new Set(arr);
  } catch { /* ignore */ }
}

function withinRateLimit(): boolean {
  const now = Date.now();
  requestTimestamps = requestTimestamps.filter((t) => now - t < RATE_WINDOW_MS);
  if (requestTimestamps.length >= CLIENT_RATE_LIMIT) return false;
  requestTimestamps.push(now);
  return true;
}

function pagePath(url: string) {
  try { return new URL(url).pathname || "/"; } catch { return ""; }
}

function toPayload(entries: LogEntry[]) {
  const ctx = getLogContext();
  return {
    logs: entries.map((e) => ({
      level: e.level,
      message: e.message.slice(0, 4000),
      source: e.source?.slice(0, 500),
      stack: e.stack?.slice(0, 8000),
      page: (ctx.route || pagePath(e.url)).slice(0, 500),
      url: e.url.slice(0, 2000),
      user_agent: e.userAgent.slice(0, 500),
      session_id: getSessionId(),
      client_timestamp: e.timestamp,
      metadata: {
        tenant: ctx.tenant,
        app_version: ctx.app_version,
        route: ctx.route,
        referrer: ctx.referrer,
        viewport: ctx.viewport,
        locale: ctx.locale,
        user_role: ctx.user_role,
        // user_id/email are also sent so admins can filter without joining auth,
        // but server still trusts JWT for the authoritative user_id column.
        user_id_hint: ctx.user_id,
        user_email_hint: ctx.user_email,
      },
    })),
  };
}

async function authHeader(): Promise<Record<string, string>> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch { return {}; }
}

async function flush(force = false) {
  if (inFlight) return;
  if (!hasUserConsent()) { queue = []; return; }
  if (queue.length === 0) return;
  if (!force && queue.length < BATCH_SIZE) return;
  if (!withinRateLimit()) return;

  const batch = queue.splice(0, BATCH_SIZE);
  inFlight = true;
  try {
    const headers = {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      ...(await authHeader()),
    };
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify(toPayload(batch)),
      keepalive: true,
    });
    if (res.ok) {
      batch.forEach((e) => shipped.add(e.id));
      persistShipped();
    } else if (res.status === 429) {
      // Server told us to back off — drop batch to avoid infinite loop
    } else {
      // transient error — requeue at the front (cap to avoid memory blowup)
      queue = [...batch.slice(0, 50), ...queue].slice(0, 200);
    }
  } catch {
    queue = [...batch.slice(0, 50), ...queue].slice(0, 200);
  } finally {
    inFlight = false;
  }
}

function flushOnUnload() {
  if (!hasUserConsent() || queue.length === 0) return;
  try {
    const blob = new Blob([JSON.stringify(toPayload(queue))], {
      type: "application/json",
    });
    // sendBeacon does not allow custom headers, so endpoint must accept anon.
    navigator.sendBeacon(`${ENDPOINT}?apikey=${encodeURIComponent(ANON_KEY)}`, blob);
    queue = [];
  } catch { /* ignore */ }
}

export function installLogShipper() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  loadShipped();

  subscribe((entries) => {
    for (const e of entries) {
      if (shipped.has(e.id)) continue;
      if (queue.find((q) => q.id === e.id)) continue;
      queue.push(e);
    }
    if (queue.length >= BATCH_SIZE) void flush();
  });

  timer = window.setInterval(() => void flush(true), FLUSH_INTERVAL_MS);
  window.addEventListener("pagehide", flushOnUnload);
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushOnUnload();
  });
}

export function stopLogShipper() {
  if (timer != null) window.clearInterval(timer);
  installed = false;
}