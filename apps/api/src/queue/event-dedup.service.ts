import { Injectable, Inject } from '@nestjs/common';
import type Redis from 'ioredis';
import { RedisKeys } from '@nexus/shared';
import { REDIS_CLIENT } from '../core/redis/redis.module';

// Só estes reprocessam de forma NÃO-idempotente (rpush duplicaria o histórico),
// então precisam de dedup de boundary. Os demais tipos v1 são idempotentes e
// passam sempre — nunca dedupar por `id`, que vem VAZIO em connection.update
// (spec §4.4; ver nota no contrato NexusEventV1Key).
const DEDUP_EVENTS = new Set(['messages.upsert', 'send.message']);

// TTL do dedup: 48h cobre religar o consumer após o kill-switch (spec §4.4).
const TTL_SEC = 48 * 3600;

@Injectable()
export class EventDedupService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * true = processar; false = duplicata (descartar). Só `messages.upsert` e
   * `send.message` deduplicam (§4.4); os demais são idempotentes e passam
   * sempre SEM tocar o Redis. Dedup por `SET NX EX` chaveado no evento v1
   * NORMALIZADO (independe do gateway de origem — node|go).
   */
  async shouldProcess(instancia: string, event: string, msgId: string): Promise<boolean> {
    if (!DEDUP_EVENTS.has(event)) return true;
    const key = RedisKeys.evtDedup(instancia, event, msgId);
    const acquired = await this.redis.set(key, '1', 'EX', TTL_SEC, 'NX');
    return acquired != null; // 'OK' = 1ª vez → processa; null = duplicata
  }
}
