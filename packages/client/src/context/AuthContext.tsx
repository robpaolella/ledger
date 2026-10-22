import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { apiFetch, ApiError } from '../lib/api';

interface User {
  id: number;
  username: string;
  displayName: string;
  role: 'owner' | 'admin' | 'member';
  permissions: Record<string, boolean>;
  twofaEnabled?: boolean;
  twofaSetupRequired?: boolean;
}

interface LoginResult {
  requiresTwoFA?: boolean;
  tempToken?: string;
  twofaSetupRequired?: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<LoginResult>;
  verify2FA: (tempToken: string, code: string, isBackupCode?: boolean) => Promise<void>;
  logout: () => void;
  isAdmin: () => boolean;
  isOwner: () => boolean;
  hasPermission: (permission: string) => boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [isLoading, setIsLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    const res = await apiFetch<{ data: User }>('/auth/me');
    setUser(res.data);
  }, []);

  // Validate existing token on mount
  useEffect(() => {
    if (!token) {
      setIsLoading(false);
      return;
    }

    fetchMe()
      .catch((err: unknown) => {
        // Only an actual rejection of the token signs the user out. A network
        // blip or a 500 keeps the session so a refresh recovers it.
        if (err instanceof ApiError && err.status === 401) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setToken(null);
          setUser(null);
          return;
        }
        const cached = localStorage.getItem('user');
        if (cached) { try { setUser(JSON.parse(cached) as User); } catch { /* ignore */ } }
      })
      .finally(() => setIsLoading(false));
  }, [token, fetchMe]);

  const login = useCallback(async (username: string, password: string): Promise<LoginResult> => {
    const res = await apiFetch<{ data: { status?: string; tempToken?: string; token?: string; user?: { twofaEnabled?: boolean }; twofaSetupRequired?: boolean } }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
      skipAuth: true,
    });

    // 2FA required — return temp token for verification step
    if (res.data.status === '2fa_required' && res.data.tempToken) {
      return { requiresTwoFA: true, tempToken: res.data.tempToken };
    }

    // Normal login (no 2FA)
    localStorage.setItem('token', res.data.token!);
    localStorage.setItem('user', JSON.stringify(res.data.user));
    setToken(res.data.token!);
    const meRes = await apiFetch<{ data: User }>('/auth/me');
    setUser(meRes.data);
    return { twofaSetupRequired: res.data.twofaSetupRequired || meRes.data.twofaSetupRequired };
  }, []);

  const verify2FA = useCallback(async (tempToken: string, code: string, isBackupCode = false) => {
    const body = isBackupCode
      ? { tempToken, backupCode: code }
      : { tempToken, token: code };

    const res = await apiFetch<{ data: { token: string; user: Record<string, unknown>; twofaSetupRequired?: boolean } }>('/auth/2fa/verify', {
      method: 'POST',
      body: JSON.stringify(body),
      skipAuth: true,
    });

    localStorage.setItem('token', res.data.token);
    localStorage.setItem('user', JSON.stringify(res.data.user));
    setToken(res.data.token);
    const meRes = await apiFetch<{ data: User }>('/auth/me');
    setUser(meRes.data);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  }, []);

  const isAdmin = useCallback(() => user?.role === 'admin' || user?.role === 'owner', [user]);

  const isOwner = useCallback(() => user?.role === 'owner', [user]);

  const hasPermission = useCallback((permission: string) => {
    if (!user) return false;
    if (user.role === 'admin' || user.role === 'owner') return true;
    return user.permissions[permission] === true;
  }, [user]);

  const refreshUser = useCallback(async () => {
    if (token) await fetchMe();
  }, [token, fetchMe]);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, verify2FA, logout, isAdmin, isOwner, hasPermission, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
