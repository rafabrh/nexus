import type { NormalizeContext } from '../../types/nexus-event-v1';
import type { Fixture } from './node.fixtures';

// @provisional: shape derivado da spec §4.2/§4.7 (whatsmeow). Os campos/naming
// REAIS da Evolution GO são capturados na Fase 0 (🔒) com número de teste antes
// de produção. Atualizar estes fixtures com capturas reais quando disponíveis.
const goCtx: NormalizeContext = {
  gateway: 'go',
  // GO traz instanceId (UUID); o ctx resolve para o nome canônico.
  resolveInstance: (raw) => ((raw as { instanceId?: string }).instanceId === 'uuid-shk' ? 'Shkgroup' : null),
  ownerJid: (inst) => (inst === 'Shkgroup' ? '5511000@s.whatsapp.net' : undefined),
};

export const goFixtures: Fixture[] = [
  {
    name: 'GO Message → messages.upsert (campos Info.* mapeados)',
    raw: {
      event: 'Message',
      instanceId: 'uuid-shk',
      instanceToken: 'tok',
      data: {
        Info: {
          Chat: '5511999@s.whatsapp.net',
          Sender: '5511999@s.whatsapp.net',
          SenderAlt: '',
          IsFromMe: false,
          IsGroup: false,
          ID: 'GOWAMID1',
          PushName: 'Cliente',
          Timestamp: 1700000000,
        },
        Message: { conversation: 'oi da go' },
      },
    },
    ctx: goCtx,
    expected: {
      event: 'messages.upsert',
      instance: 'Shkgroup',
      data: {
        key: { remoteJid: '5511999@s.whatsapp.net', fromMe: false, id: 'GOWAMID1' },
        pushName: 'Cliente',
        message: { conversation: 'oi da go' },
        messageTimestamp: 1700000000,
      },
      sender: '5511000@s.whatsapp.net', // injetado via ctx.ownerJid
      gateway: 'go',
    },
  },
  {
    name: 'GO Message @lid (SenderAlt = telefone real → remoteJidAlt)',
    raw: {
      event: 'Message',
      instanceId: 'uuid-shk',
      data: {
        Info: {
          Chat: '262246@lid',
          SenderAlt: '5511999@s.whatsapp.net',
          IsFromMe: false,
          IsGroup: false,
          ID: 'GOWAMID2',
          Timestamp: 1700000001,
        },
        Message: { conversation: 'lid go' },
      },
    },
    ctx: goCtx,
    expected: {
      event: 'messages.upsert',
      instance: 'Shkgroup',
      data: {
        key: { remoteJid: '262246@lid', remoteJidAlt: '5511999@s.whatsapp.net', fromMe: false, id: 'GOWAMID2' },
        message: { conversation: 'lid go' },
        messageTimestamp: 1700000001,
      },
      sender: '5511000@s.whatsapp.net',
      gateway: 'go',
    },
  },
  {
    name: 'GO Message em grupo (IsGroup → participant = Sender)',
    raw: {
      event: 'Message',
      instanceId: 'uuid-shk',
      data: {
        Info: {
          Chat: '123-456@g.us',
          Sender: '5511999@s.whatsapp.net',
          IsFromMe: false,
          IsGroup: true,
          ID: 'GOWAMID3',
          Timestamp: 1700000002,
        },
        Message: { conversation: 'no grupo' },
      },
    },
    ctx: goCtx,
    expected: {
      event: 'messages.upsert',
      instance: 'Shkgroup',
      data: {
        key: { remoteJid: '123-456@g.us', participant: '5511999@s.whatsapp.net', fromMe: false, id: 'GOWAMID3' },
        message: { conversation: 'no grupo' },
        messageTimestamp: 1700000002,
      },
      sender: '5511000@s.whatsapp.net',
      gateway: 'go',
    },
  },
  {
    name: 'GO SendMessage → send.message',
    raw: {
      event: 'SendMessage',
      instanceId: 'uuid-shk',
      data: { Info: { Chat: '5511999@s.whatsapp.net', IsFromMe: true, ID: 'GOWAMID4', Timestamp: 1700000003 }, Message: { conversation: 'resposta go' } },
    },
    ctx: goCtx,
    expected: {
      event: 'send.message',
      instance: 'Shkgroup',
      data: { key: { remoteJid: '5511999@s.whatsapp.net', fromMe: true, id: 'GOWAMID4' }, message: { conversation: 'resposta go' }, messageTimestamp: 1700000003 },
      sender: '5511000@s.whatsapp.net',
      gateway: 'go',
    },
  },
  {
    name: 'GO Receipt(Read) → messages.update',
    raw: { event: 'Receipt', instanceId: 'uuid-shk', data: { Type: 'Read', Info: { Chat: '5511999@s.whatsapp.net', ID: 'GOWAMID1', IsFromMe: false } } },
    ctx: goCtx,
    expected: {
      event: 'messages.update',
      instance: 'Shkgroup',
      data: { key: { remoteJid: '5511999@s.whatsapp.net', fromMe: false, id: 'GOWAMID1' }, status: 'READ' },
      sender: '5511000@s.whatsapp.net',
      gateway: 'go',
    },
  },
  {
    name: 'GO Connected → connection.update',
    raw: { event: 'Connected', instanceId: 'uuid-shk', data: {} },
    ctx: goCtx,
    expected: {
      event: 'connection.update',
      instance: 'Shkgroup',
      data: { key: { remoteJid: '', fromMe: false, id: '' }, status: 'open' },
      sender: '5511000@s.whatsapp.net',
      gateway: 'go',
    },
  },
  // ---- Descartes explícitos (null) ----
  { name: 'GO Receipt(ReadSelf) → drop', raw: { event: 'Receipt', instanceId: 'uuid-shk', data: { Type: 'ReadSelf' } }, ctx: goCtx, expected: null },
  { name: 'GO QRCode → drop', raw: { event: 'QRCode', instanceId: 'uuid-shk', data: {} }, ctx: goCtx, expected: null },
  { name: 'GO HistorySync → drop', raw: { event: 'HistorySync', instanceId: 'uuid-shk', data: {} }, ctx: goCtx, expected: null },
  { name: 'GO instância desconhecida → drop', raw: { event: 'Message', instanceId: 'uuid-desconhecido', data: {} }, ctx: goCtx, expected: null },
];
