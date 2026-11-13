let inMemoryCsrfToken = '';
let inMemoryBearerToken = '';
let onUnauthorizedCallback: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorizedCallback = handler;
}

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

  const normalizedEndpoint = endpoint.startsWith('/api/v1')
    ? endpoint.slice('/api/v1'.length)
    : endpoint.startsWith('api/v1')
    ? '/' + endpoint.slice('api/v1'.length)
    : endpoint.startsWith('/')
    ? endpoint
    : `/${endpoint}`;

  const response = await fetch(`/api/v1${normalizedEndpoint}`, {
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
    const err = new Error(errMessage) as Error & {
      code?: string;
      status?: number;
      details?: unknown[];
    };
    err.code = payload?.error?.code || 'API_ERROR';
    err.status = response.status;
    err.details = payload?.error?.details || [];

    // Notify auth context on unexpected 401s during user interaction
    // (excluding login endpoint and session validation endpoint)
    if (
      response.status === 401 &&
      !endpoint.includes('/auth/login') &&
      !endpoint.includes('/auth/me')
    ) {
      onUnauthorizedCallback?.();
    }

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

export async function startImpersonation(targetUserId: string, reason?: string) {
  return apiRequest<{
    user: any;
    csrfToken: string;
    impersonation: any;
  }>('/auth/impersonation/start', {
    method: 'POST',
    body: JSON.stringify({ targetUserId, reason }),
  });
}

export async function stopImpersonation() {
  return apiRequest<{
    user: any;
    csrfToken: string;
    impersonation: null;
  }>('/auth/impersonation/stop', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function getImpersonationStatus() {
  return apiRequest<{
    isImpersonating: boolean;
    originalUser: { id: string; name: string; email: string; role: string } | null;
    effectiveUser: { id: string; name: string; email: string; role: string };
    impersonation: any;
  }>('/auth/impersonation/status');
}

