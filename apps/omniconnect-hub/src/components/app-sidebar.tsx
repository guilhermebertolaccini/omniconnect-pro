import { Link, useRouterState } from "@tanstack/react-router";
import {
  Hexagon,
  LayoutDashboard,
  Grid3x3,
  Building2,
  MessagesSquare,
  Megaphone,
  Bot,
  Sparkles,
  LineChart,
  UsersRound,
  Workflow,
  Settings,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth-context";
import { hasModuleAccess, type ModuleId } from "@/lib/permissions";

type NavItem = {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  moduleId?: ModuleId;
};

const PLATFORM_ITEMS: NavItem[] = [
  { title: "Home", url: "/", icon: LayoutDashboard },
  { title: "Módulos", url: "/modules", icon: Grid3x3 },
  { title: "Configurações", url: "/settings/brokers", icon: Settings },
];

const MODULE_ITEMS: NavItem[] = [
  { title: "Leads 360°", url: "/leads", icon: UsersRound, moduleId: "leads" },
  { title: "Régua de Acionamento", url: "/journeys", icon: Workflow, moduleId: "journeys" },
  { title: "CRM Imobiliário", url: "/crm", icon: Building2, moduleId: "crm" },
  { title: "OmniHub", url: "/omnihub", icon: MessagesSquare, moduleId: "omnihub" },
  { title: "Ads Manager", url: "/ads", icon: Megaphone, moduleId: "ads" },
  { title: "Botify", url: "/botify", icon: Bot, moduleId: "botify" },
  { title: "InsightAI", url: "/insightai", icon: Sparkles, moduleId: "insightai" },
  { title: "Painel Executivo", url: "/executive", icon: LineChart, moduleId: "executive" },
];

export function AppSidebar() {
  const { role, tenant } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (url: string) =>
    url === "/" ? path === "/" : path.startsWith(url);

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="border-b border-sidebar-border/60 px-4 py-4">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
            <Hexagon className="h-4 w-4" />
          </div>
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold">OmniconnectPRO</span>
            <span className="text-xs text-sidebar-foreground/60">{tenant.name}</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Plataforma</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {PLATFORM_ITEMS.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                    <Link to={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Módulos</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {MODULE_ITEMS.map((item) => {
                const allowed = !item.moduleId || hasModuleAccess(role, item.moduleId);
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.url)}
                      tooltip={item.title}
                      className={!allowed ? "opacity-50" : ""}
                    >
                      <Link to={item.url}>
                        <item.icon className="h-4 w-4" />
                        <span className="flex-1">{item.title}</span>
                        {!allowed && (
                          <span className="ml-auto text-[10px] uppercase tracking-wide text-sidebar-foreground/50">
                            sem acesso
                          </span>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/60 px-4 py-3 text-[11px] text-sidebar-foreground/50 group-data-[collapsible=icon]:hidden">
        Versão 1.0 · OmniconnectPRO
      </SidebarFooter>
    </Sidebar>
  );
}
