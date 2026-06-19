import { describe, it, expect, vi } from 'vitest';
import { SyncService } from './sync.service';

/**
 * Regression for the onboarding race: the sync fired before Baileys finished
 * downloading the chat history, so `findChats` returned an empty/partial list
 * and the panel imported 0 conversations. `collectStableChats` must poll until
 * the count stabilizes instead of trusting the first (often empty) read.
 */
function makeService(findChats: () => Promise<unknown>): {
  service: SyncService;
  calls: () => number;
} {
  let calls = 0;
  const evolution = {
    findChats: vi.fn(async () => {
      calls++;
      return findChats();
    }),
  };
  // Redis is unused by collectStableChats — only the Evolution client matters.
  const service = new SyncService({} as never, evolution as never, { addJid: vi.fn() } as never);
  return { service, calls: () => calls };
}

const chat = (jid: string) => ({ remoteJid: jid });

describe('SyncService.collectStableChats', () => {
  it('waits for the history to load instead of trusting the first empty read', async () => {
    // Simulates Baileys progressively populating: empty → 1 → 2 → 2 (stable).
    const sequence = [
      [],
      [chat('111@lid')],
      [chat('111@lid'), chat('222@lid')],
      [chat('111@lid'), chat('222@lid')],
    ];
    let i = 0;
    const { service, calls } = makeService(async () =>
      sequence[Math.min(i++, sequence.length - 1)],
    );

    const result = await service.collectStableChats('inst', 6, 0);

    expect(result).toHaveLength(2);
    expect(calls()).toBe(4); // polled until the count stopped growing
  });

  it('excludes groups and broadcasts, keeping @lid and @s.whatsapp.net', async () => {
    const stable = [
      chat('111@lid'),
      chat('5511999@s.whatsapp.net'),
      chat('123@g.us'),
      chat('status@broadcast'),
    ];
    const { service } = makeService(async () => stable);

    const result = await service.collectStableChats('inst', 6, 0);

    expect(result.map((c) => c.remoteJid)).toEqual([
      '111@lid',
      '5511999@s.whatsapp.net',
    ]);
  });

  it('returns empty for an account with no conversations (exhausts attempts)', async () => {
    const { service, calls } = makeService(async () => []);

    const result = await service.collectStableChats('inst', 4, 0);

    expect(result).toEqual([]);
    expect(calls()).toBe(4); // tried all attempts before giving up
  });
});

describe('SyncService indexes imported chats', () => {
  it('adds the resolved canonical jid to the conversation index after import', async () => {
    const histStore = new Map<string, string[]>();
    const redis = {
      llen: vi.fn(async (k: string) => histStore.get(k)?.length ?? 0),
      exists: vi.fn(async () => 0),
      pipeline: vi.fn(() => {
        const ops: Array<[string, string]> = [];
        const chain: any = {
          rpush: (k: string, v: string) => {
            const arr = histStore.get(k) ?? [];
            arr.push(v);
            histStore.set(k, arr);
            return chain;
          },
          set: () => chain,
          exec: async () => ops,
        };
        return chain;
      }),
    };

    const evolution = {
      findChats: vi.fn(async () => [{ remoteJid: '5511999@s.whatsapp.net' }]),
      findMessages: vi.fn(async () => [
        {
          key: { remoteJid: '5511999@s.whatsapp.net', fromMe: false },
          message: { conversation: 'oi' },
          messageTimestamp: 1700000000,
        },
      ]),
      findContacts: vi.fn(async () => []),
    };

    const index = { addJid: vi.fn(async () => undefined) };
    const service = new SyncService(redis as never, evolution as never, index as never);
    // Bypass the history-load poll (delays) — not under test here.
    vi.spyOn(service, 'collectStableChats').mockResolvedValue([
      { remoteJid: '5511999@s.whatsapp.net' },
    ] as never);

    await service.syncAll('shk');

    expect(index.addJid).toHaveBeenCalledWith('shk', '5511999@s.whatsapp.net');
  });
});
