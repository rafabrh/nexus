import type { NexusEventV1, RawGatewayEvent, NormalizeContext } from '../../types/nexus-event-v1';

export interface Fixture {
  name: string;
  raw: RawGatewayEvent;
  ctx: NormalizeContext;
  expected: NexusEventV1 | null;
}

const nodeCtx: NormalizeContext = {
  gateway: 'node',
  resolveInstance: (raw) => (raw.instance as string) ?? null,
};

export const nodeFixtures: Fixture[] = [
  {
    name: 'messages.upsert recebida (fromMe=false)',
    raw: {
      event: 'messages.upsert',
      instance: 'Shkgroup',
      data: {
        key: { remoteJid: '5511999@s.whatsapp.net', fromMe: false, id: 'WAMID1' },
        pushName: 'Cliente',
        message: { conversation: 'oi' },
        messageTimestamp: 1700000000,
      },
      sender: '5511000@s.whatsapp.net',
    },
    ctx: nodeCtx,
    expected: {
      event: 'messages.upsert',
      instance: 'Shkgroup',
      data: {
        key: { remoteJid: '5511999@s.whatsapp.net', fromMe: false, id: 'WAMID1' },
        pushName: 'Cliente',
        message: { conversation: 'oi' },
        messageTimestamp: 1700000000,
      },
      sender: '5511000@s.whatsapp.net',
      gateway: 'node',
    },
  },
  {
    name: 'messages.upsert @lid (remoteJidAlt = telefone real)',
    raw: {
      event: 'messages.upsert',
      instance: 'Shkgroup',
      data: {
        key: { remoteJid: '262246@lid', remoteJidAlt: '5511999@s.whatsapp.net', fromMe: false, id: 'WAMID2' },
        message: { conversation: 'via lid' },
        messageTimestamp: 1700000001,
      },
    },
    ctx: nodeCtx,
    expected: {
      event: 'messages.upsert',
      instance: 'Shkgroup',
      data: {
        key: { remoteJid: '262246@lid', remoteJidAlt: '5511999@s.whatsapp.net', fromMe: false, id: 'WAMID2' },
        message: { conversation: 'via lid' },
        messageTimestamp: 1700000001,
      },
      gateway: 'node',
    },
  },
  {
    name: 'send.message (eco do próprio envio, fromMe=true)',
    raw: {
      event: 'send.message',
      instance: 'Shkgroup',
      data: { key: { remoteJid: '5511999@s.whatsapp.net', fromMe: true, id: 'WAMID3' }, message: { conversation: 'resposta' } },
    },
    ctx: nodeCtx,
    expected: {
      event: 'send.message',
      instance: 'Shkgroup',
      data: { key: { remoteJid: '5511999@s.whatsapp.net', fromMe: true, id: 'WAMID3' }, message: { conversation: 'resposta' } },
      gateway: 'node',
    },
  },
  {
    name: 'instance desconhecida (resolveInstance → null) → drop',
    raw: { event: 'messages.upsert', data: { key: { remoteJid: 'x', fromMe: false, id: 'X' } } },
    ctx: nodeCtx,
    expected: null,
  },
  {
    name: 'payload sem event → drop',
    raw: { instance: 'Shkgroup', data: {} },
    ctx: nodeCtx,
    expected: null,
  },
];
