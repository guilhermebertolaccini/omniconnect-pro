import { Building2, LayoutDashboard, Home, LogOut, Briefcase, Users, DollarSign, FileText, ScrollText, CreditCard, MessageSquare, Megaphone, ExternalLink, Bug, Bell, Mail } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/i18n/useI18n";
import { getOmniHubUrl, getAdsManagerUrl } from "@/lib/externalApps";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";

export function AppSidebar() {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  const navItems = [
    { title: t("dashboard"), url: "/", icon: LayoutDashboard },
    { title: t("properties"), url: "/properties", icon: Building2 },
    { title: t("clients"), url: "/clients", icon: Users },
    { title: t("proposals"), url: "/proposals", icon: FileText },
    { title: t("contracts"), url: "/contracts", icon: ScrollText },
    { title: t("payments"), url: "/payments", icon: CreditCard },
    { title: t("financial"), url: "/financial", icon: DollarSign },
    { title: "CRM", url: "/crm", icon: Briefcase },
  ];

  if (user?.role === "admin") {
    navItems.push({ title: "Backlog de Erros", url: "/admin/errors", icon: Bug });
    navItems.push({ title: "Envios de e-mail", url: "/admin/emails", icon: Mail });
  }
  navItems.push({ title: "Notificações", url: "/settings/notifications", icon: Bell });

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarContent className="pt-4">
        <SidebarGroup>
          <div className={`flex items-center gap-2 px-4 mb-6 ${collapsed ? "justify-center" : ""}`}>
            <Home className="h-7 w-7 text-sidebar-primary shrink-0" />
            {!collapsed && (
              <span className="text-lg font-display font-extrabold text-sidebar-primary tracking-tight">
                Tática
              </span>
            )}
          </div>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="hover:bg-sidebar-accent"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className={collapsed ? "sr-only" : ""}>{t("platforms")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <a href={getOmniHubUrl()} target="_blank" rel="noopener noreferrer" className="hover:bg-sidebar-accent flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 shrink-0" />
                    {!collapsed && <span className="flex-1">OmniHub</span>}
                    {!collapsed && <ExternalLink className="h-3 w-3 text-muted-foreground" />}
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <a href={getAdsManagerUrl()} target="_blank" rel="noopener noreferrer" className="hover:bg-sidebar-accent flex items-center gap-2">
                    <Megaphone className="h-4 w-4 shrink-0" />
                    {!collapsed && <span className="flex-1">Ads Manager</span>}
                    {!collapsed && <ExternalLink className="h-3 w-3 text-muted-foreground" />}
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4">
        {user && !collapsed && (
          <div className="flex items-center gap-3 mb-3">
            <div className="h-8 w-8 rounded-full bg-sidebar-accent flex items-center justify-center text-sidebar-accent-foreground text-sm font-semibold">
              {user.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-primary truncate">{user.name}</p>
              <p className="text-xs text-sidebar-foreground capitalize">{user.role}</p>
            </div>
          </div>
        )}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={logout} className="hover:bg-sidebar-accent">
              <LogOut className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{t("logout")}</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
