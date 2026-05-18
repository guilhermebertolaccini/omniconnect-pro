import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

interface RequireAuthProps {
  children: ReactNode;
  type: 'admin' | 'client' | 'super_admin';
}

export function RequireAuth({ children, type }: RequireAuthProps) {
  const { user, loading, roles } = useAuth();
  const role = roles[0] ?? null;
  const isSuperAdmin = roles.includes('super_admin');
  const isAdmin = roles.includes('admin') || isSuperAdmin;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) {
    const loginPath = type === 'client' ? '/client-login' : '/login';
    return <Navigate to={loginPath} replace />;
  }

  if (type === 'super_admin') {
    if (roles.length === 0) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      );
    }
    if (!isSuperAdmin) return <Navigate to="/" replace />;
  }

  if (type === 'admin' && !isAdmin) {
    if (roles.length === 0) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      );
    }
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
