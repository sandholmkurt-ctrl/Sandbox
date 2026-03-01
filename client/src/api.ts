const BASE_URL = '/api';

class ApiClient {
  private token: string | null = null;
  private retrying = false;

  constructor() {
    // Load token from localStorage immediately so it's available
    // before any React effects run — prevents race conditions where
    // API calls fire before AuthContext's useEffect sets the token.
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('token');
    }
  }

  setToken(token: string | null) {
    this.token = token;
  }

  getToken(): string | null {
    return this.token;
  }

  private async doFetch(path: string, options: RequestInit = {}): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    return fetch(`${BASE_URL}${path}`, {
      ...options,
      headers,
    });
  }

  /**
   * Make an API request with automatic retry.
   *
   * Corporate proxies (Zscaler/SiteMinder) can 307-redirect API requests
   * to a gateway domain. Browsers strip the Authorization header on
   * cross-origin redirects, causing a 401. After the proxy's auth dance
   * completes, subsequent requests go through normally. So we retry once
   * on 401 or network error to handle this transparently.
   */
  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    let response: Response;

    try {
      response = await this.doFetch(path, options);
    } catch (networkErr) {
      // Network error (e.g., CORS failure from proxy redirect).
      // Wait briefly for proxy session to establish, then retry.
      if (!this.retrying && this.token) {
        this.retrying = true;
        try {
          await new Promise(r => setTimeout(r, 500));
          response = await this.doFetch(path, options);
        } catch (retryErr) {
          this.retrying = false;
          throw retryErr;
        }
        this.retrying = false;
      } else {
        throw networkErr;
      }
    }

    // If 401, the proxy may have stripped the Authorization header during
    // a redirect. The proxy session is now established, so retry once.
    if (response.status === 401 && this.token && !this.retrying) {
      this.retrying = true;
      try {
        await new Promise(r => setTimeout(r, 300));
        response = await this.doFetch(path, options);
      } finally {
        this.retrying = false;
      }
    }

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new ApiError(response.status, body.error || 'Request failed');
    }

    return response.json();
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
