import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../core/redis/redis.module';
import { randomUUID } from 'crypto';
import { RedisKeys } from '@nexus/shared';
import type { QuickReply } from '@nexus/shared';

@Injectable()
export class QuickRepliesService {
  private readonly logger = new Logger(QuickRepliesService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * List all quick replies for a tenant.
   */
  async list(instancia: string): Promise<QuickReply[]> {
    const key = RedisKeys.quickReplies(instancia);
    const all = await this.redis.hgetall(key);

    const replies: QuickReply[] = [];
    for (const [, val] of Object.entries(all)) {
      try {
        replies.push(JSON.parse(val));
      } catch {
        // skip malformed
      }
    }

    return replies.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Create a new quick reply template.
   */
  async create(
    instancia: string,
    name: string,
    content: string,
    shortcut?: string,
  ): Promise<QuickReply> {
    const id = randomUUID();
    const reply: QuickReply = { id, name, content, shortcut };

    const key = RedisKeys.quickReplies(instancia);
    await this.redis.hset(key, id, JSON.stringify(reply));

    this.logger.log(`Quick reply created: ${id} for ${instancia}`);
    return reply;
  }

  /**
   * Update an existing quick reply.
   */
  async update(
    instancia: string,
    id: string,
    updates: { name?: string; content?: string; shortcut?: string },
  ): Promise<QuickReply> {
    const key = RedisKeys.quickReplies(instancia);
    const raw = await this.redis.hget(key, id);
    if (!raw) {
      throw new NotFoundException(`Quick reply ${id} not found`);
    }

    const reply: QuickReply = JSON.parse(raw);

    if (updates.name !== undefined) reply.name = updates.name;
    if (updates.content !== undefined) reply.content = updates.content;
    if (updates.shortcut !== undefined) reply.shortcut = updates.shortcut;

    await this.redis.hset(key, id, JSON.stringify(reply));

    this.logger.log(`Quick reply updated: ${id} for ${instancia}`);
    return reply;
  }

  /**
   * Delete a quick reply.
   */
  async remove(instancia: string, id: string): Promise<void> {
    const key = RedisKeys.quickReplies(instancia);
    const deleted = await this.redis.hdel(key, id);
    if (deleted === 0) {
      throw new NotFoundException(`Quick reply ${id} not found`);
    }
    this.logger.log(`Quick reply deleted: ${id} for ${instancia}`);
  }
}
