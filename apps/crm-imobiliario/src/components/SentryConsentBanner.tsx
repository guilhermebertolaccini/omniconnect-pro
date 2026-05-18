import { useEffect, useState } from "react";
import { hasUserConsent, setUserConsent } from "@/lib/sentry";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Shield, X } from "lucide-react";

const DECISION_KEY = "app:sentry-consent-asked";

export function SentryConsentBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const asked = localStorage.getItem(DECISION_KEY);
    if (!asked && !hasUserConsent()) setShow(true);
  }, []);

  const decide = (granted: boolean) => {
    setUserConsent(granted);
    localStorage.setItem(DECISION_KEY, "1");
    setShow(false);
  };

  if (!show) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm">
      <Card className="p-4 shadow-lg border-primary/20">
        <div className="flex items-start gap-3">
          <Shield className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="flex-1 space-y-2">
            <p className="text-sm font-medium text-foreground">
              Diagnóstico de erros
            </p>
            <p className="text-xs text-muted-foreground">
              Podemos enviar dados do seu usuário (id, nome, papel) junto com erros para
              ajudar a corrigir problemas mais rápido. Stack traces são sempre enviados de
              forma anônima.
            </p>
            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={() => decide(true)}>Permitir</Button>
              <Button size="sm" variant="outline" onClick={() => decide(false)}>Recusar</Button>
            </div>
          </div>
          <button
            onClick={() => decide(false)}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </Card>
    </div>
  );
}