import type {
  NexusEventV1,
  NexusEventV1Type,
  RawGatewayEvent,
  NormalizeContext,
} from '../types/nexus-event-v1';

const V1_TYPES = new Set<NexusEventV1Type>([
  'messages.upsert',
  'send.message',
  'messages.update',
  'connection.update',
  'contacts.update',
  'presence.update',
]);

/**
 * Normaliza um evento cru de gateway para o contrato NEXUS Event v1 (D12).
 * Função PURA: sem I/O, sem Redis, sem Nest. O `ctx` injeta a resolução de
 * instância e o ownerJid. Devolve `null` para eventos fora do contrato v1
 * (o chamador loga `evt.normalizer-drop` e segue — NÃO é NACK).
 */
export function normalizeGatewayEvent(
  raw: RawGatewayEvent,
  ctx: NormalizeContext,
): NexusEventV1 | null {
  const instance = ctx.resolveInstance(raw);
  if (!instance) return null; // instância desconhecida → drop (logado pelo chamador)

  if (ctx.gateway === 'node') return normalizeNode(raw, instance);
  return normalizeGo(raw, instance, ctx);
}

/**
 * Contexto Node do normalizer: `resolveInstance` é identidade sobre `raw.instance`
 * (o payload Node já traz o nome canônico e o `sender`). PURO e sem dependências
 * — o boundary HTTP (webhook.controller) e o `NormalizeContextProvider` reusam
 * este helper em vez de reconstruir o contexto, sem acoplar módulos entre si.
 */
export function nodeNormalizeContext(): NormalizeContext {
  return {
    gateway: 'node',
    resolveInstance: (raw) =>
      typeof raw.instance === 'string' && raw.instance ? raw.instance : null,
  };
}

function normalizeNode(raw: RawGatewayEvent, instance: string): NexusEventV1 | null {
  const event = raw.event as string | undefined;
  if (!event || !V1_TYPES.has(event as NexusEventV1Type)) return null; // fora do contrato → drop
  const data = raw.data as NexusEventV1['data'] | undefined;
  if (!data || typeof data !== 'object' || !('key' in data)) return null; // shape inválido → drop
  const out: NexusEventV1 = { event: event as NexusEventV1Type, instance, data, gateway: 'node' };
  if (typeof raw.sender === 'string') out.sender = raw.sender;
  return out;
}

// Mapeamento de evento GO (whatsmeow) → tipo v1 (§4.7). Receipt é resolvido à
// parte (depende de data.Type). Eventos fora deste mapa/descartes → null.
const GO_EVENT_MAP: Record<string, NexusEventV1Type | undefined> = {
  Message: 'messages.upsert',
  SendMessage: 'send.message',
  Connected: 'connection.update',
  LoggedOut: 'connection.update',
  Contact: 'contacts.update',
  PushName: 'contacts.update',
  Presence: 'presence.update',
  ChatPresence: 'presence.update',
};

// Descartes explícitos (fora do contrato v1 por design — §4.7).
const GO_DROP = new Set(['QRCode', 'HistorySync', 'CallOffer', 'CallTerminate', 'Labels', 'Newsletter']);

function normalizeGo(
  raw: RawGatewayEvent,
  instance: string,
  ctx: NormalizeContext,
): NexusEventV1 | null {
  const goEvent = raw.event as string | undefined;
  if (!goEvent || GO_DROP.has(goEvent)) return null;

  const data = (raw.data ?? {}) as Record<string, unknown>;
  const info = (data.Info ?? {}) as Record<string, unknown>;

  let event: NexusEventV1Type | undefined;
  let status: string | undefined;
  if (goEvent === 'Receipt') {
    const type = data.Type as string | undefined;
    if (type === 'Delivered') {
      event = 'messages.update';
      status = 'DELIVERY_ACK';
    } else if (type === 'Read') {
      event = 'messages.update';
      status = 'READ';
    } else {
      return null; // ReadSelf e outros → drop
    }
  } else {
    event = GO_EVENT_MAP[goEvent];
  }
  if (!event) return null; // evento GO não mapeado → drop

  const isGroup = info.IsGroup === true;
  const senderAlt = info.SenderAlt as string | undefined;

  const key: NexusEventV1['data']['key'] = {
    remoteJid: (info.Chat as string) ?? '',
    fromMe: info.IsFromMe === true,
    id: (info.ID as string) ?? '',
  };
  if (senderAlt) key.remoteJidAlt = senderAlt;
  if (isGroup && typeof info.Sender === 'string') key.participant = info.Sender;

  const outData: NexusEventV1['data'] = { key };
  if (typeof info.PushName === 'string') outData.pushName = info.PushName;
  if (data.Message !== undefined) outData.message = data.Message as Record<string, unknown>;
  if (info.Timestamp !== undefined) outData.messageTimestamp = info.Timestamp as number;
  if (status) outData.status = status;
  if (goEvent === 'Connected') outData.status = 'open';
  if (goEvent === 'LoggedOut') outData.status = 'close';

  const out: NexusEventV1 = { event, instance, data: outData, gateway: 'go' };
  const owner = ctx.ownerJid?.(instance);
  if (owner) out.sender = owner;
  return out;
}
