/**
 * Topologia AMQP do consumer de eventos (Fase 0 — Caminho A). FONTE ÚNICA dos
 * nomes de fila e do cap de retry, para o decorator do consumer, o errorHandler e
 * os testes lerem o MESMO shape.
 *
 * DESCOBERTA (Fase 0, captura ao vivo): a Evolution GO 0.7.2 NÃO usa exchange —
 * publica com `channel.Publish("", queueName, …)` (exchange DEFAULT, routing key =
 * nome da fila) direto em filas POR EVENTO. As filas são quorum + `x-ha-policy:all`,
 * **sem DLX e sem `x-delivery-limit`**. Por isso o consumer:
 *   • assina essas filas passivamente (não redeclara — evita PRECONDITION_FAILED);
 *   • faz o cap de retry APP-SIDE lendo o `x-delivery-count` (a quorum queue conta
 *     as reentregas nativamente) e, ao estourar, publica na DLQ existente.
 */

/**
 * Filas que a Evolution GO cria (nomes MINÚSCULOS — a GO faz ToLower do
 * `AMQP_SPECIFIC_EVENTS`). Cada uma carrega UM tipo de evento whatsmeow; o
 * `normalizeGo` roteia por `raw.event`, então o consumer só precisa consumir todas
 * e delegar ao mesmo `handle`.
 */
export const GO_EVENT_QUEUES = [
  'message',
  'receipt',
  'presence',
  'connected',
  'loggedout',
  'contact',
  'pushname',
] as const;

/** DLQ app-side (já existe no broker). Recebe a mensagem após estourar o cap. */
export const DLQ_QUEUE = 'nexus.panel.events.dlq';

/** Header nativo da quorum queue com a contagem de entregas (ausente na 1ª). */
export const DELIVERY_COUNT_HEADER = 'x-delivery-count';

/**
 * Quantas ENTREGAS tentar antes de mandar pra DLQ. Conta a entrega ORIGINAL + as
 * reentregas; com 5, é a 1ª + 4 retries e então DLQ. Configurável por env
 * (`QUEUE_DELIVERY_LIMIT`); default 5 (folga p/ blips de Redis/Postgres sem segurar
 * mensagem venenosa por tempo demais).
 */
export const DEFAULT_DELIVERY_LIMIT = 5;

/** Lê o limite de entregas do env, com fallback e piso de 1 (nunca 0/negativo). */
export function resolveDeliveryLimit(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.QUEUE_DELIVERY_LIMIT);
  if (!Number.isFinite(raw) || raw < 1) return DEFAULT_DELIVERY_LIMIT;
  return Math.floor(raw);
}
