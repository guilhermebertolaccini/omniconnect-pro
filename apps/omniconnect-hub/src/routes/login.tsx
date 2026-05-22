import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Hexagon, Loader2 } from "lucide-react";

// Google OAuth ainda não está exposto no backend Omni para login de
// utilizador (ADR-0003 — OAuth backend é só para ad platforms). O botão
// social abaixo é mantido apenas no caminho mock (Lovable preview).
const USE_MOCK_AUTH = import.meta.env.VITE_USE_MOCK_AUTH === "true";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Entrar — OmniconnectPRO" },
      {
        name: "description",
        content: "Acesse a plataforma OmniconnectPRO com seu e-mail corporativo.",
      },
    ],
  }),
  component: LoginPage,
});

type Mode = "signin" | "signup";

function LoginPage() {
  const { login, signup } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    if (mode === "signup" && !fullName.trim()) {
      toast.error("Informe seu nome completo.");
      return;
    }
    setLoading(true);
    const result =
      mode === "signin"
        ? await login(email, password)
        : await signup(email, password, fullName.trim());
    setLoading(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }
    if (mode === "signup") {
      toast.success("Conta criada! Verifique seu e-mail para confirmar o acesso.");
      setMode("signin");
      return;
    }
    navigate({ to: "/" });
  };

  const onGoogle = async () => {
    if (!USE_MOCK_AUTH) {
      toast.info(
        "Login com Google ainda não está disponível. Use seu e-mail corporativo.",
      );
      return;
    }
    setGoogleLoading(true);
    try {
      // Import dinâmico mantém `@/integrations/lovable` fora do bundle de
      // produção (só carrega quando o flag mock está ligado).
      const { lovable } = await import("@/integrations/lovable");
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        toast.error(result.error.message ?? "Falha ao entrar com Google");
        return;
      }
      if (result.redirected) return;
      navigate({ to: "/" });
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <aside className="relative hidden overflow-hidden bg-sidebar text-sidebar-foreground lg:flex lg:flex-col lg:justify-between p-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(circle at 20% 20%, oklch(0.4 0.15 260) 0%, transparent 60%), radial-gradient(circle at 80% 80%, oklch(0.35 0.12 220) 0%, transparent 55%)",
          }}
        />
        <div className="relative flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Hexagon className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold tracking-tight">OmniconnectPRO</span>
        </div>
        <div className="relative max-w-md space-y-4">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">
            Uma plataforma. Todos os módulos.
          </h1>
          <p className="text-base text-sidebar-foreground/70">
            CRM, conversas, mídia paga, automações e inteligência analítica em um
            único ambiente, com login único e controle por perfil.
          </p>
          <ul className="grid gap-2 pt-4 text-sm text-sidebar-foreground/80">
            <li>· CRM Imobiliário</li>
            <li>· OmniHub Conversas</li>
            <li>· Ads Manager · AdpilotAI</li>
            <li>· Botify · InsightAI · Painel Executivo</li>
          </ul>
        </div>
        <p className="relative text-xs text-sidebar-foreground/50">
          © {new Date().getFullYear()} OmniconnectPRO
        </p>
      </aside>

      {/* Form panel */}
      <section className="flex flex-col items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-sm space-y-8">
          <div className="lg:hidden flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Hexagon className="h-4 w-4" />
            </div>
            <span className="text-base font-semibold">OmniconnectPRO</span>
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-semibold tracking-tight">
              {mode === "signin" ? "Acesse sua conta" : "Crie sua conta"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {mode === "signin"
                ? "Entre com seu e-mail corporativo para continuar."
                : "Cadastre-se e comece a usar o OmniconnectPRO."}
            </p>
          </div>

          {USE_MOCK_AUTH && (
            <>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={googleLoading}
                onClick={onGoogle}
              >
                {googleLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <GoogleIcon />
                )}
                Continuar com Google
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    ou
                  </span>
                </div>
              </div>
            </>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            {mode === "signup" && (
              <div className="space-y-2">
                <Label htmlFor="name">Nome completo</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Seu nome"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  autoComplete="name"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="voce@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Senha</Label>
                {mode === "signin" && (
                  <Link
                    to="/forgot-password"
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Esqueci minha senha
                  </Link>
                )}
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {mode === "signin" ? "Entrando…" : "Criando…"}
                </>
              ) : mode === "signin" ? (
                "Entrar"
              ) : (
                "Criar conta"
              )}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            {mode === "signin" ? (
              <>
                Não tem conta?{" "}
                <button
                  type="button"
                  onClick={() => setMode("signup")}
                  className="font-medium text-primary hover:underline"
                >
                  Cadastre-se
                </button>
              </>
            ) : (
              <>
                Já tem conta?{" "}
                <button
                  type="button"
                  onClick={() => setMode("signin")}
                  className="font-medium text-primary hover:underline"
                >
                  Entrar
                </button>
              </>
            )}
          </p>
        </div>
      </section>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg
      className="mr-2 h-4 w-4"
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8a12 12 0 1 1 7.9-21l5.7-5.7A20 20 0 1 0 24 44a20 20 0 0 0 19.6-23.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8A12 12 0 0 1 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7A20 20 0 0 0 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.3l-6.2-5.2A12 12 0 0 1 12.7 28l-6.6 5.1A20 20 0 0 0 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3a12 12 0 0 1-4.1 5.5l6.2 5.2c-.4.4 6.6-4.8 6.6-14.7 0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}
