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
  connectionState?: 'created' | 'open' | 'close' | 'connecting';
  syncStatus?: 'pending' | 'syncing' | 'done' | 'error';
  connectedAt?: string;
  n8nWebhookUrl?: string;
}

export interface TenantRegistry {
  version: number;
  tenants: TenantEntry[];
}
