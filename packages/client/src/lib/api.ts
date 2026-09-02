const BASE_URL = '/api';

/** Thrown for every non-2xx response so callers can branch on `status`. */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

interface FetchOptions extends RequestInit {
  skipAuth?: boolean;
}

export async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { skipAuth, ...fetchOptions } = options;

  const headers: Record<string, string> = {
    ...(fetchOptions.headers as Record<string, string>),
  };

  // Let browser set Content-Type for FormData (multipart/form-data with boundary)
  if (!(fetchOptions.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (!skipAuth) {
    const token = localStorage.getItem('token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...fetchOptions,
    headers,
  });

  if (response.status === 401 && !skipAuth) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
    throw new ApiError('Authentication required', 401);
  }

  if (response.status === 403) {
    const data = await response.json();
    const msg = data.message || data.error || 'You do not have permission to perform this action';
    window.dispatchEvent(new CustomEvent('permission-denied', { detail: msg }));
    throw new ApiError(msg, 403);
  }

  let data: { error?: string } & Record<string, unknown>;
  try { data = await response.json(); }
  catch { throw new ApiError(`Request failed with status ${response.status}`, response.status); }

  if (!response.ok) {
    throw new ApiError(data.error || `Request failed with status ${response.status}`, response.status);
  }

  return data as T;
}
