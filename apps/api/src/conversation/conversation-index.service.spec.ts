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

  it('backfills an empty index from existing followup_step and chathistory keys', async () => {
    const registry = JSON.stringify({ tenants: [{ instancia: 'nexusdev' }] });
    const byPattern: Record<string, string[]> = {
      'chat:nexusdev:*:followup_step': ['chat:nexusdev:5511@s.whatsapp.net:followup_step'],
      'chathistory:nexusdev-*': ['chathistory:nexusdev-262246475239430@lid'],
    };
    const r = {
      get: vi.fn(async (k: string) => (k === 'tenant:registry' ? registry : null)),
      scard: vi.fn(async () => 0), // index empty → backfill runs
      scan: vi.fn(async (_c: string, _m: string, pattern: string) => ['0', byPattern[pattern] ?? []]),
      sadd: vi.fn(async () => 1),
    } as any;
    const s = new ConversationIndexService(r);

    await s.onApplicationBootstrap();

    expect(r.sadd).toHaveBeenCalledTimes(1);
    const [key, ...members] = r.sadd.mock.calls[0];
    expect(key).toBe(RedisKeys.conversationIndex('nexusdev'));
    // both the legacy phone (→ @s.whatsapp.net) and the opaque @lid are indexed
    expect(members.sort()).toEqual(
      ['262246475239430@lid', '5511@s.whatsapp.net'].sort(),
    );
  });

  it('skips backfill when the index already has entries', async () => {
    const registry = JSON.stringify({ tenants: [{ instancia: 'nexusdev' }] });
    const r = {
      get: vi.fn(async () => registry),
      scard: vi.fn(async () => 5), // already populated
      scan: vi.fn(async () => ['0', []]),
      sadd: vi.fn(async () => 1),
    } as any;
    const s = new ConversationIndexService(r);

    await s.onApplicationBootstrap();

    expect(r.scan).not.toHaveBeenCalled();
    expect(r.sadd).not.toHaveBeenCalled();
  });
});
