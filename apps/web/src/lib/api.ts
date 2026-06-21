const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

async function refreshToken(): Promise<string | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) return null;
    const data = await res.json();
    accessToken = data.accessToken;
    return accessToken;
  } catch {
    return null;
  }
}

/**
 * Coalesce concurrent refreshes into a single in-flight request. The backend
 * rotates (and blacklists) the refresh token on every call, so two parallel
 * refreshes would make the second one reuse an already-revoked token → 401 →
 * spurious logout. Every refresh path MUST go through here.
 */
function dedupedRefresh(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = refreshToken().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function ensureToken(): Promise<string | null> {
  if (accessToken) return accessToken;
  return dedupedRefresh();
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await ensureToken();

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  // Only set Content-Type when there's a body — Fastify rejects
  // Content-Type: application/json with an empty body on POST
  if (options.body != null) {
    headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (res.status === 401 && token) {
    // Try refresh once (deduped — see dedupedRefresh)
    const newToken = await dedupedRefresh();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      const retry = await fetch(`${API_URL}${path}`, {
        ...options,
        headers,
        credentials: 'include',
      });
      if (retry.status === 401) {
        accessToken = null;
        window.location.href = '/login';
        throw new Error('Session expired');
      }
      if (retry.status === 204) return undefined as T;
      return retry.json();
    }
    accessToken = null;
    window.location.href = '/login';
    throw new Error('Session expired');
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${body}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export { API_URL };

/**
 * Try to refresh the session using the refresh_token cookie.
 * Returns the new access token or null if refresh fails.
 */
export async function tryRefreshSession(): Promise<string | null> {
  return dedupedRefresh();
}
