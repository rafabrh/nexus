import { IoAdapter } from '@nestjs/platform-socket.io';
import type { INestApplicationContext } from '@nestjs/common';
import { createAdapter } from '@socket.io/redis-adapter';
import type Redis from 'ioredis';
import type { ServerOptions } from 'socket.io';

/**
 * Socket.IO adapter backed by Redis pub/sub so broadcasts reach clients on every
 * replica. Uses two duplicated ioredis connections (pub/sub channels must not
 * share the command connection).
 */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor!: ReturnType<typeof createAdapter>;

  constructor(app: INestApplicationContext, private readonly redis: Redis) {
    super(app);
  }

  async connect(): Promise<void> {
    const pubClient = this.redis.duplicate();
    const subClient = this.redis.duplicate();
    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, options);
    server.adapter(this.adapterConstructor);
    return server;
  }
}
