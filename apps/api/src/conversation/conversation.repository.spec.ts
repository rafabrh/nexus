import { describe, it, expect, vi } from 'vitest';
import { ConversationRepository } from './conversation.repository';
import type { MessageArchiveRepository } from './message-archive.repository';
import type { MessageRow } from '../core/db/schema';

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

/** Mock mínimo de MessageArchiveRepository para os testes de getMessages. */
function makeArchive(
  overrides: Partial<{ seqOf: any; readPage: any }> = {},
): MessageArchiveRepository {
  return {
    seqOf: vi.fn(async () => null),
    readPage: vi.fn(async () => []),
    insertManyIdempotent: vi.fn(async () => {}),
    ...overrides,
  } as unknown as MessageArchiveRepository;
}

/** Constrói um MessageRow completo com defaults sensatos para testes. */
function makeRow(overrides: Partial<MessageRow> = {}): MessageRow {
  return {
    seq: 1,
    instancia: 'shk',
    jid: JID,
    msgId: 'MSG1',
    fromMe: false,
    type: 'text',
    content: 'hello',
    mediaKind: null,
    mediaId: null,
    mediaMimetype: null,
    quoted: null,
    ts: new Date('2024-01-15T10:00:00.000Z'),
    raw: {},
    createdAt: new Date('2024-01-15T10:00:00.000Z'),
    ...overrides,
  };
}

const JID = '5511999@s.whatsapp.net';

describe('ConversationRepository.getMessages deduplica o eco do proprio envio', () => {
  it('colapsa entradas de texto com o mesmo WAMID numa unica bolha', async () => {
    // 1) envio (painel) + 2) eco (webhook) — mesmo id 'M1'.
    const entries = [
      JSON.stringify({ type: 'ai', data: { content: 'oi' }, id: 'M1' }),
      JSON.stringify({ type: 'ai', data: { content: 'oi' }, id: 'M1' }),
    ];
    const repo = new ConversationRepository(makeRedis(entries), makeArchive());

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
    const repo = new ConversationRepository(makeRedis(entries), makeArchive());

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
    const repo = new ConversationRepository(makeRedis(entries), makeArchive());

    const msgs = await repo.getMessages('shk', JID, 0);

    expect(msgs).toHaveLength(4); // nada colapsado
  });

  it('mantem o mesmo texto enviado 2x de proposito (WAMIDs diferentes)', async () => {
    const entries = [
      JSON.stringify({ type: 'ai', data: { content: 'ok' }, id: 'M1' }),
      JSON.stringify({ type: 'ai', data: { content: 'ok' }, id: 'M2' }),
    ];
    const repo = new ConversationRepository(makeRedis(entries), makeArchive());

    const msgs = await repo.getMessages('shk', JID, 0);

    expect(msgs).toHaveLength(2); // ids diferentes → não é duplicata
  });

  it('preserva a primeira ocorrencia (envio do painel), com fromMe correto', async () => {
    const entries = [
      JSON.stringify({ type: 'ai', data: { content: 'legenda real' }, id: 'M1' }),
      JSON.stringify({ type: 'ai', data: { content: '[imagem]' }, id: 'M1' }),
    ];
    const repo = new ConversationRepository(makeRedis(entries), makeArchive());

    const msgs = await repo.getMessages('shk', JID, 0);

    expect(msgs).toHaveLength(1);
    expect(msgs[0].content).toBe('legenda real');
    expect(msgs[0].role).toBe('assistant');
  });
});

// ---------------------------------------------------------------------------
// getMessagesPage — leitura tiered (histórico frio Postgres por seq)
// ---------------------------------------------------------------------------

describe('ConversationRepository.getMessagesPage', () => {
  it('com beforeMsgId: resolve seq, chama readPage com beforeSeq e limit, mapeia rows', async () => {
    const row = makeRow({
      msgId: 'MSG1',
      fromMe: false,
      content: 'ola',
      mediaKind: null,
      mediaId: null,
      ts: new Date('2024-01-15T10:00:00.000Z'),
      quoted: null,
    });

    const archive = makeArchive({
      seqOf: vi.fn(async () => 42),
      readPage: vi.fn(async () => [row]),
    });

    const repo = new ConversationRepository(makeRedis([]), archive);
    const msgs = await repo.getMessagesPage('shk', JID, { beforeMsgId: 'MSG1', limit: 20 });

    expect(archive.seqOf).toHaveBeenCalledWith('shk', JID, 'MSG1');
    expect(archive.readPage).toHaveBeenCalledWith('shk', JID, { beforeSeq: 42, limit: 20 });

    expect(msgs).toHaveLength(1);
    expect(msgs[0].id).toBe('MSG1');
    expect(msgs[0].role).toBe('user');
    expect(msgs[0].content).toBe('ola');
    expect(msgs[0].mediaType).toBe('text');
    expect(msgs[0].ts).toBe('2024-01-15T10:00:00.000Z');
    // sem status — cold history não rastreia ACK
    expect('status' in msgs[0]).toBe(false);
    // sem quoted — row.quoted é null
    expect('quoted' in msgs[0]).toBe(false);
  });

  it('beforeMsgId dado mas seqOf retorna null → retorna [] sem chamar readPage', async () => {
    const archive = makeArchive({
      seqOf: vi.fn(async () => null),
      readPage: vi.fn(async () => []),
    });

    const repo = new ConversationRepository(makeRedis([]), archive);
    const msgs = await repo.getMessagesPage('shk', JID, { beforeMsgId: 'UNKNOWN', limit: 20 });

    expect(msgs).toEqual([]);
    expect(archive.readPage).not.toHaveBeenCalled();
  });

  it('sem beforeMsgId: readPage chamado com beforeSeq undefined e limit', async () => {
    const archive = makeArchive({
      seqOf: vi.fn(async () => null),
      readPage: vi.fn(async () => []),
    });

    const repo = new ConversationRepository(makeRedis([]), archive);
    await repo.getMessagesPage('shk', JID, { limit: 10 });

    expect(archive.seqOf).not.toHaveBeenCalled();
    expect(archive.readPage).toHaveBeenCalledWith('shk', JID, { beforeSeq: undefined, limit: 10 });
  });

  it('row com ts null mapeia para ts: null (não crasha)', async () => {
    const row = makeRow({ ts: null });
    const archive = makeArchive({ readPage: vi.fn(async () => [row]) });

    const repo = new ConversationRepository(makeRedis([]), archive);
    const msgs = await repo.getMessagesPage('shk', JID, { limit: 10 });

    expect(msgs[0].ts).toBeNull();
  });

  it('row de mídia mapeia mediaType e mediaId corretamente', async () => {
    const row = makeRow({
      msgId: 'IMG1',
      fromMe: true,
      content: 'legenda',
      mediaKind: 'image',
      mediaId: 'media-abc',
      ts: new Date('2024-02-01T08:30:00.000Z'),
    });
    const archive = makeArchive({ readPage: vi.fn(async () => [row]) });

    const repo = new ConversationRepository(makeRedis([]), archive);
    const msgs = await repo.getMessagesPage('shk', JID, { limit: 5 });

    expect(msgs[0].id).toBe('IMG1');
    expect(msgs[0].role).toBe('assistant'); // fromMe=true
    expect(msgs[0].mediaType).toBe('image');
    expect(msgs[0].mediaId).toBe('media-abc');
    expect(msgs[0].ts).toBe('2024-02-01T08:30:00.000Z');
    expect('status' in msgs[0]).toBe(false);
  });

  it('row com quoted popula o campo quoted na Message', async () => {
    const q = { id: 'QID', preview: 'citado', fromMe: false };
    const row = makeRow({ quoted: q });
    const archive = makeArchive({ readPage: vi.fn(async () => [row]) });

    const repo = new ConversationRepository(makeRedis([]), archive);
    const msgs = await repo.getMessagesPage('shk', JID, { limit: 5 });

    expect(msgs[0].quoted).toEqual(q);
  });

  it('row sem mediaId não inclui a chave mediaId no objeto Message', async () => {
    const row = makeRow({ mediaId: null, mediaKind: null });
    const archive = makeArchive({ readPage: vi.fn(async () => [row]) });

    const repo = new ConversationRepository(makeRedis([]), archive);
    const msgs = await repo.getMessagesPage('shk', JID, { limit: 5 });

    expect('mediaId' in msgs[0]).toBe(false);
  });
});
