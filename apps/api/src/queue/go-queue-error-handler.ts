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

    const reason = (error as Error)?.message ?? String(error);
    const originalQueue = msg.fields?.routingKey ?? '?';
    logger.error(
      `evt.go-dlq queue=${originalQueue} deliveryCount=${count} limit=${limit}: ${reason}`,
    );
    // Grava a CAUSA na própria mensagem da DLQ: sem isto, a mensagem chega à DLQ
    // sem nenhum rastro do erro e o diagnóstico exige caçar o log ao vivo. Com os
    // headers, `rabbitmqadmin get` já mostra o porquê e a fila de origem.
    channel.sendToQueue(DLQ_QUEUE, msg.content, {
      persistent: true,
      headers: {
        ...msg.properties?.headers,
        'x-error': reason,
        'x-error-stack': (error as Error)?.stack ?? undefined,
        'x-original-queue': originalQueue,
        'x-dead-lettered-at': new Date().toISOString(),
      },
    });
    channel.ack(msg);
  };
}

/** Handler default (lê `process.env`) usado pelo decorator `@RabbitSubscribe`. */
export const goQueueErrorHandler = makeGoQueueErrorHandler();
