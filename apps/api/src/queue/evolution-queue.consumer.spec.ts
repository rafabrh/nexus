import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Logger } from '@nestjs/common';
import type { RawGatewayEvent } from '@nexus/shared';
import { EvolutionQueueConsumer } from './evolution-queue.consumer';
import { NormalizeContextProvider } from './normalize-context.provider';
import type { EventDedupService } from './event-dedup.service';
import type { WebhookService } from '../webhook/webhook.service';

// Usa o NormalizeContextProvider e o normalizeGatewayEvent REAIS (caminho Node
// é identidade) — só os colaboradores com efeito colateral são mockados.
function makeConsumer(overrides?: {
  shouldProcess?: boolean;
  processImpl?: () => Promise<void>;
}) {
  const dedup = {
    shouldProcess: vi.fn().mockResolvedValue(overrides?.shouldProcess ?? true),
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

  it('processEvolutionEvent lança → rethrow (nack→DLQ) e loga nack-dlq', async () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const boom = new Error('boom');
    const { consumer } = makeConsumer({
      processImpl: async () => {
        throw boom;
      },
    });
    await expect(consumer.handle(validNode, 'node')).rejects.toBe(boom);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('evt.nack-dlq'));
  });
});
