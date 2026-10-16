import { apiRequest } from './api';
import type { AuditEvent } from '../types';

const buildQueryString = (params: { page?: number; limit?: number }): string => {
  const parts: string[] = [];
  if (params.page !== undefined) parts.push(`page=${params.page}`);
  if (params.limit !== undefined) parts.push(`limit=${params.limit}`);
  return parts.join('&');
};

export const listAuditEvents = async (page = 1, limit = 20): Promise<{
  events: AuditEvent[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}> => {
  const url = `/api/events?${buildQueryString({ page, limit })}`;
  const response = await apiRequest<{
    events: AuditEvent[];
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  }>(url);
  return {
    events: response.events ?? [],
    page: response.page,
    limit: response.limit,
    total: response.total,
    totalPages: response.totalPages,
  };
};

export const listEntityAuditEvents = async (entityType: string, entityId: string, page = 1, limit = 20): Promise<AuditEvent[]> => {
  const response = await apiRequest<{ events: AuditEvent[] }>(
    `/api/events/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}?${buildQueryString({ page, limit })}`,
  );
  return response.events ?? [];
};
