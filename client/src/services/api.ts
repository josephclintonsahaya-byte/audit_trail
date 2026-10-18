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
  if (includeJson) headers.set('Content-Type', 'application/json');

  const token = getStoredToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return headers;
};

const safeMessageForStatus = (status: number): string => {
  if (status === 401) return 'Your session has expired. Please sign in again.';
  if (status === 403) return 'You do not have permission to complete this action.';
  if (status === 404) return 'The requested record could not be found.';
  if (status === 409) return 'This record changed before your update could be saved. Refresh and try again.';
  if (status === 400 || status === 422) return 'Check the information you entered and try again.';
  if (status >= 500) return 'The service is temporarily unavailable. Please try again.';
  return 'The request could not be completed. Please try again.';
};

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const parseResponse = async (response: Response): Promise<unknown> => {
  if (response.status === 204) return {};
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return response.json().catch(() => ({}));
  }
  return {};
};

export const apiRequest = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
  const headers = new Headers(getAuthHeaders(false));
  new Headers(options.headers).forEach((value, key) => headers.set(key, value));

  if (options.body !== undefined && typeof options.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path), { ...options, headers });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new ApiError('Unable to reach the service. Check your connection and try again.', 0);
  }

  const payload = asRecord(await parseResponse(response));
  if (!response.ok) {
    throw new ApiError(
      safeMessageForStatus(response.status),
      response.status,
      typeof payload.code === 'string' ? payload.code : undefined,
      asRecord(payload.errors),
    );
  }

  return payload as T;
};
