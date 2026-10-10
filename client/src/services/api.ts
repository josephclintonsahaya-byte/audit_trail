export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? '' : 'http://localhost:5000');

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: Record<string, unknown>;

  constructor(message: string, status: number, code?: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const getStoredToken = (): string | null => localStorage.getItem('audit-trail-token');

export const setStoredToken = (token: string | null): void => {
  if (!token) {
    localStorage.removeItem('audit-trail-token');
    return;
  }

  localStorage.setItem('audit-trail-token', token);
};

const buildUrl = (path: string): string => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
};

export const getAuthHeaders = (includeJson = true): Headers => {
  const headers = new Headers();
  if (includeJson) {
    headers.set('Content-Type', 'application/json');
  }

  const token = getStoredToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return headers;
};

export const apiRequest = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
  const requestOptions = { ...options };
  const shouldIncludeJson = !requestOptions.body || requestOptions.method === 'GET' ? false : true;

  const response = await fetch(buildUrl(path), {
    ...requestOptions,
    headers: {
      ...Object.fromEntries(getAuthHeaders(shouldIncludeJson).entries()),
      ...(requestOptions.headers ?? {}),
    },
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(
      typeof payload.message === 'string' ? payload.message : 'Request failed',
      response.status,
      typeof payload.code === 'string' ? payload.code : undefined,
      payload.errors && typeof payload.errors === 'object' ? (payload.errors as Record<string, unknown>) : undefined,
    );
  }

  return payload as T;
};
