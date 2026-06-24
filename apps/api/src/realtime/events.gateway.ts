import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Logger, Inject } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import type Redis from 'ioredis';
import { RedisKeys } from '@nexus/shared';
import { REDIS_CLIENT } from '../core/redis/redis.module';
import { NexusJwtService } from '../auth/jwt.service';
import { EventPublisher } from './event.publisher';
import { StreamReplayService } from './stream-replay.service';

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:3000'],
    credentials: true,
  },
  namespace: '/',
  transports: ['websocket', 'polling'],
})
export class EventsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(EventsGateway.name);

  constructor(
    private readonly jwt: NexusJwtService,
    private readonly publisher: EventPublisher,
    private readonly replay: StreamReplayService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  afterInit(server: Server) {
    this.publisher.setServer(server);
    this.logger.log('Socket.IO Gateway initialized');
  }

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token
        || (client.handshake.query?.token as string);

      if (!token) {
        client.disconnect(true);
        return;
      }

      const payload = await this.jwt.verify(token);

      // Parity with the HTTP guard: a refresh token must never open a socket,
      // and a token revoked at logout must be rejected even mid-session.
      if (payload.type !== 'access') {
        client.disconnect(true);
        return;
      }

      const blacklisted = await this.redis.get(
        RedisKeys.sessionBlacklist(payload.jti!),
      );
      if (blacklisted) {
        client.disconnect(true);
        return;
      }

      const room = `tenant:${payload.instancia}`;

      client.data.user = payload;
      client.data.instancia = payload.instancia;

      await client.join(room);

      this.logger.log(`Client connected: ${payload.sub} -> ${room}`);
    } catch (err: any) {
      this.logger.warn(`Auth failed on WS connect: ${err.message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const email = client.data?.user?.sub ?? 'unknown';
    this.logger.log(`Client disconnected: ${email}`);
  }

  @SubscribeMessage('replay')
  async handleReplay(client: Socket, data: { lastEventId: string }) {
    const instancia = client.data.instancia;
    if (!instancia) return;

    const events = await this.replay.getEventsSince(instancia, data.lastEventId);
    client.emit('replay-response', { events, count: events.length });
  }

  @SubscribeMessage('join-conversation')
  async handleJoinConversation(client: Socket, data: { jid: string }) {
    const instancia = client.data.instancia;
    if (!instancia) return;

    const room = `conversation:${instancia}:${data.jid}`;
    await client.join(room);
  }

  @SubscribeMessage('leave-conversation')
  async handleLeaveConversation(client: Socket, data: { jid: string }) {
    const instancia = client.data.instancia;
    if (!instancia) return;

    const room = `conversation:${instancia}:${data.jid}`;
    await client.leave(room);
  }
}
