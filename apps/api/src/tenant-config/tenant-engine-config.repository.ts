import { Injectable, Inject } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { DB, type Database } from '../core/db/db.module';
import { tenants, tenantEngineConfig, type TenantEngineConfigRow } from '../core/db/schema';
import type { TenantEngineConfig } from './tenant-engine-config.types';

/**
 * Acesso ao `tenant_engine_config` (Postgres = fonte de verdade da config, §4.6).
 * `list()` alimenta a hidratação do snapshot em memória e o write-through Redis.
 */
@Injectable()
export class TenantEngineConfigRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async get(instancia: string): Promise<TenantEngineConfigRow | null> {
    const [row] = await this.db
      .select()
      .from(tenantEngineConfig)
      .where(eq(tenantEngineConfig.instancia, instancia));
    return row ?? null;
  }

  async list(): Promise<TenantEngineConfigRow[]> {
    return this.db.select().from(tenantEngineConfig);
  }

  /**
   * Junta a config (`tenant_engine_config`) ao `gateway` do registry (`tenants`),
   * fonte ÚNICA do roteamento (D7). LEFT JOIN: tenants SEM config vêm com
   * `config=null` → normaliza p/ `{}` (tenant Node puro). Alimenta a hidratação
   * do snapshot com o gateway por instância (fonte p/ o router de saída).
   */
  async listWithGateway(): Promise<
    { instancia: string; gateway: string; config: TenantEngineConfig }[]
  > {
    const rows = await this.db
      .select({
        instancia: tenants.instancia,
        gateway: tenants.gateway,
        config: tenantEngineConfig.config,
      })
      .from(tenants)
      .leftJoin(tenantEngineConfig, eq(tenants.instancia, tenantEngineConfig.instancia));
    return rows.map((r) => ({
      instancia: r.instancia,
      gateway: r.gateway,
      config: (r.config ?? {}) as TenantEngineConfig,
    }));
  }

  /**
   * Insere ou funde a config do tenant. No conflito (já existe) SUBSTITUI o jsonb
   * e **bumpa `cfg_version`** — o incremento é o sinal de drift que o reconcile e
   * o engine observam (§4.6). `updated_at` explícito para o write-through refletir.
   */
  async upsert(instancia: string, config: TenantEngineConfig): Promise<void> {
    await this.db
      .insert(tenantEngineConfig)
      .values({ instancia, config, cfgVersion: 1 })
      .onConflictDoUpdate({
        target: tenantEngineConfig.instancia,
        set: {
          config,
          cfgVersion: sql`${tenantEngineConfig.cfgVersion} + 1`,
          updatedAt: new Date(),
        },
      });
  }
}
