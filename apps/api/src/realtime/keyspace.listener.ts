import { Injectable, OnModuleInit, OnModuleDestroy, Inject, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../core/redis/redis.module';
import { RedisKeys } from '@nexus/shared';
import { EventTranslator } from './event.translator';
import { EventPublisher } from './event.publisher';
import { ConversationProjectionService } from '../conversation/conversation-projection.service';

@Injectable()
export class KeyspaceListener implements OnModuleInit, OnModuleDestroy {
  private subscriber!: Redis;
  private readonly logger = new Logger(KeyspaceListener.name);

  /**
   * Patterns target the keys that carry real meaning. `chathistory:*` on rpush
   * captures both the client message and the AI reply — the moment the visible
   * history changes — replacing the fragile `buffer` proxy.
   */
  private patternsFor(db: number): string[] {
    const prefix = `__keyspace@${db}__:`;
    return [
      `${prefix}chathistory:*`,
      `${prefix}chat:*:humanControlUntil`,
      `${prefix}chat:*:paymentStatus`,
      `${prefix}chat:*:processing`,
      `${prefix}chat:*:followup_step`,
      `${prefix}mp:payment:*:approvedSent`,
    ];
  }

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly translator: EventTranslator,
    private readonly publisher: EventPublisher,
    private readonly projection: ConversationProjectionService,
  ) {}

  async onModuleInit() {
    this.subscriber = this.redis.duplicate();

    // The keyspace DB index must match the connection's DB, not a hardcoded @0.
    const db = this.redis.options?.db ?? 0;
    const patterns = this.patternsFor(db);

    for (const pattern of patterns) {
      await this.subscriber.psubscribe(pattern);
    }

    this.subscriber.on('pmessage', async (_pattern: string, channel: string, operation: string) => {
      try {
        const event = await this.translator.translate(channel, operation);
        if (event) {
          await this.publisher.publish(event);

          if (event.instancia && event.jid) {
            // Self-heal the conversation index on every persisted message.
            if (event.type === 'message.received') {
              await this.redis
                .sadd(RedisKeys.conversationIndex(event.instancia), event.jid)
                .catch((err: Error) =>
                  this.logger.warn(`index self-heal failed: ${err.message}`),
                );
            }
            // Write-behind: projeta o estado atual do Redis no Postgres. Cobre as
            // mudanças dirigidas pelo N8N (followup_step, chathistory, payment).
            await this.projection
              .project(event.instancia, event.jid)
              .catch((err: Error) =>
                this.logger.warn(`projection failed: ${err.message}`),
              );
          }
        }
      } catch (err: any) {
        this.logger.warn(`Keyspace event error: ${err.message}`, { channel, operation });
      }
    });

    this.logger.log(`Subscribed to ${patterns.length} keyspace patterns (db=${db})`);
  }

  async onModuleDestroy() {
    await this.subscriber?.punsubscribe();
    await this.subscriber?.quit();
  }
}
