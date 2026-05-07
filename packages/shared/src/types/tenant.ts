export interface TenantUser {
  email: string;
  role: 'admin' | 'operator';
}

export interface TenantEntry {
  instancia: string;
  name: string;
  users: TenantUser[];
  createdAt: string;
  active: boolean;
}

export interface TenantRegistry {
  version: number;
  tenants: TenantEntry[];
}
