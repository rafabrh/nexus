import { describe, it, expect } from 'vitest';
import { parseHistoryEntry, phoneFromJid, parseHistoryKey } from './parse-history-entry';

describe('phoneFromJid', () => {
  it('normal → dígitos', () => expect(phoneFromJid('5511@s.whatsapp.net')).toBe('5511'));
  it('@lid → inalterado', () => expect(phoneFromJid('262246@lid')).toBe('262246@lid'));
  it('@g.us → inalterado', () => expect(phoneFromJid('123@g.us')).toBe('123@g.us'));
});

describe('parseHistoryKey', () => {
  it('normal → jid ganha @s.whatsapp.net', () =>
    expect(parseHistoryKey('chathistory:shk-5511')).toEqual({
      instancia: 'shk',
      id: '5511',
      jid: '5511@s.whatsapp.net',
    }));
  it('@lid passa inalterado', () =>
    expect(parseHistoryKey('chathistory:shk-262246@lid')).toEqual({
      instancia: 'shk',
      id: '262246@lid',
      jid: '262246@lid',
    }));
  it('split no PRIMEIRO traço (id pode conter -)', () =>
    expect(parseHistoryKey('chathistory:shk-12-34')).toMatchObject({ instancia: 'shk', id: '12-34' }));
  it('sem traço → null', () => expect(parseHistoryKey('chathistory:shk')).toBeNull());
  it('id vazio (chathistory:shk-) → null', () => expect(parseHistoryKey('chathistory:shk-')).toBeNull());
  it('instancia vazia (chathistory:-5511) → null', () =>
    expect(parseHistoryKey('chathistory:-5511')).toBeNull());
  it('prefixo diferente → null', () => expect(parseHistoryKey('chat:shk:5511')).toBeNull());
});

describe('parseHistoryEntry', () => {
  it('mensagem de saída (type ai) com id real', () => {
    const e = parseHistoryEntry(JSON.stringify({ id: 'WAMID1', type: 'ai', data: { content: 'oi', timestamp: 1700000000000 } }));
    expect(e).toMatchObject({ msgId: 'WAMID1', type: 'ai', content: 'oi', fromMe: true });
    expect(e!.ts).toBeInstanceOf(Date);
  });
  it('mídia usa media.id como msgId quando não há id de topo', () => {
    const e = parseHistoryEntry(JSON.stringify({ media: { id: 'M1', kind: 'image', mimetype: 'image/jpeg' } }));
    expect(e).toMatchObject({ msgId: 'M1', mediaKind: 'image', mediaId: 'M1' });
  });
  it('quoted preservado', () => {
    const e = parseHistoryEntry(JSON.stringify({ id: 'W', quoted: { id: 'q', preview: 'p', fromMe: true } }));
    expect(e!.quoted).toEqual({ id: 'q', preview: 'p', fromMe: true });
  });
  it('legado sem id → msgId sintético estável por sha1(raw)', () => {
    const raw = JSON.stringify({ data: { content: 'x' } });
    const first = parseHistoryEntry(raw)!.msgId;
    const second = parseHistoryEntry(raw)!.msgId; // duas invocações independentes
    expect(first).toBe(second); // determinístico entre chamadas
    expect(first).toMatch(/^legacy-[0-9a-f]{40}$/); // prefixo + sha1 (40 hex)
  });
  it('malformada → null', () => expect(parseHistoryEntry('{invalid')).toBeNull());
});
