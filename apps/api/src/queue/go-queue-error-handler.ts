import { Logger } from '@nestjs/common';
import type { MessageErrorHandler } from '@golevelup/nestjs-rabbitmq';
import { DLQ_QUEUE, DELIVERY_COUNT_HEADER, resolveDeliveryLimit } from './queue.topology';

const logger = new Logger('GoQueueErrorHandler');

/**
 * errorHandler das filas da Evolution GO. Como essas filas NÃO têm DLX (a GO as
 * declara quorum sem dead-letter), o cap de retry é feito APP-SIDE lendo o
 * `x-delivery-count` que a quorum queue conta nativamente:
 *   • `count < limite` → nack COM requeue (a fila reconta e reentrega);
 *   • `count >= limite` → publica o corpo cru na DLQ existente + ack (tira a
 *     mensagem venenosa da fila de origem sem loop infinito).
 *
 * A marca de dedup já foi liberada no `catch` do `handle` (anti-perda) antes do
 * rethrow, então aqui é lógica pura de channel/msg. Factory p/ o env ser
 * injetável nos testes; o default lê `process.env` a cada chamada.
 */
export function makeGoQueueErrorHandler(
  env: NodeJS.ProcessEnv = process.env,
): MessageErrorHandler {
  return (channel, msg, error) => {
    const limit = resolveDeliveryLimit(env);
    const count = Number(msg.properties?.headers?.[DELIVERY_COUNT_HEADER] ?? 0);

    if (count < limit) {
      channel.nack(msg, false, true); // requeue → quorum reconta a entrega
      return;
    }

    logger.error(
      `evt.go-dlq queue=${msg.fields?.routingKey ?? '?'} deliveryCount=${count} limit=${limit}: ${
        (error as Error)?.message ?? String(error)
      }`,
    );
    channel.sendToQueue(DLQ_QUEUE, msg.content, {
      persistent: true,
      headers: msg.properties?.headers,
    });
    channel.ack(msg);
  };
}

/** Handler default (lê `process.env`) usado pelo decorator `@RabbitSubscribe`. */
export const goQueueErrorHandler = makeGoQueueErrorHandler();
