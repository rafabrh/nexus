import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import type { RawGatewayEvent } from '@nexus/shared';
import { EvolutionQueueConsumer } from './evolution-queue.consumer';
import { NormalizeContextProvider } from './normalize-context.provider';
import type { EventDedupService } from './event-dedup.service';
import type { WebhookService } from '../webhook/webhook.service';
import { GO_EVENT_QUEUES } from './queue.topology';
import { goQueueErrorHandler } from './go-queue-error-handler';

// O @RabbitSubscribe (via NestJS SetMetadata) guarda sua config sob a metadata-key
// Symbol('RABBIT_HANDLER') DIRETO na FUNÇÃO do método (descriptor.value). Lemos essa
// metadata para travar o WIRING sem subir broker: se um método deixar de assinar sua
// fila da GO, ou perder o goQueueErrorHandler / o createQueueIfNotExists=false, quebra.
function subscribedMethodNames(): string[] {
  const proto = EvolutionQueueConsumer.prototype as unknown as Record<string, unknown>;
  return Object.getOwnPropertyNames(proto).filter((name) => {
    const fn = proto[name];
    if (typeof fn !== 'function') return false;
    const keys = Reflect.getOwnMetadataKeys(fn as object) as unknown[];
    return keys.some((k) => typeof k === 'symbol' && (k as symbol).toString() === 'Symbol(RABBIT_HANDLER)');
  });
}

function subscribeConfigs(): Record<string, any>[] {
  const proto = EvolutionQueueConsumer.prototype as unknown as Record<string, unknown>;
  return subscribedMethodNames().map((name) => {
    const fn = proto[name] as object;
    const keys = Reflect.getOwnMetadataKeys(fn) as unknown[];
    const handlerKey = keys.find(
      (k) => typeof k === 'symbol' && (k as symbol).toString() === 'Symbol(RABBIT_HANDLER)',
    );
    return Reflect.getOwnMetadata(handlerKey as symbol, fn) as Record<string, any>;
  });
}

// Usa o NormalizeContextProvider e o normalizeGatewayEvent REAIS (caminho Node
// é identidade) — só os colaboradores com efeito colateral são mockados.
function makeConsumer(overrides?: {
  shouldProcess?: boolean;
  processImpl?: () => Promise<void>;
}) {
  const dedup = {
    shouldProcess: vi.fn().mockResolvedValue(overrides?.shouldProcess ?? true),
    release: vi.fn().mockResolvedValue(undefined),
    count: vi.fn().mockResolvedValue(undefined),
  } as unknown as EventDedupService;
  const service = {
    processEvolutionEvent: vi.fn(overrides?.processImpl ?? (async () => undefined)),
  } as unknown as WebhookService;
  const consumer = new EvolutionQueueConsumer(new NormalizeContextProvider(), dedup, service);
  return { consumer, dedup, service };
}

const validNode: RawGatewayEvent = {
  instance: 'shk',
  event: 'messages.upsert',
  data: { key: { remoteJid: '5511@s.whatsapp.net', fromMe: false, id: 'WAMID-1' } },
  sender: '5599@s.whatsapp.net',
};

describe('EvolutionQueueConsumer.handle', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('normalizer null (fora do contrato) → ack, não delega, loga drop', async () => {
    const debug = vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    const { consumer, service } = makeConsumer();
    await expect(
      consumer.handle({ instance: 'shk', event: 'foo.unknown', data: { key: { id: 'x' } } }, 'node'),
    ).resolves.toBeUndefined();
    expect(service.processEvolutionEvent).not.toHaveBeenCalled();
    expect(debug).toHaveBeenCalledWith(expect.stringContaining('evt.normalizer-drop'));
  });

  it('evento válido + dedup ok → delega processEvolutionEvent com o v1 normalizado', async () => {
    const { consumer, service, dedup } = makeConsumer({ shouldProcess: true });
    await consumer.handle(validNode, 'node');
    expect(dedup.shouldProcess).toHaveBeenCalledWith('shk', 'messages.upsert', 'WAMID-1');
    expect(service.processEvolutionEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'messages.upsert', instance: 'shk', gateway: 'node' }),
    );
  });

  it('duplicata (dedup false) → ack, não delega, loga hit', async () => {
    const debug = vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    const { consumer, service } = makeConsumer({ shouldProcess: false });
    await consumer.handle(validNode, 'node');
    expect(service.processEvolutionEvent).not.toHaveBeenCalled();
    expect(debug).toHaveBeenCalledWith(expect.stringContaining('evt.dedup-hit'));
  });

  it('processEvolutionEvent lança → LIBERA dedup (anti-perda) + rethrow + loga nack-dlq', async () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const boom = new Error('boom');
    const { consumer, dedup } = makeConsumer({
      processImpl: async () => {
        throw boom;
      },
    });
    await expect(consumer.handle(validNode, 'node')).rejects.toBe(boom);
    // Chave de dedup liberada ANTES do rethrow, para o replay do DLQ reprocessar.
    expect(dedup.release).toHaveBeenCalledWith('shk', 'messages.upsert', 'WAMID-1');
    expect(error).toHaveBeenCalledWith(expect.stringContaining('evt.nack-dlq'));
  });

  it('sucesso NÃO libera a marca de dedup (permanece deduplicado)', async () => {
    const { consumer, dedup } = makeConsumer({ shouldProcess: true });
    await consumer.handle(validNode, 'node');
    expect(dedup.release).not.toHaveBeenCalled();
  });
});

// Caminho A (wiring): a GO publica no DEFAULT exchange, em filas por evento. O
// consumer assina cada uma passivamente (não redeclara) e delega ao mesmo handle.
describe('EvolutionQueueConsumer.@RabbitSubscribe (Caminho A — filas da GO)', () => {
  it('assina EXATAMENTE as GO_EVENT_QUEUES', () => {
    const queues = subscribeConfigs().map((c) => c.queue).sort();
    expect(queues).toEqual([...GO_EVENT_QUEUES].sort());
  });

  it('cada subscription é PASSIVA no default exchange (sem exchange, não redeclara)', () => {
    for (const cfg of subscribeConfigs()) {
      expect(cfg.createQueueIfNotExists).toBe(false);
      expect(cfg.exchange).toBeUndefined(); // default exchange → sem bind
      expect(cfg.type).toBe('subscribe');
    }
  });

  it('cada subscription usa o goQueueErrorHandler (cap → DLQ; NÃO requeue infinito)', () => {
    for (const cfg of subscribeConfigs()) {
      expect(cfg.errorHandler).toBe(goQueueErrorHandler);
    }
  });

  it('cada método assinado delega pro handle(_, "go")', async () => {
    const { consumer } = makeConsumer();
    const spy = vi.spyOn(consumer, 'handle').mockResolvedValue(undefined);
    const raw = { event: 'Message', instanceId: 'x', data: {} } as unknown as RawGatewayEvent;
    for (const name of subscribedMethodNames()) {
      await (consumer as unknown as Record<string, (r: RawGatewayEvent) => Promise<void>>)[name](raw);
    }
    expect(spy).toHaveBeenCalledTimes(GO_EVENT_QUEUES.length);
    for (const call of spy.mock.calls) {
      expect(call[1]).toBe('go');
    }
  });
});
