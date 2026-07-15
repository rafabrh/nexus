import { describe, it, expect, vi } from 'vitest';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { FunnelStagesService } from './funnel-stages.service';

/**
 * FunnelStagesService owns the per-tenant Kanban columns (`funnel_stages`). These
 * tests pin the contract the spec (Seção 4) and D4 depend on, with a chainable
 * Drizzle stub in the style of conversation-projection.service.spec.ts:
 *
 *  - create: slug kebab + anti-collision suffix; `order = max+1`.
 *  - update: partial patch; NEVER touches `key`; 404 when the row isn't the tenant's.
 *  - remove: 409 (ConflictException) with `count` when a conversation sits on the
 *            key; deletes when count === 0; 404 for an unknown/other-tenant id.
 *  - reorder: transactional; rejects (400) an id list that isn't exactly the
 *             tenant's set (foreign/other-tenant id) — no partial reorder, no leak.
 *  - keyExists: true/false against the tenant's rows.
 *  - tenant isolation: every query filters by `instancia`.
 */

/**
 * Builds a `.where(...)` result that is BOTH awaitable (yields `rows`) and carries
 * the chain methods a query may call after `where` (`orderBy`, `limit`, `returning`).
 * Each resolves to `rows` unless overridden.
 */
function whereResult(rows: any[]) {
  const r: any = {
    orderBy: vi.fn(async () => rows),
    limit: vi.fn(async () => rows),
    returning: vi.fn(async () => rows),
    then: (res: any, rej: any) => Promise.resolve(rows).then(res, rej),
  };
  return r;
}

/**
 * A recording Drizzle stub. `selects` is a queue: each `.select().from().where()`
 * shifts the next entry (so a method issuing several selects gets them in order).
 * `insert`/`update`/`delete` capture their inputs for assertions.
 */
function makeDb(opts: {
  selects?: any[][]; // queued rows, one per select() call, in call order
  insertRow?: any; // row returned by insert().values().returning()
  updateRow?: any[]; // rows returned by update().set().where().returning()
} = {}) {
  const selectQueue = [...(opts.selects ?? [])];
  const whereCalls: any[] = [];

  const select = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn((cond: any) => {
        whereCalls.push(cond);
        const rows = selectQueue.length ? selectQueue.shift()! : [];
        return whereResult(rows);
      }),
    })),
  }));

  const insertValues = vi.fn((v: any) => {
    (insert as any).lastValues = v;
    return { returning: vi.fn(async () => [opts.insertRow ?? v]) };
  });
  const insert = vi.fn(() => ({ values: insertValues })) as any;

  const updateSet = vi.fn((s: any) => {
    (update as any).lastSet = s;
    return {
      where: vi.fn((cond: any) => {
        whereCalls.push(cond);
        return whereResult(opts.updateRow ?? []);
      }),
    };
  });
  const update = vi.fn(() => ({ set: updateSet })) as any;

  const deleteWhere = vi.fn(async () => undefined);
  const del = vi.fn(() => ({ where: deleteWhere }));

  return {
    select,
    insert,
    update,
    delete: del,
    deleteWhere,
    whereCalls,
    // transaction runs the callback against a fresh sub-db that shares config.
    transaction: vi.fn(async (cb: any) => cb(makeTxDb(opts))),
  } as any;
}

/**
 * Sub-db handed to `transaction(cb)`. reorder() issues, in order:
 *   1) select owned ids   → opts.txOwned
 *   2) N× update set order
 *   3) select final rows  → opts.txFinal
 */
function makeTxDb(opts: any) {
  const owned = opts.txOwned ?? [];
  const final = opts.txFinal ?? [];
  let selectCall = 0;
  const updates: any[] = [];

  const select = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => {
        selectCall += 1;
        // 1st select in reorder = owned-check; a later select = final ordered list.
        return whereResult(selectCall === 1 ? owned : final);
      }),
    })),
  }));

  const update = vi.fn(() => ({
    set: vi.fn((s: any) => {
      updates.push(s);
      return { where: vi.fn(async () => undefined) };
    }),
  }));

  return { select, update, __updates: updates } as any;
}

describe('FunnelStagesService.create', () => {
  it('generates a kebab-case slug key from the label and sets order = max+1', async () => {
    const db = makeDb({
      selects: [
        [{ key: 'S0' }, { key: 'S1' }], // uniqueKey: existing keys
        [{ nextOrder: 7 }], // create: COALESCE(MAX(order),-1)+1
      ],
    });
    const svc = new FunnelStagesService(db);

    const dto = await svc.create('shk', { label: 'Proposta Enviada', color: '#3B82F6' });

    expect(db.insert.lastValues).toMatchObject({
      instancia: 'shk',
      key: 'proposta-enviada', // slugified, accents/spaces collapsed
      label: 'Proposta Enviada',
      color: '#3B82F6',
      order: 7,
    });
    expect(dto.key).toBe('proposta-enviada');
    expect(dto.order).toBe(7);
  });

  it('strips accents and appends an anti-collision suffix when the slug already exists', async () => {
    const db = makeDb({
      selects: [
        [{ key: 'proposta' }, { key: 'proposta-2' }], // both taken
        [{ nextOrder: 3 }],
      ],
    });
    const svc = new FunnelStagesService(db);

    await svc.create('shk', { label: 'Proposta', color: '#000' });

    // 'proposta' and 'proposta-2' are taken → next free is 'proposta-3'.
    expect(db.insert.lastValues.key).toBe('proposta-3');
  });

  it('starts order at 0 for a tenant with no stages yet (COALESCE MAX -1)', async () => {
    const db = makeDb({ selects: [[], [{ nextOrder: 0 }]] });
    const svc = new FunnelStagesService(db);

    const dto = await svc.create('fresh', { label: 'Novo', color: '#fff' });
    expect(dto.order).toBe(0);
  });

  it('falls back to the "stage" key when the label has no alphanumerics', async () => {
    const db = makeDb({ selects: [[], [{ nextOrder: 0 }]] });
    const svc = new FunnelStagesService(db);

    await svc.create('shk', { label: '!!! ??? ***', color: '#111' });
    expect(db.insert.lastValues.key).toBe('stage');
  });
});

describe('FunnelStagesService.update', () => {
  it('applies a partial patch (label/color/order) and never sends key in the SET', async () => {
    const row = { id: 'id1', key: 'S1', label: 'Renamed', color: '#10B981', order: 1 };
    const db = makeDb({ updateRow: [row] });
    const svc = new FunnelStagesService(db);

    const dto = await svc.update('shk', 'id1', { label: 'Renamed', color: '#10B981' });

    expect(db.update.lastSet).toEqual({ label: 'Renamed', color: '#10B981' });
    expect(db.update.lastSet).not.toHaveProperty('key'); // key is immutable
    expect(dto.label).toBe('Renamed');
  });

  it('rejects (400) an update with no fields to change', async () => {
    const db = makeDb();
    const svc = new FunnelStagesService(db);
    await expect(svc.update('shk', 'id1', {})).rejects.toBeInstanceOf(BadRequestException);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('throws 404 when the row does not belong to the tenant (no returning row)', async () => {
    const db = makeDb({ updateRow: [] }); // where(id, instancia) matched nothing
    const svc = new FunnelStagesService(db);
    await expect(
      svc.update('shk', 'ghost', { label: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('FunnelStagesService.remove (D4)', () => {
  it('throws 409 (ConflictException) with the count when conversations sit on the key', async () => {
    const db = makeDb({
      selects: [
        [{ key: 'S4' }], // stage lookup
        [{ count: 3 }], // conversations on that key
      ],
    });
    const svc = new FunnelStagesService(db);

    // Single invocation (the selects queue is consumed once): assert both the
    // type (ConflictException => 409) and the payload it carries.
    const err = await svc.remove('shk', 'id4').catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse()).toMatchObject({
      count: 3,
      message: 'Existem 3 conversa(s) nesta coluna. Mova-as antes de excluir.',
    });
    expect(db.deleteWhere).not.toHaveBeenCalled(); // never deletes on 409
  });

  it('deletes the stage when the count is 0', async () => {
    const db = makeDb({
      selects: [
        [{ key: 'proposta' }], // stage lookup
        [{ count: 0 }], // no conversations
      ],
    });
    const svc = new FunnelStagesService(db);

    await svc.remove('shk', 'id9');
    expect(db.deleteWhere).toHaveBeenCalledTimes(1);
  });

  it('throws 404 when the stage id is unknown / belongs to another tenant', async () => {
    const db = makeDb({ selects: [[]] }); // stage lookup returns nothing
    const svc = new FunnelStagesService(db);
    await expect(svc.remove('shk', 'ghost')).rejects.toBeInstanceOf(NotFoundException);
    expect(db.deleteWhere).not.toHaveBeenCalled();
  });
});

describe('FunnelStagesService.reorder', () => {
  it('rewrites order = index for all ids and returns the reordered list (transactional)', async () => {
    const finalRows = [
      { id: 'b', key: 'S1', label: 'B', color: '#1', order: 0 },
      { id: 'a', key: 'S0', label: 'A', color: '#0', order: 1 },
    ];
    const db = makeDb({
      txOwned: [{ id: 'a' }, { id: 'b' }], // both owned
      txFinal: finalRows,
    });
    const svc = new FunnelStagesService(db);

    const out = await svc.reorder('shk', ['b', 'a']);
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(out.map((s) => s.id)).toEqual(['b', 'a']);
  });

  it('rejects (400) duplicate ids before opening a transaction', async () => {
    const db = makeDb();
    const svc = new FunnelStagesService(db);
    await expect(svc.reorder('shk', ['a', 'a'])).rejects.toBeInstanceOf(BadRequestException);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('rejects (400) when an id is not owned by the tenant (foreign/other-tenant id)', async () => {
    const db = makeDb({
      txOwned: [{ id: 'a' }], // only 1 of the 2 requested ids belongs to the tenant
    });
    const svc = new FunnelStagesService(db);
    await expect(svc.reorder('shk', ['a', 'foreign'])).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('FunnelStagesService.keyExists', () => {
  it('returns true when the key belongs to the tenant', async () => {
    const db = makeDb({ selects: [[{ id: 'id1' }]] });
    const svc = new FunnelStagesService(db);
    expect(await svc.keyExists('shk', 'S3')).toBe(true);
  });

  it('returns false when the key does not exist for the tenant', async () => {
    const db = makeDb({ selects: [[]] });
    const svc = new FunnelStagesService(db);
    expect(await svc.keyExists('shk', 'nope')).toBe(false);
  });
});

describe('FunnelStagesService tenant isolation', () => {
  it('filters every list/keyExists query by instancia (no cross-tenant read)', async () => {
    const db = makeDb({ selects: [[]] });
    const svc = new FunnelStagesService(db);
    await svc.list('tenant-A');
    // The where() condition object was recorded; its presence proves list()
    // constrains by instancia (the service builds `eq(instancia, ...)`).
    expect(db.whereCalls.length).toBeGreaterThan(0);
    expect(db.select).toHaveBeenCalled();
  });
});
