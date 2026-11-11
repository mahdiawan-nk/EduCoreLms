let inMemoryCsrfToken = '';
let inMemoryBearerToken = '';

export function setApiSecurityTokens(tokens: {
  csrfToken?: string;
  bearerToken?: string;
}) {
  if (tokens.csrfToken !== undefined) {
    inMemoryCsrfToken = tokens.csrfToken;
  }
  if (tokens.bearerToken !== undefined) {
    inMemoryBearerToken = tokens.bearerToken;
  }
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  meta: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
    [key: string]: unknown;
  } | null;
  error?: {
    code: string;
    message: string;
    details: unknown[];
  };
}

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiEnvelope<T>> {
  const csrf = inMemoryCsrfToken || readCookie('pk_lms_csrf') || '';
  const headers: Record<string, string> = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
    ...(inMemoryBearerToken
      ? { Authorization: `Bearer ${inMemoryBearerToken}` }
      : {}),
    ...((options.headers as Record<string, string>) || {}),
  };

  const response = await fetch(`/api/v1${endpoint}`, {
    ...options,
    credentials: 'include',
    headers,
  });

  const rawText = await response.text();
  let payload: ApiEnvelope<T> | null = null;
  if (rawText) {
    try {
      payload = JSON.parse(rawText) as ApiEnvelope<T>;
    } catch {
      const err = new Error(
        `Respons server bukan format JSON yang valid (${response.status})`
      ) as Error & { code?: string };
      err.code = 'INVALID_JSON_RESPONSE';
      throw err;
    }
  }

  if (!response.ok || !payload || !payload.success) {
    const errMessage =
      payload?.error?.message || `Permintaan gagal (${response.status})`;
    const err = new Error(errMessage) as Error & { code?: string };
    err.code = payload?.error?.code || 'API_ERROR';
    throw err;
  }

  return payload;
}

export async function apiFetch<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const normalizedEndpoint = url.startsWith('/api/v1')
    ? url.slice('/api/v1'.length)
    : url;
  const envelope = await apiRequest<T>(normalizedEndpoint, options);
  return envelope.data;
}

