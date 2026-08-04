/**
 * Topologia AMQP do consumer de eventos (Etapa 2 — desacoplamento). FONTE ÚNICA
 * dos nomes de fila/exchange e dos ARGUMENTOS de declaração da fila, para o
 * decorator do consumer e os testes unitários lerem o MESMO shape.
 *
 * GATE #2 — retry vs DLQ (auditoria 2.2): antes, o `defaultNackErrorHandler`
 * mandava a falha DIRETO ao DLX `nexus.dlx` (nack requeue=false), SEM retry. Um
 * blip transitório de Redis/Postgres despejaria mensagens BOAS na DLQ.
 *
 * Solução (recomendada pela auditoria): **quorum queue com `x-delivery-limit`**.
 *   • A fila é declarada `x-queue-type: quorum` + `x-delivery-limit: N`.
 *   • O errorHandler passa a nackar com **requeue=true** (`requeueErrorHandler`).
 *   • A quorum queue conta as reentregas por mensagem (`x-delivery-count`) e, ao
 *     ultrapassar `x-delivery-limit`, DEAD-LETTER a própria mensagem para
 *     `nexus.dlx` — sem bookkeeping do app. N tentativas e SÓ ENTÃO a DLQ.
 *
 * Assim um erro transitório (Redis/Postgres piscando) é retentado N vezes; só uma
 * mensagem venenosa persistente (falha em TODAS as N entregas) cai na DLQ.
 *
 * ⚠️ GATED NO BROKER (passo 8): sem RabbitMQ local não dá para validar o
 * comportamento de reentrega/dead-letter ponta-a-ponta. Os testes unitários abaixo
 * travam a INTENÇÃO (args declarados corretamente); a validação e2e roda quando o
 * broker subir (RUNBOOK Fase 0, §8).
 */

/** Exchange topic de onde a Evolution GO publica os eventos. */
export const EVOLUTION_EXCHANGE = 'evolution';

/** Fila durável (quorum) que buffra os eventos do painel. */
export const PANEL_EVENTS_QUEUE = 'nexus.panel.events';

/** Dead-letter exchange para onde a fila entrega após esgotar as tentativas. */
export const NEXUS_DLX = 'nexus.dlx';

/** Routing key usada no dead-letter (bindada à DLQ no broker). */
export const PANEL_EVENTS_DLQ_ROUTING_KEY = 'nexus.panel.events.dlq';

/**
 * Quantas ENTREGAS a quorum queue tenta antes de dead-letter. `x-delivery-limit`
 * conta a entrega ORIGINAL + as reentregas; com 5, são a 1ª + 4 retries e então
 * DLQ. Configurável por env (`QUEUE_DELIVERY_LIMIT`); default 5 (folga p/ blips
 * de Redis/Postgres sem segurar mensagem venenosa por tempo demais).
 */
export const DEFAULT_DELIVERY_LIMIT = 5;

/** Lê o limite de entregas do env, com fallback e piso de 1 (nunca 0/negativo). */
export function resolveDeliveryLimit(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.QUEUE_DELIVERY_LIMIT);
  if (!Number.isFinite(raw) || raw < 1) return DEFAULT_DELIVERY_LIMIT;
  return Math.floor(raw);
}

/**
 * Argumentos de declaração da fila `nexus.panel.events` (quorum + delivery-limit
 * + dead-letter). Passados via `queueOptions.arguments` no `@RabbitSubscribe`, o
 * golevelup os repassa ao `channel.assertQueue`.
 *
 * NOTA: os args de dead-letter vão AQUI (em `arguments`), não em
 * `queueOptions.deadLetterExchange`, para ficarem no MESMO objeto que a auditoria
 * (e os testes) inspecionam e para não misturar as duas formas de declarar DLX.
 */
export function panelEventsQueueArguments(
  env: NodeJS.ProcessEnv = process.env,
): Record<string, unknown> {
  return {
    // Quorum: replicação + contagem de entregas nativa (habilita x-delivery-limit).
    'x-queue-type': 'quorum',
    // Retry limitado: N entregas e só então dead-letter (o coração do gate #2).
    'x-delivery-limit': resolveDeliveryLimit(env),
    // Dead-letter após esgotar as tentativas.
    'x-dead-letter-exchange': NEXUS_DLX,
    'x-dead-letter-routing-key': PANEL_EVENTS_DLQ_ROUTING_KEY,
  };
}
