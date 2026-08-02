import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageArchiveService } from './message-archive.service';
import type { MessageArchiveRepository, ArchiveEntry } from './message-archive.repository';

// ---------------------------------------------------------------------------
// Fake Redis stub — operates on an in-memory list, simulates Lua atomically.
// ---------------------------------------------------------------------------

function makeFakeRedis(initialItems: string[] = []) {
  // Internal list — shared mutable reference across method calls.
  const store: Record<string, string[]> = {};

  const setKey = (key: string, items: string[]) => {
    store[key] = [...items];
  };

  // Seed the initial list for the test key.
  const SEED_KEY = '__seed__';
  setKey(SEED_KEY, initialItems);

  const lrange = vi.fn(async (key: string, start: number, stop: number): Promise<string[]> => {
    const list = store[key] ?? [];
    const len = list.length;
    // Normalise negative indices.
    const s = start < 0 ? Math.max(0, len + start) : start;
    const e = stop < 0 ? len + stop : Math.min(stop, len - 1);
    if (s > e) return [];
    return list.slice(s, e + 1);
  });

  /**
   * eval simulates the Lua script:
   *   if llen <= cap → return [] (no-op)
   *   else head = list.slice(0, len-cap), trim list to tail (cap items), return head
   *
   * Signature: eval(script, numKeys, key, capStr)
   */
  const evalFn = vi.fn(async (_script: string, _numKeys: number, key: string, capStr: string): Promise<string[]> => {
    const list = store[key] ?? [];
    const len = list.length;
    const cap = Number(capStr);
    if (len <= cap) return [];
    const head = list.slice(0, len - cap);
    store[key] = list.slice(len - cap); // keep tail
    return head;
  });

  return {
    store,
    setKey,
    lrange,
    eval: evalFn,
    // Helper: seed the given histKey with a list of raw strings.
    seed(key: string, items: string[]) {
      setKey(key, items);
    },
    getList(key: string): string[] {
      return store[key] ?? [];
    },
  };
}

// ---------------------------------------------------------------------------
// Fake MessageArchiveRepository — vi.fn() for assertions.
// ---------------------------------------------------------------------------

function makeFakeRepo(): MessageArchiveRepository {
  return {
    insertManyIdempotent: vi.fn(async () => undefined),
    readPage: vi.fn(async () => []),
    seqOf: vi.fn(async () => null),
  } as unknown as MessageArchiveRepository;
}

// ---------------------------------------------------------------------------
// Factory: creates a MessageArchiveService with controlled config.
// ---------------------------------------------------------------------------

interface ServiceOpts {
  archiveEnabled?: boolean;
  ltrimEnabled?: boolean;
  hotCap?: number;
}

function makeService(
  redis: ReturnType<typeof makeFakeRedis>,
  repo: MessageArchiveRepository,
  opts: ServiceOpts = {},
) {
  const { archiveEnabled = true, ltrimEnabled = true, hotCap = 300 } = opts;

  // Build a ConfigService stub that reads from the opts.
  const config = {
    get: vi.fn((key: string) => {
      if (key === 'CHATHISTORY_ARCHIVE_ENABLED') return archiveEnabled ? 'true' : 'false';
      if (key === 'CHATHISTORY_LTRIM_ENABLED') return ltrimEnabled ? 'true' : 'false';
      if (key === 'CHATHISTORY_HOT_CAP') return hotCap;
      return undefined;
    }),
  } as any;

  return new MessageArchiveService(redis as any, repo, config);
}

// ---------------------------------------------------------------------------
// Raw JSON fixtures — realistic chathistory entries.
// ---------------------------------------------------------------------------

function makeRaw(i: number): string {
  return JSON.stringify({
    id: `wamid.${i}`,
    type: i % 2 === 0 ? 'ai' : 'human',
    data: { content: `msg ${i}`, timestamp: 1700000000000 + i * 1000 },
  });
}

function makeRawList(count: number): string[] {
  return Array.from({ length: count }, (_, i) => makeRaw(i));
}

// The histKey that archiveTail will compute internally.
// RedisKeys.chatHistory(inst, phone) = `chathistory:${inst}-${phone}`
// (N8N convention: dash-separated, NOT colon-separated)
const INSTANCIA = 'shk';
const JID = '5511999@s.whatsapp.net';
const PHONE = '5511999'; // phoneFromJid result
const HIST_KEY = `chathistory:${INSTANCIA}-${PHONE}`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MessageArchiveService', () => {
  let redis: ReturnType<typeof makeFakeRedis>;
  let repo: MessageArchiveRepository;

  beforeEach(() => {
    redis = makeFakeRedis();
    repo = makeFakeRepo();
  });

  // -------------------------------------------------------------------------
  // 1. Early-exit when archiveEnabled=false
  // -------------------------------------------------------------------------

  describe('archiveEnabled=false (rollout gate)', () => {
    it('retorna imediatamente sem chamar redis nem archive quando archiveEnabled=false', async () => {
      redis.seed(HIST_KEY, makeRawList(500));
      const svc = makeService(redis, repo, { archiveEnabled: false });

      await svc.archiveTail(INSTANCIA, JID);

      expect(redis.lrange).not.toHaveBeenCalled();
      expect(redis.eval).not.toHaveBeenCalled();
      expect(repo.insertManyIdempotent).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 2. Write-behind da cauda (step 1) — always runs when archiveEnabled
  // -------------------------------------------------------------------------

  describe('archiveTail arquiva a cauda (write-behind) sempre', () => {
    it('chama insertManyIdempotent com os itens da cauda (hotCap+50 tail)', async () => {
      const items = makeRawList(400);
      redis.seed(HIST_KEY, items);
      const svc = makeService(redis, repo, { ltrimEnabled: false, hotCap: 300 });

      await svc.archiveTail(INSTANCIA, JID);

      // lrange should have been called with the tail slice -(300+50) = -350
      expect(redis.lrange).toHaveBeenCalledWith(HIST_KEY, -350, -1);

      // insertManyIdempotent must have been called (with parsed entries)
      expect(repo.insertManyIdempotent).toHaveBeenCalledTimes(1);
      const [inst, jid, entries] = (repo.insertManyIdempotent as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(inst).toBe(INSTANCIA);
      expect(jid).toBe(JID);
      // entries must be non-empty (tail slice = 350 items)
      expect((entries as ArchiveEntry[]).length).toBeGreaterThan(0);
      // Each entry must have a raw field equal to the original JSON string
      for (const e of entries as ArchiveEntry[]) {
        expect(typeof e.raw).toBe('string');
        // raw is valid JSON containing an id field
        const parsed = JSON.parse(e.raw as string);
        expect(parsed).toHaveProperty('id');
      }
    });

    it('não chama insertManyIdempotent quando a lista está vazia', async () => {
      redis.seed(HIST_KEY, []);
      const svc = makeService(redis, repo, { ltrimEnabled: false });

      await svc.archiveTail(INSTANCIA, JID);

      // lrange returns [] → toEntries returns [] → insertManyIdempotent not called
      expect(repo.insertManyIdempotent).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 3. LTRIM atômico (step 2) — lista > cap, ltrimEnabled=true
  // -------------------------------------------------------------------------

  describe('com LTRIM ligado e lista > cap: Lua devolve a cabeça e ela é ARQUIVADA antes de sumir', () => {
    it('com 500 itens e cap=300: head(200) é arquivada e lista fica com 300', async () => {
      const items = makeRawList(500);
      redis.seed(HIST_KEY, items);
      const svc = makeService(redis, repo, { ltrimEnabled: true, hotCap: 300 });

      await svc.archiveTail(INSTANCIA, JID);

      // eval (Lua) must have been called exactly once
      expect(redis.eval).toHaveBeenCalledTimes(1);
      const [_script, numKeys, key, capStr] = (redis.eval as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(numKeys).toBe(1);
      expect(key).toBe(HIST_KEY);
      expect(capStr).toBe('300');

      // After Lua: list must have exactly cap items left
      expect(redis.getList(HIST_KEY)).toHaveLength(300);

      // insertManyIdempotent called at least twice:
      //   call #1 — write-behind da cauda (step 1)
      //   call #2 — head devolvida pela Lua (step 2)
      const calls = (repo.insertManyIdempotent as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(2);

      // The second call must contain the 200 head entries
      const headEntries: ArchiveEntry[] = calls[calls.length - 1][2];
      expect(headEntries).toHaveLength(200);

      // Verify that each head entry has raw = the original JSON string
      for (const e of headEntries) {
        expect(typeof e.raw).toBe('string');
        const parsed = JSON.parse(e.raw as string);
        expect(parsed).toHaveProperty('id');
      }
    });
  });

  // -------------------------------------------------------------------------
  // 4. LTRIM com lista <= cap: não apara
  // -------------------------------------------------------------------------

  describe('com LTRIM ligado e lista <= cap: não apara', () => {
    it('com 100 itens e cap=300: eval é chamado mas retorna [] e lista não é modificada', async () => {
      const items = makeRawList(100);
      redis.seed(HIST_KEY, items);
      const svc = makeService(redis, repo, { ltrimEnabled: true, hotCap: 300 });

      await svc.archiveTail(INSTANCIA, JID);

      // eval must be called (ltrimEnabled=true)
      expect(redis.eval).toHaveBeenCalledTimes(1);

      // But the list is untouched (100 items still there)
      expect(redis.getList(HIST_KEY)).toHaveLength(100);

      // And no second insertManyIdempotent call for the head (head=[])
      const calls = (repo.insertManyIdempotent as ReturnType<typeof vi.fn>).mock.calls;
      // Only 1 call at most (write-behind da cauda, step 1) — head is empty so no call
      // The step-1 lrange for <= cap may also return few items; what matters is no head call
      const headCalls = calls.filter(([, , entries]) => (entries as ArchiveEntry[]).length === 200);
      expect(headCalls).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // 5. LTRIM desligado: nunca apara
  // -------------------------------------------------------------------------

  describe('com LTRIM desligado: nunca apara', () => {
    it('eval jamais é chamado quando ltrimEnabled=false', async () => {
      redis.seed(HIST_KEY, makeRawList(500));
      const svc = makeService(redis, repo, { ltrimEnabled: false, hotCap: 300 });

      await svc.archiveTail(INSTANCIA, JID);

      expect(redis.eval).not.toHaveBeenCalled();

      // List is left intact
      expect(redis.getList(HIST_KEY)).toHaveLength(500);
    });
  });

  // -------------------------------------------------------------------------
  // 6. Garantia anti-perda em concorrência: a cabeça devolvida pela Lua É a fonte de verdade
  // -------------------------------------------------------------------------

  describe('rpush concorrente durante o ciclo não perde msg (a cabeça devolvida pela Lua == a removida)', () => {
    it('o que o fake eval devolve é exatamente o que fica arquivado — sem outra fonte de verdade', async () => {
      // Simulate: 400 items in Redis, cap=300
      // While step-1 runs a concurrent rpush would add items — but the Lua script
      // is atomic, so whatever it returns is canonical (head = removed items).
      // The fake eval simulates this: it atomically computes and returns the head.
      const items = makeRawList(400);
      redis.seed(HIST_KEY, items);

      // Intercept eval to capture what it returns (simulates the Lua return value).
      const originalEval = redis.eval;
      let capturedHead: string[] = [];
      redis.eval = vi.fn(async (...args: Parameters<typeof originalEval>) => {
        const head = await originalEval(...args);
        capturedHead = head;
        return head;
      }) as any;

      const svc = makeService(redis, repo, { ltrimEnabled: true, hotCap: 300 });
      await svc.archiveTail(INSTANCIA, JID);

      // capturedHead = 100 items (400-300)
      expect(capturedHead).toHaveLength(100);

      // The service must archive exactly those items — single source of truth.
      const calls = (repo.insertManyIdempotent as ReturnType<typeof vi.fn>).mock.calls;
      // Find the call that carried the head entries (last call = step-2)
      const lastCall = calls[calls.length - 1];
      const archivedHead: ArchiveEntry[] = lastCall[2];

      expect(archivedHead).toHaveLength(100);

      // Each archived entry's raw must match the corresponding item the Lua returned.
      for (let i = 0; i < capturedHead.length; i++) {
        expect(archivedHead[i].raw).toBe(capturedHead[i]);
      }
    });
  });

  // -------------------------------------------------------------------------
  // 7. toEntries: raw handling
  // -------------------------------------------------------------------------

  describe('toEntries — raw field', () => {
    it('o campo raw de cada ArchiveEntry é a string JSON original (não o objeto parseado)', async () => {
      const rawStr = JSON.stringify({ id: 'wamid.X', type: 'human', data: { content: 'hello', timestamp: 1700000001000 } });
      redis.seed(HIST_KEY, [rawStr]);
      const svc = makeService(redis, repo, { ltrimEnabled: false, hotCap: 300 });

      await svc.archiveTail(INSTANCIA, JID);

      const calls = (repo.insertManyIdempotent as ReturnType<typeof vi.fn>).mock.calls;
      // At least one call with entries
      const callWithEntries = calls.find(([, , entries]) => (entries as ArchiveEntry[]).length > 0);
      expect(callWithEntries).toBeDefined();
      const entries: ArchiveEntry[] = callWithEntries![2];
      const entry = entries[0];

      // raw must be the ORIGINAL string, not a parsed object
      expect(entry.raw).toBe(rawStr);
      expect(typeof entry.raw).toBe('string');
    });

    it('entradas malformadas (JSON inválido) são filtradas e não aparecem em ArchiveEntry', async () => {
      redis.seed(HIST_KEY, ['NOT_JSON', makeRaw(1)]);
      const svc = makeService(redis, repo, { ltrimEnabled: false, hotCap: 300 });

      await svc.archiveTail(INSTANCIA, JID);

      const calls = (repo.insertManyIdempotent as ReturnType<typeof vi.fn>).mock.calls;
      const callWithEntries = calls.find(([, , entries]) => (entries as ArchiveEntry[]).length > 0);
      // Only 1 valid entry (the malformed one is filtered)
      expect(callWithEntries).toBeDefined();
      const entries: ArchiveEntry[] = callWithEntries![2];
      expect(entries).toHaveLength(1);
      expect(entries[0].msgId).toBe('wamid.1');
    });
  });
});
