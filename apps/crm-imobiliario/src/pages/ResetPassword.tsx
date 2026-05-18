import { useNavigate } from "react-router-dom";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function ResetPassword() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <Building2 className="h-10 w-10 text-primary" />
            <h1 className="text-2xl font-display font-extrabold">Redefinir senha</h1>
          </div>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4 text-center">
              <p className="text-sm text-muted-foreground">
                A redefinição automática de senha por email ainda não está
                disponível no backend Omniconnect. Por enquanto, solicite ao
                administrador do tenant um novo convite ou uma redefinição
                manual de acesso.
              </p>
              <Button className="w-full" onClick={() => navigate("/auth", { replace: true })}>
                Voltar para login
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
