import { apiRequest } from './api';
import type { Product } from '../types';

export const listProducts = async (): Promise<Product[]> => {
  const response = await apiRequest<{ products: Product[] }>('/api/products');
  return response.products ?? [];
};

export const createProduct = async (input: Partial<Product>): Promise<Product> => {
  const response = await apiRequest<{ product: Product }>('/api/products', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return response.product ?? (input as Product);
};

export const updateProduct = async (id: string, input: Partial<Product>): Promise<Product> => {
  const response = await apiRequest<{ product: Product }>(`/api/products/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return response.product ?? (input as Product);
};

export const deleteProduct = async (id: string): Promise<void> => {
  await apiRequest(`/api/products/${id}`, { method: 'DELETE' });
};
