import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
  Logger,
} from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../core/redis/redis.module';
import { RedisKeys } from '@nexus/shared';
import { EvolutionClient } from '../whatsapp/evolution.client';
import { EventPublisher } from './event.publisher';
import { TenantRepository } from '../admin/tenant.repository';

/**
 * Keeps the panel's view of each instance's WhatsApp connection honest with the
 * Evolution API, independent of webhooks (which can be lost on API restarts,
 * tunnel hiccups, or external deletion). On every cycle it probes the tracked
 * instances and, when the real state differs from what Redis holds, persists
 * the change and PUSHES it to the UI via Socket.IO — so the operator sees a
 * dropped/deleted instance in near real time instead of on the next navigation.
 *
 * Scale note: this iterates tenants sequentially with a throttle. For a large
 * fleet (100x), shard by tenant across replicas or move to a queue; the probe
 * call already rides the Evolution circuit breaker so a downstream outage can't
 * amplify into a probe storm.
 */
@Injectable()
export class ConnectionReconcilerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ConnectionReconcilerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  private static readonly INTERVAL_MS = 30_000;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly evolution: EvolutionClient,
    private readonly publisher: EventPublisher,
    private readonly tenants: TenantRepository,
  ) {}

  onModuleInit() {
    this.timer = setInterval(
      () => void this.reconcileAll(),
      ConnectionReconcilerService.INTERVAL_MS,
    );
    this.logger.log(
      `Connection reconciler started (${ConnectionReconcilerService.INTERVAL_MS / 1000}s interval)`,
    );
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Probes every tracked instance once per cycle (skips overlapping runs). */
  private async reconcileAll(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const list = await this.tenants.list();
      for (const t of list) {
        await this.reconcileOne(t.instancia).catch((err: Error) =>
          this.logger.warn(`reconcile ${t.instancia} failed: ${err.message}`),
        );
      }
    } catch (err) {
      this.logger.warn(`reconcileAll failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /** Reconciles a single instance against the Evolution API. */
  async reconcileOne(instancia: string): Promise<void> {
    const current = await this.redis.get(RedisKeys.instanceState(instancia));
    // Only track instances the panel knows about (Redis has a state for them).
    if (current === null) return;

    const probe = await this.evolution.probeState(instancia);

    // Transient failure — never act on uncertainty (would wipe a live instance).
    if (probe.status === 'unknown') return;

    if (probe.status === 'absent') {
      await this.applyState(instancia, 'absent');
      return;
    }

    if (probe.state !== current) {
      await this.applyState(instancia, probe.state);
    }
  }

  /**
   * Persists the new state, mirrors it to Postgres, and pushes a connection
   * event to the tenant's clients. `absent` clears the Redis state so the
   * onboarding guard routes the operator back to (re)connect.
   */
  async applyState(instancia: string, state: string): Promise<void> {
    if (state === 'absent') {
      await Promise.all([
        this.redis.del(RedisKeys.instanceState(instancia)),
        this.redis.del(RedisKeys.syncStatus(instancia)),
      ]);
    } else {
      await this.redis.set(RedisKeys.instanceState(instancia), state);
    }

    await this.tenants
      .updateState(instancia, { connectionState: state })
      .catch(() => this.logger.warn(`tenant state mirror failed for ${instancia}`));

    await this.publisher.publish({
      type: 'connection.update',
      instancia,
      jid: '',
      ts: Date.now(),
      payload: { state },
    });

    this.logger.log(`connection.reconciled instancia=${instancia} state=${state}`);
  }
}
