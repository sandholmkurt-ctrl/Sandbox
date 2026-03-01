const BASE_URL = '/api';

/**
 * Multi-strategy API client that survives corporate proxy interference.
 *
 * Corporate proxies (Zscaler / SiteMinder) 307-redirect API requests to a
 * gateway domain.  Browsers strip the Authorization header on cross-origin
 * redirects (HTTP spec).  This client uses THREE fallback strategies:
 *
 *   1. Normal fetch with Authorization header  + `_token` query-param.
 *      The query-param survives 307 redirects because the proxy encodes
 *      the original URL (including query string) in its redirect-back URL.
 *
 *   2. Retry with exponential back-off (the proxy session may be
 *      established after the first attempt, allowing the retry through).
 *
 *   3. POST-body "tunnel": re-send the request as POST with the token in
 *      the JSON body.  HTTP 307 preserves the POST method and body, so
 *      the token reaches the server even through a redirect chain.
 */
class ApiClient {
  private token: string | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('token');
      // Fire-and-forget warm-up:  trigger any proxy auth flow early
      // so it doesn't interfere with real requests.  Image loads and
      // no-cors fetches are not subject to CORS restrictions.
      try {
        const img = new Image();
        img.src = `/api/health?_warm=${Date.now()}`;
        fetch('/api/health', { mode: 'no-cors' }).catch(() => {});
      } catch { /* ignore */ }
    }
  }

  setToken(token: string | null) {
    this.token = token;
  }

  getToken(): string | null {
    return this.token;
  }

  // ── Strategy 1: normal fetch with header + query-param token ──
  private async doFetch(path: string, options: RequestInit = {}): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    let url = `${BASE_URL}${path}`;

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
      // Also embed token as query-param — survives 307 redirect chains
      // where the proxy preserves the original URL in its redirect-back.
      const sep = path.includes('?') ? '&' : '?';
      url = `${BASE_URL}${path}${sep}_token=${encodeURIComponent(this.token)}`;
    }

    return fetch(url, { ...options, headers });
  }

  // ── Strategy 3: POST-body tunnel ──────────────────────────────
  // 307 redirects preserve POST method + body, so the token reaches
  // the server even when headers are stripped.  The server-side
  // "token tunnel" middleware reads _authToken / _method from the
  // body, sets the Authorization header, and restores the original
  // HTTP method before routing.
  private async tunnelFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    const tunnelBody: Record<string, unknown> = {
      _authToken: this.token,
      _method: options.method || 'GET',
    };

    // Merge original body fields (for POST/PUT endpoints)
    if (options.body) {
      try { Object.assign(tunnelBody, JSON.parse(options.body as string)); } catch { /* skip */ }
    }

    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tunnelBody),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new ApiError(res.status, body.error || `HTTP ${res.status}`);
    }

    return res.json();
  }

  // ── Orchestrator: try all strategies ──────────────────────────
  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const MAX_RETRIES = 3;

    // ─ attempt 1..MAX_RETRIES: normal fetch (header + query param) ──
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt > 1) {
          const delay = Math.pow(2, attempt - 1) * 1000;       // 2 s, 4 s
          console.log(`[API] Retry ${attempt}/${MAX_RETRIES} after ${delay}ms …`);
          await new Promise(r => setTimeout(r, delay));
        }

        const response = await this.doFetch(path, options);

        // Success or non-auth error → return/throw immediately
        if (response.ok) return response.json();

        if (response.status !== 401 || !this.token) {
          const body = await response.json().catch(() => ({}));
          throw new ApiError(response.status, body.error || `HTTP ${response.status}`);
        }

        // 401 with a token → likely header stripped by proxy; retry
        console.warn(`[API] 401 on attempt ${attempt} – proxy may have stripped auth header`);
      } catch (err) {
        if (err instanceof ApiError) throw err; // non-recoverable HTTP error
        // Network / TypeError (proxy CORS block) → keep retrying
        console.warn(`[API] Network error on attempt ${attempt}:`, (err as Error).message);
        if (!this.token || attempt >= MAX_RETRIES) {
          // Only fall through to tunnel if we have a token
          if (this.token) break;
          throw err;
        }
      }
    }

    // ─ Final fallback: POST-body tunnel ─────────────────────────
    console.warn('[API] All standard attempts failed – using POST-body tunnel');
    return this.tunnelFetch<T>(path, options);
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>(path);
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: 'POST', body: JSON.stringify(body) });
  }

  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: 'PUT', body: JSON.stringify(body) });
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' });
  }
}

export class ApiError extends Error {
  constructor(public status: number, public detail: string | Record<string, string[]>) {
    super(typeof detail === 'string' ? detail : JSON.stringify(detail));
  }
}

export const api = new ApiClient();
export default api;
