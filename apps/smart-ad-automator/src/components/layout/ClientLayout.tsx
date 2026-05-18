import { ReactNode, useState, useEffect } from 'react';
import { TrendingUp, Moon, Sun, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

interface ClientLayoutProps {
  children: ReactNode;
  businessName?: string;
  agencyName?: string;
}

export function ClientLayout({
  children,
  businessName,
  agencyName = 'AdPilot Agency',
}: ClientLayoutProps) {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const navigate = useNavigate();

  const handleLogout = () => {
    sessionStorage.removeItem('adpilot_client');
    navigate('/client-login');
  };

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
  }, [theme]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-primary shadow-lg shadow-primary/20">
              <TrendingUp className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold leading-tight">
                {businessName ?? 'Minha Empresa'}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Powered by <span className="font-semibold text-primary">AdPilot</span><span className="font-semibold text-accent">AI</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 px-4 py-6">
        <div className="mx-auto max-w-2xl">{children}</div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border px-4 py-4 text-center">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-1.5">
          <div className="flex items-center gap-1.5">
            <div className="flex h-5 w-5 items-center justify-center rounded-md bg-gradient-primary">
              <TrendingUp className="h-3 w-3 text-white" />
            </div>
            <span className="text-xs font-semibold">
              <span className="text-primary">AdPilot</span><span className="text-accent">AI</span>
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Gerenciado por{' '}
            <span className="font-medium text-foreground">{agencyName}</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
