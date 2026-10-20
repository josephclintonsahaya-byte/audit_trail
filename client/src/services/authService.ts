import { apiRequest, getStoredToken, setStoredToken } from './api';
import { ApiError } from './api';
import type { User } from '../types';

interface LoginPayload {
  email: string;
  password: string;
}

export const login = async (email: string, password: string): Promise<{ token: string; user: User }> => {
  let response: { token: string; user: User };
  try {
    response = await apiRequest<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password } satisfies LoginPayload),
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      throw new ApiError('Invalid email or password.', error.status, error.code);
    }
    throw error;
  }

  setStoredToken(response.token ?? null);
  return response;
};

export const fetchCurrentUser = async (): Promise<User | null> => {
  const token = getStoredToken();
  if (!token) {
    return null;
  }

  try {
    const response = await apiRequest<{ user: User }>('/api/auth/me');
    if (!response.user) {
      clearSession();
      return null;
    }
    return response.user;
  } catch (requestError) {
    if (requestError instanceof ApiError && requestError.status === 401) {
      clearSession();
      return null;
    }
    throw requestError;
  }
};

export const clearSession = (): void => {
  setStoredToken(null);
};
