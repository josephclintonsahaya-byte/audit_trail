import { apiRequest } from './api';
import type {
  Shipment,
  ShipmentDomainEvent,
  ShipmentReconstruction,
} from '../types';

export const listShipments = async (): Promise<Shipment[]> => {
  const response = await apiRequest<{ shipments: Shipment[] }>('/api/shipments');
  return response.shipments ?? [];
};

export const getShipmentById = async (id: string): Promise<Shipment> => {
  const response = await apiRequest<{ shipment: Shipment }>(`/api/shipments/${id}`);
  if (!response.shipment) {
    throw new Error('Shipment response did not include a shipment.');
  }
  return response.shipment;
};

export const getShipmentEvents = async (id: string): Promise<ShipmentDomainEvent[]> => {
  const response = await apiRequest<{ events: ShipmentDomainEvent[] }>(`/api/queries/shipments/${id}/events`);
  if (!response.events) {
    throw new Error('Shipment event response did not include an event list.');
  }
  return response.events;
};

export const getCurrentShipmentState = async (
  id: string,
): Promise<ShipmentReconstruction> => {
  const response = await apiRequest<{ data: ShipmentReconstruction }>(
    `/api/queries/shipments/${id}`,
  );
  if (!response.data) {
    throw new Error('Current shipment query did not include state data.');
  }
  return response.data;
};

export const reconstructShipment = async (
  id: string,
  version?: number,
  at?: string,
): Promise<ShipmentReconstruction> => {
  const query = at !== undefined
    ? `?at=${encodeURIComponent(at)}`
    : version === undefined ? '' : `?version=${encodeURIComponent(String(version))}`;
  const response = await apiRequest<{ data: ShipmentReconstruction }>(
    `/api/queries/shipments/${id}/reconstruct${query}`,
  );
  if (!response.data) {
    throw new Error('Shipment reconstruction response did not include state data.');
  }
  return response.data;
};

export const recordShipmentTemperature = async (
  id: string,
  expectedVersion: number,
  temperatureC: number,
): Promise<void> => {
  await apiRequest('/api/commands/shipments/temperature', {
    method: 'POST',
    body: JSON.stringify({ shipmentId: id, expectedVersion, temperatureC }),
  });
};

export const createShipment = async (input: {
  sourceWarehouseId: string;
  destinationWarehouseId: string;
  items: Array<{ productId: string; quantity: number }>;
}): Promise<Shipment> => {
  const response = await apiRequest<{ shipment: Shipment }>('/api/shipments', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (!response.shipment) {
    throw new Error('Create shipment response did not include a shipment.');
  }
  return response.shipment;
};

export const updateShipment = async (id: string, input: Partial<Shipment>): Promise<Shipment> => {
  const payload = {
    sourceWarehouseId: input.sourceWarehouseId,
    destinationWarehouseId: input.destinationWarehouseId,
    items: input.items,
  };

  const response = await apiRequest<{ shipment: Shipment }>(`/api/shipments/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  if (!response.shipment) {
    throw new Error('Update shipment response did not include a shipment.');
  }
  return response.shipment;
};

export const deleteShipment = async (id: string): Promise<void> => {
  await apiRequest(`/api/shipments/${id}`, { method: 'DELETE' });
};

export const dispatchShipment = async (id: string): Promise<Shipment> => {
  const response = await apiRequest<{ shipment: Shipment }>(`/api/shipments/${id}/dispatch`, {
    method: 'POST',
  });
  if (!response.shipment) {
    throw new Error('Dispatch response did not include a shipment.');
  }
  return response.shipment;
};

export const deliverShipment = async (id: string): Promise<Shipment> => {
  const response = await apiRequest<{ shipment: Shipment }>(`/api/shipments/${id}/deliver`, {
    method: 'POST',
  });
  if (!response.shipment) {
    throw new Error('Delivery response did not include a shipment.');
  }
  return response.shipment;
};

export const cancelShipment = async (id: string): Promise<Shipment> => {
  const response = await apiRequest<{ shipment: Shipment }>(`/api/shipments/${id}/cancel`, {
    method: 'POST',
  });
  if (!response.shipment) {
    throw new Error('Cancellation response did not include a shipment.');
  }
  return response.shipment;
};
