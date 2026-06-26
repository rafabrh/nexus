export interface TenantUser {
  email: string;
  // 'superadmin' = dono da plataforma (rotas cross-tenant /admin/*); criado só
  // via bootstrap SQL, nunca pela API (AddUserDto restringe a admin|operator).
  role: 'admin' | 'operator' | 'superadmin';
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
