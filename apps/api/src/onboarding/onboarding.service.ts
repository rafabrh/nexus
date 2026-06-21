import {
  Injectable,
  Logger,
  Inject,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../core/redis/redis.module';
import { RedisKeys } from '@nexus/shared';
import { EvolutionClient } from '../whatsapp/evolution.client';
import { SyncService } from './sync.service';
import { TenantRepository } from '../admin/tenant.repository';

export interface OnboardingState {
  instanceExists: boolean;
  connectionState: string | null;
  syncStatus: string | null;
}

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  // Max one Evolution probe per instance within this window on getState reads.
  private static readonly PROBE_THROTTLE_SECONDS = 20;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly evolution: EvolutionClient,
    private readonly config: ConfigService,
    private readonly sync: SyncService,
    private readonly tenants: TenantRepository,
  ) {}

  async getState(instancia: string): Promise<OnboardingState> {
    let connectionState = await this.redis.get(RedisKeys.instanceState(instancia));
    const syncStatus = await this.redis.get(RedisKeys.syncStatus(instancia));

    // The Evolution instance is the SINGLE SOURCE OF TRUTH for connectivity.
    // Even when Redis says 'open', the instance may have been deleted or
    // disconnected externally — serving stale conversations would lie to the
    // operator (the exact bug: a deleted instance still showed chats). So we
    // revalidate against Evolution on EVERY state read, throttled so we never
    // hammer the API (at most one probe per PROBE_THROTTLE_SECONDS per
    // instance; the connection.update webhook still pushes faster updates).
    if (connectionState !== null) {
      const probedRecently = await this.redis.get(
        RedisKeys.instanceProbeAt(instancia),
      );

      if (!probedRecently) {
        await this.redis.set(
          RedisKeys.instanceProbeAt(instancia),
          Date.now().toString(),
          'EX',
          OnboardingService.PROBE_THROTTLE_SECONDS,
        );

        const probe = await this.probeInstance(instancia);

        if (probe.status === 'absent') {
          // Evolution CONFIRMED (404) the instance no longer exists. Reset the
          // stale Redis state so the panel stops serving dead conversations and
          // routes the operator back to (re)connect.
          this.logger.warn(
            `Instance ${instancia} not found on Evolution API, resetting Redis state`,
          );
          await Promise.all([
            this.redis.del(RedisKeys.instanceState(instancia)),
            this.redis.del(RedisKeys.syncStatus(instancia)),
          ]);
          await this.updateTenantRegistry(instancia, 'absent', 'pending');
          return { instanceExists: false, connectionState: null, syncStatus: null };
        }

        if (probe.status === 'exists' && probe.state !== connectionState) {
          // Drift between Redis and Evolution (a connection.update webhook was
          // missed, in either direction) — reconcile to the real state.
          await this.redis.set(RedisKeys.instanceState(instancia), probe.state);
          await this.updateTenantRegistry(instancia, probe.state);
          connectionState = probe.state;
          this.logger.log(
            `onboarding.state-reconciled instancia=${instancia} -> ${probe.state}`,
          );
        }
        // probe.status === 'unknown' (Evolution unreachable): keep current state
        // — a transient error must never wipe a real instance's state.
      }
    }

    return {
      instanceExists: connectionState !== null,
      connectionState,
      syncStatus,
    };
  }

  /**
   * Probes an instance on the Evolution API, distinguishing three cases that
   * MUST NOT be collapsed:
   *  - `exists`  : the instance is live (with its connection state)
   *  - `absent`  : Evolution returned 404 — the instance genuinely does not exist
   *  - `unknown` : the call failed (timeout/network/5xx) — we cannot tell
   *
   * Collapsing `unknown` into `absent` is dangerous: it lets a transient error
   * trigger destructive recreation of a live instance (dropping WhatsApp and
   * overwriting the N8N webhook). Callers must treat `unknown` as fail-safe.
   */
  private async probeInstance(
    instancia: string,
  ): Promise<{ status: 'exists'; state: string } | { status: 'absent' } | { status: 'unknown' }> {
    return this.evolution.probeState(instancia);
  }

  async createInstance(instancia: string): Promise<{ instanceName: string; state: string }> {
    const probe = await this.probeInstance(instancia);
    const redisState = await this.redis.get(RedisKeys.instanceState(instancia));

    if (probe.status === 'exists') {
      // The instance is already live on Evolution. Creating it again would
      // reconfigure its webhook and could hijack a production N8N flow, so we
      // only proceed if THIS panel created it (tracked in Redis). Otherwise
      // refuse — never touch a foreign/production instance.
      if (!redisState) {
        this.logger.warn(
          `onboarding.create-refused instancia=${instancia} reason=foreign-instance`,
        );
        throw new ConflictException(
          `Instancia ${instancia} ja existe na Evolution e nao foi criada por este painel`,
        );
      }
      throw new ConflictException(`Instancia ${instancia} ja existe`);
    }

    if (probe.status === 'unknown') {
      // We could not confirm the instance state. NEVER recreate under
      // uncertainty — recreating a live instance drops its WhatsApp session and
      // overwrites the sacred N8N webhook. Fail safe and ask to retry.
      this.logger.error(
        `onboarding.create-aborted instancia=${instancia} reason=evolution-unreachable`,
      );
      throw new ServiceUnavailableException(
        'Nao foi possivel verificar a instancia na Evolution. Tente novamente em instantes.',
      );
    }

    // probe.status === 'absent' — Evolution confirmed (404) the instance is gone.
    if (redisState) {
      // Stale Redis state (instance deleted externally) — clean up and recreate.
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
    try {
      // UPDATE por linha no Postgres (connectedAt é gravado uma única vez na
      // primeira conexão pelo próprio repositório).
      await this.tenants.updateState(instancia, { connectionState, syncStatus });
    } catch {
      this.logger.warn('Failed to update tenant connection state');
    }
  }
}
