import { describe, it, expect, vi } from 'vitest';
import { WebhookService } from './webhook.service';

describe('WebhookService indexes processed conversations', () => {
  it('adds the resolved jid to the conversation index after persisting a message', async () => {
    const redis = {
      rpush: vi.fn(async () => 1),
      exists: vi.fn(async () => 1),
      set: vi.fn(async () => 'OK'),
      get: vi.fn(async () => null),
      del: vi.fn(async () => 1),
      lrange: vi.fn(async () => []),
    } as any;
    const publisher = { publish: vi.fn(async () => undefined) } as any;
    const index = { addJid: vi.fn(async () => undefined) } as any;
    const tenants = {
      updateState: vi.fn(async () => undefined),
      get: vi.fn(async () => ({ instancia: 'shk', name: 'shk', active: true, users: [] })),
    } as any;

    const svc = new WebhookService(redis, publisher, index, tenants);

    await svc.processEvolutionEvent({
      event: 'messages.upsert',
      instance: 'shk',
      data: {
        key: { remoteJid: '5511999@s.whatsapp.net', fromMe: false },
        message: { conversation: 'oi' },
      },
    });

    expect(tenants.get).toHaveBeenCalledWith('shk');
    expect(redis.rpush).toHaveBeenCalled();
    expect(index.addJid).toHaveBeenCalledWith('shk', '5511999@s.whatsapp.net');
  });
});

describe('WebhookService rejects unknown instances', () => {
  it('does not write to Redis and returns early when the instance has no tenant', async () => {
    const redis = {
      rpush: vi.fn(async () => 1),
      exists: vi.fn(async () => 1),
      set: vi.fn(async () => 'OK'),
      get: vi.fn(async () => null),
      del: vi.fn(async () => 1),
      lrange: vi.fn(async () => []),
    } as any;
    const publisher = { publish: vi.fn(async () => undefined) } as any;
    const index = { addJid: vi.fn(async () => undefined) } as any;
    const tenants = {
      updateState: vi.fn(async () => undefined),
      get: vi.fn(async () => null),
    } as any;

    const svc = new WebhookService(redis, publisher, index, tenants);

    await svc.processEvolutionEvent({
      event: 'messages.upsert',
      instance: 'ghost',
      data: {
        key: { remoteJid: '5511999@s.whatsapp.net', fromMe: false },
        message: { conversation: 'oi' },
      },
    });

    expect(tenants.get).toHaveBeenCalledWith('ghost');
    expect(redis.rpush).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
    expect(index.addJid).not.toHaveBeenCalled();
    expect(publisher.publish).not.toHaveBeenCalled();
  });
});
