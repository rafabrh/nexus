import { describe, it, expect, vi } from 'vitest';
import { ConversationRepository } from './conversation.repository';

/**
 * Redis mockado só com o necessário para getMessages: a lista do chathistory
 * (lrange) e o hash lateral de ACK (hgetall).
 */
function makeRedis(entries: string[], ack: Record<string, string> = {}) {
  return {
    lrange: vi.fn(async () => entries),
    hgetall: vi.fn(async () => ack),
  } as any;
}

const JID = '5511999@s.whatsapp.net';

describe('ConversationRepository.getMessages deduplica o eco do proprio envio', () => {
  it('colapsa entradas de texto com o mesmo WAMID numa unica bolha', async () => {
    // 1) envio (painel) + 2) eco (webhook) — mesmo id 'M1'.
    const entries = [
      JSON.stringify({ type: 'ai', data: { content: 'oi' }, id: 'M1' }),
      JSON.stringify({ type: 'ai', data: { content: 'oi' }, id: 'M1' }),
    ];
    const repo = new ConversationRepository(makeRedis(entries));

    const msgs = await repo.getMessages('shk', JID, 0);

    expect(msgs).toHaveLength(1);
    expect(msgs[0].id).toBe('M1');
  });

  it('colapsa audio/imagem duplicados pelo mesmo WAMID (painel guarda em media.id)', async () => {
    const entries = [
      // Painel: WAMID so em media.id, sem id no topo.
      JSON.stringify({
        type: 'ai',
        data: { content: '' },
        media: { kind: 'audio', id: 'A1', fromMe: true },
      }),
      // Eco do webhook: WAMID no topo + media.id.
      JSON.stringify({
        type: 'ai',
        data: { content: '[audio]' },
        id: 'A1',
        media: { kind: 'audio', id: 'A1', fromMe: true },
      }),
    ];
    const repo = new ConversationRepository(makeRedis(entries));

    const msgs = await repo.getMessages('shk', JID, 0);

    expect(msgs).toHaveLength(1);
    expect(msgs[0].mediaType).toBe('audio');
    expect(msgs[0].mediaId).toBe('A1');
  });

  it('preserva mensagens distintas e as sem id (legadas nunca colidem)', async () => {
    const entries = [
      JSON.stringify({ type: 'human', data: { content: 'cliente 1' } }), // sem id
      JSON.stringify({ type: 'human', data: { content: 'cliente 2' } }), // sem id
      JSON.stringify({ type: 'ai', data: { content: 'a' }, id: 'M1' }),
      JSON.stringify({ type: 'ai', data: { content: 'b' }, id: 'M2' }),
    ];
    const repo = new ConversationRepository(makeRedis(entries));

    const msgs = await repo.getMessages('shk', JID, 0);

    expect(msgs).toHaveLength(4); // nada colapsado
  });

  it('mantem o mesmo texto enviado 2x de proposito (WAMIDs diferentes)', async () => {
    const entries = [
      JSON.stringify({ type: 'ai', data: { content: 'ok' }, id: 'M1' }),
      JSON.stringify({ type: 'ai', data: { content: 'ok' }, id: 'M2' }),
    ];
    const repo = new ConversationRepository(makeRedis(entries));

    const msgs = await repo.getMessages('shk', JID, 0);

    expect(msgs).toHaveLength(2); // ids diferentes → não é duplicata
  });

  it('preserva a primeira ocorrencia (envio do painel), com fromMe correto', async () => {
    const entries = [
      JSON.stringify({ type: 'ai', data: { content: 'legenda real' }, id: 'M1' }),
      JSON.stringify({ type: 'ai', data: { content: '[imagem]' }, id: 'M1' }),
    ];
    const repo = new ConversationRepository(makeRedis(entries));

    const msgs = await repo.getMessages('shk', JID, 0);

    expect(msgs).toHaveLength(1);
    expect(msgs[0].content).toBe('legenda real');
    expect(msgs[0].role).toBe('assistant');
  });
});
