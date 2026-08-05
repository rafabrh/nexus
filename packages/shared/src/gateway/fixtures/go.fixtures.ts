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
    // Casing whatsmeow REAL: `URL` maiúsculo (Baileys usa `url`), base64 INLINE.
    // O normalizer reescreve `URL→url` e mantém `base64` no topo do corpo para o
    // painel/proxy lerem sem baixar por key. mimetype/fileLength já vêm minúsculos.
    name: 'Message imagem whatsmeow (URL→url, base64 inline preservado)',
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
        imageMessage: {
          URL: 'https://mmg.whatsapp.net/x.enc',
          mimetype: 'image/jpeg',
          fileLength: 184449,
          FileSHA256: 'sha',
          MediaKey: 'mk',
          Height: 1280,
          Width: 720,
          Caption: 'legenda da foto',
          messageContextInfo: { messageSecret: 'x' },
        },
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
          imageMessage: {
            url: 'https://mmg.whatsapp.net/x.enc',
            mimetype: 'image/jpeg',
            fileLength: 184449,
            fileSha256: 'sha',
            mediaKey: 'mk',
            height: 1280,
            width: 720,
            caption: 'legenda da foto',
            messageContextInfo: { messageSecret: 'x' },
          },
        },
        messageTimestamp: EPOCH,
      },
      sender: OWNER,
      gateway: 'go',
    },
  },
  {
    // Áudio PTT whatsmeow: `PTT`/`URL`/`Seconds`/`Waveform`/`Mimetype` title-cased.
    // O normalizer reescreve p/ `ptt`/`url`/`seconds`/`waveform`/`mimetype` (o
    // painel lê `audioMessage` só pela presença + mimetype; o casing correto
    // garante que ptt/seconds/waveform cheguem para futuros consumidores/UI).
    name: 'Message áudio PTT whatsmeow (PTT/URL/Seconds/Waveform/Mimetype → minúsculo)',
    raw: env('Message', {
      Info: {
        Chat: LID_PEER,
        Sender: LID_PEER,
        SenderAlt: PHONE_PEER,
        IsFromMe: false,
        IsGroup: false,
        ID: 'GOMSG7',
        Timestamp: ISO,
        Type: 'media',
        MediaType: 'audio',
      },
      Message: {
        base64: 'AUDIOBYTES',
        audioMessage: {
          PTT: true,
          URL: 'https://mmg.whatsapp.net/a.enc',
          Mimetype: 'audio/ogg; codecs=opus',
          Seconds: 6,
          Waveform: 'AAECAwQ=',
          FileLength: 9001,
          FileSHA256: 'sha-a',
          MediaKey: 'mk-a',
        },
      },
    }),
    ctx: goCtx,
    expected: {
      event: 'messages.upsert',
      instance: 'Shkgroup',
      data: {
        key: { remoteJid: LID_PEER, remoteJidAlt: PHONE_PEER, fromMe: false, id: 'GOMSG7' },
        message: {
          base64: 'AUDIOBYTES',
          audioMessage: {
            ptt: true,
            url: 'https://mmg.whatsapp.net/a.enc',
            mimetype: 'audio/ogg; codecs=opus',
            seconds: 6,
            waveform: 'AAECAwQ=',
            fileLength: 9001,
            fileSha256: 'sha-a',
            mediaKey: 'mk-a',
          },
        },
        messageTimestamp: EPOCH,
      },
      sender: OWNER,
      gateway: 'go',
    },
  },
  {
    // Vídeo + documento whatsmeow no MESMO corpo é impossível, mas o vídeo sozinho
    // trava o casing de `Caption`/`URL`. Documento trava `FileName`.
    name: 'Message vídeo whatsmeow (URL→url, Caption→caption)',
    raw: env('Message', {
      Info: {
        Chat: '5511999@s.whatsapp.net',
        Sender: '5511999@s.whatsapp.net',
        IsFromMe: false,
        IsGroup: false,
        ID: 'GOMSG8',
        Timestamp: ISO,
        Type: 'media',
        MediaType: 'video',
      },
      Message: {
        base64: 'VIDEOBYTES',
        videoMessage: { URL: 'https://mmg.whatsapp.net/v.enc', Mimetype: 'video/mp4', Caption: 'olha isso', Seconds: 12 },
      },
    }),
    ctx: goCtx,
    expected: {
      event: 'messages.upsert',
      instance: 'Shkgroup',
      data: {
        key: { remoteJid: '5511999@s.whatsapp.net', fromMe: false, id: 'GOMSG8' },
        message: {
          base64: 'VIDEOBYTES',
          videoMessage: { url: 'https://mmg.whatsapp.net/v.enc', mimetype: 'video/mp4', caption: 'olha isso', seconds: 12 },
        },
        messageTimestamp: EPOCH,
      },
      sender: OWNER,
      gateway: 'go',
    },
  },
  {
    name: 'Message documento whatsmeow (FileName→fileName, URL→url)',
    raw: env('Message', {
      Info: {
        Chat: '5511999@s.whatsapp.net',
        Sender: '5511999@s.whatsapp.net',
        IsFromMe: false,
        IsGroup: false,
        ID: 'GOMSG9',
        Timestamp: ISO,
        Type: 'media',
        MediaType: 'document',
      },
      Message: {
        base64: 'DOCBYTES',
        documentMessage: { URL: 'https://mmg.whatsapp.net/d.enc', Mimetype: 'application/pdf', FileName: 'contrato.pdf', FileLength: 4242 },
      },
    }),
    ctx: goCtx,
    expected: {
      event: 'messages.upsert',
      instance: 'Shkgroup',
      data: {
        key: { remoteJid: '5511999@s.whatsapp.net', fromMe: false, id: 'GOMSG9' },
        message: {
          base64: 'DOCBYTES',
          documentMessage: { url: 'https://mmg.whatsapp.net/d.enc', mimetype: 'application/pdf', fileName: 'contrato.pdf', fileLength: 4242 },
        },
        messageTimestamp: EPOCH,
      },
      sender: OWNER,
      gateway: 'go',
    },
  },
  {
    name: 'Message sticker whatsmeow (URL→url; passa como mídia image no painel)',
    raw: env('Message', {
      Info: {
        Chat: '5511999@s.whatsapp.net',
        Sender: '5511999@s.whatsapp.net',
        IsFromMe: false,
        IsGroup: false,
        ID: 'GOMSG10',
        Timestamp: ISO,
        Type: 'media',
        MediaType: 'sticker',
      },
      Message: {
        base64: 'STICKERBYTES',
        stickerMessage: { URL: 'https://mmg.whatsapp.net/s.enc', Mimetype: 'image/webp', FileLength: 1024 },
      },
    }),
    ctx: goCtx,
    expected: {
      event: 'messages.upsert',
      instance: 'Shkgroup',
      data: {
        key: { remoteJid: '5511999@s.whatsapp.net', fromMe: false, id: 'GOMSG10' },
        message: {
          base64: 'STICKERBYTES',
          stickerMessage: { url: 'https://mmg.whatsapp.net/s.enc', mimetype: 'image/webp', fileLength: 1024 },
        },
        messageTimestamp: EPOCH,
      },
      sender: OWNER,
      gateway: 'go',
    },
  },
  {
    name: 'Message reação (reactionMessage passa opaco — sem nó de mídia)',
    raw: env('Message', {
      Info: {
        Chat: '5511999@s.whatsapp.net',
        Sender: '5511999@s.whatsapp.net',
        IsFromMe: false,
        IsGroup: false,
        ID: 'GOMSG11',
        Timestamp: ISO,
        Type: 'reaction',
      },
      Message: {
        reactionMessage: { key: { id: 'GOMSG1' }, text: '👍', senderTimestampMS: 1704067200000 },
      },
    }),
    ctx: goCtx,
    expected: {
      event: 'messages.upsert',
      instance: 'Shkgroup',
      data: {
        key: { remoteJid: '5511999@s.whatsapp.net', fromMe: false, id: 'GOMSG11' },
        message: {
          reactionMessage: { key: { id: 'GOMSG1' }, text: '👍', senderTimestampMS: 1704067200000 },
        },
        messageTimestamp: EPOCH,
      },
      sender: OWNER,
      gateway: 'go',
    },
  },
  {
    name: 'Message link (extendedTextMessage passa opaco — text/contextInfo Baileys)',
    raw: env('Message', {
      Info: {
        Chat: '5511999@s.whatsapp.net',
        Sender: '5511999@s.whatsapp.net',
        IsFromMe: false,
        IsGroup: false,
        ID: 'GOMSG12',
        Timestamp: ISO,
        Type: 'text',
      },
      Message: {
        extendedTextMessage: {
          text: 'veja https://exemplo.com',
          contextInfo: { stanzaId: 'GOMSG1', quotedMessage: { conversation: 'anterior' } },
        },
      },
    }),
    ctx: goCtx,
    expected: {
      event: 'messages.upsert',
      instance: 'Shkgroup',
      data: {
        key: { remoteJid: '5511999@s.whatsapp.net', fromMe: false, id: 'GOMSG12' },
        message: {
          extendedTextMessage: {
            text: 'veja https://exemplo.com',
            contextInfo: { stanzaId: 'GOMSG1', quotedMessage: { conversation: 'anterior' } },
          },
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
    // `state` (além de `status`): o painel lê `data.state`; sem ele todo Connected
    // cairia no default 'close'. jid com device é ignorado na key.
    name: 'Connected → connection.update (open, state=open); jid com device ignorado',
    raw: env('Connected', { jid: '5511000:57@s.whatsapp.net', pushName: 'Bot', status: 'open' }),
    ctx: goCtx,
    expected: {
      event: 'connection.update',
      instance: 'Shkgroup',
      data: { key: { remoteJid: '', fromMe: false, id: '' }, status: 'open', state: 'open' },
      sender: OWNER,
      gateway: 'go',
    },
  },
  {
    name: 'LoggedOut → connection.update (close, state=close)',
    raw: env('LoggedOut', {}),
    ctx: goCtx,
    expected: {
      event: 'connection.update',
      instance: 'Shkgroup',
      data: { key: { remoteJid: '', fromMe: false, id: '' }, status: 'close', state: 'close' },
      sender: OWNER,
      gateway: 'go',
    },
  },
  {
    // contacts.update GO: PushName → contacts.update (shape v1 objeto). O consumer
    // (handleContactUpdate) achata `data.key` + `data.pushName`. A chave inclui o
    // telefone real (remoteJidAlt) quando @lid.
    name: 'PushName → contacts.update (shape v1 objeto; consumer achata)',
    raw: env('PushName', {
      Info: {
        Chat: LID_PEER,
        Sender: LID_PEER,
        SenderAlt: PHONE_PEER,
        IsFromMe: false,
        IsGroup: false,
        ID: 'GOMSG13',
        PushName: 'Cliente Novo',
        Timestamp: ISO,
      },
    }),
    ctx: goCtx,
    expected: {
      event: 'contacts.update',
      instance: 'Shkgroup',
      data: {
        key: { remoteJid: LID_PEER, remoteJidAlt: PHONE_PEER, fromMe: false, id: 'GOMSG13' },
        pushName: 'Cliente Novo',
        messageTimestamp: EPOCH,
      },
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
