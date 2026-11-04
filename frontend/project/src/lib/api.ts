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

// Friendly copy for gateway/platform failures. Proxies (Render's free tier,
// Cloudflare, nginx) replace our JSON envelope with plain text or HTML, so the
// body itself is unusable — the status is the only reliable signal.
const STATUS_MESSAGES: Record<number, string> = {
  400: 'Some of the information sent was invalid. Please review it and try again.',
  401: 'Your session has expired. Please sign in again.',
  403: 'You do not have permission to do that.',
  404: 'We could not find what you were looking for.',
  408: 'The request timed out. Please try again.',
  409: 'This conflicts with the current state. Refresh the page and try again.',
  413: 'The file is too large to upload.',
  422: 'The submitted information could not be processed.',
  429: 'Too many requests — please wait a moment and try again.',
  500: 'Something went wrong on our end. Please try again.',
  502: 'The server is temporarily unreachable (it may be restarting). Please try again in a moment.',
  503: 'The service is temporarily unavailable. Please try again in a moment.',
  504: 'The server took too long to respond. Please try again.',
};
const OFFLINE_MESSAGE = 'You appear to be offline or the connection failed. Check your network and try again.';
const TIMEOUT_MESSAGE = 'This is taking longer than expected. Please try again.';
const GENERIC_MESSAGE = 'An unexpected error occurred';

function statusMessage(status?: number): string | undefined {
  return status !== undefined ? STATUS_MESSAGES[status] : undefined;
}

/** Axios' own messages carry no app information. */
function isAxiosDefaultMessage(message: string): boolean {
  const m = message.trim();
  return /^Request failed with status code \d{3}$/.test(m) || m === 'Network Error';
}

/** Proxy/gateway bodies (HTML error pages, Render's plain-text 502) are not app messages. */
function isProxyBody(message: string): boolean {
  const m = message.trim();
  if (!m) return false;
  if (m.startsWith('<')) return true; // HTML error page
  if (/^An error occurred with this application\.?$/i.test(m)) return true; // Render free tier
  return /^\d{3}\s+(Bad Gateway|Gateway Time-out|Service Unavailable|Internal Server Error)/i.test(m);
}

/** Pull a human message out of a JSON envelope or a JSON-looking raw string. */
function envelopeMessage(body: unknown): string | undefined {
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const record = body as Record<string, unknown>;
    if (typeof record.message === 'string' && record.message.trim()) return record.message.trim();
    if (typeof record.error === 'string' && record.error.trim()) return record.error.trim();
    if (record.message && typeof record.message === 'object') {
      try { return JSON.stringify(record.message); } catch { /* ignore */ }
    }
    return undefined;
  }
  if (typeof body === 'string' && body.trim().startsWith('{')) {
    try { return envelopeMessage(JSON.parse(body)); } catch { /* not JSON */ }
  }
  return undefined;
}

export function getApiErrorMessage(err: unknown): string {
  if (!err) return GENERIC_MESSAGE;
  if (typeof err === 'string') {
    const s = err.trim();
    if (!s) return GENERIC_MESSAGE;
    return s.startsWith('<') ? GENERIC_MESSAGE : s;
  }
  if (typeof err !== 'object') return GENERIC_MESSAGE;

  const apiErr = err as any;
  const status: number | undefined =
    typeof apiErr.status === 'number' ? apiErr.status
      : typeof apiErr.response?.status === 'number' ? apiErr.response?.status
        : undefined;
  const body = apiErr.details ?? apiErr.response?.data;
  const raw: string = typeof apiErr.message === 'string' ? apiErr.message.trim() : '';

  // 1) A meaningful app message from the API envelope wins.
  if (raw && !isAxiosDefaultMessage(raw) && !isProxyBody(raw) && !raw.trimStart().startsWith('{')) {
    return raw;
  }
  const envelope = envelopeMessage(body);
  if (envelope && !isProxyBody(envelope)) return envelope;

  // 2) Transport-level failures: no HTTP status at all.
  if (apiErr.code === 'ECONNABORTED') return TIMEOUT_MESSAGE;
  if (!status) {
    if (apiErr.code === 'ERR_NETWORK' || raw === 'Network Error') return OFFLINE_MESSAGE;
    return envelope ?? (raw && !isAxiosDefaultMessage(raw) && !isProxyBody(raw) ? raw : GENERIC_MESSAGE);
  }

  // 3) Gateway/platform failure or axios default: map the status to friendly copy.
  return statusMessage(status) ?? envelope ?? GENERIC_MESSAGE;
}

export default api;
