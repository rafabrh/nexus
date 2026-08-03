import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RedisKeys } from '@nexus/shared';
import { EventDedupService } from './event-dedup.service';

// ---------------------------------------------------------------------------
// Fake Redis stub — simula SET NX EX sobre um Set em memória.
//   set(key, '1', 'EX', ttl, 'NX') → 'OK' na 1ª vez, null se a chave já existe.
// ---------------------------------------------------------------------------
function makeFakeRedis() {
  const store = new Set<string>();
  const set = vi.fn(
    async (
      key: string,
      _val: string,
      _ex: 'EX',
      _ttl: number,
      _nx: 'NX',
    ): Promise<string | null> => {
      if (store.has(key)) return null; // duplicata
      store.add(key);
      return 'OK'; // 1ª vez
    },
  );
  return { store, set };
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
      const first = await service.shouldProcess('shk', 'messages.upsert', 'WAMID-1');
      const second = await service.shouldProcess('shk', 'messages.upsert', 'WAMID-1');
      expect(first).toBe(true);
      expect(second).toBe(false);
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
});
