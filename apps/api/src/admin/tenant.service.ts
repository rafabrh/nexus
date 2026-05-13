import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../core/redis/redis.service';
import { RedisKeys } from '@nexus/shared';
import type { TenantRegistry, TenantEntry, TenantUser } from '@nexus/shared';

@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name);

  constructor(private readonly redis: RedisService) {}

  private async loadRegistry(): Promise<TenantRegistry> {
    const raw = await this.redis.get(RedisKeys.tenantRegistry());
    if (!raw) {
      return { version: 1, tenants: [] };
    }
    try {
      return JSON.parse(raw) as TenantRegistry;
    } catch {
      this.logger.warn('Failed to parse tenant registry, returning empty');
      return { version: 1, tenants: [] };
    }
  }

  private async saveRegistry(registry: TenantRegistry): Promise<void> {
    await this.redis.set(RedisKeys.tenantRegistry(), JSON.stringify(registry));
  }

  async listTenants(): Promise<TenantEntry[]> {
    const registry = await this.loadRegistry();
    return registry.tenants;
  }

  async getTenant(instancia: string): Promise<TenantEntry | null> {
    const registry = await this.loadRegistry();
    return registry.tenants.find((t) => t.instancia === instancia) ?? null;
  }

  async registerTenant(instancia: string, adminEmail: string): Promise<TenantEntry> {
    const registry = await this.loadRegistry();

    // Check if tenant already exists
    const existing = registry.tenants.find((t) => t.instancia === instancia);
    if (existing) {
      this.logger.warn(`Tenant ${instancia} already exists, returning existing`);
      return existing;
    }

    const entry: TenantEntry = {
      instancia,
      name: instancia,
      users: [{ email: adminEmail, role: 'admin' }],
      createdAt: new Date().toISOString(),
      active: true,
    };

    registry.tenants.push(entry);
    registry.version++;
    await this.saveRegistry(registry);

    this.logger.log(`Tenant registered: ${instancia} (${adminEmail})`);
    return entry;
  }

  async toggleTenant(instancia: string, active: boolean): Promise<TenantEntry | null> {
    const registry = await this.loadRegistry();
    const tenant = registry.tenants.find((t) => t.instancia === instancia);
    if (!tenant) return null;

    tenant.active = active;
    registry.version++;
    await this.saveRegistry(registry);

    this.logger.log(`Tenant ${instancia} ${active ? 'activated' : 'deactivated'}`);
    return tenant;
  }

  async addUser(instancia: string, user: TenantUser): Promise<TenantEntry | null> {
    const registry = await this.loadRegistry();
    const tenant = registry.tenants.find((t) => t.instancia === instancia);
    if (!tenant) return null;

    const existing = tenant.users.find(
      (u) => u.email.toLowerCase() === user.email.toLowerCase(),
    );
    if (!existing) {
      tenant.users.push(user);
      registry.version++;
      await this.saveRegistry(registry);
    }

    return tenant;
  }

  async removeUser(instancia: string, email: string): Promise<TenantEntry | null> {
    const registry = await this.loadRegistry();
    const tenant = registry.tenants.find((t) => t.instancia === instancia);
    if (!tenant) return null;

    tenant.users = tenant.users.filter(
      (u) => u.email.toLowerCase() !== email.toLowerCase(),
    );
    registry.version++;
    await this.saveRegistry(registry);

    return tenant;
  }
}
