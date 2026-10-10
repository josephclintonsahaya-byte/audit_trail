import { apiRequest } from './api';
import type { AuditEvent } from '../types';

export const listAuditEvents = async (): Promise<AuditEvent[]> => {
  const response = await apiRequest<{ events: AuditEvent[] }>('/api/events');
  return response.events ?? [];
};
