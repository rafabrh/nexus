import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';
import { RedisService } from '../core/redis/redis.service';
import type { NexusEvent, NexusEventEnvelope } from '@nexus/shared';

@Injectable()
export class EventPublisher {
  private server!: Server;
  private readonly logger = new Logger(EventPublisher.name);

  constructor(private readonly redis: RedisService) {}

  setServer(server: Server) {
    this.server = server;
  }

  async publish(event: NexusEvent): Promise<void> {
    // Persist to the stream FIRST so the Redis-generated stream ID becomes the
    // eventId. That ID is what clients replay via XRANGE on reconnect — a
    // synthetic `${ts}-${random}` id is NOT a valid stream ID and made replay
    // throw "Invalid stream ID".
    let streamId: string | null = null;
    try {
      streamId = await this.redis.xadd(
        `events:${event.instancia}`,
        1000,
        '*',
        'data',
        JSON.stringify(event),
      );
    } catch (err: any) {
      this.logger.warn(`Stream write failed: ${err.message}`);
    }

    // Fall back to a synthetic id only when the stream write failed (the live
    // emit still works; only replay of this one event won't).
    const eventId = streamId ?? `${event.ts}-${Math.random().toString(36).slice(2, 6)}`;
    const envelope: NexusEventEnvelope = { eventId, ...event };

    if (this.server) {
      this.server.to(`tenant:${event.instancia}`).emit('nexus-event', envelope);
    }

    this.logger.debug(`Published ${event.type} for ${event.instancia}/${event.jid}`);
  }
}
