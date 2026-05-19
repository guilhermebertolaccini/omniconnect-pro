import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { UserMenu } from './UserMenu';
import {
  Bot,
  LayoutDashboard,
  MessageSquare,
  GitBranch,
  Settings,
  Activity,
  Phone,
  Smartphone,
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Bots', href: '/bots', icon: Bot },
  { name: 'Chips WhatsApp', href: '/chips', icon: Smartphone },
  { name: 'Fluxos', href: '/flows', icon: GitBranch },
  { name: 'Mensagens', href: '/messages', icon: MessageSquare },
  { name: 'Saúde das Linhas', href: '/health', icon: Activity },
  { name: 'Configurações', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const location = useLocation();

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-sidebar-border bg-sidebar">
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
            <Phone className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-sidebar-foreground">BotFlow</h1>
            <p className="text-xs text-muted-foreground">WhatsApp Manager</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href || 
              (item.href !== '/' && location.pathname.startsWith(item.href));
            
            return (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* User Menu Footer */}
        <div className="border-t border-sidebar-border p-3">
          <UserMenu />
        </div>
      </div>
    </aside>
  );
}
