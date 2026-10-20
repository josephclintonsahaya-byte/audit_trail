import type { User } from './types';

export type Permission =
  | 'product:create'
  | 'product:update'
  | 'product:delete'
  | 'inventory:create'
  | 'inventory:update'
  | 'inventory:delete'
  | 'warehouse:create'
  | 'warehouse:update'
  | 'warehouse:delete'
  | 'shipment:create'
  | 'shipment:update'
  | 'shipment:dispatch'
  | 'shipment:deliver'
  | 'shipment:cancel'
  | 'shipment:delete'
  | 'shipment:record-temperature'
  | 'user:manage';

const rolePermissions: Record<User['role'], readonly Permission[]> = {
  admin: [
    'product:create', 'product:update', 'product:delete',
    'inventory:create', 'inventory:update', 'inventory:delete',
    'warehouse:create', 'warehouse:update', 'warehouse:delete',
    'shipment:create', 'shipment:update', 'shipment:dispatch',
    'shipment:deliver', 'shipment:cancel', 'shipment:delete',
    'shipment:record-temperature', 'user:manage',
  ],
  manager: [
    'product:create', 'product:update',
    'inventory:create', 'inventory:update', 'inventory:delete',
    'warehouse:create', 'warehouse:update',
    'shipment:create', 'shipment:update', 'shipment:dispatch',
    'shipment:deliver', 'shipment:cancel', 'shipment:record-temperature',
  ],
  staff: [],
};

export const hasPermission = (
  user: Pick<User, 'role'> | null,
  permission: Permission,
): boolean => {
  const role = typeof user?.role === 'string' ? user.role.trim().toLowerCase() : '';
  if (!Object.prototype.hasOwnProperty.call(rolePermissions, role)) return false;
  return rolePermissions[role as User['role']].includes(permission);
};
