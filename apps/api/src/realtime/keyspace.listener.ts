import { Injectable, OnModuleInit, OnModuleDestroy, Inject, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../core/redis/redis.module';
import { EventTranslator } from './event.translator';
import { EventPublisher } from './event.publisher';

@Injectable()
export class KeyspaceListener implements OnModuleInit, OnModuleDestroy {
  private subscriber!: Redis;
  private readonly logger = new Logger(KeyspaceListener.name);

  private readonly patterns = [
    '__keyspace@0__:chat:*:humanControlUntil',
    '__keyspace@0__:chat:*:paymentStatus',
    '__keyspace@0__:chat:*:buffer',
    '__keyspace@0__:chat:*:processing',
    '__keyspace@0__:chat:*:followup_step',
    '__keyspace@0__:mp:payment:*:approvedSent',
  ];

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly translator: EventTranslator,
    private readonly publisher: EventPublisher,
  ) {}

  async onModuleInit() {
    this.subscriber = this.redis.duplicate();

    for (const pattern of this.patterns) {
      await this.subscriber.psubscribe(pattern);
    }

    this.subscriber.on('pmessage', async (_pattern: string, channel: string, operation: string) => {
      try {
        const event = this.translator.translate(channel, operation);
        if (event) {
          await this.publisher.publish(event);
        }
      } catch (err: any) {
        this.logger.warn(`Keyspace event error: ${err.message}`, { channel, operation });
      }
    });

    this.logger.log(`Subscribed to ${this.patterns.length} keyspace patterns`);
  }

  async onModuleDestroy() {
    await this.subscriber?.punsubscribe();
    await this.subscriber?.quit();
  }
}
