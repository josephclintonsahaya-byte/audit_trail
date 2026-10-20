import { apiRequest } from './api';
import type { Warehouse } from '../types';

export const listWarehouses = async (): Promise<Warehouse[]> => {
  const response = await apiRequest<{ warehouses: Warehouse[] }>('/api/warehouses');
  return response.warehouses ?? [];
};

export const createWarehouse = async (input: Partial<Warehouse>): Promise<Warehouse> => {
  const response = await apiRequest<{ warehouse: Warehouse }>('/api/warehouses', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return response.warehouse ?? (input as Warehouse);
};

export const updateWarehouse = async (id: string, input: Partial<Warehouse>): Promise<Warehouse> => {
  const response = await apiRequest<{ warehouse: Warehouse }>(`/api/warehouses/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return response.warehouse;
};

export const deleteWarehouse = async (id: string): Promise<void> => {
  await apiRequest(`/api/warehouses/${id}`, { method: 'DELETE' });
};
