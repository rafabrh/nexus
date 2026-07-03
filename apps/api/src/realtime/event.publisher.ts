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

  /**
   * @param opts.persistToStream Grava no stream de replay (default true). Eventos de
   *   alto volume e puramente de UI (ex.: `message.status`/tiques, ~3x por mensagem)
   *   passam `false`: a entrega ao vivo (cross-réplica via adapter Redis do socket.io)
   *   é mantida, mas não poluem a janela finita (1000) de replay nem inflam o
   *   catch-up no reconnect. Esses eventos não avançam o `lastEventId` no cliente
   *   (early-return antes do addEvent), então nunca são a base de um replay; e o
   *   estado é reconstruído da fonte da verdade (hash de ACK) no refetch.
   */
  async publish(
    event: NexusEvent,
    opts: { persistToStream?: boolean } = {},
  ): Promise<void> {
    // Persist to the stream FIRST so the Redis-generated stream ID becomes the
    // eventId. That ID is what clients replay via XRANGE on reconnect — a
    // synthetic `${ts}-${random}` id is NOT a valid stream ID and made replay
    // throw "Invalid stream ID".
    let streamId: string | null = null;
    if (opts.persistToStream !== false) {
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
