import { describe, it, expect, vi } from 'vitest';
import { WebhookService } from './webhook.service';

/** Deps mockadas do WebhookService, no padrão dos outros specs da api. */
function makeDeps(tenantGet: () => Promise<unknown>) {
  const redis = {
    rpush: vi.fn(async () => 1),
    exists: vi.fn(async () => 1),
    set: vi.fn(async () => 'OK'),
    get: vi.fn(async () => null),
    del: vi.fn(async () => 1),
    lrange: vi.fn(async () => []),
    incr: vi.fn(async () => 1),
  } as any;
  const publisher = { publish: vi.fn(async () => undefined) } as any;
  const index = { addJid: vi.fn(async () => undefined) } as any;
  const tenants = { updateState: vi.fn(async () => undefined), get: vi.fn(tenantGet) } as any;
  const forwarder = { forward: vi.fn(async () => undefined) } as any;
  return { redis, publisher, index, tenants, forwarder };
}

const knownTenant =
  (extra: Record<string, unknown> = {}) =>
  async () => ({ instancia: 'shk', name: 'shk', active: true, users: [], ...extra });

const msgUpsert = (extraKey: Record<string, unknown> = {}, instance = 'shk') => ({
  event: 'messages.upsert',
  instance,
  data: {
    key: { remoteJid: '5511999@s.whatsapp.net', fromMe: false, ...extraKey },
    message: { conversation: 'oi' },
  },
});

describe('WebhookService indexes processed conversations', () => {
  it('adds the resolved jid to the conversation index after persisting a message', async () => {
    const d = makeDeps(knownTenant());
    const svc = new WebhookService(d.redis, d.publisher, d.index, d.tenants, d.forwarder);

    await svc.processEvolutionEvent(msgUpsert());

    expect(d.tenants.get).toHaveBeenCalledWith('shk');
    expect(d.redis.rpush).toHaveBeenCalled();
    expect(d.index.addJid).toHaveBeenCalledWith('shk', '5511999@s.whatsapp.net');
  });
});

describe('WebhookService rejects unknown instances', () => {
  it('does not write to Redis, forward or publish when the instance has no tenant', async () => {
    const d = makeDeps(async () => null);
    const svc = new WebhookService(d.redis, d.publisher, d.index, d.tenants, d.forwarder);

    await svc.processEvolutionEvent(msgUpsert({}, 'ghost'));

    expect(d.tenants.get).toHaveBeenCalledWith('ghost');
    expect(d.redis.rpush).not.toHaveBeenCalled();
    expect(d.redis.set).not.toHaveBeenCalled();
    expect(d.index.addJid).not.toHaveBeenCalled();
    expect(d.publisher.publish).not.toHaveBeenCalled();
    expect(d.forwarder.forward).not.toHaveBeenCalled();
  });
});

describe('WebhookService is the hub (forward + realtime)', () => {
  it('forwards the raw payload to the tenant N8N and publishes message.received', async () => {
    const d = makeDeps(knownTenant({ n8nWebhookUrl: 'https://n8n/w/shk' }));
    const svc = new WebhookService(d.redis, d.publisher, d.index, d.tenants, d.forwarder);
    const payload = msgUpsert({ id: 'M9' });

    await svc.processEvolutionEvent(payload);

    // Transparente: repassa o payload cru, com a URL do tenant e o key.id p/ dedup.
    expect(d.forwarder.forward).toHaveBeenCalledWith('shk', 'https://n8n/w/shk', 'M9', payload);
    // Realtime direto, sem depender do keyspace.
    expect(d.publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'message.received',
        instancia: 'shk',
        jid: '5511999@s.whatsapp.net',
      }),
    );
  });

  it('forwards with a null n8n url when the tenant has none configured', async () => {
    const d = makeDeps(knownTenant());
    const svc = new WebhookService(d.redis, d.publisher, d.index, d.tenants, d.forwarder);

    await svc.processEvolutionEvent(msgUpsert({ id: 'M9' }));

    expect(d.forwarder.forward).toHaveBeenCalledWith('shk', null, 'M9', expect.any(Object));
  });
});

describe('WebhookService handles send.message (AI reply via API)', () => {
  it('persists + publishes the AI reply but does NOT forward it back to N8N', async () => {
    const d = makeDeps(knownTenant({ n8nWebhookUrl: 'https://n8n/w/shk' }));
    const svc = new WebhookService(d.redis, d.publisher, d.index, d.tenants, d.forwarder);

    await svc.processEvolutionEvent({
      event: 'send.message',
      instance: 'shk',
      data: {
        key: { remoteJid: '5511999@s.whatsapp.net', id: 'AI1', fromMe: true },
        message: { conversation: 'resposta da IA' },
      },
    });

    // Aparece no painel (gravou no historico + publicou realtime)...
    expect(d.redis.rpush).toHaveBeenCalled();
    expect(d.publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'message.received', instancia: 'shk' }),
    );
    // ...mas NAO volta pro N8N (evita a IA reprocessar a propria resposta).
    expect(d.forwarder.forward).not.toHaveBeenCalled();
  });
});

describe('WebhookService unread counter', () => {
  it('increments unread on an inbound client message (fromMe=false)', async () => {
    const d = makeDeps(knownTenant());
    const svc = new WebhookService(d.redis, d.publisher, d.index, d.tenants, d.forwarder);

    await svc.processEvolutionEvent(msgUpsert());

    expect(d.redis.incr).toHaveBeenCalledWith('chat:shk:5511999@s.whatsapp.net:unread');
  });

  it('does NOT increment unread for the AI reply (send.message, fromMe=true)', async () => {
    const d = makeDeps(knownTenant());
    const svc = new WebhookService(d.redis, d.publisher, d.index, d.tenants, d.forwarder);

    await svc.processEvolutionEvent({
      event: 'send.message',
      instance: 'shk',
      data: {
        key: { remoteJid: '5511999@s.whatsapp.net', id: 'AI1', fromMe: true },
        message: { conversation: 'resposta da IA' },
      },
    });

    expect(d.redis.incr).not.toHaveBeenCalled();
  });
});

describe('WebhookService presence.update (typing/online)', () => {
  it('publishes presence.update and does NOT forward it to N8N', async () => {
    const d = makeDeps(knownTenant({ n8nWebhookUrl: 'https://n8n/w/shk' }));
    const svc = new WebhookService(d.redis, d.publisher, d.index, d.tenants, d.forwarder);

    await svc.processEvolutionEvent({
      event: 'presence.update',
      instance: 'shk',
      data: {
        id: '5511999@s.whatsapp.net',
        presences: { '5511999@s.whatsapp.net': { lastKnownPresence: 'composing' } },
      },
    });

    expect(d.publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'presence.update',
        instancia: 'shk',
        jid: '5511999@s.whatsapp.net',
        payload: { presence: 'composing' },
      }),
    );
    // Presença é sinal de UI — nunca vai pro N8N (evita flood).
    expect(d.forwarder.forward).not.toHaveBeenCalled();
  });
});
