import * as Sentry from "@sentry/react";

/**
 * Sentry init — DSN é uma chave pública (publishable), pode ficar no código.
 * Substitua o valor abaixo pelo DSN do seu projeto Sentry.
 * Você pode também definir em `VITE_SENTRY_DSN` se preferir manter fora do código.
 */
const SENTRY_DSN: string =
  (import.meta.env.VITE_SENTRY_DSN as string | undefined) ?? "";

const ENV = (import.meta.env.MODE as string) || "development";
const RELEASE = (import.meta.env.VITE_APP_RELEASE as string) || undefined;

const CONSENT_KEY = "app:sentry-consent";

/** Usuário deu consentimento explícito para enviar dados de identificação? */
export function hasUserConsent(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === "granted";
  } catch {
    return false;
  }
}

export function setUserConsent(granted: boolean) {
  try {
    localStorage.setItem(CONSENT_KEY, granted ? "granted" : "denied");
  } catch {
    /* ignore */
  }
  if (!granted) {
    Sentry.setUser(null);
  }
}

export function initSentry() {
  if (!SENTRY_DSN) {
    // Sem DSN configurado: silenciosamente desativa em dev/preview.
    // eslint-disable-next-line no-console
    console.info("[sentry] DSN não configurado — captura desativada.");
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: ENV,
    release: RELEASE,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
      Sentry.breadcrumbsIntegration({
        console: true,
        dom: true,
        fetch: true,
        history: true,
        xhr: true,
      }),
    ],
    tracesSampleRate: ENV === "production" ? 0.1 : 1.0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    // Sanitiza dados antes do envio: derruba PII se não houver consentimento
    beforeSend(event) {
      if (!hasUserConsent()) {
        delete event.user;
        if (event.request) {
          delete event.request.cookies;
          delete event.request.headers;
        }
      }
      return event;
    },
    sendDefaultPii: false,
  });
}

/** Define o usuário no Sentry, respeitando consentimento. */
export function identifyUser(user: { id: string; email?: string; name?: string; role?: string } | null) {
  if (!user || !hasUserConsent()) {
    Sentry.setUser(null);
    return;
  }
  Sentry.setUser({
    id: user.id,
    email: user.email,
    username: user.name,
    segment: user.role,
  });
}

/** Captura manual de erro (usado pelo ErrorBoundary e logger). */
export function captureException(err: unknown, context?: Record<string, unknown>) {
  Sentry.captureException(err, context ? { extra: context } : undefined);
}

export function addBreadcrumb(message: string, category = "app", data?: Record<string, unknown>) {
  Sentry.addBreadcrumb({ message, category, data, level: "info" });
}

export { Sentry };