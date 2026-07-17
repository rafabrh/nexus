const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

/**
 * Erro de API com o status HTTP e o corpo parseado (quando é JSON). Permite à UI
 * distinguir casos como o 409 de "excluir coluna com cards" e usar a `message`
 * pronta do servidor no toast, sem regex sobre a string do Error. Callers antigos
 * que só olham `err.message` continuam funcionando (herda de Error).
 */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, body: unknown, fallback: string) {
    // Prefere a `message` do corpo (texto pronto do backend) como message do Error.
    const serverMessage =
      body && typeof body === 'object' && typeof (body as { message?: unknown }).message === 'string'
        ? (body as { message: string }).message
        : fallback;
    super(serverMessage);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

/** Type guard para estreitar um erro capturado em `ApiError`. */
export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

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
    const raw = await res.text().catch(() => '');
    // Tenta parsear como JSON (erros do BFF vêm com { message, statusCode, ... });
    // se não for JSON, guarda o texto cru. A message do Error mantém o formato
    // antigo `API <status>: <body>` como fallback para logs.
    let parsed: unknown = raw;
    try {
      parsed = raw ? JSON.parse(raw) : raw;
    } catch {
      /* corpo não-JSON: mantém o texto cru */
    }
    throw new ApiError(res.status, parsed, `API ${res.status}: ${raw}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

/**
 * Como `api()`, mas devolve o corpo bruto como Blob — para mídia autenticada.
 * Um `<img src>` não envia o Bearer, então buscamos via fetch (com refresh) e
 * transformamos em object URL no componente.
 */
export async function apiBlob(path: string): Promise<Blob> {
  const token = await ensureToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res = await fetch(`${API_URL}${path}`, { headers, credentials: 'include' });

  if (res.status === 401 && token) {
    const newToken = await dedupedRefresh();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      res = await fetch(`${API_URL}${path}`, { headers, credentials: 'include' });
    }
  }

  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.blob();
}

/**
 * Upload multipart autenticado. Não seta `Content-Type` — o browser monta o
 * boundary do `FormData` sozinho (setá-lo manualmente quebra o parse no servidor).
 * Espelha o refresh/Bearer do `api()`. Devolve o JSON de resposta.
 */
export async function apiUpload<T = unknown>(path: string, form: FormData): Promise<T> {
  const token = await ensureToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    body: form,
    headers,
    credentials: 'include',
  });

  if (res.status === 401 && token) {
    const newToken = await dedupedRefresh();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      res = await fetch(`${API_URL}${path}`, {
        method: 'POST',
        body: form,
        headers,
        credentials: 'include',
      });
    }
  }

  if (!res.ok) {
    const raw = await res.text().catch(() => '');
    let parsed: unknown = raw;
    try { parsed = raw ? JSON.parse(raw) : raw; } catch { /* texto cru */ }
    throw new ApiError(res.status, parsed, `API ${res.status}: ${raw}`);
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
