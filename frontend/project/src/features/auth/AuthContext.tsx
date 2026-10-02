// src/features/auth/AuthContext.tsx
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
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

  // Issue 3 fix 3: single-flight — StrictMode's double mount (and any concurrent
  // caller) shares ONE /auth/session request instead of issuing duplicates.
  const inflight = useRef<Promise<void> | null>(null);
  const refresh = useCallback(async () => {
    if (inflight.current) return inflight.current;
    const run = (async () => {
      try {
        setLoading(true);
        // 8s cap (Issue 3): a sleeping backend must not hold the UI hostage to the
        // global 60s axios timeout — on timeout we resolve as guest.
        const res = await api.get('/auth/session', { timeout: 8000 });
        const u = (res.data as { user?: User })?.user ?? null;
        setUser(u);
        setError(null);
      } catch {
        // No session / timeout / network failure → unauthenticated (guest)
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
    inflight.current = run;
    try {
      await run;
    } finally {
      inflight.current = null;
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
      await api.post('/auth/logout');
    } catch {}
    setUser(null);
    setLoading(false);
  };

  const logoutAll = async () => {
    try {
      await api.post('/auth/logout-all');
    } catch {}
    setUser(null);
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
