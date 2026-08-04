import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { requeueErrorHandler } from '@golevelup/nestjs-rabbitmq';
import type { RawGatewayEvent } from '@nexus/shared';
import { EvolutionQueueConsumer } from './evolution-queue.consumer';
import { NormalizeContextProvider } from './normalize-context.provider';
import type { EventDedupService } from './event-dedup.service';
import type { WebhookService } from '../webhook/webhook.service';
import {
  EVOLUTION_EXCHANGE,
  PANEL_EVENTS_QUEUE,
  panelEventsQueueArguments,
} from './queue.topology';

// O @RabbitSubscribe (via NestJS SetMetadata) guarda sua config sob a metadata-key
// Symbol('RABBIT_HANDLER') DIRETO na FUNÇÃO do método (descriptor.value), não em
// (prototype, propertyKey). Lemos essa metadata para travar o WIRING do gate #2 sem
// subir broker: se o errorHandler voltar ao defaultNackErrorHandler (o bug) ou os
// args da fila perderem quorum/x-delivery-limit, o teste quebra.
function subscribeConfig(): Record<string, any> {
  const method = EvolutionQueueConsumer.prototype.onEvent as unknown as object;
  const keys = Reflect.getOwnMetadataKeys(method) as unknown[];
  const handlerKey = keys.find(
    (k) => typeof k === 'symbol' && (k as symbol).toString() === 'Symbol(RABBIT_HANDLER)',
  );
  expect(handlerKey, 'metadata RABBIT_HANDLER ausente no onEvent').toBeDefined();
  return Reflect.getOwnMetadata(handlerKey as symbol, method) as Record<string, any>;
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

// GATE #2 (wiring): trava a config do @RabbitSubscribe. A lógica de retry/DLQ é do
// broker (quorum + x-delivery-limit), mas o consumer PRECISA nackar com requeue
// (requeueErrorHandler) e declarar os args da fila — senão o gate não engaja.
describe('EvolutionQueueConsumer.@RabbitSubscribe (wiring do gate #2)', () => {
  it('usa requeueErrorHandler (NÃO defaultNackErrorHandler → senão x-delivery-limit não engaja)', () => {
    const cfg = subscribeConfig();
    expect(cfg.errorHandler).toBe(requeueErrorHandler);
  });

  it('assina a exchange/fila da topologia (fonte única)', () => {
    const cfg = subscribeConfig();
    expect(cfg.exchange).toBe(EVOLUTION_EXCHANGE);
    expect(cfg.queue).toBe(PANEL_EVENTS_QUEUE);
    expect(cfg.routingKey).toBe('#');
    expect(cfg.type).toBe('subscribe');
  });

  it('declara a fila durável com os args de quorum + delivery-limit + dead-letter', () => {
    const cfg = subscribeConfig();
    expect(cfg.queueOptions?.durable).toBe(true);
    expect(cfg.queueOptions?.arguments).toEqual(panelEventsQueueArguments());
    // Reafirma as chaves críticas explicitamente (não só via helper).
    expect(cfg.queueOptions?.arguments?.['x-queue-type']).toBe('quorum');
    expect(cfg.queueOptions?.arguments?.['x-dead-letter-exchange']).toBe('nexus.dlx');
  });
});
