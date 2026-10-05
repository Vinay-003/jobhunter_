// src/lib/api.ts - central API client
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export interface ApiError {
  message: string;
  status?: number;
  code?: string;
  details?: unknown;
}

function getCsrfToken(): string | null {
  // Try cookie first (double-submit pattern), then meta tag
  const match = document.cookie.match(/(?:^|;\s*)jobhunter_csrf=([^;]*)/);
  if (match?.[1]) return decodeURIComponent(match[1]);
  const meta = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]');
  if (meta?.content) return meta.content;
  // Also check XSRF-TOKEN (common with cookieParser setups)
  const xsrf = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]*)/);
  if (xsrf?.[1]) return decodeURIComponent(xsrf[1]);
  return null;
}

export const api = axios.create({
  baseURL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  timeout: 60000,
});

let csrfRequest: Promise<void> | null = null;
// The API cookie may belong to another origin and cannot be read through
// document.cookie. Its CORS-approved token response is kept only in memory.
let apiCsrfToken: string | null = null;
export function ensureCsrfToken(): Promise<void> {
  if (apiCsrfToken) return Promise.resolve();
  if (!csrfRequest) csrfRequest = api.get<{csrfToken:string}>('/csrf').then(response => {
    if (!/^[a-f0-9]{64}$/.test(response.data.csrfToken)) throw new Error('Invalid CSRF response');
    apiCsrfToken = response.data.csrfToken;
  }).finally(() => { csrfRequest = null; });
  return csrfRequest;
}

// Request interceptor: attach CSRF token
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const sameCookieHost = new URL(baseURL, window.location.href).hostname === window.location.hostname;
    const token = (sameCookieHost ? getCsrfToken() : null) ?? apiCsrfToken;
    if (token && config.headers) {
      (config.headers as Record<string, string>)['X-CSRF-Token'] = token;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: typed error handling + 401 redirect
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const status = error.response?.status;
    const data = error.response?.data as { message?: string; error?: string } | undefined;
    const message =
      data?.message || data?.error || error.message || 'An unexpected error occurred';

    const apiError: ApiError = {
      message,
      status,
      code: error.code,
      details: data,
    };

    // 401: session expired -> redirect to login (avoid redirect loop)
    if (status === 401) {
      const current = window.location.pathname;
      if (current === '/app' || current.startsWith('/app/')) {
        // Defer redirect to avoid breaking concurrent requests
        setTimeout(() => {
          if (window.location.pathname === '/app' || window.location.pathname.startsWith('/app/')) {
            window.location.href = '/login';
          }
        }, 100);
      }
    }

    return Promise.reject(apiError);
  }
);

export function getApiErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as ApiError).message);
  }
  if (err instanceof Error) return err.message;
  return 'Unknown error';
}

export default api;
