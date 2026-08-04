import { describe, it, expect, vi } from 'vitest';
import { makeGoQueueErrorHandler } from './go-queue-error-handler';
import { DLQ_QUEUE, DELIVERY_COUNT_HEADER } from './queue.topology';

// Assinatura afrouxada p/ os testes: o handler real é MessageErrorHandler
// (channel: Channel, msg: ConsumeMessage, error), mas não importamos `amqplib`
// direto (não é dep de 1ª ordem daqui) — mockamos channel/msg com o mínimo usado.
type LooseHandler = (c: unknown, m: unknown, e: unknown) => void | Promise<void>;

function makeChannel() {
  return { nack: vi.fn(), ack: vi.fn(), sendToQueue: vi.fn() };
}

function makeMsg(deliveryCount?: number, content = Buffer.from('{"event":"Message"}')) {
  const headers: Record<string, unknown> = {};
  if (deliveryCount !== undefined) headers[DELIVERY_COUNT_HEADER] = deliveryCount;
  return { content, properties: { headers } };
}

// As filas da GO não têm DLX: o cap de retry é APP-SIDE, lendo o x-delivery-count
// que a quorum queue conta nativamente. Abaixo do limite → nack requeue (a fila
// reconta); ao atingir → publica na DLQ existente + ack (tira da fila de origem).

describe('goQueueErrorHandler — cap de retry via x-delivery-count', () => {
  it('1ª entrega (header ausente = 0) → nack requeue, NÃO vai pra DLQ', async () => {
    const ch = makeChannel();
    const handler = makeGoQueueErrorHandler({ QUEUE_DELIVERY_LIMIT: '5' }) as LooseHandler;
    await handler(ch, makeMsg(undefined), new Error('boom'));
    expect(ch.nack).toHaveBeenCalledWith(expect.anything(), false, true);
    expect(ch.sendToQueue).not.toHaveBeenCalled();
    expect(ch.ack).not.toHaveBeenCalled();
  });

  it('abaixo do limite → nack requeue (a quorum reconta)', async () => {
    const ch = makeChannel();
    const handler = makeGoQueueErrorHandler({ QUEUE_DELIVERY_LIMIT: '5' }) as LooseHandler;
    await handler(ch, makeMsg(4), new Error('boom'));
    expect(ch.nack).toHaveBeenCalledWith(expect.anything(), false, true);
    expect(ch.sendToQueue).not.toHaveBeenCalled();
    expect(ch.ack).not.toHaveBeenCalled();
  });

  it('atingiu o limite → publica na DLQ (persistent) + ack, SEM requeue', async () => {
    const ch = makeChannel();
    const content = Buffer.from('{"event":"Message","x":1}');
    const handler = makeGoQueueErrorHandler({ QUEUE_DELIVERY_LIMIT: '5' }) as LooseHandler;
    await handler(ch, makeMsg(5, content), new Error('poison'));
    expect(ch.sendToQueue).toHaveBeenCalledWith(
      DLQ_QUEUE,
      content,
      expect.objectContaining({ persistent: true }),
    );
    expect(ch.ack).toHaveBeenCalledOnce();
    expect(ch.nack).not.toHaveBeenCalled();
  });

  it('acima do limite (replay já contado) → DLQ + ack', async () => {
    const ch = makeChannel();
    const handler = makeGoQueueErrorHandler({ QUEUE_DELIVERY_LIMIT: '3' }) as LooseHandler;
    await handler(ch, makeMsg(9), new Error('poison'));
    expect(ch.sendToQueue).toHaveBeenCalledOnce();
    expect(ch.ack).toHaveBeenCalledOnce();
    expect(ch.nack).not.toHaveBeenCalled();
  });
});
