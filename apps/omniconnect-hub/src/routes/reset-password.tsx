import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Hexagon, Loader2 } from "lucide-react";

// Reset de senha real precisa de endpoint backend (ADR-0003 — fora do PR 3).
// No mock (Lovable preview) reusamos Supabase. Em produção, mostramos uma
// página informativa apontando para o administrador.
const USE_MOCK_AUTH = import.meta.env.VITE_USE_MOCK_AUTH === "true";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Redefinir senha — OmniconnectPRO" },
      { name: "description", content: "Defina uma nova senha para sua conta OmniconnectPRO." },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(!USE_MOCK_AUTH);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [supabaseMod, setSupabaseMod] = useState<any>(null);

  useEffect(() => {
    if (!USE_MOCK_AUTH) return; // produção: form fica desabilitado
    let cancelled = false;
    (async () => {
      const mod = await import("@/integrations/supabase/client");
      if (cancelled) return;
      setSupabaseMod(mod);
      const { data } = mod.supabase.auth.onAuthStateChange((event: string) => {
        if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
          setReady(true);
        }
      });
      const sessionRes = await mod.supabase.auth.getSession();
      if (sessionRes.data.session) setReady(true);
      return () => data.subscription.unsubscribe();
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("A senha precisa ter ao menos 6 caracteres.");
      return;
    }
    if (password !== confirm) {
      toast.error("As senhas não coincidem.");
      return;
    }
    if (!USE_MOCK_AUTH || !supabaseMod) {
      toast.error(
        "Redefinição de senha via link ainda não está disponível. Procure o administrador do seu tenant.",
      );
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabaseMod.supabase.auth.updateUser({ password });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Senha atualizada com sucesso.");
      navigate({ to: "/" });
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

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Redefinir senha</h1>
          <p className="text-sm text-muted-foreground">
            {!USE_MOCK_AUTH
              ? "Redefinição via link ainda não está disponível. Procure o administrador do seu tenant."
              : ready
                ? "Defina uma nova senha para acessar sua conta."
                : "Validando link de recuperação…"}
          </p>
          {!USE_MOCK_AUTH && (
            <Button asChild variant="ghost" className="w-full">
              <Link to="/login">Voltar para o login</Link>
            </Button>
          )}
        </div>

        {USE_MOCK_AUTH && (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Nova senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                disabled={!ready}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirmar senha</Label>
              <Input
                id="confirm"
                type="password"
                placeholder="••••••••"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                disabled={!ready}
              />
            </div>
            <Button type="submit" className="w-full" disabled={!ready || loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando…
                </>
              ) : (
                "Atualizar senha"
              )}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
