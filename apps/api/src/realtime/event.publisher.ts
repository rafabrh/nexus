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
    const eventId = `${event.ts}-${Math.random().toString(36).slice(2, 6)}`;
    const envelope: NexusEventEnvelope = { eventId, ...event };

    if (this.server) {
      this.server.to(`tenant:${event.instancia}`).emit('nexus-event', envelope);
    }

    try {
      await this.redis.xadd(
        `events:${event.instancia}`,
        1000,
        '*',
        'data',
        JSON.stringify(envelope),
      );
    } catch (err: any) {
      this.logger.warn(`Stream write failed: ${err.message}`);
    }

    this.logger.debug(`Published ${event.type} for ${event.instancia}/${event.jid}`);
  }
}
