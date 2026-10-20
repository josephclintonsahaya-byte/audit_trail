import { apiRequest } from './api';
import type { ManagedUser, User } from '../types';

export interface UserListResult {
  users: ManagedUser[];
  page: number;
  totalPages: number;
  total: number;
}

export interface UserInput {
  name: string;
  email: string;
  role: User['role'];
}

export interface CreateUserInput extends UserInput { password: string; confirmPassword: string }

export const listUsers = async (page = 1, limit = 20, search = '', role = ''): Promise<UserListResult> => {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search.trim()) query.set('search', search.trim());
  if (role) query.set('role', role);
  const response = await apiRequest<UserListResult>(`/api/users?${query.toString()}`);
  return response;
};

export const createUser = async (input: CreateUserInput): Promise<ManagedUser> => {
  const response = await apiRequest<{ user: ManagedUser }>('/api/users', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return response.user;
};

export const updateUser = async (id: string, input: UserInput): Promise<ManagedUser> => {
  const response = await apiRequest<{ user: ManagedUser }>(`/api/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return response.user;
};

export const changeUserPassword = async (id: string, newPassword: string, confirmNewPassword: string): Promise<void> => {
  await apiRequest(`/api/users/${id}/password`, {
    method: 'PATCH',
    body: JSON.stringify({ newPassword, confirmNewPassword }),
  });
};

export const deleteUser = async (id: string): Promise<void> => {
  await apiRequest(`/api/users/${id}`, { method: 'DELETE' });
};
