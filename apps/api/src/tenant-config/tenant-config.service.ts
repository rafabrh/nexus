import {
  Injectable,
  Inject,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { RedisKeys } from '@nexus/shared';
import { REDIS_CLIENT } from '../core/redis/redis.module';
import { TenantEngineConfigRepository } from './tenant-engine-config.repository';
import { InMemoryGatewayConfigStore } from './in-memory-gateway-config.store';
import type { TenantEngineConfig } from './tenant-engine-config.types';

/**
 * Orquestra a config por tenant (§4.6): Postgres = fonte de verdade;
 * write-through → Redis (`tenant:cfg:<inst>`) para o futuro engine GO; e hidrata
 * o snapshot em memória ({@link InMemoryGatewayConfigStore}) que o normalizer
 * consulta SÍNCRONO. Reconcile no boot + tick periódico mantêm o snapshot fresco
 * entre réplicas sem pub/sub (config muda raramente).
 */
@Injectable()
export class TenantConfigService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(TenantConfigService.name);
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly repo: TenantEngineConfigRepository,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly store: InMemoryGatewayConfigStore,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.safeReconcile(); // boot: Postgres → Redis + snapshot em memória
    const sec = Number(this.config.get<number>('TENANT_CFG_RECONCILE_SEC') ?? 60);
    this.timer = setInterval(() => void this.safeRehydrate(), sec * 1000);
    if (typeof this.timer.unref === 'function') this.timer.unref(); // não segura o process
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Grava a config (Postgres = verdade), espelha no Redis e re-hidrata o snapshot. */
  async upsert(instancia: string, config: TenantEngineConfig): Promise<void> {
    await this.repo.upsert(instancia, config);
    await this.redis.set(RedisKeys.tenantCfg(instancia), JSON.stringify(config));
    await this.rehydrate();
  }

  /** Boot/full: Postgres → write-through Redis de TODAS + hidrata o snapshot. */
  async reconcile(): Promise<void> {
    const rows = await this.repo.list();
    await Promise.all(
      rows.map((r) => this.redis.set(RedisKeys.tenantCfg(r.instancia), JSON.stringify(r.config))),
    );
    this.store.hydrate(rows);
    this.logger.log(`tenant-cfg.reconciled n=${rows.length}`);
  }

  /** Tick periódico: só re-hidrata o snapshot em memória (não reescreve o Redis). */
  async rehydrate(): Promise<void> {
    this.store.hydrate(await this.repo.list());
  }

  private async safeReconcile(): Promise<void> {
    try {
      await this.reconcile();
    } catch (err) {
      // Falha do reconcile NUNCA derruba o boot — o snapshot fica vazio (GO não
      // resolve) até o próximo tick; o Node segue normal.
      this.logger.error(`tenant-cfg.reconcile-failed: ${(err as Error).message}`);
    }
  }

  private async safeRehydrate(): Promise<void> {
    try {
      await this.rehydrate();
    } catch (err) {
      this.logger.warn(`tenant-cfg.rehydrate-failed: ${(err as Error).message}`);
    }
  }
}
