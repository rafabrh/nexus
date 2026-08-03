import type { NormalizeContext } from '../../types/nexus-event-v1';
import type { Fixture } from './node.fixtures';

// Fixtures da Evolution GO (whatsmeow) → NEXUS Event v1.
// Estrutura CAPTURADA na Fase 0 (2026-08-03, número de teste) — envelope real
// `{data, event, instanceId, instanceName, instanceToken}` + `state` no Receipt.
// VALORES sintéticos (JIDs/IDs/conteúdo) por LGPD: só a ESTRUTURA é real. Fatos
// que estes fixtures travam (capturados, não assumidos):
//   • Info.Timestamp é STRING ISO-8601 → normalizer converte p/ epoch segundos.
//   • @lid: 1:1 recebido traz o telefone em Info.SenderAlt; 1:1 enviado em
//     Info.RecipientAlt; grupo usa Info.Sender=@lid (participant).
//   • Receipt NÃO tem data.Info: Chat/Sender/IsFromMe/IsGroup/MessageIDs(array)
//     ficam direto em data; Type é minúsculo ("read"); `state` ("Read"/"Delivered")
//     vem no topo do envelope.
//   • JIDs de device (":NN@…", ex. Receipt.Sender/Connected.jid) → canonizados.
//   • Connected: data={jid,pushName,status:"open"}.
const ISO = '2024-01-01T00:00:00Z';
const EPOCH = 1704067200; // Date.parse(ISO)/1000

const LID_PEER = '111111111111111@lid'; // @lid do contato 1:1
const PHONE_PEER = '5511988887777@s.whatsapp.net'; // telefone real do contato
const LID_MEMBER = '222222222222222@lid'; // membro de grupo (@lid)
const GROUP = '120363000000000001@g.us';
const OWNER = '5511000@s.whatsapp.net'; // ctx.ownerJid(Shkgroup)

const goCtx: NormalizeContext = {
  gateway: 'go',
  // GO traz instanceId (UUID); o ctx resolve p/ o nome canônico do painel.
  resolveInstance: (raw) => ((raw as { instanceId?: string }).instanceId === 'uuid-shk' ? 'Shkgroup' : null),
  ownerJid: (inst) => (inst === 'Shkgroup' ? OWNER : undefined),
};

// Helper p/ montar o envelope real da GO.
const env = (event: string, data: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  event,
  instanceId: 'uuid-shk',
  instanceName: 'nexus-teste',
  instanceToken: 'tok',
  data,
  ...extra,
});

export const goFixtures: Fixture[] = [
  {
    name: 'Message texto 1:1 recebida @lid (SenderAlt → remoteJidAlt; Timestamp ISO → epoch)',
    raw: env('Message', {
      Info: {
        Chat: LID_PEER,
        Sender: LID_PEER,
        SenderAlt: PHONE_PEER,
        RecipientAlt: '',
        IsFromMe: false,
        IsGroup: false,
        AddressingMode: 'lid',
        ID: 'GOMSG1',
        PushName: 'Cliente',
        Timestamp: ISO,
        Type: 'text',
      },
      Message: { conversation: 'oi da go', messageContextInfo: { messageSecret: 'x' } },
    }),
    ctx: goCtx,
    expected: {
      event: 'messages.upsert',
      instance: 'Shkgroup',
      data: {
        key: { remoteJid: LID_PEER, remoteJidAlt: PHONE_PEER, fromMe: false, id: 'GOMSG1' },
        pushName: 'Cliente',
        message: { conversation: 'oi da go', messageContextInfo: { messageSecret: 'x' } },
        messageTimestamp: EPOCH,
      },
      sender: OWNER,
      gateway: 'go',
    },
  },
  {
    name: 'Message texto 1:1 enviada @lid (fromMe → RecipientAlt vira remoteJidAlt)',
    raw: env('Message', {
      Info: {
        Chat: LID_PEER,
        Sender: LID_PEER,
        SenderAlt: '',
        RecipientAlt: PHONE_PEER,
        IsFromMe: true,
        IsGroup: false,
        ID: 'GOMSG2',
        PushName: 'Rafael',
        Timestamp: ISO,
        Type: 'text',
      },
      Message: { conversation: 'resposta go' },
    }),
    ctx: goCtx,
    expected: {
      event: 'messages.upsert',
      instance: 'Shkgroup',
      data: {
        key: { remoteJid: LID_PEER, remoteJidAlt: PHONE_PEER, fromMe: true, id: 'GOMSG2' },
        pushName: 'Rafael',
        message: { conversation: 'resposta go' },
        messageTimestamp: EPOCH,
      },
      sender: OWNER,
      gateway: 'go',
    },
  },
  {
    name: 'Message texto grupo (@lid → participant = Sender; sem remoteJidAlt em @g.us)',
    raw: env('Message', {
      Info: {
        Chat: GROUP,
        Sender: LID_MEMBER,
        SenderAlt: '',
        IsFromMe: false,
        IsGroup: true,
        AddressingMode: 'lid',
        ID: 'GOMSG3',
        Timestamp: ISO,
        Type: 'text',
      },
      Message: { conversation: 'no grupo' },
    }),
    ctx: goCtx,
    expected: {
      event: 'messages.upsert',
      instance: 'Shkgroup',
      data: {
        key: { remoteJid: GROUP, participant: LID_MEMBER, fromMe: false, id: 'GOMSG3' },
        message: { conversation: 'no grupo' },
        messageTimestamp: EPOCH,
      },
      sender: OWNER,
      gateway: 'go',
    },
  },
  {
    name: 'Message texto 1:1 clássico (@s.whatsapp.net, sem alt)',
    raw: env('Message', {
      Info: {
        Chat: '5511999@s.whatsapp.net',
        Sender: '5511999@s.whatsapp.net',
        IsFromMe: false,
        IsGroup: false,
        ID: 'GOMSG4',
        Timestamp: ISO,
        Type: 'text',
      },
      Message: { conversation: 'classico' },
    }),
    ctx: goCtx,
    expected: {
      event: 'messages.upsert',
      instance: 'Shkgroup',
      data: {
        key: { remoteJid: '5511999@s.whatsapp.net', fromMe: false, id: 'GOMSG4' },
        message: { conversation: 'classico' },
        messageTimestamp: EPOCH,
      },
      sender: OWNER,
      gateway: 'go',
    },
  },
  {
    name: 'Message mídia imagem (message passa opaco, incl. base64 inline)',
    raw: env('Message', {
      Info: {
        Chat: LID_PEER,
        Sender: LID_PEER,
        SenderAlt: PHONE_PEER,
        IsFromMe: false,
        IsGroup: false,
        ID: 'GOMSG5',
        Timestamp: ISO,
        Type: 'media',
        MediaType: 'image',
      },
      Message: {
        base64: 'BASE64BYTES',
        imageMessage: { URL: 'https://mmg.whatsapp.net/x.enc', mimetype: 'image/jpeg', fileLength: 184449 },
      },
    }),
    ctx: goCtx,
    expected: {
      event: 'messages.upsert',
      instance: 'Shkgroup',
      data: {
        key: { remoteJid: LID_PEER, remoteJidAlt: PHONE_PEER, fromMe: false, id: 'GOMSG5' },
        message: {
          base64: 'BASE64BYTES',
          imageMessage: { URL: 'https://mmg.whatsapp.net/x.enc', mimetype: 'image/jpeg', fileLength: 184449 },
        },
        messageTimestamp: EPOCH,
      },
      sender: OWNER,
      gateway: 'go',
    },
  },
  {
    name: 'SendMessage → send.message',
    raw: env('SendMessage', {
      Info: {
        Chat: LID_PEER,
        RecipientAlt: PHONE_PEER,
        IsFromMe: true,
        IsGroup: false,
        ID: 'GOMSG6',
        Timestamp: ISO,
        Type: 'text',
      },
      Message: { conversation: 'via api' },
    }),
    ctx: goCtx,
    expected: {
      event: 'send.message',
      instance: 'Shkgroup',
      data: {
        key: { remoteJid: LID_PEER, remoteJidAlt: PHONE_PEER, fromMe: true, id: 'GOMSG6' },
        message: { conversation: 'via api' },
        messageTimestamp: EPOCH,
      },
      sender: OWNER,
      gateway: 'go',
    },
  },
  {
    name: 'Receipt(Read) 1:1 → messages.update (shape real: data.*, MessageIDs[], state topo)',
    raw: env(
      'Receipt',
      {
        Chat: LID_PEER,
        Sender: LID_PEER,
        SenderAlt: PHONE_PEER,
        IsFromMe: false,
        IsGroup: false,
        MessageIDs: ['GOMSG1', 'GOMSG1B'],
        Type: 'read',
        Timestamp: ISO,
      },
      { state: 'Read' },
    ),
    ctx: goCtx,
    expected: {
      event: 'messages.update',
      instance: 'Shkgroup',
      data: {
        key: { remoteJid: LID_PEER, remoteJidAlt: PHONE_PEER, fromMe: false, id: 'GOMSG1' },
        status: 'READ',
      },
      sender: OWNER,
      gateway: 'go',
    },
  },
  {
    name: 'Receipt(Read) grupo → messages.update (participant canonizado, sem device :NN)',
    raw: env(
      'Receipt',
      {
        Chat: GROUP,
        Sender: '222222222222222:56@lid',
        IsFromMe: true,
        IsGroup: true,
        MessageIDs: ['GOMSG3'],
        Type: 'read',
        Timestamp: ISO,
      },
      { state: 'Read' },
    ),
    ctx: goCtx,
    expected: {
      event: 'messages.update',
      instance: 'Shkgroup',
      data: {
        key: { remoteJid: GROUP, participant: LID_MEMBER, fromMe: true, id: 'GOMSG3' },
        status: 'READ',
      },
      sender: OWNER,
      gateway: 'go',
    },
  },
  {
    name: 'Receipt(Delivered via state) → messages.update DELIVERY_ACK (Type pode vir vazio)',
    raw: env(
      'Receipt',
      { Chat: LID_PEER, IsFromMe: false, IsGroup: false, MessageIDs: ['GOMSG5'], Type: '', Timestamp: ISO },
      { state: 'Delivered' },
    ),
    ctx: goCtx,
    expected: {
      event: 'messages.update',
      instance: 'Shkgroup',
      data: { key: { remoteJid: LID_PEER, fromMe: false, id: 'GOMSG5' }, status: 'DELIVERY_ACK' },
      sender: OWNER,
      gateway: 'go',
    },
  },
  {
    name: 'Connected → connection.update (open); jid com device é ignorado na key',
    raw: env('Connected', { jid: '5511000:57@s.whatsapp.net', pushName: 'Bot', status: 'open' }),
    ctx: goCtx,
    expected: {
      event: 'connection.update',
      instance: 'Shkgroup',
      data: { key: { remoteJid: '', fromMe: false, id: '' }, status: 'open' },
      sender: OWNER,
      gateway: 'go',
    },
  },
  {
    name: 'LoggedOut → connection.update (close)',
    raw: env('LoggedOut', {}),
    ctx: goCtx,
    expected: {
      event: 'connection.update',
      instance: 'Shkgroup',
      data: { key: { remoteJid: '', fromMe: false, id: '' }, status: 'close' },
      sender: OWNER,
      gateway: 'go',
    },
  },
  // ---- Descartes explícitos (null) ----
  {
    name: 'Receipt(read-self) → drop',
    raw: env('Receipt', { Chat: LID_PEER, MessageIDs: ['GOMSG1'], Type: 'read-self' }, { state: 'ReadSelf' }),
    ctx: goCtx,
    expected: null,
  },
  {
    name: 'Receipt(played) → drop',
    raw: env('Receipt', { Chat: LID_PEER, MessageIDs: ['GOMSG5'], Type: 'played' }, { state: 'Played' }),
    ctx: goCtx,
    expected: null,
  },
  { name: 'GO QRCode → drop', raw: env('QRCode', {}), ctx: goCtx, expected: null },
  { name: 'GO HistorySync → drop', raw: env('HistorySync', {}), ctx: goCtx, expected: null },
  { name: 'GO GroupInfo → drop', raw: env('GroupInfo', { JID: GROUP }), ctx: goCtx, expected: null },
  {
    name: 'GO instância desconhecida → drop',
    raw: { event: 'Message', instanceId: 'uuid-desconhecido', data: {} },
    ctx: goCtx,
    expected: null,
  },
];
