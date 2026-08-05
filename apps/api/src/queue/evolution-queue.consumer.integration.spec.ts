import { describe, it, expect, vi } from 'vitest';
import 'reflect-metadata';
import type { RawGatewayEvent } from '@nexus/shared';
import { EvolutionQueueConsumer } from './evolution-queue.consumer';
import { NormalizeContextProvider } from './normalize-context.provider';
import { InMemoryGatewayConfigStore } from '../tenant-config/in-memory-gateway-config.store';
import type { EventDedupService } from './event-dedup.service';
import type { WebhookService } from '../webhook/webhook.service';

// INTEGRAÇÃO do consumer com o pipeline REAL (normalizer + config store), usando
// payloads GO CAPTURADOS AO VIVO na Fase 0 (sanitizados p/ LGPD — só a estrutura é
// real). Fecha o gap que deixou o bug dos guards passar: os specs unitários
// mockavam o normalizer/store; aqui o `handle('go')` roda o caminho de verdade
// (resolveInstanceId via store hidratado → normalizeGo → delega). Se a
// normalização de um shape real quebrar, este teste pega — sem subir broker.

const GO_UUID = 'uuid-teste-22a04a5a';
const INSTANCIA = 'nexus_teste';
const OWNER = '5511000000000@s.whatsapp.net';

function makeConsumer() {
  const store = new InMemoryGatewayConfigStore();
  store.hydrate([
    {
      instancia: INSTANCIA,
      gateway: 'go',
      config: { instanceId: GO_UUID, ownerJid: OWNER, instanceToken: 'tok' },
    },
  ]);
  const ctxProvider = new NormalizeContextProvider(store);
  const dedup = {
    shouldProcess: vi.fn().mockResolvedValue(true),
    release: vi.fn().mockResolvedValue(undefined),
    count: vi.fn().mockResolvedValue(undefined),
  } as unknown as EventDedupService;
  const service = {
    processEvolutionEvent: vi.fn().mockResolvedValue(undefined),
  } as unknown as WebhookService;
  const consumer = new EvolutionQueueConsumer(ctxProvider, dedup, service);
  return { consumer, service, dedup };
}

// Envelope real da GO: postMap cru {event, data, instanceId, instanceName, instanceToken}.
const connectedRaw: RawGatewayEvent = {
  event: 'Connected',
  instanceId: GO_UUID,
  instanceName: 'nexus-teste',
  instanceToken: 'tok',
  data: { jid: '5511000000000:57@s.whatsapp.net', pushName: 'Cliente Teste', status: 'open' },
};

const messageRaw: RawGatewayEvent = {
  event: 'Message',
  instanceId: GO_UUID,
  instanceName: 'nexus-teste',
  instanceToken: 'tok',
  data: {
    Info: {
      Chat: '5511000000000@s.whatsapp.net',
      Sender: '5511000000000@s.whatsapp.net',
      IsFromMe: false,
      IsGroup: false,
      ID: 'GOMSG-INT-1',
      PushName: 'Cliente Teste',
      Timestamp: '2026-08-04T12:00:00-03:00',
      Type: 'text',
    },
    Message: { conversation: 'oi da integração' },
  },
};

describe('EvolutionQueueConsumer — integração com o pipeline real (payloads GO reais)', () => {
  it('Connected → resolve instância pelo store, normaliza p/ connection.update e delega', async () => {
    const { consumer, service } = makeConsumer();
    await consumer.handle(connectedRaw, 'go');
    expect(service.processEvolutionEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'connection.update',
        instance: INSTANCIA,
        gateway: 'go',
        data: expect.objectContaining({ status: 'open', state: 'open' }),
      }),
    );
  });

  it('Message → normaliza p/ messages.upsert com o corpo e delega', async () => {
    const { consumer, service, dedup } = makeConsumer();
    await consumer.handle(messageRaw, 'go');
    expect(dedup.shouldProcess).toHaveBeenCalledWith(INSTANCIA, 'messages.upsert', 'GOMSG-INT-1');
    expect(service.processEvolutionEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'messages.upsert',
        instance: INSTANCIA,
        gateway: 'go',
        data: expect.objectContaining({
          key: expect.objectContaining({ id: 'GOMSG-INT-1', fromMe: false }),
          message: expect.objectContaining({ conversation: 'oi da integração' }),
        }),
      }),
    );
  });

  it('instância NÃO seedada (store não resolve o UUID) → DROP (ack), não delega', async () => {
    const { consumer, service } = makeConsumer();
    const foreign = { ...connectedRaw, instanceId: 'uuid-desconhecido' };
    await consumer.handle(foreign, 'go');
    expect(service.processEvolutionEvent).not.toHaveBeenCalled();
  });
});
