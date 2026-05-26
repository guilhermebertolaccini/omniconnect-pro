import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { isAuthenticated, loading, tenant, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate({ to: "/login", replace: true });
    }
  }, [loading, isAuthenticated, navigate]);

  if (loading || !isAuthenticated) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <div className="text-sm text-muted-foreground">Carregando…</div>
      </div>
    );
  }

  if (!tenant.id) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-4">
        <div className="max-w-md space-y-4 text-center">
          <h1 className="text-xl font-semibold tracking-tight">Empresa não configurada</h1>
          <p className="text-sm text-muted-foreground">
            Sua conta não está associada a uma empresa ativa. Solicite a configuração do acesso
            antes de continuar.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              void logout().finally(() => navigate({ to: "/login", replace: true }));
            }}
          >
            Sair
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex flex-1 flex-col">
          <AppHeader />
          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
            <Outlet />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
