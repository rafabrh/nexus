import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../core/redis/redis.module';
import { randomUUID } from 'crypto';
import { RedisKeys } from '@nexus/shared';
import type { Reminder, ReminderStatus } from '@nexus/shared';
import { EventPublisher } from '../realtime/event.publisher';

@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly publisher: EventPublisher,
  ) {}

  /**
   * Create a new reminder.
   */
  async create(
    instancia: string,
    jid: string,
    text: string,
    triggerAt: number,
    createdBy: string,
  ): Promise<Reminder> {
    const id = randomUUID();
    const reminder: Reminder = {
      id,
      instancia,
      jid,
      text,
      triggerAt,
      createdBy,
      status: 'pending',
    };

    // Store reminder hash
    const hashKey = RedisKeys.reminder(instancia, id);
    await this.redis.set(hashKey, JSON.stringify(reminder));

    // Add to sorted set (score = triggerAt)
    const setKey = RedisKeys.reminders(instancia);
    await this.redis.zadd(setKey, triggerAt, id);

    this.logger.log(`Reminder created: ${id} for ${instancia}/${jid} at ${new Date(triggerAt).toISOString()}`);
    return reminder;
  }

  /**
   * List reminders for a tenant, optionally filtered by status.
   */
  async list(instancia: string, status?: ReminderStatus): Promise<Reminder[]> {
    const setKey = RedisKeys.reminders(instancia);
    const ids = await this.redis.zrange(setKey, 0, -1);

    if (ids.length === 0) return [];

    const pipeline = this.redis.pipeline();
    for (const id of ids) {
      pipeline.get(RedisKeys.reminder(instancia, id));
    }
    const results = await pipeline.exec();

    const reminders: Reminder[] = [];
    for (const [, val] of results!) {
      if (val) {
        try {
          const reminder: Reminder = JSON.parse(val as string);
          if (!status || reminder.status === status) {
            reminders.push(reminder);
          }
        } catch {
          // skip malformed
        }
      }
    }

    // Sort by triggerAt ascending
    return reminders.sort((a, b) => a.triggerAt - b.triggerAt);
  }

  /**
   * Update a reminder (dismiss, change text, etc.).
   */
  async update(
    instancia: string,
    id: string,
    updates: { text?: string; triggerAt?: number; status?: ReminderStatus },
  ): Promise<Reminder> {
    const hashKey = RedisKeys.reminder(instancia, id);
    const raw = await this.redis.get(hashKey);
    if (!raw) {
      throw new NotFoundException(`Reminder ${id} not found`);
    }

    const reminder: Reminder = JSON.parse(raw);

    if (updates.text !== undefined) reminder.text = updates.text;
    if (updates.status !== undefined) reminder.status = updates.status;
    if (updates.triggerAt !== undefined) {
      reminder.triggerAt = updates.triggerAt;
      // Update sorted set score
      const setKey = RedisKeys.reminders(instancia);
      await this.redis.zadd(setKey, updates.triggerAt, id);
    }

    await this.redis.set(hashKey, JSON.stringify(reminder));

    this.logger.log(`Reminder updated: ${id} for ${instancia}`);
    return reminder;
  }

  /**
   * Delete a reminder completely.
   */
  async remove(instancia: string, id: string): Promise<void> {
    const hashKey = RedisKeys.reminder(instancia, id);
    const setKey = RedisKeys.reminders(instancia);

    await this.redis.del(hashKey);
    await this.redis.zrem(setKey, id);

    this.logger.log(`Reminder deleted: ${id} for ${instancia}`);
  }

  /**
   * Check for due reminders and emit events.
   * Called by the scheduler interval.
   */
  async processDueReminders(): Promise<void> {
    // We need to scan all tenant registries to find instances.
    // For efficiency, scan all reminders:* sorted sets.
    const setKeys = await this.scanKeys('reminders:*');

    for (const setKey of setKeys) {
      const instancia = setKey.replace('reminders:', '');
      const now = Date.now();

      // Get all reminders due (score <= now)
      const dueIds = await this.redis.zrangebyscore(setKey, 0, now);

      for (const id of dueIds) {
        const hashKey = RedisKeys.reminder(instancia, id);
        const raw = await this.redis.get(hashKey);
        if (!raw) {
          // Orphaned entry — clean up
          await this.redis.zrem(setKey, id);
          continue;
        }

        try {
          const reminder: Reminder = JSON.parse(raw);
          if (reminder.status !== 'pending') continue;

          // Mark as triggered
          reminder.status = 'triggered';
          await this.redis.set(hashKey, JSON.stringify(reminder));

          // Emit realtime event
          await this.publisher.publish({
            type: 'note.added', // Reuse note.added for reminder notification
            instancia,
            jid: reminder.jid,
            ts: Date.now(),
            payload: {
              reminderId: reminder.id,
              text: reminder.text,
              reminderTriggered: true,
            },
          });

          this.logger.log(`Reminder triggered: ${id} for ${instancia}/${reminder.jid}`);
        } catch (err: any) {
          this.logger.warn(`Failed to process reminder ${id}: ${err.message}`);
        }
      }
    }
  }

  private async scanKeys(pattern: string): Promise<string[]> {
    const results: string[] = [];
    let cursor = '0';
    do {
      const [next, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = next;
      results.push(...keys);
    } while (cursor !== '0');
    return results;
  }
}
