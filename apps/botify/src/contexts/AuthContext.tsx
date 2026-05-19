import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { wpApi } from '@/services/wordpress-api';
import type { LoginCredentials } from '@/types/api';

// ============= Types =============

interface User {
  id: string;
  username: string;
  email: string;
  displayName: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

// ============= Context =============

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ============= Storage Keys =============

const USER_KEY = 'botflow_user';

// ============= Provider =============

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const clearSession = useCallback(() => {
    wpApi.clearTokens();
    setUser(null);
    localStorage.removeItem(USER_KEY);
  }, []);

  useEffect(() => {
    return wpApi.onAuthFailure(() => {
      clearSession();
    });
  }, [clearSession]);

  // Load user from storage on mount
  useEffect(() => {
    const loadStoredUser = async () => {
      try {
        const storedUser = localStorage.getItem(USER_KEY);
        if (storedUser && wpApi.isAuthenticated()) {
          const me = await wpApi.getCurrentUser();
          const normalized: User = {
            id: String(me.id),
            username: me.email,
            email: me.email,
            displayName: me.display_name || me.email,
            role: me.roles?.[0] || 'admin',
          };
          setUser(normalized);
          localStorage.setItem(USER_KEY, JSON.stringify(normalized));
        } else {
          clearSession();
        }
      } catch (error) {
        console.error('Error loading stored user:', error);
        clearSession();
      } finally {
        setIsLoading(false);
      }
    };

    loadStoredUser();
  }, [clearSession]);

  // Login function
  const login = useCallback(async (credentials: LoginCredentials) => {
    setIsLoading(true);
    
    try {
      await wpApi.login(credentials);
      const me = await wpApi.getCurrentUser();
      const userData: User = {
        id: String(me.id),
        username: credentials.username,
        email: me.email,
        displayName: me.display_name || credentials.username,
        role: me.roles?.[0] || 'admin',
      };
      
      setUser(userData);
      localStorage.setItem(USER_KEY, JSON.stringify(userData));
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Logout function
  const logout = useCallback(async () => {
    setIsLoading(true);
    
    try {
      await wpApi.logout();
    } catch (error) {
      // Continue with logout even if API call fails
      console.error('Logout API error:', error);
    } finally {
      clearSession();
      setIsLoading(false);
    }
  }, [clearSession]);

  // Refresh user data
  const refreshUser = useCallback(async () => {
    if (!wpApi.isAuthenticated()) {
      clearSession();
      return;
    }

    try {
      const me = await wpApi.getCurrentUser();
      const storedUser = localStorage.getItem(USER_KEY);
      const parsed = storedUser ? (JSON.parse(storedUser) as Partial<User>) : null;
      const refreshedUser: User = {
        id: String(me.id),
        username: parsed?.username || me.email,
        email: me.email,
        displayName: me.display_name || parsed?.displayName || me.email,
        role: me.roles?.[0] || 'admin',
      };
      setUser(refreshedUser);
      localStorage.setItem(USER_KEY, JSON.stringify(refreshedUser));
    } catch {
      clearSession();
    }
  }, [clearSession]);

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user && wpApi.isAuthenticated(),
    isLoading,
    login,
    logout,
    refreshUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// ============= Hook =============

export function useAuth() {
  const context = useContext(AuthContext);
  
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  
  return context;
}
