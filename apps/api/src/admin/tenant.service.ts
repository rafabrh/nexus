import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../core/redis/redis.service';
import { RedisKeys } from '@nexus/shared';

export interface TenantInfo {
  instancia: string;
  adminEmail: string;
  createdAt: string;
  active: boolean;
}

@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name);

  constructor(private readonly redis: RedisService) {}

  async listTenants(): Promise<TenantInfo[]> {
    const client = this.redis.getClient();
    const data = await client.hgetall(RedisKeys.tenantRegistry());

    return Object.entries(data).map(([instancia, json]) => {
      const parsed = JSON.parse(json);
      return { instancia, ...parsed };
    });
  }

  async getTenant(instancia: string): Promise<TenantInfo | null> {
    const client = this.redis.getClient();
    const data = await client.hget(RedisKeys.tenantRegistry(), instancia);
    if (!data) return null;

    const parsed = JSON.parse(data);
    return { instancia, ...parsed };
  }

  async registerTenant(instancia: string, adminEmail: string): Promise<TenantInfo> {
    const client = this.redis.getClient();
    const info: Omit<TenantInfo, 'instancia'> = {
      adminEmail,
      createdAt: new Date().toISOString(),
      active: true,
    };

    await client.hset(RedisKeys.tenantRegistry(), instancia, JSON.stringify(info));
    this.logger.log(`Tenant registered: ${instancia} (${adminEmail})`);

    return { instancia, ...info };
  }

  async toggleTenant(instancia: string, active: boolean): Promise<TenantInfo | null> {
    const existing = await this.getTenant(instancia);
    if (!existing) return null;

    existing.active = active;
    const { instancia: _, ...data } = existing;
    const client = this.redis.getClient();
    await client.hset(RedisKeys.tenantRegistry(), instancia, JSON.stringify(data));

    this.logger.log(`Tenant ${instancia} ${active ? 'activated' : 'deactivated'}`);
    return existing;
  }
}
