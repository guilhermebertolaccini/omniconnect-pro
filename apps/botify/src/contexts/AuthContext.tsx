import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { wpApi } from '@/services/wordpress-api';
import {
  bootstrapSession,
  getBotifyAuthSource,
  getAuthState,
  signIn as omniSignIn,
  signOut as omniSignOut,
  subscribe,
} from '@/lib/omniconnectClient';
import type { LoginCredentials } from '@/types/api';

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
  authSource: 'wordpress' | 'omniconnect';
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const USER_KEY = 'botflow_user';

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const authSource = getBotifyAuthSource();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const mapOmniUser = useCallback(
    (u: { id: number; name: string; email: string; role: string }): User => ({
      id: String(u.id),
      username: u.email,
      email: u.email,
      displayName: u.name,
      role: u.role,
    }),
    [],
  );

  const clearSession = useCallback(() => {
    if (authSource === 'wordpress') {
      wpApi.clearTokens();
    }
    setUser(null);
    localStorage.removeItem(USER_KEY);
  }, [authSource]);

  useEffect(() => {
    if (authSource === 'wordpress') {
      return wpApi.onAuthFailure(() => clearSession());
    }
    return subscribe((s) => {
      if (s.status === 'anonymous') {
        setUser(null);
        localStorage.removeItem(USER_KEY);
      } else if (s.user) {
        const mapped = mapOmniUser(s.user);
        setUser(mapped);
        localStorage.setItem(USER_KEY, JSON.stringify(mapped));
      }
    });
  }, [authSource, clearSession, mapOmniUser]);

  useEffect(() => {
    const load = async () => {
      try {
        if (authSource === 'omniconnect') {
          const booted = await bootstrapSession();
          if (booted) {
            setUser(mapOmniUser(booted));
            localStorage.setItem(USER_KEY, JSON.stringify(mapOmniUser(booted)));
          } else {
            clearSession();
          }
          return;
        }

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

    load();
  }, [authSource, clearSession, mapOmniUser]);

  const login = useCallback(
    async (credentials: LoginCredentials) => {
      setIsLoading(true);
      try {
        if (authSource === 'omniconnect') {
          const email = credentials.email?.trim() || credentials.username.trim();
          const omniUser = await omniSignIn(email, credentials.password);
          const userData = mapOmniUser(omniUser);
          setUser(userData);
          localStorage.setItem(USER_KEY, JSON.stringify(userData));
          return;
        }

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
    },
    [authSource, mapOmniUser],
  );

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      if (authSource === 'omniconnect') {
        await omniSignOut();
      } else {
        try {
          await wpApi.logout();
        } catch (error) {
          console.error('Logout API error:', error);
        }
      }
    } finally {
      clearSession();
      setIsLoading(false);
    }
  }, [authSource, clearSession]);

  const refreshUser = useCallback(async () => {
    if (authSource === 'omniconnect') {
      const s = getAuthState();
      if (s.user) {
        setUser(mapOmniUser(s.user));
        return;
      }
      clearSession();
      return;
    }

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
  }, [authSource, clearSession, mapOmniUser]);

  const isAuthenticated =
    authSource === 'omniconnect'
      ? !!user && getAuthState().status === 'authenticated'
      : !!user && wpApi.isAuthenticated();

  const value: AuthContextType = {
    user,
    isAuthenticated,
    isLoading,
    authSource,
    login,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
