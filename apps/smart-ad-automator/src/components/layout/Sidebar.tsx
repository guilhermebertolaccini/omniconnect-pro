import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  BarChart3,
  FileText,
  Settings,
  Users,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Image,
  TrendingUp,
  Layers,
  LineChart,
  Building2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useAuth } from '@/hooks/useAuth';

const navItems = [
  { icon: Layers, label: 'Visão Unificada', path: '/unified' },
  { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
  { icon: BarChart3, label: 'Campanhas', path: '/campaigns' },
  { icon: LineChart, label: 'Análise de Mídia', path: '/media-analysis' },
  { icon: Image, label: 'Publicações', path: '/posts' },
  { icon: Sparkles, label: 'Análise IA', path: '/ai-analysis' },
  { icon: FileText, label: 'Relatórios', path: '/reports' },
  { icon: Users, label: 'Contas', path: '/accounts' },
  { icon: Settings, label: 'Configurações', path: '/settings' },
];

const superAdminItems = [
  { icon: Building2, label: 'Agências', path: '/super-admin/agencies' },
];

interface SidebarProps {
  collapsed: boolean;
  onCollapsedChange: (v: boolean) => void;
  mobileOpen: boolean;
  onMobileOpenChange: (v: boolean) => void;
}

function NavContent({
  collapsed,
  onCollapsedChange,
  onClose,
}: {
  collapsed?: boolean;
  onCollapsedChange?: (v: boolean) => void;
  onClose?: () => void;
}) {
  const location = useLocation();
  const { roles } = useAuth();
  const isSuperAdmin = roles.includes('super_admin');
  const items = isSuperAdmin ? [...navItems, ...superAdminItems] : navItems;

  return (
    <>
      {/* Logo */}
      <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
        <Link
          to="/"
          className="flex items-center gap-2"
          onClick={onClose}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-primary">
            <TrendingUp className="h-5 w-5 text-white" />
          </div>
          {!collapsed && (
            <span className="text-lg font-bold text-sidebar-primary-foreground">
              AdPilot<span className="text-primary">AI</span>
            </span>
          )}
        </Link>
        {onClose && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-sidebar-foreground hover:bg-sidebar-accent"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-3">
        {items.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={onClose}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
              )}
            >
              <item.icon
                className={cn('h-5 w-5 shrink-0', isActive && 'text-primary')}
              />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Collapse Button — desktop only */}
      {onCollapsedChange && (
        <div className="border-t border-sidebar-border p-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onCollapsedChange(!collapsed)}
            className="w-full justify-center text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4" />
                <span className="ml-2">Recolher</span>
              </>
            )}
          </Button>
        </div>
      )}
    </>
  );
}

export function Sidebar({
  collapsed,
  onCollapsedChange,
  mobileOpen,
  onMobileOpenChange,
}: SidebarProps) {
  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-40 hidden md:flex h-screen flex-col border-r border-sidebar-border bg-sidebar-background transition-all duration-300',
          collapsed ? 'w-16' : 'w-64'
        )}
      >
        <NavContent
          collapsed={collapsed}
          onCollapsedChange={onCollapsedChange}
        />
      </aside>

      {/* Mobile drawer */}
      <Sheet open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <SheetContent
          side="left"
          className="w-64 p-0 bg-sidebar-background border-sidebar-border"
        >
          <div className="flex h-full flex-col">
            <NavContent onClose={() => onMobileOpenChange(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
