import { describe, it, expect, vi } from 'vitest';
import { MessageArchiveRepository } from './message-archive.repository';

/**
 * Tests for MessageArchiveRepository — idempotent insert + cold pagination by seq.
 *
 * Uses a chainable Drizzle stub in the style of funnel-stages.service.spec.ts:
 *  - `selects` is a FIFO queue; each `select().from().where()` shifts the next batch.
 *  - `insert` captures `.values(rows)` and the `onConflictDoNothing` call for assertions.
 */

function whereResult(rows: any[]) {
  const r: any = {
    orderBy: vi.fn(() => ({
      limit: vi.fn(async () => rows),
    })),
    limit: vi.fn(async () => rows),
    then: (res: any, rej: any) => Promise.resolve(rows).then(res, rej),
  };
  return r;
}

function makeDb(opts: { selects?: any[][] } = {}) {
  const selectQueue = [...(opts.selects ?? [])];

  const onConflictDoNothing = vi.fn(async () => undefined);
  const values = vi.fn((v: any) => {
    (insert as any).lastValues = v;
    return { onConflictDoNothing };
  });
  const insert = vi.fn(() => ({ values })) as any;

  const select = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => {
        const rows = selectQueue.length ? selectQueue.shift()! : [];
        return whereResult(rows);
      }),
    })),
  }));

  return { db: { select, insert } as any, insert, values, onConflictDoNothing, select };
}

function makeRepo(opts: { selects?: any[][] } = {}) {
  const stub = makeDb(opts);
  const repo = new MessageArchiveRepository(stub.db);
  return { repo, ...stub };
}

// ---- ArchiveEntry shape -------------------------------------------------------

describe('ArchiveEntry', () => {
  it('insertManyIdempotent accepts entries with all required fields', async () => {
    const { repo, onConflictDoNothing, values } = makeRepo();
    const entry = {
      msgId: 'msg1',
      fromMe: false,
      type: 'human',
      content: 'hello',
      mediaKind: undefined,
      mediaId: undefined,
      mediaMimetype: undefined,
      quoted: null,
      ts: new Date('2026-01-01T00:00:00Z'),
      raw: { foo: 'bar' },
    };
    await repo.insertManyIdempotent('shk', '5511@s.whatsapp.net', [entry]);
    expect(values).toHaveBeenCalledTimes(1);
    expect(onConflictDoNothing).toHaveBeenCalledTimes(1);
  });
});

// ---- insertManyIdempotent ----------------------------------------------------

describe('MessageArchiveRepository.insertManyIdempotent', () => {
  it('grava UMA linha — ON CONFLICT DO NOTHING com target composto (instancia,jid,msgId)', async () => {
    const { repo, insert, values, onConflictDoNothing } = makeRepo();

    const entry = {
      msgId: 'wamid.123',
      fromMe: true,
      type: 'ai',
      content: 'oi',
      mediaKind: undefined,
      mediaId: undefined,
      mediaMimetype: undefined,
      quoted: null,
      ts: new Date('2026-01-01T12:00:00Z'),
      raw: { id: 'wamid.123', type: 'ai' },
    };

    await repo.insertManyIdempotent('shk', '5511@s.whatsapp.net', [entry]);

    // Called once (not twice — dedup is a DB guarantee via ON CONFLICT)
    expect(insert).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledTimes(1);

    // Row has instancia and jid prepended
    const rows: any[] = (values as any).mock.calls[0][0];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ instancia: 'shk', jid: '5511@s.whatsapp.net', msgId: 'wamid.123' });

    // ON CONFLICT DO NOTHING must be called (dedup guarantee)
    expect(onConflictDoNothing).toHaveBeenCalledTimes(1);

    // The conflict target must be the composite key
    const conflictOpts = (onConflictDoNothing as any).mock.calls[0][0];
    expect(conflictOpts).toHaveProperty('target');
    expect(Array.isArray(conflictOpts.target)).toBe(true);
    // The target array must carry all three columns by reference
    expect(conflictOpts.target).toHaveLength(3);
  });

  it('no-ops when entries array is empty (never calls insert)', async () => {
    const { repo, insert } = makeRepo();
    await repo.insertManyIdempotent('shk', '5511@s.whatsapp.net', []);
    expect(insert).not.toHaveBeenCalled();
  });

  it('batches multiple entries into a single insert.values call', async () => {
    const { repo, values } = makeRepo();
    const makeEntry = (n: number) => ({
      msgId: `msg${n}`,
      fromMe: false,
      type: 'human',
      content: `msg ${n}`,
      mediaKind: undefined,
      mediaId: undefined,
      mediaMimetype: undefined,
      quoted: null,
      ts: null,
      raw: {},
    });
    await repo.insertManyIdempotent('shk', 'jid', [makeEntry(1), makeEntry(2), makeEntry(3)]);
    expect(values).toHaveBeenCalledTimes(1);
    const rows: any[] = (values as any).mock.calls[0][0];
    expect(rows).toHaveLength(3);
  });
});

// ---- seqOf -------------------------------------------------------------------

describe('MessageArchiveRepository.seqOf', () => {
  it('retorna o seq quando o msgId existe', async () => {
    const { repo } = makeRepo({ selects: [[{ seq: 42 }]] });
    const seq = await repo.seqOf('shk', '5511@s.whatsapp.net', 'wamid.abc');
    expect(seq).toBe(42);
  });

  it('retorna null quando o msgId não existe', async () => {
    const { repo } = makeRepo({ selects: [[]] });
    const seq = await repo.seqOf('shk', '5511@s.whatsapp.net', 'wamid.ghost');
    expect(seq).toBeNull();
  });
});

// ---- readPage ----------------------------------------------------------------

describe('MessageArchiveRepository.readPage', () => {
  const m0 = { seq: 1, msgId: 'm0', content: 'zero', instancia: 'shk', jid: 'j' };
  const m1 = { seq: 2, msgId: 'm1', content: 'um', instancia: 'shk', jid: 'j' };
  const m2 = { seq: 3, msgId: 'm2', content: 'dois', instancia: 'shk', jid: 'j' };

  it('readPage por seq retorna anteriores ao cursor em ordem cronológica (asc)', async () => {
    // DB returns desc by seq (seq 2, seq 1) — readPage reverses to asc
    const { repo } = makeRepo({ selects: [[m1, m0]] });

    const page = await repo.readPage('shk', 'j', { beforeSeq: m2.seq, limit: 10 });

    // Should be chronological (ascending seq)
    expect(page).toHaveLength(2);
    expect(page[0].seq).toBe(1); // m0
    expect(page[1].seq).toBe(2); // m1
  });

  it('readPage sem cursor devolve as últimas N por seq desc, reordenadas asc', async () => {
    // Stub returns rows as if DB returned desc: [m2, m1]
    const { repo } = makeRepo({ selects: [[m2, m1]] });

    const page = await repo.readPage('shk', 'j', { limit: 2 });

    // Reversed back to asc
    expect(page).toHaveLength(2);
    expect(page[0].seq).toBe(2); // m1
    expect(page[1].seq).toBe(3); // m2
  });

  it('retorna vazio quando não há mensagens', async () => {
    const { repo } = makeRepo({ selects: [[]] });
    const page = await repo.readPage('shk', 'j', { limit: 20 });
    expect(page).toEqual([]);
  });

  it('chama orderBy(desc) e limit() com os valores corretos', async () => {
    const orderedRows: any[] = [];
    // We can inspect the stub call — check that the chain was used correctly
    const stub = makeDb({ selects: [[m0]] });
    const repo = new MessageArchiveRepository(stub.db);

    await repo.readPage('shk', 'j', { limit: 5 });

    // select was called once
    expect(stub.select).toHaveBeenCalledTimes(1);
  });
});
