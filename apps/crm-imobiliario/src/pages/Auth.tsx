import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Loader2 } from "lucide-react";
import { z } from "zod";
import {
  signIn,
  signUp,
  OmniconnectError,
} from "@/lib/omniconnectClient";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

const emailSchema = z.string().trim().email("invalid_email").max(255);
const passwordSchema = z.string().min(6, "password_min").max(72);
const nameSchema = z.string().trim().min(2, "name_short").max(100);
const tenantSchema = z.string().trim().min(2, "tenant_short").max(120);

export default function AuthPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const { locale, setLocale, t } = useI18n();
  const [busy, setBusy] = useState(false);

  // Login
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Signup
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupTenant, setSignupTenant] = useState("");

  useEffect(() => {
    if (!loading && session) navigate("/", { replace: true });
  }, [session, loading, navigate]);

  const mapZodError = (code: string) => {
    if (code === "invalid_email") return t("authInvalidEmail");
    if (code === "password_min") return t("authPasswordMin");
    if (code === "name_short") return t("authNameShort");
    if (code === "tenant_short") return "Nome da empresa muito curto.";
    return code;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      emailSchema.parse(loginEmail);
      passwordSchema.parse(loginPassword);
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast.error(mapZodError(err.issues[0].message));
        return;
      }
    }
    setBusy(true);
    try {
      await signIn(loginEmail, loginPassword);
      navigate("/", { replace: true });
    } catch (err) {
      const msg =
        err instanceof OmniconnectError && err.status === 401
          ? t("authBadCreds")
          : err instanceof Error
            ? err.message
            : t("authBadCreds");
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      nameSchema.parse(signupName);
      emailSchema.parse(signupEmail);
      passwordSchema.parse(signupPassword);
      tenantSchema.parse(signupTenant);
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast.error(mapZodError(err.issues[0].message));
        return;
      }
    }
    setBusy(true);
    try {
      await signUp({
        name: signupName,
        email: signupEmail,
        password: signupPassword,
        tenantName: signupTenant,
      });
      toast.success(t("authSignupOk"));
      navigate("/", { replace: true });
    } catch (err) {
      if (err instanceof OmniconnectError && err.status === 409) {
        toast.error(t("authEmailExists"));
      } else {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setBusy(false);
    }
  };

  const handleForgot = () => {
    // O backend novo ainda não expõe `/auth/password-reset` — ver
    // sprint-3-1-crm-frontend.md (item "deferred"). Mostramos o
    // caminho manual enquanto o endpoint não existe.
    toast.info(
      "Para redefinir sua senha, peça a um administrador do tenant para usar /tenant-invitations.",
    );
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <Building2 className="h-10 w-10 text-primary" />
            <h1 className="text-3xl font-display font-extrabold tracking-tight text-foreground">
              Tática Real Estate OS
            </h1>
          </div>
          <button
            onClick={() => setLocale(locale === "pt-BR" ? "en" : "pt-BR")}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {locale === "pt-BR" ? "🇺🇸 English" : "🇧🇷 Português"}
          </button>
        </div>

        <Card>
          <CardContent className="pt-6">
            <Tabs defaultValue="login">
              <TabsList className="grid grid-cols-2 w-full mb-4">
                <TabsTrigger value="login">{t("authSignIn")}</TabsTrigger>
                <TabsTrigger value="signup">{t("authSignUp")}</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">{t("authEmail")}</Label>
                    <Input
                      id="login-email"
                      type="email"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      autoComplete="email"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label htmlFor="login-password">{t("authPassword")}</Label>
                      <button
                        type="button"
                        onClick={handleForgot}
                        className="text-xs text-primary hover:underline"
                      >
                        {t("authForgot")}
                      </button>
                    </div>
                    <Input
                      id="login-password"
                      type="password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      autoComplete="current-password"
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {t("authSignIn")}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignup} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">{t("authFullName")}</Label>
                    <Input
                      id="signup-name"
                      value={signupName}
                      onChange={(e) => setSignupName(e.target.value)}
                      autoComplete="name"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-tenant">Nome da empresa</Label>
                    <Input
                      id="signup-tenant"
                      value={signupTenant}
                      onChange={(e) => setSignupTenant(e.target.value)}
                      autoComplete="organization"
                      placeholder="Tática Marketing"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">{t("authEmail")}</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      autoComplete="email"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">{t("authPassword")}</Label>
                    <Input
                      id="signup-password"
                      type="password"
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      autoComplete="new-password"
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {t("authCreateAccount")}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
