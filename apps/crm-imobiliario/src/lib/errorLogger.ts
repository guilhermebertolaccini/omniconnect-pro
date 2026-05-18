/**
 * Frontend error capture system.
 * Captures uncaught errors, unhandled promise rejections, and console errors/warnings.
 * Stores them in memory + localStorage, exposes a subscribable store.
 */

import { Sentry } from "./sentry";

export type LogLevel = "error" | "warn" | "exception" | "rejection";
export type LogStatus = "open" | "recurring" | "resolved";

export interface LogEntry {
  id: string;
  level: LogLevel;
  message: string;
  stack?: string;
  source?: string;
  url: string;
  userAgent: string;
  timestamp: string;
  status?: LogStatus;
  notes?: string;
}

const STORAGE_KEY = "app:error-log";
const MAX_ENTRIES = 200;

let entries: LogEntry[] = [];
const listeners = new Set<(entries: LogEntry[]) => void>();
let installed = false;

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) entries = JSON.parse(raw);
  } catch {
    entries = [];
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    /* quota exceeded — drop silently */
  }
}

function notify() {
  listeners.forEach((fn) => fn([...entries]));
}

function pushEntry(partial: Omit<LogEntry, "id" | "url" | "userAgent" | "timestamp">) {
  const entry: LogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    url: typeof window !== "undefined" ? window.location.href : "",
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    timestamp: new Date().toISOString(),
    status: "open",
    ...partial,
  };
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries = entries.slice(-MAX_ENTRIES);
  persist();
  notify();
}

function safeMessage(args: unknown[]): string {
  return args
    .map((a) => {
      if (a instanceof Error) return a.message;
      if (typeof a === "string") return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(" ");
}

export function installErrorLogger() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  load();

  // Uncaught runtime errors
  window.addEventListener("error", (event) => {
    pushEntry({
      level: "exception",
      message: event.message || "Unknown error",
      stack: event.error?.stack,
      source: event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : undefined,
    });
    if (event.error) Sentry.captureException(event.error);
    else Sentry.captureMessage(event.message || "Unknown error", "error");
  });

  // Unhandled promise rejections
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    pushEntry({
      level: "rejection",
      message:
        reason instanceof Error
          ? reason.message
          : typeof reason === "string"
          ? reason
          : safeMessage([reason]),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
    if (reason instanceof Error) Sentry.captureException(reason);
    else Sentry.captureMessage(`Unhandled rejection: ${safeMessage([reason])}`, "error");
  });

  // Patch console.error / console.warn (keep originals running)
  const origError = console.error.bind(console);
  const origWarn = console.warn.bind(console);
  console.error = (...args: unknown[]) => {
    pushEntry({ level: "error", message: safeMessage(args) });
    Sentry.addBreadcrumb({ category: "console", level: "error", message: safeMessage(args) });
    origError(...args);
  };
  console.warn = (...args: unknown[]) => {
    pushEntry({ level: "warn", message: safeMessage(args) });
    Sentry.addBreadcrumb({ category: "console", level: "warning", message: safeMessage(args) });
    origWarn(...args);
  };
}

export function getLogs(): LogEntry[] {
  return [...entries];
}

export function clearLogs() {
  entries = [];
  persist();
  notify();
}

export function updateLog(id: string, patch: Partial<Pick<LogEntry, "status" | "notes">>) {
  entries = entries.map((e) => (e.id === id ? { ...e, ...patch } : e));
  persist();
  notify();
}

export function deleteLog(id: string) {
  entries = entries.filter((e) => e.id !== id);
  persist();
  notify();
}

export function subscribe(fn: (entries: LogEntry[]) => void): () => void {
  listeners.add(fn);
  fn([...entries]);
  return () => listeners.delete(fn);
}

export function logManual(level: LogLevel, message: string, stack?: string) {
  pushEntry({ level, message, stack });
}

// Expose a debug helper in dev so users can inspect from the browser console
if (typeof window !== "undefined") {
  (window as unknown as { __errorLog?: unknown }).__errorLog = { getLogs, clearLogs, subscribe };
}