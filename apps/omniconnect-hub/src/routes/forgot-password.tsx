import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Hexagon, Loader2, MailCheck } from "lucide-react";

// O backend Omni ainda não expõe `/auth/forgot-password` (ADR-0003 — fora
// do escopo do PR 3). No caminho mock (Lovable preview), usamos o Supabase
// Auth via import dinâmico. No caminho de produção, instruímos a contactar
// o administrador do tenant — um endpoint real entra em PR posterior.
const USE_MOCK_AUTH = import.meta.env.VITE_USE_MOCK_AUTH === "true";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Recuperar senha — OmniconnectPRO" },
      { name: "description", content: "Recupere o acesso à sua conta OmniconnectPRO." },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    try {
      if (USE_MOCK_AUTH) {
        const { supabase } = await import("@/integrations/supabase/client");
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) {
          toast.error(error.message);
          return;
        }
        setSent(true);
        return;
      }

      // Caminho de produção — backend Omni ainda não expõe reset; orientamos
      // o utilizador a contactar o administrador. Mostramos a mensagem
      // confirmatória padrão (anti-enumeration) para não revelar se o email
      // existe.
      toast.message(
        "Solicitação registrada. Procure o administrador do seu tenant para concluir a redefinição.",
      );
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Hexagon className="h-4 w-4" />
          </div>
          <span className="text-base font-semibold">OmniconnectPRO</span>
        </div>

        {sent ? (
          <div className="space-y-4 rounded-lg border bg-card p-6">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-success/15 text-success">
              <MailCheck className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <h1 className="text-lg font-semibold">Verifique seu e-mail</h1>
              <p className="text-sm text-muted-foreground">
                Se houver uma conta para <b>{email}</b>, você receberá um link
                para redefinir sua senha em alguns minutos.
              </p>
            </div>
            <Button asChild variant="outline" className="w-full">
              <Link to="/login">
                <ArrowLeft className="mr-2 h-4 w-4" /> Voltar para o login
              </Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight">Recuperar senha</h1>
              <p className="text-sm text-muted-foreground">
                Informe o e-mail da sua conta e enviaremos um link de
                redefinição.
              </p>
            </div>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="voce@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Enviando…
                  </>
                ) : (
                  "Enviar link de recuperação"
                )}
              </Button>
              <Button asChild variant="ghost" className="w-full">
                <Link to="/login">
                  <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
                </Link>
              </Button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
