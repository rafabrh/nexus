import { Injectable, Logger, Inject, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../core/redis/redis.module';
import { RedisKeys } from '@nexus/shared';
import type { TenantRegistry } from '@nexus/shared';
import { EvolutionClient } from '../whatsapp/evolution.client';
import { SyncService } from './sync.service';

export interface OnboardingState {
  instanceExists: boolean;
  connectionState: string | null;
  syncStatus: string | null;
}

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly evolution: EvolutionClient,
    private readonly config: ConfigService,
    private readonly sync: SyncService,
  ) {}

  async getState(instancia: string): Promise<OnboardingState> {
    const [connectionState, syncStatus] = await Promise.all([
      this.redis.get(RedisKeys.instanceState(instancia)),
      this.redis.get(RedisKeys.syncStatus(instancia)),
    ]);

    // Redis says instance exists but it's not connected — verify with Evolution API
    if (connectionState !== null && connectionState !== 'open') {
      const existsOnEvolution = await this.verifyInstanceExists(instancia);
      if (!existsOnEvolution) {
        this.logger.warn(`Instance ${instancia} not found on Evolution API, resetting Redis state`);
        await Promise.all([
          this.redis.del(RedisKeys.instanceState(instancia)),
          this.redis.del(RedisKeys.syncStatus(instancia)),
        ]);
        return { instanceExists: false, connectionState: null, syncStatus: null };
      }
    }

    return {
      instanceExists: connectionState !== null,
      connectionState,
      syncStatus,
    };
  }

  private async verifyInstanceExists(instancia: string): Promise<boolean> {
    try {
      await this.evolution.getConnectionState(instancia);
      return true;
    } catch {
      return false;
    }
  }

  async createInstance(instancia: string): Promise<{ instanceName: string; state: string }> {
    const existing = await this.redis.get(RedisKeys.instanceState(instancia));
    if (existing) {
      // Verify the instance actually exists on Evolution API
      const existsOnEvolution = await this.verifyInstanceExists(instancia);
      if (existsOnEvolution) {
        throw new ConflictException(`Instancia ${instancia} ja existe`);
      }
      // Instance was deleted externally — clean up stale Redis state
      this.logger.warn(`Stale Redis state for ${instancia}, cleaning up for re-creation`);
      await Promise.all([
        this.redis.del(RedisKeys.instanceState(instancia)),
        this.redis.del(RedisKeys.syncStatus(instancia)),
      ]);
    }

    const appBaseUrl = this.config.get<string>('APP_BASE_URL', 'http://localhost:4000');
    const webhookUrl = `${appBaseUrl}/api/v1/webhook/evolution`;

    await this.evolution.createInstance(instancia, webhookUrl);

    await Promise.all([
      this.redis.set(RedisKeys.instanceState(instancia), 'created'),
      this.redis.set(RedisKeys.syncStatus(instancia), 'pending'),
    ]);

    await this.updateTenantRegistry(instancia, 'created', 'pending');

    this.logger.log(`onboarding.instance-created instancia=${instancia}`);
    return { instanceName: instancia, state: 'created' };
  }

  async getQrCode(instancia: string): Promise<{ qrCode: string; expiresIn: number }> {
    const result = await this.evolution.getQrCode(instancia);
    this.logger.log(`onboarding.qr-generated instancia=${instancia}`);
    return {
      qrCode: result.base64,
      expiresIn: 40,
    };
  }

  async startSync(instancia: string): Promise<{ status: string; chatsImported: number; messagesImported: number }> {
    const currentSync = await this.redis.get(RedisKeys.syncStatus(instancia));
    if (currentSync === 'syncing') {
      throw new ConflictException('Sync ja em andamento');
    }

    await this.redis.set(RedisKeys.syncStatus(instancia), 'syncing');
    await this.updateTenantRegistry(instancia, undefined, 'syncing');

    try {
      const result = await this.sync.syncAll(instancia);

      await this.redis.set(RedisKeys.syncStatus(instancia), 'done');
      await this.updateTenantRegistry(instancia, undefined, 'done');

      this.logger.log(
        `sync.completed instancia=${instancia} chats=${result.chats} messages=${result.messages} durationMs=${result.durationMs}`,
      );

      return {
        status: 'done',
        chatsImported: result.chats,
        messagesImported: result.messages,
      };
    } catch (err) {
      await this.redis.set(RedisKeys.syncStatus(instancia), 'error');
      await this.updateTenantRegistry(instancia, undefined, 'error');
      this.logger.error(`sync.failed instancia=${instancia}: ${(err as Error).message}`);
      throw err;
    }
  }

  private async updateTenantRegistry(
    instancia: string,
    connectionState?: string,
    syncStatus?: string,
  ): Promise<void> {
    const raw = await this.redis.get(RedisKeys.tenantRegistry());
    if (!raw) return;

    try {
      const registry: TenantRegistry = JSON.parse(raw);
      const tenant = registry.tenants.find((t) => t.instancia === instancia);
      if (!tenant) return;

      if (connectionState !== undefined) {
        tenant.connectionState = connectionState as TenantRegistry['tenants'][number]['connectionState'];
      }
      if (syncStatus !== undefined) {
        tenant.syncStatus = syncStatus as TenantRegistry['tenants'][number]['syncStatus'];
      }
      if (connectionState === 'open' && !tenant.connectedAt) {
        tenant.connectedAt = new Date().toISOString();
      }

      registry.version++;
      await this.redis.set(RedisKeys.tenantRegistry(), JSON.stringify(registry));
    } catch {
      this.logger.warn('Failed to update tenant registry connection state');
    }
  }
}
