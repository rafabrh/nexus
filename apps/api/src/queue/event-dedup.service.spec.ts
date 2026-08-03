import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RedisKeys } from '@nexus/shared';
import { EventDedupService } from './event-dedup.service';

// ---------------------------------------------------------------------------
// Fake Redis stub — simula SET NX EX + DEL + INCR/EXPIRE sobre estado em memória.
//   set(key,'1','EX',ttl,'NX') → 'OK' na 1ª vez, null se a chave já existe.
// ---------------------------------------------------------------------------
function makeFakeRedis() {
  const store = new Set<string>();
  const counters: Record<string, number> = {};
  const set = vi.fn(
    async (key: string, _v: string, _ex: 'EX', _ttl: number, _nx: 'NX'): Promise<string | null> => {
      if (store.has(key)) return null;
      store.add(key);
      return 'OK';
    },
  );
  const del = vi.fn(async (key: string): Promise<number> => (store.delete(key) ? 1 : 0));
  const incr = vi.fn(async (key: string): Promise<number> => (counters[key] = (counters[key] ?? 0) + 1));
  const expire = vi.fn(async (): Promise<number> => 1);
  return { store, counters, set, del, incr, expire };
}

describe('EventDedupService', () => {
  let redis: ReturnType<typeof makeFakeRedis>;
  let service: EventDedupService;

  beforeEach(() => {
    redis = makeFakeRedis();
    service = new EventDedupService(redis as never);
  });

  describe('eventos que deduplicam (messages.upsert / send.message)', () => {
    it('messages.upsert: 1ª chamada processa, 2ª é descartada', async () => {
      expect(await service.shouldProcess('shk', 'messages.upsert', 'WAMID-1')).toBe(true);
      expect(await service.shouldProcess('shk', 'messages.upsert', 'WAMID-1')).toBe(false);
    });

    it('send.message segue a mesma política de dedup', async () => {
      expect(await service.shouldProcess('shk', 'send.message', 'WAMID-2')).toBe(true);
      expect(await service.shouldProcess('shk', 'send.message', 'WAMID-2')).toBe(false);
    });

    it('usa RedisKeys.evtDedup e SET NX EX 48h', async () => {
      await service.shouldProcess('shk', 'messages.upsert', 'WAMID-3');
      expect(redis.set).toHaveBeenCalledWith(
        RedisKeys.evtDedup('shk', 'messages.upsert', 'WAMID-3'),
        '1',
        'EX',
        48 * 3600,
        'NX',
      );
    });

    it('isola por instância: mesmo msgId em instâncias diferentes não colide', async () => {
      expect(await service.shouldProcess('shk', 'messages.upsert', 'WAMID-4')).toBe(true);
      expect(await service.shouldProcess('geotech', 'messages.upsert', 'WAMID-4')).toBe(true);
    });
  });

  describe('guard de msgId vazio (evita colapso do dedup)', () => {
    it('msgId vazio processa sempre e NÃO toca o Redis (não colide)', async () => {
      expect(await service.shouldProcess('shk', 'messages.upsert', '')).toBe(true);
      expect(await service.shouldProcess('shk', 'messages.upsert', '')).toBe(true);
      expect(redis.set).not.toHaveBeenCalled();
    });
  });

  describe('release (anti-perda no replay do DLQ)', () => {
    it('após release, o MESMO evento volta a processar (marca liberada)', async () => {
      expect(await service.shouldProcess('shk', 'messages.upsert', 'W9')).toBe(true);
      expect(await service.shouldProcess('shk', 'messages.upsert', 'W9')).toBe(false); // marcado
      await service.release('shk', 'messages.upsert', 'W9');
      expect(redis.del).toHaveBeenCalledWith(RedisKeys.evtDedup('shk', 'messages.upsert', 'W9'));
      expect(await service.shouldProcess('shk', 'messages.upsert', 'W9')).toBe(true); // reprocessa
    });

    it('no-op para evento idempotente ou msgId vazio (nunca criou chave)', async () => {
      await service.release('shk', 'connection.update', '');
      await service.release('shk', 'messages.upsert', '');
      expect(redis.del).not.toHaveBeenCalled();
    });
  });

  describe('eventos idempotentes passam sempre (nunca dedupam por id)', () => {
    it.each(['messages.update', 'connection.update', 'presence.update', 'contacts.update'])(
      '%s sempre processa e NÃO toca o Redis',
      async (event) => {
        expect(await service.shouldProcess('shk', event, '')).toBe(true);
        expect(await service.shouldProcess('shk', event, '')).toBe(true);
        expect(redis.set).not.toHaveBeenCalled();
      },
    );
  });

  describe('count (observabilidade §8)', () => {
    it('incrementa evtCount e seta TTL na 1ª ocorrência', async () => {
      await service.count('node', 'shk', 'messages.upsert');
      expect(redis.incr).toHaveBeenCalledWith(RedisKeys.evtCount('node', 'shk', 'messages.upsert'));
      expect(redis.expire).toHaveBeenCalledWith(
        RedisKeys.evtCount('node', 'shk', 'messages.upsert'),
        7 * 24 * 3600,
      );
    });

    it('não re-seta TTL em ocorrências seguintes', async () => {
      await service.count('node', 'shk', 'messages.upsert');
      await service.count('node', 'shk', 'messages.upsert');
      expect(redis.expire).toHaveBeenCalledTimes(1);
    });
  });
});
