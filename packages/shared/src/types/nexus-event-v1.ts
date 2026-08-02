// Contrato interno de eventos de gateway (D12). NÃO confundir com o NexusEvent
// interno de realtime (types/nexus-event.ts). Este é o shape que a Evolution Node
// já entrega e que o painel/fluxo já consomem — promovido a contrato versionado.
// A Evolution GO (whatsmeow) é normalizada PARA este shape na borda.

/** Tipos de evento do contrato v1 que os consumidores conhecem. */
export type NexusEventV1Type =
  | 'messages.upsert' // mensagem recebida ou eco do próprio envio
  | 'send.message' // envio feito pela própria IA/painel
  | 'messages.update' // ACK de entrega/leitura
  | 'connection.update' // conexão do gateway (open/close)
  | 'contacts.update' // nome/foto de contato
  | 'presence.update'; // digitando/online (efêmero)

/**
 * Chave da mensagem no contrato v1 (espelha o `data.key` da Evolution).
 * NOTA: em eventos SEM mensagem (`connection.update`), `remoteJid` e `id` vêm
 * VAZIOS. O consumer NÃO deve dedupar por `id` nesses tipos (spec §4.4: dedup só
 * em messages.upsert/send.message) — senão colapsaria todos num único evt:dedup.
 */
export interface NexusEventV1Key {
  /** JID canônico do chat (pode conter @lid, @g.us, @s.whatsapp.net). */
  remoteJid: string;
  /** Telefone real quando o remoteJid é @lid (LID addressing). Opcional. */
  remoteJidAlt?: string;
  /** Remetente dentro de um grupo (só em @g.us). Opcional. */
  participant?: string;
  fromMe: boolean;
  /** WAMID da mensagem. */
  id: string;
}

/** Corpo do evento v1. Campos opcionais conforme o tipo. */
export interface NexusEventV1Data {
  key: NexusEventV1Key;
  pushName?: string;
  /** Conteúdo cru da mensagem (opaco a este contrato; o consumer parseia). */
  message?: Record<string, unknown>;
  /** Epoch em segundos (Evolution) — number ou string numérica. */
  messageTimestamp?: number | string;
  /** Status do ACK em messages.update (ex.: 'DELIVERY_ACK', 'READ'). */
  status?: string;
  // Index signature DELIBERADA: o upstream (Evolution) é aberto e o consumer pode
  // parsear extras. Não "apertar" — quebraria o passthrough. A rigidez vem dos
  // testes dourados (toEqual), não do tipo.
  [k: string]: unknown;
}

/** O contrato NEXUS Event v1. */
export interface NexusEventV1 {
  event: NexusEventV1Type;
  /** Chave canônica da instância (nome do painel/registry — NUNCA o UUID da GO). */
  instance: string;
  data: NexusEventV1Data;
  /** JID do dono da instância. Node envia; para GO o normalizer injeta via ctx. */
  sender?: string;
  /** Gateway de origem, anexado pelo normalizer para observabilidade. */
  gateway: 'node' | 'go';
}

/** Evento cru vindo de um gateway, antes da normalização. */
export interface RawGatewayEvent {
  [k: string]: unknown;
}

/** Contexto injetado pelo chamador (o normalizer é puro; não consulta nada). */
export interface NormalizeContext {
  /** Gateway de origem do payload cru. */
  gateway: 'node' | 'go';
  /**
   * Resolve o identificador de instância do gateway para a chave canônica.
   * Node: o payload já traz `instance` (nome) → ctx pode ser identidade.
   * GO: o payload traz `instanceId` (UUID) → ctx mapeia UUID → nome canônico.
   */
  resolveInstance: (raw: RawGatewayEvent) => string | null;
  /**
   * JID do dono da instância (config 4.6). A GO não traz `sender`; o normalizer
   * injeta este valor para manter o contrato v1 íntegro (gate de self-chat).
   * Node: pode devolver undefined (o `sender` já vem no payload).
   */
  ownerJid?: (instancia: string) => string | undefined;
}
