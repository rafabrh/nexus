import { Injectable, Inject } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../core/redis/redis.module';
import { RedisKeys } from '@nexus/shared';
import type { NexusEvent } from '@nexus/shared';

@Injectable()
export class EventTranslator {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async translate(channel: string, operation: string): Promise<NexusEvent | null> {
    // Strip the keyspace prefix regardless of the DB index (e.g. @0, @3).
    const key = channel.replace(/^__keyspace@\d+__:/, '');
    const ts = Date.now();

    // ---- chathistory:{inst}-{id} (real message store, N8N + BFF write) ----
    // The visible history changed (client message OR AI reply persisted).
    if (key.startsWith('chathistory:')) {
      if (operation !== 'rpush' && operation !== 'lpush' && operation !== 'set') {
        return null;
      }
      // Split on the FIRST '-' after the prefix: inst, then the remainder is the
      // conversation id. Instance names contain no '-' in this codebase
      // (e.g. `shk`, `nexusdev`); if that ever changes, switch to matching the
      // known tenant list.
      const rest = key.slice('chathistory:'.length);
      const dash = rest.indexOf('-');
      if (dash < 0) return null;
      const instancia = rest.slice(0, dash);
      const id = rest.slice(dash + 1);
      if (!instancia || !id) return null;
      const jid = id.includes('@') ? id : `${id}@s.whatsapp.net`;
      return { type: 'message.received', instancia, jid, ts, payload: {} };
    }

    const parts = key.split(':');

    if (parts[0] === 'chat' && parts.length >= 4) {
      const instancia = parts[1];
      const jid = parts[2];
      const field = parts.slice(3).join(':');

      switch (field) {
        case 'humanControlUntil':
          if (operation === 'del' || operation === 'expired') {
            return { type: 'ai.toggled', instancia, jid, ts, payload: { state: 'ON' } };
          }
          if (operation === 'set') {
            const value = await this.redis.get(RedisKeys.humanControlUntil(instancia, jid));
            return {
              type: 'ai.toggled',
              instancia,
              jid,
              ts,
              payload: { state: 'OFF', until: value ? Number(value) : null },
            };
          }
          return null;

        case 'processing':
          if (operation === 'set') {
            return { type: 'ai.thinking', instancia, jid, ts, payload: {} };
          }
          if (operation === 'del' || operation === 'expired') {
            return { type: 'ai.responded', instancia, jid, ts, payload: {} };
          }
          return null;

        case 'paymentStatus':
          if (operation === 'set') {
            return { type: 'payment.approved', instancia, jid, ts, payload: {} };
          }
          return null;

        case 'followup_step':
          if (operation === 'set') {
            const stage = await this.redis.get(RedisKeys.followupStep(instancia, jid));
            return { type: 'funnel.changed', instancia, jid, ts, payload: { stage } };
          }
          return null;

        default:
          return null;
      }
    }

    return null;
  }
}
