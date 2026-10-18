import { apiRequest } from './api';
import type { AuditEvent } from '../types';

type AuditEventFilters = { search?: string; eventType?: string; sort?: 'newest' | 'oldest' };

const buildQueryString = (params: { page?: number; limit?: number } & AuditEventFilters): string => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  return query.toString();
};

export const listAuditEvents = async (page = 1, limit = 20, filters: AuditEventFilters = {}): Promise<{
  events: AuditEvent[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  eventTypes: string[];
}> => {
  const url = `/api/events?${buildQueryString({ page, limit, ...filters })}`;
  const response = await apiRequest<{
    events: AuditEvent[];
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    eventTypes: string[];
  }>(url);
  return {
    events: response.events ?? [],
    page: response.page,
    limit: response.limit,
    total: response.total,
    totalPages: response.totalPages,
    eventTypes: response.eventTypes ?? [],
  };
};

export const getAuditEventDetails = async (id: string): Promise<AuditEvent> => {
  const response = await apiRequest<{ event: AuditEvent }>(`/api/events/detail/${encodeURIComponent(id)}`);
  return response.event;
};

export const listEntityAuditEvents = async (entityType: string, entityId: string, page = 1, limit = 20): Promise<AuditEvent[]> => {
  const response = await apiRequest<{ events: AuditEvent[] }>(
    `/api/events/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}?${buildQueryString({ page, limit })}`,
  );
  return response.events ?? [];
};
