import { apiRequest } from './api';
import type { InventoryItem } from '../types';

export const listInventory = async (): Promise<InventoryItem[]> => {
  const response = await apiRequest<{ inventories: InventoryItem[] }>('/api/inventory');
  return response.inventories ?? [];
};

export const createInventory = async (input: {
  productId: string;
  warehouseId: string;
  quantity: number;
}): Promise<InventoryItem> => {
  const response = await apiRequest<{ inventory: InventoryItem }>('/api/inventory', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return response.inventory ?? ({ ...input } as InventoryItem);
};

export const updateInventory = async (id: string, quantity: number): Promise<InventoryItem> => {
  const response = await apiRequest<{ inventory: InventoryItem }>(`/api/inventory/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ quantity }),
  });
  return response.inventory ?? ({ _id: id, quantity } as InventoryItem);
};

export const deleteInventory = async (id: string): Promise<void> => {
  await apiRequest(`/api/inventory/${id}`, { method: 'DELETE' });
};
