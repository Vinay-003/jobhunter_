// src/features/auth/AuthContext.tsx
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import api, { ensureCsrfToken, getApiErrorMessage } from '../../lib/api';

export interface User {
  id: string;
  username: string;
  email: string;
  display_name?: string;
  verified?: boolean;
}

export interface AuthResult {
  requiresOtp?: boolean;
  requiresVerification?: boolean;
  email?: string;
  user?: User;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<AuthResult>;
  signup: (username: string, email: string, password: string) => Promise<AuthResult>;
  verifyOtp: (email: string, otp: string, purpose?: 'verification' | 'login') => Promise<void>;
  resendOtp: (email: string, purpose?: 'verification' | 'login') => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Single-flight session fetch to prevent duplicate requests
  const inflight = useRef<Promise<void> | null>(null);
  const refresh = useCallback(async () => {
    if (inflight.current) return inflight.current;
    const run = (async () => {
      try {
        setLoading(true);
        await ensureCsrfToken();
        const res = await api.get('/auth/session', { timeout: 8000 });
        const u = (res.data as { user?: User })?.user ?? null;
        setUser(u);
        setError(null);
      } catch {
        // No session / timeout / network failure -> unauthenticated (guest)
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

  const login = async (email: string, password: string): Promise<AuthResult> => {
    setLoading(true);
    setError(null);
    try {
      await ensureCsrfToken();
      const res = await api.post('/auth/login', { email, password });
      const data = res.data as { user?: User };
      if (data.user) setUser(data.user);
      else await refresh();
      return { user: data.user };
    } catch (err: any) {
      const msg = getApiErrorMessage(err);
      setError(msg);
      throw new Error(msg);
    } finally {
      setLoading(false);
    }
  };

  const signup = async (username: string, email: string, password: string): Promise<AuthResult> => {
    setLoading(true);
    setError(null);
    try {
      await ensureCsrfToken();
      const res = await api.post('/auth/signup', { username, email, password });
      const data = res.data as { user?: User; requiresVerification?: boolean; email?: string };
      return {
        requiresVerification: data.requiresVerification ?? true,
        email: data.email || email,
        user: data.user,
      };
    } catch (err: any) {
      const msg = getApiErrorMessage(err);
      setError(msg);
      throw new Error(msg);
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async (email: string, otp: string, purpose?: 'verification' | 'login') => {
    setLoading(true);
    setError(null);
    try {
      await ensureCsrfToken();
      const res = await api.post('/auth/verify-otp', { email, otp, purpose });
      const data = res.data as { user?: User };
      if (data.user) {
        setUser(data.user);
      } else {
        await refresh();
      }
    } catch (err: any) {
      const msg = getApiErrorMessage(err);
      setError(msg);
      throw new Error(msg);
    } finally {
      setLoading(false);
    }
  };

  const resendOtp = async (email: string, purpose?: 'verification' | 'login') => {
    try {
      await ensureCsrfToken();
      await api.post('/auth/resend-otp', { email, purpose });
    } catch (err: any) {
      const msg = getApiErrorMessage(err);
      throw new Error(msg);
    }
  };

  const logout = async () => {
    try {
      await ensureCsrfToken();
      await api.post('/auth/logout');
    } catch (error) { throw new Error(getApiErrorMessage(error)); }
    setUser(null);
    setLoading(false);
  };

  const logoutAll = async () => {
    try {
      await ensureCsrfToken();
      await api.post('/auth/logout-all');
    } catch (error) { throw new Error(getApiErrorMessage(error)); }
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
        verifyOtp,
        resendOtp,
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
