import { useEffect, useMemo } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  Bell,
  Check,
  ChevronsUpDown,
  Globe,
  LogOut,
  Search,
  ShieldAlert,
  UserCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { ROLE_LABELS, type Role } from "@/lib/permissions";
import { NOTIFICATIONS } from "@/lib/mock-data";
import { getLineHealthAlerts, type LineHealthAlertSeverity } from "@/lib/line-health-alerts";
import { cn } from "@/lib/utils";

const ENABLE_DEMO_ROLE_SWITCHER =
  import.meta.env.VITE_USE_MOCK_AUTH === "true" || import.meta.env.VITE_USE_MOCK_DATA === "true";
const ENABLE_DEMO_NOTIFICATIONS = import.meta.env.VITE_USE_MOCK_DATA === "true";

const ROLES: Role[] = [
  "corretor",
  "atendente",
  "gestor_comercial",
  "analista_agencia",
  "ceo_cfo",
  "admin",
];

const LANGS = [
  { code: "pt-BR", label: "Português (BR)" },
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
] as const;

function SeverityDot({ severity }: { severity: LineHealthAlertSeverity }) {
  const Icon =
    severity === "critical" ? ShieldAlert : severity === "warning" ? AlertTriangle : Activity;
  const cls =
    severity === "critical"
      ? "bg-destructive/15 text-destructive"
      : severity === "warning"
        ? "bg-amber-100 text-amber-800"
        : "bg-secondary text-foreground";
  return (
    <div className={cn("mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md", cls)}>
      <Icon className="h-3.5 w-3.5" />
    </div>
  );
}

export function AppHeader() {
  const navigate = useNavigate();
  const { user, role, tenant, tenants, language, logout, switchTenant, switchRole, setLanguage } =
    useAuth();

  const lineAlerts = useMemo(() => (ENABLE_DEMO_NOTIFICATIONS ? getLineHealthAlerts() : []), []);
  const demoNotifications = ENABLE_DEMO_NOTIFICATIONS ? NOTIFICATIONS : [];
  const totalNotifications = lineAlerts.length + demoNotifications.length;

  // Toast automático na primeira aparição da sessão para cada alerta crítico/warning.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const KEY = "line-health-alerts-seen";
    let seen: Set<string>;
    try {
      seen = new Set<string>(JSON.parse(sessionStorage.getItem(KEY) ?? "[]"));
    } catch {
      seen = new Set();
    }
    const fresh = lineAlerts.filter((a) => !seen.has(a.id));
    if (fresh.length === 0) return;

    fresh.forEach((a) => {
      const fn = a.severity === "critical" ? toast.error : toast.warning;
      fn(a.title, {
        description: a.detail,
        action: {
          label: "Abrir auditoria",
          onClick: () => navigate({ to: "/settings/audit" }),
        },
      });
      seen.add(a.id);
    });
    sessionStorage.setItem(KEY, JSON.stringify(Array.from(seen)));
  }, [lineAlerts, navigate]);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-4">
      <SidebarTrigger className="text-foreground" />

      {/* Tenant switcher */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-2 pl-1.5 pr-2 sm:pl-2 sm:pr-3"
            aria-label={`Empresa ativa: ${tenant.name}. Trocar empresa`}
          >
            <div className="grid h-6 w-6 place-items-center rounded bg-primary/10 text-[10px] font-semibold text-primary">
              {tenant.initials}
            </div>
            <span className="hidden max-w-[160px] truncate font-medium sm:inline">
              {tenant.name}
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>Trocar empresa</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {tenants.map((t) => {
            const active = t.id === tenant.id;
            return (
              <DropdownMenuItem
                key={t.id}
                onClick={() => {
                  if (active) return;
                  switchTenant(t.id);
                  toast.success(`Empresa ativa: ${t.name}`);
                }}
                className="gap-2"
              >
                <div className="grid h-6 w-6 place-items-center rounded bg-muted text-[10px] font-semibold text-muted-foreground">
                  {t.initials}
                </div>
                <span className="flex-1 truncate">{t.name}</span>
                {active && <Check className="h-4 w-4 text-primary" />}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Global search */}
      <div className="relative ml-2 hidden flex-1 md:block max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Buscar leads, conversas, módulos…" className="h-9 pl-9" />
      </div>
      <div className="flex-1 md:hidden" />

      {/* Role switcher is available only in explicit demo/preview modes. */}
      {ENABLE_DEMO_ROLE_SWITCHER ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-9 gap-2">
              <Badge variant="secondary" className="font-normal">
                {ROLE_LABELS[role]}
              </Badge>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Visualizar como (demo)</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {ROLES.map((r) => (
              <DropdownMenuItem key={r} onClick={() => switchRole(r)}>
                <span className="flex-1">{ROLE_LABELS[r]}</span>
                {r === role && <Check className="h-4 w-4 text-primary" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Badge variant="secondary" className="font-normal">
          {ROLE_LABELS[role]}
        </Badge>
      )}

      {/* Language */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-9 w-9">
            <Globe className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {LANGS.map((l) => (
            <DropdownMenuItem key={l.code} onClick={() => setLanguage(l.code)}>
              <span className="flex-1">{l.label}</span>
              {l.code === language && <Check className="h-4 w-4 text-primary" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Notifications */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative h-9 w-9"
            aria-label={
              totalNotifications > 0 ? `Notificações: ${totalNotifications}` : "Notificações"
            }
          >
            <Bell className="h-4 w-4" />
            {totalNotifications > 0 && (
              <span
                className={cn(
                  "absolute right-2 top-2 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-medium",
                  lineAlerts.some((a) => a.severity === "critical")
                    ? "bg-destructive text-destructive-foreground"
                    : lineAlerts.length > 0
                      ? "bg-amber-500 text-white"
                      : "bg-destructive text-destructive-foreground",
                )}
              >
                {totalNotifications}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-96 p-0">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <p className="text-sm font-semibold">Notificações</p>
            {lineAlerts.length > 0 && (
              <Badge variant="outline" className="gap-1 text-[10px]">
                <Activity className="h-3 w-3" /> {lineAlerts.length} saúde de linha
              </Badge>
            )}
          </div>
          <ul className="max-h-96 divide-y overflow-auto">
            {lineAlerts.map((a) => (
              <li key={a.id}>
                <Link
                  to="/settings/audit"
                  className="flex items-start gap-2 px-4 py-3 hover:bg-muted/50"
                >
                  <SeverityDot severity={a.severity} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium leading-tight">{a.title}</p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{a.detail}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{a.time}</p>
                  </div>
                </Link>
              </li>
            ))}
            {demoNotifications.map((n, i) => (
              <li key={`base-${i}`} className="px-4 py-3 hover:bg-muted/50">
                <p className="text-sm font-medium leading-tight">{n.title}</p>
                <p className="text-xs text-muted-foreground">{n.time}</p>
              </li>
            ))}
            {totalNotifications === 0 && (
              <li className="px-4 py-6 text-center text-xs text-muted-foreground">
                Sem notificações.
              </li>
            )}
          </ul>
        </PopoverContent>
      </Popover>

      {/* User menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-9 gap-2 pl-1.5 pr-2">
            <div
              className="grid h-7 w-7 place-items-center rounded-full text-xs font-semibold text-primary-foreground"
              style={{ backgroundColor: user.avatarColor || "var(--primary)" }}
            >
              {user.name.charAt(0).toUpperCase()}
            </div>
            <span className="hidden text-sm font-medium sm:inline">{user.name}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <div className="flex flex-col">
              <span className="text-sm font-medium">{user.name}</span>
              <span className="text-xs font-normal text-muted-foreground">{user.email}</span>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            <UserCircle2 className="mr-2 h-4 w-4" /> Meu perfil
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              logout();
              navigate({ to: "/login" });
            }}
          >
            <LogOut className="mr-2 h-4 w-4" /> Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
