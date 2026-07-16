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

/**
 * Remediação de contatos poluídos com o nome do dono ("Você"), sequela do bug do
 * eco fromMe: um envio do operador gravava o pushName do dono sobre o contato.
 */
function makeRemediateDeps(store: Record<string, string>, ownerName: string | null) {
  const redis = {
    // scan de página única: devolve todas as chaves do store e cursor '0' (fim).
    scan: vi.fn(async () => ['0', Object.keys(store)]),
    get: vi.fn(async (k: string) => store[k] ?? null),
    set: vi.fn(async (k: string, v: string) => {
      store[k] = v;
      return 'OK';
    }),
    del: vi.fn(async (k: string) => {
      delete store[k];
      return 1;
    }),
    pipeline: vi.fn(() => ({ set: vi.fn(), exec: vi.fn(async () => []) })),
  };
  const evolution = {
    fetchInstances: vi.fn(async () =>
      ownerName ? [{ name: 'shk', profileName: ownerName }] : [{ name: 'shk' }],
    ),
    // syncContacts roda após a limpeza — sem agenda nova neste teste.
    findContacts: vi.fn(async () => []),
  };
  const index = { addJid: vi.fn(async () => undefined) };
  return { redis, evolution, index };
}

describe('SyncService.remediateContactNames', () => {
  it('remove o pushName igual ao nome do dono e preserva contatos legítimos', async () => {
    const store: Record<string, string> = {
      'contact:shk:5511111': JSON.stringify({ pushName: 'SHK Group' }), // poluído
      'contact:shk:5522222': JSON.stringify({ name: 'Maria Cliente' }), // legítimo
      'contact:shk:5533333': JSON.stringify({ pushName: 'João Real' }), // legítimo
      'contact:shk:5544444': JSON.stringify({
        pushName: 'SHK Group',
        profilePicUrl: 'http://x/a.jpg',
      }), // poluído mas com foto → mantém a chave, some só o pushName
    };
    const d = makeRemediateDeps(store, 'SHK Group');
    const svc = new SyncService(d.redis as never, d.evolution as never, d.index as never);

    const res = await svc.remediateContactNames('shk');

    expect(res.ownerName).toBe('SHK Group');
    expect(res.cleaned).toBe(2);
    // só-pushName-poluído → chave apagada (cai no número)
    expect(store['contact:shk:5511111']).toBeUndefined();
    // legítimos intactos
    expect(JSON.parse(store['contact:shk:5522222']).name).toBe('Maria Cliente');
    expect(JSON.parse(store['contact:shk:5533333']).pushName).toBe('João Real');
    // poluído com foto → perde o pushName, mantém a foto
    const kept = JSON.parse(store['contact:shk:5544444']);
    expect(kept.pushName).toBeUndefined();
    expect(kept.profilePicUrl).toBe('http://x/a.jpg');
  });

  it('sem nome do dono, não limpa nada mas ainda dispara o re-sync de contatos', async () => {
    const store: Record<string, string> = {
      'contact:shk:5511111': JSON.stringify({ pushName: 'SHK Group' }),
    };
    const d = makeRemediateDeps(store, null);
    const svc = new SyncService(d.redis as never, d.evolution as never, d.index as never);

    const res = await svc.remediateContactNames('shk');

    expect(res.ownerName).toBeNull();
    expect(res.cleaned).toBe(0);
    expect(store['contact:shk:5511111']).toBeDefined(); // intocado
    expect(d.evolution.findContacts).toHaveBeenCalledWith('shk'); // re-sync rodou
  });
});
