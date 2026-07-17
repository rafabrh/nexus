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
    lrem: vi.fn(async () => 1),
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

  it('SEMPRE encaminha o self-chat do dono pro N8N, mesmo com a IA OFF (canal de comando admin)', async () => {
    const d = makeDeps(knownTenant({ n8nWebhookUrl: 'https://n8n/w/shk' }));
    // Takeover ativo na conversa self (ex.: testou quick-reply mandando pro
    // proprio numero pelo painel) — humanControlUntil no futuro.
    d.redis.get = vi.fn(async (key: string) =>
      String(key).endsWith(':humanControlUntil') ? '4102444800000' : null,
    );
    const svc = new WebhookService(d.redis, d.publisher, d.index, d.tenants, d.forwarder);

    // Self-chat: fromMe=true e remoteJid == sender (ownerJid que a Evolution
    // injeta na raiz de todo webhook). E o canal dos comandos /help, /tpl...
    await svc.processEvolutionEvent({
      ...msgUpsert({ id: 'CMD1', fromMe: true, remoteJid: '5511912839594@s.whatsapp.net' }),
      sender: '5511912839594@s.whatsapp.net',
    });

    expect(d.forwarder.forward).toHaveBeenCalledWith(
      'shk',
      'https://n8n/w/shk',
      'CMD1',
      expect.any(Object),
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

describe('WebhookService deduplica o eco do proprio envio', () => {
  const sendEcho = (key: Record<string, unknown>, message: Record<string, unknown>) => ({
    event: 'send.message',
    instance: 'shk',
    data: { key: { remoteJid: '5511999@s.whatsapp.net', fromMe: true, ...key }, message },
  });

  it('NAO regrava uma mensagem de saida cujo WAMID ja esta no historico (eco)', async () => {
    const d = makeDeps(knownTenant());
    // Envio ja persistido (pelo painel ou por um eco anterior): id 'AI1' presente.
    d.redis.lrange = vi.fn(async () => [
      JSON.stringify({ type: 'ai', data: { content: 'resposta da IA' }, id: 'AI1' }),
    ]);
    const svc = new WebhookService(d.redis, d.publisher, d.index, d.tenants, d.forwarder);

    await svc.processEvolutionEvent(sendEcho({ id: 'AI1' }, { conversation: 'resposta da IA' }));

    // Eco: nao duplica no historico...
    expect(d.redis.rpush).not.toHaveBeenCalled();
    // ...mas o realtime/indice seguem (idempotentes).
    expect(d.publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'message.received', instancia: 'shk' }),
    );
  });

  it('grava a mensagem de saida quando o WAMID ainda nao esta no historico (envio novo)', async () => {
    const d = makeDeps(knownTenant());
    d.redis.lrange = vi.fn(async () => [
      JSON.stringify({ type: 'human', data: { content: 'oi' }, id: 'X1' }),
    ]);
    const svc = new WebhookService(d.redis, d.publisher, d.index, d.tenants, d.forwarder);

    await svc.processEvolutionEvent(sendEcho({ id: 'AI2' }, { conversation: 'nova resposta' }));

    expect(d.redis.rpush).toHaveBeenCalled();
  });

  it('deduplica midia de saida pelo media.id (o painel guarda o WAMID em media.id)', async () => {
    const d = makeDeps(knownTenant());
    // Painel gravou a imagem com o WAMID so em media.id (sem id no topo).
    d.redis.lrange = vi.fn(async () => [
      JSON.stringify({
        type: 'ai',
        data: { content: '' },
        media: { kind: 'image', id: 'IMG1', fromMe: true },
      }),
    ]);
    const svc = new WebhookService(d.redis, d.publisher, d.index, d.tenants, d.forwarder);

    await svc.processEvolutionEvent(
      sendEcho({ id: 'IMG1' }, { imageMessage: { caption: 'foto', mimetype: 'image/jpeg' } }),
    );

    // O eco da imagem casa com o media.id gravado pelo painel → nao duplica.
    expect(d.redis.rpush).not.toHaveBeenCalled();
  });

  it('grava normalmente a mensagem RECEBIDA do cliente (fromMe=false nao entra no dedup)', async () => {
    const d = makeDeps(knownTenant());
    // Mesmo que o historico tenha algo, uma msg do cliente sempre grava.
    d.redis.lrange = vi.fn(async () => [
      JSON.stringify({ type: 'human', data: { content: 'oi' }, id: 'C1' }),
    ]);
    const svc = new WebhookService(d.redis, d.publisher, d.index, d.tenants, d.forwarder);

    await svc.processEvolutionEvent(msgUpsert({ id: 'C2' }));

    expect(d.redis.rpush).toHaveBeenCalled();
  });
});

describe('WebhookService reconcilia o eco de midia visual (id do sendMedia diverge do WAMID)', () => {
  // Imagem sem legenda chega SEM a propriedade caption (não como string vazia);
  // extractContent devolve '[imagem]' nesse caso (não '', que abortaria cedo).
  const imgEcho = (id: string, caption?: string) => ({
    event: 'send.message',
    instance: 'shk',
    data: {
      key: { remoteJid: '5511999@s.whatsapp.net', fromMe: true, id },
      message: {
        imageMessage: { ...(caption ? { caption } : {}), mimetype: 'image/jpeg' },
      },
    },
  });

  it('substitui a bolha otimista do painel (sem id no topo) pelo eco, sem duplicar', async () => {
    const d = makeDeps(knownTenant());
    // Otimista do painel: imagem SEM id no topo; media.id = id local do sendMedia,
    // que NÃO bate com o WAMID do eco.
    d.redis.lrange = vi.fn(async () => [
      JSON.stringify({
        type: 'ai',
        data: { content: '' },
        media: { kind: 'image', id: 'MSG_LOCAL', fromMe: true },
      }),
    ]);
    const svc = new WebhookService(d.redis, d.publisher, d.index, d.tenants, d.forwarder);

    await svc.processEvolutionEvent(imgEcho('WAMID_REAL'));

    // Remove a otimista (lrem) e grava o eco (rpush) — 1 bolha, com o WAMID real.
    expect(d.redis.lrem).toHaveBeenCalledTimes(1);
    expect(d.redis.rpush).toHaveBeenCalledTimes(1);
    const stored = JSON.parse((d.redis.rpush as any).mock.calls[0][1]);
    expect(stored.id).toBe('WAMID_REAL');
    expect(stored.media.id).toBe('WAMID_REAL');
  });

  it('nao regrava um segundo eco de imagem com o mesmo WAMID (send.message + upsert)', async () => {
    const d = makeDeps(knownTenant());
    // Bolha já reconciliada: tem o WAMID no topo.
    d.redis.lrange = vi.fn(async () => [
      JSON.stringify({
        type: 'ai',
        data: { content: '' },
        id: 'WAMID_REAL',
        media: { kind: 'image', id: 'WAMID_REAL', fromMe: true },
      }),
    ]);
    const svc = new WebhookService(d.redis, d.publisher, d.index, d.tenants, d.forwarder);

    await svc.processEvolutionEvent(imgEcho('WAMID_REAL'));

    expect(d.redis.lrem).not.toHaveBeenCalled();
    expect(d.redis.rpush).not.toHaveBeenCalled();
  });

  it('grava o eco de imagem quando nao ha bolha otimista pendente (IA / outro device)', async () => {
    const d = makeDeps(knownTenant());
    d.redis.lrange = vi.fn(async () => [
      JSON.stringify({ type: 'human', data: { content: 'oi' }, id: 'C1' }),
    ]);
    const svc = new WebhookService(d.redis, d.publisher, d.index, d.tenants, d.forwarder);

    await svc.processEvolutionEvent(imgEcho('WAMID_NEW', 'foto'));

    expect(d.redis.lrem).not.toHaveBeenCalled();
    expect(d.redis.rpush).toHaveBeenCalledTimes(1);
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

describe('WebhookService contact name (pushName)', () => {
  const contactKey = 'contact:shk:5511999';

  it('grava o pushName do contato numa mensagem RECEBIDA (fromMe=false)', async () => {
    const d = makeDeps(knownTenant());
    const svc = new WebhookService(d.redis, d.publisher, d.index, d.tenants, d.forwarder);

    await svc.processEvolutionEvent({
      event: 'messages.upsert',
      instance: 'shk',
      data: {
        key: { remoteJid: '5511999@s.whatsapp.net', fromMe: false },
        message: { conversation: 'oi' },
        pushName: 'Cliente Real',
      },
    });

    const wrote = d.redis.set.mock.calls.find((c: unknown[]) => c[0] === contactKey);
    expect(wrote).toBeTruthy();
    expect(wrote![1]).toContain('Cliente Real');
  });

  it('NAO grava o pushName do DONO no contato numa mensagem ENVIADA (fromMe=true)', async () => {
    const d = makeDeps(knownTenant());
    const svc = new WebhookService(d.redis, d.publisher, d.index, d.tenants, d.forwarder);

    // Eco do proprio envio: a Evolution devolve o pushName do dono ("SHK Group").
    // Ele jamais pode ir para o registro do CONTATO (senao o nome oscila).
    await svc.processEvolutionEvent({
      event: 'messages.upsert',
      instance: 'shk',
      data: {
        key: { remoteJid: '5511999@s.whatsapp.net', id: 'OUT1', fromMe: true },
        message: { conversation: 'resposta' },
        pushName: 'SHK Group',
      },
    });

    const wrote = d.redis.set.mock.calls.find((c: unknown[]) => c[0] === contactKey);
    expect(wrote).toBeUndefined();
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
