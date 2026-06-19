import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConversationIndexService } from './conversation-index.service';
import { RedisKeys } from '@nexus/shared';

function makeRedis() {
  const store = new Map<string, Set<string>>();
  return {
    store,
    sadd: vi.fn(async (key: string, ...members: string[]) => {
      const s = store.get(key) ?? new Set<string>();
      members.forEach((m) => s.add(m));
      store.set(key, s);
      return members.length;
    }),
    smembers: vi.fn(async (key: string) => Array.from(store.get(key) ?? [])),
    scard: vi.fn(async (key: string) => (store.get(key)?.size ?? 0)),
    scan: vi.fn(async () => ['0', []]),
  } as any;
}

describe('ConversationIndexService', () => {
  let redis: any;
  let svc: ConversationIndexService;
  beforeEach(() => {
    redis = makeRedis();
    svc = new ConversationIndexService(redis);
  });

  it('adds a jid to the per-tenant index', async () => {
    await svc.addJid('shk', '5511@s.whatsapp.net');
    expect(redis.sadd).toHaveBeenCalledWith(RedisKeys.conversationIndex('shk'), '5511@s.whatsapp.net');
  });

  it('lists jids from the index', async () => {
    await svc.addJid('shk', 'a@s.whatsapp.net');
    await svc.addJid('shk', 'b@lid');
    const jids = await svc.listJids('shk');
    expect(jids.sort()).toEqual(['a@s.whatsapp.net', 'b@lid']);
  });

  it('ignores empty jids', async () => {
    await svc.addJid('shk', '');
    expect(redis.sadd).not.toHaveBeenCalled();
  });
});
