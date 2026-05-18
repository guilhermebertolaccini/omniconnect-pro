import { useEffect } from "react";
import { getAccessToken } from "@/lib/omniconnectClient";

const CRM_EVENTS = [
  "crm.proposal.transitioned",
  "crm.contract.transitioned",
  "crm.contract.signed",
  "crm.payment.created",
  "crm.commission.created",
  "crm.signature.updated",
] as const;

function socketBaseUrl(): string {
  const raw =
    import.meta.env.VITE_OMNICONNECT_API_URL ??
    import.meta.env.VITE_API_URL ??
    "";
  if (!raw || raw === "/api") return window.location.origin;
  return String(raw).replace(/\/api\/?$/, "").replace(/\/$/, "");
}

export function useCrmRealtime(onEvent: () => void | Promise<void>) {
  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;

    const ws = new WebSocket(
      `${socketBaseUrl().replace(/^http/, "ws")}/socket.io/?EIO=4&transport=websocket`,
    );
    let pingTimer: number | undefined;

    ws.onopen = () => {
      ws.send(`40/crm,${JSON.stringify({ token })}`);
    };

    ws.onmessage = (message) => {
      const data = String(message.data);
      if (data.startsWith("0")) {
        try {
          const handshake = JSON.parse(data.slice(1)) as { pingInterval?: number };
          if (handshake.pingInterval) {
            pingTimer = window.setInterval(() => ws.send("3"), handshake.pingInterval);
          }
        } catch {
          // Ignore malformed socket.io handshake frames.
        }
        return;
      }
      if (data.startsWith("2")) {
        ws.send("3");
        return;
      }
      if (!data.startsWith("42/crm,")) return;
      try {
        const [eventName] = JSON.parse(data.slice("42/crm,".length)) as [string, unknown];
        if ((CRM_EVENTS as readonly string[]).includes(eventName)) {
          void onEvent();
        }
      } catch {
        // Ignore non-event frames.
      }
    };

    return () => {
      if (pingTimer) window.clearInterval(pingTimer);
      ws.close();
    };
  }, [onEvent]);
}
