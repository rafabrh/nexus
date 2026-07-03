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
    // CAS atômico do ACK (ACK_CAS_LUA): 1 = avançou. Testes que precisam simular
    // "não avançou" (fora de ordem) sobrescrevem para retornar 0.
    eval: vi.fn(async () => 1),
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

describe('WebhookService BFF-gate do controle de IA', () => {
  it('does NOT forward an inbound message to N8N when the AI is OFF for the conversation', async () => {
    const d = makeDeps(knownTenant({ n8nWebhookUrl: 'https://n8n/w/shk' }));
    // Conversa com a IA desligada: humanControlUntil no futuro (OFF permanente).
    d.redis.get = vi.fn(async (key: string) =>
      String(key).endsWith(':humanControlUntil') ? '4102444800000' : null,
    );
    const svc = new WebhookService(d.redis, d.publisher, d.index, d.tenants, d.forwarder);

    await svc.processEvolutionEvent(msgUpsert({ id: 'M9' }));

    // Barrado na origem — o N8N nem recebe a mensagem, então nao responde.
    expect(d.forwarder.forward).not.toHaveBeenCalled();
    // Mas o painel continua registrando tudo (historico + realtime).
    expect(d.redis.rpush).toHaveBeenCalled();
    expect(d.publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'message.received', instancia: 'shk' }),
    );
  });

  it('still forwards to N8N when the AI-OFF pause has already expired', async () => {
    const d = makeDeps(knownTenant({ n8nWebhookUrl: 'https://n8n/w/shk' }));
    d.redis.get = vi.fn(async (key: string) =>
      String(key).endsWith(':humanControlUntil') ? String(Date.now() - 1000) : null,
    );
    const svc = new WebhookService(d.redis, d.publisher, d.index, d.tenants, d.forwarder);

    await svc.processEvolutionEvent(msgUpsert({ id: 'M9' }));

    expect(d.forwarder.forward).toHaveBeenCalledWith(
      'shk',
      'https://n8n/w/shk',
      'M9',
      expect.any(Object),
    );
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

describe('WebhookService messages.update (read receipts / ACK)', () => {
  const ackUpdate = (
    status: unknown,
    keyExtra: Record<string, unknown> = { id: 'AI1', fromMe: true },
  ) => ({
    event: 'messages.update',
    instance: 'shk',
    data: { key: { remoteJid: '5511999@s.whatsapp.net', ...keyExtra }, status },
  });

  it('publishes message.status for OUR message and never forwards ACK to N8N', async () => {
    const d = makeDeps(knownTenant({ n8nWebhookUrl: 'https://n8n/w/shk' }));
    const svc = new WebhookService(d.redis, d.publisher, d.index, d.tenants, d.forwarder);

    await svc.processEvolutionEvent(ackUpdate('READ'));

    expect(d.publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'message.status',
        instancia: 'shk',
        jid: '5511999@s.whatsapp.net',
        payload: { id: 'AI1', status: 'read' },
      }),
      // Tique não é persistido no stream de replay (alto volume).
      { persistToStream: false },
    );
    // ACK é alto volume/sinal de UI — nunca reencaminha pro N8N.
    expect(d.forwarder.forward).not.toHaveBeenCalled();
  });

  it('maps the numeric WAMessageStatus (3 = delivered)', async () => {
    const d = makeDeps(knownTenant());
    const svc = new WebhookService(d.redis, d.publisher, d.index, d.tenants, d.forwarder);

    await svc.processEvolutionEvent(ackUpdate(3));

    expect(d.publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ payload: { id: 'AI1', status: 'delivered' } }),
      { persistToStream: false },
    );
  });

  it('ignores the ACK of inbound (fromMe=false) messages', async () => {
    const d = makeDeps(knownTenant());
    const svc = new WebhookService(d.redis, d.publisher, d.index, d.tenants, d.forwarder);

    await svc.processEvolutionEvent(ackUpdate('READ', { id: 'X', fromMe: false }));

    expect(d.redis.eval).not.toHaveBeenCalled();
    expect(d.publisher.publish).not.toHaveBeenCalled();
  });

  it('does NOT publish when the CAS did not advance (out-of-order/duplicate ACK)', async () => {
    const d = makeDeps(knownTenant());
    d.redis.eval = vi.fn(async () => 0); // Lua: novo status <= atual, não gravou
    const svc = new WebhookService(d.redis, d.publisher, d.index, d.tenants, d.forwarder);

    await svc.processEvolutionEvent(ackUpdate('DELIVERY_ACK'));

    expect(d.publisher.publish).not.toHaveBeenCalled();
  });
});
