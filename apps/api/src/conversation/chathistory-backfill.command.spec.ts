import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChathistoryBackfillCommand } from './chathistory-backfill.command';
import type { MessageArchiveRepository, ArchiveEntry } from './message-archive.repository';

// ---------------------------------------------------------------------------
// Raw JSON fixtures
// ---------------------------------------------------------------------------

function makeRaw(i: number): string {
  return JSON.stringify({
    id: `wamid.${i}`,
    type: i % 2 === 0 ? 'ai' : 'human',
    data: { content: `msg ${i}`, timestamp: 1700000000000 + i * 1000 },
  });
}

/** An entry without an `id` field — triggers legacy-sha1 synthetic key. */
function makeLegacyRaw(content: string): string {
  return JSON.stringify({
    type: 'human',
    data: { content, timestamp: 1700000001234 },
  });
}

// ---------------------------------------------------------------------------
// Fake Redis
// ---------------------------------------------------------------------------

interface FakeScanPage {
  cursor: string;
  keys: string[];
}

function makeFakeRedis(pages: FakeScanPage[], lrangeData: Record<string, string[]>) {
  let callCount = 0;
  const scanFn = vi.fn(async (_cursor: string, _match: string, _pattern: string, _count: string, _n: number) => {
    const page = pages[callCount] ?? { cursor: '0', keys: [] };
    callCount++;
    return [page.cursor, page.keys];
  });

  const lrangeFn = vi.fn(async (key: string, start: number, stop: number): Promise<string[]> => {
    const list = lrangeData[key] ?? [];
    const len = list.length;
    const s = start < 0 ? Math.max(0, len + start) : start;
    const e = stop < 0 ? len + stop : Math.min(stop, len - 1);
    if (s > e) return [];
    return list.slice(s, e + 1);
  });

  return { scan: scanFn, lrange: lrangeFn };
}

// ---------------------------------------------------------------------------
// Fake MessageArchiveRepository
// ---------------------------------------------------------------------------

function makeFakeRepo(): MessageArchiveRepository {
  return {
    insertManyIdempotent: vi.fn(async () => undefined),
    readPage: vi.fn(async () => []),
    seqOf: vi.fn(async () => null),
  } as unknown as MessageArchiveRepository;
}

// ---------------------------------------------------------------------------
// Helper: build + run the command
// ---------------------------------------------------------------------------

async function runBackfill(
  redis: ReturnType<typeof makeFakeRedis>,
  repo: MessageArchiveRepository,
): Promise<void> {
  const cmd = new ChathistoryBackfillCommand(redis as any, repo);
  await cmd.onApplicationBootstrap();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChathistoryBackfillCommand', () => {
  const originalEnv = process.env.BACKFILL_CHATHISTORY;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.BACKFILL_CHATHISTORY;
    } else {
      process.env.BACKFILL_CHATHISTORY = originalEnv;
    }
  });

  // -------------------------------------------------------------------------
  // 1. Env guard: BACKFILL_CHATHISTORY unset → no-op
  // -------------------------------------------------------------------------

  describe('env guard', () => {
    it('BACKFILL_CHATHISTORY unset → scan NOT called, no archive', async () => {
      delete process.env.BACKFILL_CHATHISTORY;
      const redis = makeFakeRedis([], {});
      const repo = makeFakeRepo();

      await runBackfill(redis, repo);

      expect(redis.scan).not.toHaveBeenCalled();
      expect(repo.insertManyIdempotent).not.toHaveBeenCalled();
    });

    it('BACKFILL_CHATHISTORY=other → scan NOT called, no archive', async () => {
      process.env.BACKFILL_CHATHISTORY = 'true';
      const redis = makeFakeRedis([], {});
      const repo = makeFakeRepo();

      await runBackfill(redis, repo);

      expect(redis.scan).not.toHaveBeenCalled();
      expect(repo.insertManyIdempotent).not.toHaveBeenCalled();
    });

    it('BACKFILL_CHATHISTORY=once → scan IS called', async () => {
      process.env.BACKFILL_CHATHISTORY = 'once';
      const pages: FakeScanPage[] = [{ cursor: '0', keys: [] }];
      const redis = makeFakeRedis(pages, {});
      const repo = makeFakeRepo();

      await runBackfill(redis, repo);

      expect(redis.scan).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 2. Key parsing: mirrors event.translator.ts:26-32
  // -------------------------------------------------------------------------

  describe('key parsing', () => {
    beforeEach(() => {
      process.env.BACKFILL_CHATHISTORY = 'once';
    });

    it('chathistory:shk-5511 → instancia=shk, jid=5511@s.whatsapp.net', async () => {
      const key = 'chathistory:shk-5511';
      const raw0 = makeRaw(0);
      const pages: FakeScanPage[] = [{ cursor: '0', keys: [key] }];
      const redis = makeFakeRedis(pages, { [key]: [raw0] });
      const repo = makeFakeRepo();

      await runBackfill(redis, repo);

      expect(repo.insertManyIdempotent).toHaveBeenCalledWith(
        'shk',
        '5511@s.whatsapp.net',
        expect.arrayContaining([expect.objectContaining({ msgId: 'wamid.0' })]),
      );
    });

    it('chathistory:shk-262246@lid → instancia=shk, jid=262246@lid (no @s.whatsapp.net appended)', async () => {
      const key = 'chathistory:shk-262246@lid';
      const raw0 = makeRaw(0);
      const pages: FakeScanPage[] = [{ cursor: '0', keys: [key] }];
      const redis = makeFakeRedis(pages, { [key]: [raw0] });
      const repo = makeFakeRepo();

      await runBackfill(redis, repo);

      expect(repo.insertManyIdempotent).toHaveBeenCalledWith(
        'shk',
        '262246@lid',
        expect.arrayContaining([expect.objectContaining({ msgId: 'wamid.0' })]),
      );
    });

    it('malformed key (no dash after chathistory:) → skipped silently', async () => {
      const key = 'chathistory:nodash';
      const pages: FakeScanPage[] = [{ cursor: '0', keys: [key] }];
      const redis = makeFakeRedis(pages, { [key]: [makeRaw(0)] });
      const repo = makeFakeRepo();

      await runBackfill(redis, repo);

      expect(repo.insertManyIdempotent).not.toHaveBeenCalled();
    });

    it('key with inst= prefix of key and id= empty string → skipped silently', async () => {
      // "chathistory:-5511" → instancia='' → skipped
      const key = 'chathistory:-5511';
      const pages: FakeScanPage[] = [{ cursor: '0', keys: [key] }];
      const redis = makeFakeRedis(pages, { [key]: [makeRaw(0)] });
      const repo = makeFakeRepo();

      await runBackfill(redis, repo);

      // instancia='' → skipped
      expect(repo.insertManyIdempotent).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 3. lrange called with (key, 0, -1) — whole list
  // -------------------------------------------------------------------------

  describe('lrange whole list', () => {
    beforeEach(() => {
      process.env.BACKFILL_CHATHISTORY = 'once';
    });

    it('calls lrange(key, 0, -1) for each conversation key', async () => {
      const key = 'chathistory:shk-5511';
      const pages: FakeScanPage[] = [{ cursor: '0', keys: [key] }];
      const redis = makeFakeRedis(pages, { [key]: [makeRaw(0)] });
      const repo = makeFakeRepo();

      await runBackfill(redis, repo);

      expect(redis.lrange).toHaveBeenCalledWith(key, 0, -1);
    });

    it('does NOT call lrange with a tail slice (not -350 or similar)', async () => {
      const key = 'chathistory:shk-5511';
      const pages: FakeScanPage[] = [{ cursor: '0', keys: [key] }];
      const redis = makeFakeRedis(pages, { [key]: [makeRaw(0)] });
      const repo = makeFakeRepo();

      await runBackfill(redis, repo);

      const calls = redis.lrange.mock.calls;
      for (const [, start, stop] of calls) {
        // Must always be (0, -1) — never a tail slice
        expect(start).toBe(0);
        expect(stop).toBe(-1);
      }
    });
  });

  // -------------------------------------------------------------------------
  // 4. Multi-page SCAN
  // -------------------------------------------------------------------------

  describe('multi-page scan', () => {
    beforeEach(() => {
      process.env.BACKFILL_CHATHISTORY = 'once';
    });

    it('processes keys from both pages when scan returns non-0 cursor then 0', async () => {
      const key1 = 'chathistory:shk-1111';
      const key2 = 'chathistory:shk-2222';
      const pages: FakeScanPage[] = [
        { cursor: '42', keys: [key1] }, // first page — non-0 cursor → continue
        { cursor: '0', keys: [key2] },  // second page — cursor 0 → stop
      ];
      const redis = makeFakeRedis(pages, {
        [key1]: [makeRaw(0)],
        [key2]: [makeRaw(1)],
      });
      const repo = makeFakeRepo();

      await runBackfill(redis, repo);

      expect(redis.scan).toHaveBeenCalledTimes(2);
      expect(repo.insertManyIdempotent).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------------------
  // 5. No eval / no LTRIM
  // -------------------------------------------------------------------------

  describe('no LTRIM / no eval', () => {
    beforeEach(() => {
      process.env.BACKFILL_CHATHISTORY = 'once';
    });

    it('fake redis has no eval method; the command runs without error', async () => {
      const key = 'chathistory:shk-5511';
      const pages: FakeScanPage[] = [{ cursor: '0', keys: [key] }];
      // Deliberately omit eval from the fake — if the command calls it, it will throw
      const redis = makeFakeRedis(pages, { [key]: [makeRaw(0)] });
      const repo = makeFakeRepo();

      // Should complete without throwing (no eval called)
      await expect(runBackfill(redis, repo)).resolves.not.toThrow();
      // And archive was still called
      expect(repo.insertManyIdempotent).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // 6. Idempotency: running twice yields SAME msgIds (dedup is DB's job)
  // -------------------------------------------------------------------------

  describe('idempotency (stable synthetic keys)', () => {
    beforeEach(() => {
      process.env.BACKFILL_CHATHISTORY = 'once';
    });

    it('running onApplicationBootstrap twice produces identical msgId arrays per call', async () => {
      const key = 'chathistory:shk-5511';
      const legacyRaw = makeLegacyRaw('hello'); // no id → legacy-sha1
      const normalRaw = makeRaw(99);
      const lrangeData = { [key]: [legacyRaw, normalRaw] };

      const pages = (): FakeScanPage[] => [{ cursor: '0', keys: [key] }];

      // Run 1
      const repo1 = makeFakeRepo();
      const redis1 = makeFakeRedis(pages(), lrangeData);
      const cmd1 = new ChathistoryBackfillCommand(redis1 as any, repo1);
      await cmd1.onApplicationBootstrap();

      // Run 2 — fresh redis stub, same data
      const repo2 = makeFakeRepo();
      const redis2 = makeFakeRedis(pages(), lrangeData);
      const cmd2 = new ChathistoryBackfillCommand(redis2 as any, repo2);
      await cmd2.onApplicationBootstrap();

      const entries1: ArchiveEntry[] = (repo1.insertManyIdempotent as ReturnType<typeof vi.fn>).mock.calls[0][2];
      const entries2: ArchiveEntry[] = (repo2.insertManyIdempotent as ReturnType<typeof vi.fn>).mock.calls[0][2];

      const ids1 = entries1.map((e) => e.msgId);
      const ids2 = entries2.map((e) => e.msgId);

      // Same msgIds in same order — synthetic keys are stable across runs
      expect(ids1).toEqual(ids2);
      // Legacy entry's msgId starts with 'legacy-' (sha1 synthetic)
      const legacyEntry = entries1.find((e) => e.msgId.startsWith('legacy-'));
      expect(legacyEntry).toBeDefined();
      // And it must be the same sha1 both times
      const legacyEntry2 = entries2.find((e) => e.msgId.startsWith('legacy-'));
      expect(legacyEntry!.msgId).toBe(legacyEntry2!.msgId);
    });
  });

  // -------------------------------------------------------------------------
  // 7. Empty list → no archive call for that key
  // -------------------------------------------------------------------------

  describe('empty list', () => {
    beforeEach(() => {
      process.env.BACKFILL_CHATHISTORY = 'once';
    });

    it('does not call insertManyIdempotent when lrange returns empty list', async () => {
      const key = 'chathistory:shk-5511';
      const pages: FakeScanPage[] = [{ cursor: '0', keys: [key] }];
      const redis = makeFakeRedis(pages, { [key]: [] });
      const repo = makeFakeRepo();

      await runBackfill(redis, repo);

      expect(repo.insertManyIdempotent).not.toHaveBeenCalled();
    });
  });
});
