// src/features/auth/AuthContext.tsx
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api, { getApiErrorMessage } from '../../lib/api';

export interface User {
  id: number;
  username: string;
  email: string;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      // Primary V2 endpoint, fallback to legacy token check if backend not yet migrated
      const res = await api.get('/v1/auth/session').catch(async (err: unknown) => {
        // Fallback: try legacy /latest-resume or /auth/me style? If 404, try /auth/session without v1
        const msg = getApiErrorMessage(err);
        if (String(msg).includes('404') || (err as { status?: number })?.status === 404) {
          try {
            return await api.get('/auth/session');
          } catch {
            // If still 404, we are not authenticated - return null gracefully
            return { data: { user: null } } as { data: { user: User | null } };
          }
        }
        throw err;
      });
      const u = (res.data as { user?: User })?.user ?? null;
      setUser(u);
      setError(null);
    } catch (err) {
      // No session is not an error - just unauthenticated
      const status = (err as { status?: number })?.status;
      if (status === 401) {
        setUser(null);
      } else {
        // Keep unauthenticated but note error for debugging
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/auth/login', { email, password });
      const data = res.data as { user?: User; token?: string };
      if (data.user) setUser(data.user);
      else await refresh();
    } catch (err) {
      const msg = getApiErrorMessage(err);
      setError(msg);
      throw new Error(msg);
    } finally {
      setLoading(false);
    }
  };

  const signup = async (username: string, email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      await api.post('/auth/signup', { username, email, password });
    } catch (err) {
      const msg = getApiErrorMessage(err);
      setError(msg);
      throw new Error(msg);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      await api.post('/v1/auth/logout').catch(() => api.post('/auth/logout').catch(() => {}));
    } finally {
      setUser(null);
      setLoading(false);
    }
  };

  const logoutAll = async () => {
    try {
      await api.post('/v1/auth/logout-all').catch(() => api.post('/auth/logout-all').catch(() => {}));
    } finally {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        isAuthenticated: !!user,
        login,
        signup,
        logout,
        logoutAll,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export default AuthContext;
