import { Injectable, Inject } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { DB, type Database } from '../core/db/db.module';
import { tenantEngineConfig, type TenantEngineConfigRow } from '../core/db/schema';
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
