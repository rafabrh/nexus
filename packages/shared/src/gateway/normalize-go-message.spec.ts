import { describe, it, expect } from 'vitest';
import { normalizeGoMessageBody } from './normalize-go-message';

describe('normalizeGoMessageBody — casing whatsmeow → Baileys', () => {
  it('imagem: URL→url, Caption→caption; mantém base64 inline no topo', () => {
    const out = normalizeGoMessageBody({
      base64: 'BYTES',
      imageMessage: { URL: 'https://x.enc', mimetype: 'image/jpeg', Caption: 'foto', FileLength: 10 },
    });
    expect(out).toEqual({
      base64: 'BYTES',
      imageMessage: { url: 'https://x.enc', mimetype: 'image/jpeg', caption: 'foto', fileLength: 10 },
    });
  });

  it('áudio PTT: PTT→ptt, URL→url, Seconds→seconds, Waveform→waveform, Mimetype→mimetype', () => {
    const out = normalizeGoMessageBody({
      audioMessage: { PTT: true, URL: 'https://a.enc', Seconds: 6, Waveform: 'wf', Mimetype: 'audio/ogg' },
    });
    expect(out).toEqual({
      audioMessage: { ptt: true, url: 'https://a.enc', seconds: 6, waveform: 'wf', mimetype: 'audio/ogg' },
    });
  });

  it('documento: FileName→fileName', () => {
    const out = normalizeGoMessageBody({
      documentMessage: { URL: 'https://d.enc', FileName: 'c.pdf', Mimetype: 'application/pdf' },
    });
    expect(out).toEqual({
      documentMessage: { url: 'https://d.enc', fileName: 'c.pdf', mimetype: 'application/pdf' },
    });
  });

  it('texto (conversation) passa opaco', () => {
    const out = normalizeGoMessageBody({ conversation: 'oi', messageContextInfo: { s: 1 } });
    expect(out).toEqual({ conversation: 'oi', messageContextInfo: { s: 1 } });
  });

  it('reação e extendedText passam opacos (sem nó de mídia)', () => {
    const body = {
      extendedTextMessage: { text: 'link', contextInfo: { stanzaId: 'X' } },
      reactionMessage: { text: '👍' },
    };
    expect(normalizeGoMessageBody(body)).toEqual(body);
  });

  it('idempotente: já-minúsculo (Baileys) passa inalterado', () => {
    const body = { imageMessage: { url: 'https://x', mimetype: 'image/png', caption: 'c' } };
    expect(normalizeGoMessageBody(body)).toEqual(body);
  });

  it('preserva chaves whatsmeow desconhecidas (não mapeadas) sem perder dado', () => {
    const out = normalizeGoMessageBody({
      imageMessage: { URL: 'https://x', SomeUnknownField: 42 },
    });
    expect(out).toEqual({ imageMessage: { url: 'https://x', SomeUnknownField: 42 } });
  });

  it('não muta a entrada (retorna novo objeto)', () => {
    const input = { imageMessage: { URL: 'https://x' } };
    const out = normalizeGoMessageBody(input);
    expect(input).toEqual({ imageMessage: { URL: 'https://x' } }); // intacto
    expect(out).not.toBe(input);
  });

  // ---- Edge cases achados no QA (comportamento observado, travado p/ regressão) ----

  it('nó de mídia null passa opaco (não quebra, não vira {})', () => {
    // whatsmeow nunca deveria mandar null, mas o guard (`value && typeof object`)
    // tem de proteger — um null aqui NÃO pode virar {} nem lançar.
    const out = normalizeGoMessageBody({ imageMessage: null, conversation: 'oi' });
    expect(out).toEqual({ imageMessage: null, conversation: 'oi' });
  });

  it('nó de mídia como ARRAY passa opaco (não é renomeado — só objeto puro)', () => {
    // O guard `!Array.isArray(value)` evita iterar índices como se fossem chaves.
    const out = normalizeGoMessageBody({ imageMessage: [{ URL: 'x' }] });
    expect(out).toEqual({ imageMessage: [{ URL: 'x' }] });
  });

  it('corpo vazio → objeto vazio', () => {
    expect(normalizeGoMessageBody({})).toEqual({});
  });

  it('ContextInfo dentro do nó de mídia: renomeia só a chave RASA (contextInfo), NÃO os campos aninhados', () => {
    // Ressalva conhecida: o rename é RASO. `ContextInfo`→`contextInfo` (topo do nó),
    // mas campos internos title-cased (ex.: StanzaID) NÃO são reescritos. Se a
    // whatsmeow title-casear o interior do contextInfo em nós de mídia, o
    // extractQuoted (que lê `stanzaId`/`quotedMessage` minúsculo) não acha a citação.
    // Nos fixtures da Fase 0 a citação vem por extendedTextMessage já minúsculo
    // (passa opaco), então isto é forward-looking, não um bug ativo.
    const out = normalizeGoMessageBody({
      imageMessage: { URL: 'x', ContextInfo: { StanzaID: 'q1', QuotedMessage: { conversation: 'ant' } } },
    });
    expect(out).toEqual({
      imageMessage: {
        url: 'x',
        contextInfo: { StanzaID: 'q1', QuotedMessage: { conversation: 'ant' } },
      },
    });
  });

  it('ambas as grafias presentes: a 1ª ENUMERADA vence (ordem-dependente, não "Baileys sempre")', () => {
    // whatsmeow não emite as duas juntas, mas o QA documenta o comportamento REAL:
    // o "não sobrescreve" é determinístico só quanto à ordem de enumeração, não
    // quanto a "Baileys sempre vence". Se `url` (Baileys) vem antes, ele vence...
    expect(
      normalizeGoMessageBody({ imageMessage: { url: 'BAILEYS', URL: 'WHATSMEOW' } }),
    ).toEqual({ imageMessage: { url: 'BAILEYS' } });
    // ...mas se `URL` (whatsmeow) vem antes, é o valor dele que fica sob `url`.
    expect(
      normalizeGoMessageBody({ imageMessage: { URL: 'WHATSMEOW', url: 'BAILEYS' } }),
    ).toEqual({ imageMessage: { url: 'WHATSMEOW' } });
  });

  it('grafia minúscula com valor undefined NÃO bloqueia a whatsmeow (guard usa !== undefined)', () => {
    // `url: undefined` presente + `URL` real: o guard `out[target] !== undefined`
    // deixa o valor real sobrescrever o undefined — sem perder o dado.
    expect(
      normalizeGoMessageBody({ imageMessage: { url: undefined, URL: 'REAL' } }),
    ).toEqual({ imageMessage: { url: 'REAL' } });
  });
});
