import { ReactNode, useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        collapsed={collapsed}
        onCollapsedChange={setCollapsed}
        mobileOpen={mobileOpen}
        onMobileOpenChange={setMobileOpen}
      />
      {/* Desktop offset */}
      <div
        className={`hidden md:block transition-all duration-300 ${collapsed ? 'md:pl-16' : 'md:pl-64'}`}
      >
        <Header onMenuClick={() => setMobileOpen(true)} />
        <main className="p-6">{children}</main>
      </div>
      {/* Mobile: no offset */}
      <div className="block md:hidden">
        <Header onMenuClick={() => setMobileOpen(true)} />
        <main className="p-4">{children}</main>
      </div>
    </div>
  );
}
