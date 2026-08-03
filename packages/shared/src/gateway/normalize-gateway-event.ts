import type {
  NexusEventV1,
  NexusEventV1Type,
  NexusEventV1Data,
  NexusEventV1Key,
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

// Descartes explícitos (fora do contrato v1 por design — §4.7). GroupInfo é
// metadado de grupo (não é evento de mensagem/conexão no v1).
const GO_DROP = new Set([
  'QRCode',
  'HistorySync',
  'CallOffer',
  'CallTerminate',
  'Labels',
  'Newsletter',
  'GroupInfo',
]);

/**
 * Info.Timestamp da GO vem como STRING ISO-8601 (capturado na Fase 0), mas o
 * contrato v1 (espelho da Evolution Node) é epoch em SEGUNDOS. Converte ISO→epoch;
 * aceita número/número-string (já epoch) na marra; sem parse → passthrough.
 */
function toEpochSeconds(v: unknown): number | string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    if (v === '') return undefined;
    if (/^\d+$/.test(v)) return Number(v);
    const ms = Date.parse(v);
    return Number.isNaN(ms) ? v : Math.floor(ms / 1000);
  }
  return undefined;
}

/** Remove o sufixo de device (":NN") de um JID whatsmeow → JID canônico. */
function canonicalJid(jid: string): string {
  return jid.replace(/:\d+(?=@)/, '');
}

/**
 * Telefone real (alt) quando o remoteJid é @lid: em envio (fromMe) o telefone do
 * peer vem em RecipientAlt; em recebimento vem em SenderAlt (capturado na Fase 0).
 */
function lidAlt(remoteJid: string, fromMe: boolean, src: Record<string, unknown>): string | undefined {
  if (!remoteJid.endsWith('@lid')) return undefined;
  const alt = fromMe ? src.RecipientAlt : src.SenderAlt;
  return typeof alt === 'string' && alt ? canonicalJid(alt) : undefined;
}

function withSender(out: NexusEventV1, instance: string, ctx: NormalizeContext): NexusEventV1 {
  const owner = ctx.ownerJid?.(instance);
  if (owner) out.sender = owner;
  return out;
}

function normalizeGo(
  raw: RawGatewayEvent,
  instance: string,
  ctx: NormalizeContext,
): NexusEventV1 | null {
  const goEvent = raw.event as string | undefined;
  if (!goEvent || GO_DROP.has(goEvent)) return null;

  const data = (raw.data ?? {}) as Record<string, unknown>;

  // Receipt tem shape PRÓPRIO (Fase 0): campos direto em `data` (sem Info),
  // `MessageIDs` é array, `Type` é minúsculo e o `state` vem no topo do envelope.
  if (goEvent === 'Receipt') return normalizeGoReceipt(raw, data, instance, ctx);

  const event = GO_EVENT_MAP[goEvent];
  if (!event) return null; // evento GO não mapeado → drop

  const info = (data.Info ?? {}) as Record<string, unknown>;
  const fromMe = info.IsFromMe === true;
  const remoteJid = canonicalJid((info.Chat as string) ?? '');

  const key: NexusEventV1Key = { remoteJid, fromMe, id: (info.ID as string) ?? '' };
  const alt = lidAlt(remoteJid, fromMe, info);
  if (alt) key.remoteJidAlt = alt;
  if (info.IsGroup === true && typeof info.Sender === 'string') {
    key.participant = canonicalJid(info.Sender);
  }

  const outData: NexusEventV1Data = { key };
  if (typeof info.PushName === 'string' && info.PushName) outData.pushName = info.PushName;
  if (data.Message !== undefined) outData.message = data.Message as Record<string, unknown>;
  const ts = toEpochSeconds(info.Timestamp);
  if (ts !== undefined) outData.messageTimestamp = ts;
  if (goEvent === 'Connected') outData.status = 'open';
  if (goEvent === 'LoggedOut') outData.status = 'close';

  return withSender({ event, instance, data: outData, gateway: 'go' }, instance, ctx);
}

/** Normaliza um Receipt GO (ACK de entrega/leitura) → messages.update. */
function normalizeGoReceipt(
  raw: RawGatewayEvent,
  data: Record<string, unknown>,
  instance: string,
  ctx: NormalizeContext,
): NexusEventV1 | null {
  const state = ((raw.state as string) ?? '').toLowerCase();
  const type = ((data.Type as string) ?? '').toLowerCase();
  let status: string | undefined;
  if (state === 'read' || type === 'read') status = 'READ';
  else if (state === 'delivered' || type === 'delivered' || type === 'delivery') status = 'DELIVERY_ACK';
  else return null; // read-self, played, sender, etc. → drop (fora do v1)

  const fromMe = data.IsFromMe === true;
  const remoteJid = canonicalJid((data.Chat as string) ?? '');
  const ids = Array.isArray(data.MessageIDs) ? (data.MessageIDs as string[]) : [];

  const key: NexusEventV1Key = { remoteJid, fromMe, id: ids[0] ?? '' };
  const alt = lidAlt(remoteJid, fromMe, data);
  if (alt) key.remoteJidAlt = alt;
  if (data.IsGroup === true && typeof data.Sender === 'string') {
    key.participant = canonicalJid(data.Sender);
  }

  return withSender(
    { event: 'messages.update', instance, data: { key, status }, gateway: 'go' },
    instance,
    ctx,
  );
}
