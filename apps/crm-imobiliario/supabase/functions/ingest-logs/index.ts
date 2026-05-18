import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "https://esm.sh/zod@3.23.8";

const LogSchema = z.object({
  level: z.enum(["error", "warn", "exception", "rejection"]),
  message: z.string().min(1).max(4000),
  source: z.string().max(500).optional(),
  stack: z.string().max(8000).optional(),
  page: z.string().max(500).optional(),
  url: z.string().max(2000).optional(),
  user_agent: z.string().max(500).optional(),
  session_id: z.string().max(100).optional(),
  client_timestamp: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const BodySchema = z.object({
  logs: z.array(LogSchema).min(1).max(50),
});

// In-memory rate limiter (best effort; resets when function cold-starts).
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 60; // max requests per IP per window
const buckets = new Map<string, { count: number; reset: number }>();

function rateLimit(ip: string): { ok: boolean; retryAfter?: number } {
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || b.reset < now) {
    buckets.set(ip, { count: 1, reset: now + RATE_WINDOW_MS });
    return { ok: true };
  }
  if (b.count >= RATE_MAX) {
    return { ok: false, retryAfter: Math.ceil((b.reset - now) / 1000) };
  }
  b.count++;
  return { ok: true };
}

// Strip obvious PII patterns (emails, long digit sequences, bearer tokens)
function sanitize(s?: string): string | undefined {
  if (!s) return s;
  return s
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b\d{11,}\b/g, "[number]")
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [token]")
    .replace(/eyJ[A-Za-z0-9._\-]{20,}/g, "[jwt]")
    .slice(0, 8000);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    "unknown";

  const rl = rateLimit(ip);
  if (!rl.ok) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Retry-After": String(rl.retryAfter ?? 60),
      },
    });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Best-effort user identification (optional). We never trust client-supplied user_id.
  let userId: string | null = null;
  const auth = req.headers.get("Authorization");
  if (auth?.startsWith("Bearer ")) {
    try {
      const sb = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: auth } } },
      );
      const { data } = await sb.auth.getUser();
      userId = data.user?.id ?? null;
    } catch { /* anonymous */ }
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const rows = parsed.data.logs.map((l) => ({
    level: l.level,
    message: sanitize(l.message)!,
    source: sanitize(l.source),
    stack: sanitize(l.stack),
    page: l.page?.slice(0, 500),
    url: l.url?.slice(0, 2000),
    user_agent: l.user_agent?.slice(0, 500),
    session_id: l.session_id,
    client_timestamp: l.client_timestamp ?? null,
    user_id: userId,
    metadata: l.metadata ?? {},
  }));

  const { error } = await admin.from("frontend_logs").insert(rows);
  if (error) {
    console.error("ingest-logs insert failed", error);
    return new Response(JSON.stringify({ error: "Insert failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ inserted: rows.length }), {
    status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});