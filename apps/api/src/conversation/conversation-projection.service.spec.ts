import { describe, it, expect, vi } from 'vitest';
import { ConversationProjectionService } from './conversation-projection.service';

/**
 * The projection is the durable Postgres mirror of the Redis/N8N state. These
 * tests pin the two behaviors that are easy to regress:
 *  1. The boot backfill is ORDER-INDEPENDENT — it rebuilds the Redis discovery
 *     index before sourcing from it. This is the regression for the cutover bug
 *     where an empty projection left the list/dashboard blank.
 *  2. Time-sensitive aiState is recomputed on read and filtered in memory.
 */

// Minimal chainable Drizzle stub. The result of `.where(...)` is used two ways:
//  - countActive():  `await select(...).from().where(eq)`        → resolves [{count}]
//  - list():         `select().from().where(and).orderBy(desc)`  → resolves rows
// So whereResult is BOTH a thenable (yields the count row) and carries .orderBy.
function makeDb(opts: { count?: number; rows?: any[] } = {}) {
  const orderBy = vi.fn(async () => opts.rows ?? []);
  const whereResult: any = {
    orderBy,
    then: (res: any, rej: any) =>
      Promise.resolve([{ count: opts.count ?? 0 }]).then(res, rej),
  };
  const select = vi.fn(() => ({ from: () => ({ where: () => whereResult }) }));
  const onConflictDoUpdate = vi.fn(async () => undefined);
  const insert = vi.fn(() => ({ values: () => ({ onConflictDoUpdate }) }));
  return { select, insert, onConflictDoUpdate } as any;
}

const baseItem = {
  contactName: 'Fulano',
  stage: 'S0',
  paymentStatus: null,
  isHot: false,
  optout: false,
  tags: [],
  aiOffUntil: null,
  lastMessagePreview: 'oi',
  lastActivity: new Date().toISOString(),
};

describe('ConversationProjectionService.onApplicationBootstrap', () => {
  it('rebuilds the Redis index BEFORE sourcing the projection from it (order-independent)', async () => {
    const db = makeDb({ count: 0 });
    const redis = { smembers: vi.fn(async () => ['a@s.whatsapp.net']) } as any;
    const repo = { buildListItem: vi.fn(async () => ({ ...baseItem })) } as any;
    const index = { backfillIfEmpty: vi.fn(async () => undefined) } as any;
    const tenants = { list: vi.fn(async () => [{ instancia: 'shk' }]) } as any;

    const svc = new ConversationProjectionService(db, redis, repo, index, tenants);
    await svc.onApplicationBootstrap();

    // The index is ensured for the tenant...
    expect(index.backfillIfEmpty).toHaveBeenCalledWith('shk');
    // ...strictly BEFORE the projection reads the index (the cutover fix).
    expect(index.backfillIfEmpty.mock.invocationCallOrder[0]).toBeLessThan(
      redis.smembers.mock.invocationCallOrder[0],
    );
    // ...and the discovered jid gets projected (upsert).
    expect(db.insert).toHaveBeenCalled();
  });

  it('still ensures the index but skips projecting when the projection is already populated', async () => {
    const db = makeDb({ count: 7 }); // countActive > 0
    const redis = { smembers: vi.fn(async () => ['a@s.whatsapp.net']) } as any;
    const repo = { buildListItem: vi.fn() } as any;
    const index = { backfillIfEmpty: vi.fn(async () => undefined) } as any;
    const tenants = { list: vi.fn(async () => [{ instancia: 'shk' }]) } as any;

    const svc = new ConversationProjectionService(db, redis, repo, index, tenants);
    await svc.onApplicationBootstrap();

    expect(index.backfillIfEmpty).toHaveBeenCalledWith('shk');
    expect(redis.smembers).not.toHaveBeenCalled(); // short-circuited
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('never throws if the tenant lookup fails (must not block startup)', async () => {
    const db = makeDb();
    const redis = { smembers: vi.fn() } as any;
    const repo = { buildListItem: vi.fn() } as any;
    const index = { backfillIfEmpty: vi.fn() } as any;
    const tenants = { list: vi.fn(async () => { throw new Error('db down'); }) } as any;

    const svc = new ConversationProjectionService(db, redis, repo, index, tenants);
    await expect(svc.onApplicationBootstrap()).resolves.toBeUndefined();
  });
});

describe('ConversationProjectionService.list', () => {
  it('recomputes aiState on read and filters OFF_UNTIL that has already expired', async () => {
    const past = new Date(Date.now() - 60_000); // expired → recomputed to ON
    const future = new Date(Date.now() + 60 * 60_000); // still OFF_UNTIL
    const rows = [
      { instancia: 'shk', jid: 'on@s.whatsapp.net', phone: 'on', contactName: 'A', stage: 'S0',
        paymentStatus: null, isHot: false, optout: false, tags: [], humanControlUntil: past,
        lastMessagePreview: '', lastActivity: past, updatedAt: past },
      { instancia: 'shk', jid: 'off@s.whatsapp.net', phone: 'off', contactName: 'B', stage: 'S0',
        paymentStatus: null, isHot: false, optout: false, tags: [], humanControlUntil: future,
        lastMessagePreview: '', lastActivity: future, updatedAt: future },
    ];
    const db = makeDb({ rows });
    const svc = new ConversationProjectionService(db, {} as any, {} as any, {} as any, {} as any);

    const all = await svc.list('shk', {});
    expect(all.map((c) => c.aiState).sort()).toEqual(['OFF_UNTIL', 'ON']);

    const onlyOn = await svc.list('shk', { aiState: 'ON' });
    expect(onlyOn).toHaveLength(1);
    expect(onlyOn[0].jid).toBe('on@s.whatsapp.net');
  });
});
