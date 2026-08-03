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

// TTL do contador de observabilidade por fonte (spec §8).
const COUNT_TTL_SEC = 7 * 24 * 3600;

/**
 * Serviço de boundary do consumer: dedup por tipo (`evt:dedup`) + contador de
 * eventos por fonte (`evt:count`, observabilidade §8). Ambas as chaves são
 * chaveadas pelo evento v1 NORMALIZADO, independente do gateway de origem.
 */
@Injectable()
export class EventDedupService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * true = processar; false = duplicata (descartar). Só `messages.upsert` e
   * `send.message` deduplicam (§4.4); os demais são idempotentes e passam
   * sempre SEM tocar o Redis. `msgId` vazio TAMBÉM passa sempre: sem WAMID a
   * chave colapsaria todos os eventos sem id numa única entrada e derrubaria
   * tudo após o primeiro (o GO pode emitir `key.id` vazio). Dedup por
   * `SET NX EX` na chave do evento v1 normalizado.
   */
  async shouldProcess(instancia: string, event: string, msgId: string): Promise<boolean> {
    if (!DEDUP_EVENTS.has(event) || !msgId) return true;
    const key = RedisKeys.evtDedup(instancia, event, msgId);
    const acquired = await this.redis.set(key, '1', 'EX', TTL_SEC, 'NX');
    return acquired != null; // 'OK' = 1ª vez → processa; null = duplicata
  }

  /**
   * Libera a marca de dedup — chamado quando o processamento FALHA, para que o
   * replay do DLQ (dentro da janela de 48h) reprocesse em vez de ser suprimido
   * como duplicata. Sem isto, a marca (setada ANTES do processamento) tornaria
   * a mensagem perdida para sempre no primeiro erro. No-op para eventos que não
   * deduplicam ou sem `msgId` (nunca criaram chave).
   */
  async release(instancia: string, event: string, msgId: string): Promise<void> {
    if (!DEDUP_EVENTS.has(event) || !msgId) return;
    await this.redis.del(RedisKeys.evtDedup(instancia, event, msgId));
  }

  /**
   * Contador best-effort de eventos por fonte/instância/tipo (§8), TTL 7d. Usado
   * para observabilidade do boundary (throughput, drops, dedup-hits) sem depender
   * de logs. O chamador trata como fire-and-forget: falha aqui NUNCA quebra o
   * processamento do evento.
   */
  async count(fonte: string, instancia: string, event: string): Promise<void> {
    const key = RedisKeys.evtCount(fonte, instancia, event);
    const n = await this.redis.incr(key);
    if (n === 1) await this.redis.expire(key, COUNT_TTL_SEC);
  }
}
