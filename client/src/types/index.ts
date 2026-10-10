export type ProductStatus = 'active' | 'inactive';
export type InventoryStatus = 'active' | 'inactive';
export type ShipmentStatus = 'CREATED' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'staff';
}

export interface Product {
  _id?: string;
  id?: string;
  name: string;
  sku: string;
  category: string;
  price: number;
  quantity: number;
  status: ProductStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface Warehouse {
  _id?: string;
  id?: string;
  name: string;
  code: string;
  location: string;
  status: InventoryStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface InventoryItem {
  _id?: string;
  id?: string;
  productId: Product | string | null;
  warehouseId: Warehouse | string | null;
  quantity: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ShipmentItem {
  productId: Product | string;
  quantity: number;
}

export interface Shipment {
  _id?: string;
  id?: string;
  shipmentNumber: string;
  sourceWarehouseId: Warehouse | string;
  destinationWarehouseId: Warehouse | string;
  items: ShipmentItem[];
  status: ShipmentStatus;
  version?: number;
  createdBy?: User | string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ShipmentAggregateState {
  shipmentNumber: string;
  sourceWarehouseId: string;
  destinationWarehouseId: string;
  items: Array<{ productId: string; quantity: number }>;
  status: ShipmentStatus;
  createdBy: string;
  deleted?: boolean;
}

export interface ShipmentDomainEvent {
  id: string;
  aggregateId: string;
  aggregateType: 'Shipment';
  version: number;
  eventType: string;
  timestamp: string;
  performedBy: string;
  payload: Record<string, unknown>;
  metadata?: Record<string, string>;
}

export interface ShipmentReconstruction {
  aggregateId: string;
  version: number;
  eventCount: number;
  state: ShipmentAggregateState | null;
}

export interface AuditEvent {
  _id?: string;
  id?: string;
  eventType: string;
  entityType: string;
  entityId: string;
  performedBy?: User | string | null;
  payload?: Record<string, unknown>;
  timestamp?: string;
  createdAt?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
  product?: T;
  products?: T;
  shipment?: T;
  shipments?: T;
  inventory?: T;
  inventories?: T;
  events?: T;
  user?: User;
  token?: string;
  [key: string]: unknown;
}
