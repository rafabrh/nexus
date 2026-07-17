import { describe, it, expect, vi } from 'vitest';
import { ConversationService } from './conversation.service';

describe('ConversationService', () => {
  it('lists conversations from the durable Postgres projection, not a Redis fan-out', async () => {
    const items = [
      { jid: 'a@s.whatsapp.net', stage: 'S0', aiState: 'ON' },
      { jid: 'b@lid', stage: 'S0', aiState: 'ON' },
    ];
    const projection = { list: vi.fn(async () => items), project: vi.fn() } as any;
    // A lista é enriquecida com o unread via pipeline Redis (um round-trip).
    // Enriquecimento: 3 GETs por conversa (unread + contact inst + contact global).
    const pipeline = {
      get: vi.fn(),
      exec: vi.fn(async () => items.flatMap(() => [[null, null], [null, null], [null, null]])),
    };
    const redis = { pipeline: () => pipeline } as any;
    const svc = new ConversationService({} as any, {} as any, {} as any, redis, {} as any, projection, {} as any);

    const result = await svc.listConversations('shk', { stage: 'S0' });
    expect(projection.list).toHaveBeenCalledWith('shk', { stage: 'S0' });
    expect(result).toHaveLength(2);
  });

  it('enriches each conversation with unread count, contact name and avatar from Redis', async () => {
    const items = [{ jid: 'a@s.whatsapp.net', contactName: '55999', stage: 'S0', aiState: 'ON' }];
    const projection = { list: vi.fn(async () => items), project: vi.fn() } as any;
    const pipeline = {
      get: vi.fn(),
      exec: vi.fn(async () => [
        [null, '3'], // unread
        [null, JSON.stringify({ name: 'João Cliente', profilePicUrl: 'http://pic/j' })], // contact inst
        [null, null], // legacy global
      ]),
    };
    const redis = { pipeline: () => pipeline } as any;
    const svc = new ConversationService({} as any, {} as any, {} as any, redis, {} as any, projection, {} as any);

    const result = await svc.listConversations('shk', {});

    expect(pipeline.get).toHaveBeenCalledWith('chat:shk:a@s.whatsapp.net:unread');
    expect(pipeline.get).toHaveBeenCalledWith('contact:shk:a');
    expect(pipeline.get).toHaveBeenCalledWith('contact:a');
    expect(result[0].unreadCount).toBe(3);
    expect(result[0].contactName).toBe('João Cliente');
    expect(result[0].avatarUrl).toBe('http://pic/j');
  });

  it('falls back to the N8N global contact key for the historical name', async () => {
    const items = [{ jid: 'b@s.whatsapp.net', contactName: '55888', stage: 'S0', aiState: 'ON' }];
    const projection = { list: vi.fn(async () => items), project: vi.fn() } as any;
    const pipeline = {
      get: vi.fn(),
      exec: vi.fn(async () => [
        [null, null], // unread
        [null, null], // contact inst (vazio — namespacing "escondeu" o nome)
        [null, JSON.stringify({ pushName: 'Maria Antiga' })], // legacy global N8N
      ]),
    };
    const redis = { pipeline: () => pipeline } as any;
    const svc = new ConversationService({} as any, {} as any, {} as any, redis, {} as any, projection, {} as any);

    const result = await svc.listConversations('shk', {});
    expect(result[0].contactName).toBe('Maria Antiga');
  });

  it('marks a conversation as read: clears unread and publishes conversation.read', async () => {
    const redis = { del: vi.fn(async () => 1) } as any;
    const publisher = { publish: vi.fn(async () => undefined) } as any;
    const projection = { list: vi.fn(), project: vi.fn() } as any;
    const svc = new ConversationService({} as any, {} as any, publisher, redis, {} as any, projection, {} as any);

    await svc.markRead('shk', '5511@s.whatsapp.net');

    expect(redis.del).toHaveBeenCalledWith('chat:shk:5511@s.whatsapp.net:unread');
    expect(publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'conversation.read',
        instancia: 'shk',
        jid: '5511@s.whatsapp.net',
      }),
    );
  });

  it('saves a custom contact name (merging, keeps pushName) and reprojects', async () => {
    const redis = {
      get: vi.fn(async () => JSON.stringify({ pushName: 'Jonny' })),
      set: vi.fn(async () => 'OK'),
    } as any;
    const projection = { project: vi.fn(async () => undefined), list: vi.fn() } as any;
    const svc = new ConversationService({} as any, {} as any, {} as any, redis, {} as any, projection, {} as any);

    await svc.saveContactName('shk', '5511@s.whatsapp.net', 'João Cliente');

    const saved = JSON.parse(redis.set.mock.calls[0][1]);
    expect(saved.name).toBe('João Cliente');
    expect(saved.pushName).toBe('Jonny'); // merge preserva o pushName original
    expect(projection.project).toHaveBeenCalledWith('shk', '5511@s.whatsapp.net');
  });

  it('clears the saved name when given a blank string', async () => {
    const redis = {
      get: vi.fn(async () => JSON.stringify({ name: 'Old', pushName: 'Jonny' })),
      set: vi.fn(async () => 'OK'),
    } as any;
    const projection = { project: vi.fn(async () => undefined), list: vi.fn() } as any;
    const svc = new ConversationService({} as any, {} as any, {} as any, redis, {} as any, projection, {} as any);

    await svc.saveContactName('shk', '5511@s.whatsapp.net', '   ');

    const saved = JSON.parse(redis.set.mock.calls[0][1]);
    expect(saved.name).toBeUndefined();
    expect(saved.pushName).toBe('Jonny');
  });

  it('persists the outbound message, pauses AI, indexes the jid, and reprojects', async () => {
    const calls: any = { rpush: [], set: [] };
    const redis = {
      get: vi.fn(async () => null),
      set: vi.fn(async (...a: any[]) => { calls.set.push(a); return 'OK'; }),
      rpush: vi.fn(async (...a: any[]) => { calls.rpush.push(a); return 1; }),
      del: vi.fn(async () => 1),
    } as any;
    const evolution = { sendTextMessage: vi.fn(async () => undefined) } as any;
    const index = { addJid: vi.fn(async () => undefined), listJids: vi.fn() } as any;
    const projection = { list: vi.fn(), project: vi.fn(async () => undefined) } as any;
    const svc = new ConversationService({} as any, evolution, {} as any, redis, index, projection, {} as any);

    await svc.sendMessage('shk', '5511@s.whatsapp.net', 'oi');

    expect(evolution.sendTextMessage).toHaveBeenCalledWith('shk', '5511@s.whatsapp.net', 'oi', undefined);
    expect(calls.rpush[0][0]).toBe('chathistory:shk-5511'); // history key
    expect(JSON.parse(calls.rpush[0][1]).data.content).toBe('oi');
    expect(redis.set).toHaveBeenCalled(); // humanControlUntil
    expect(index.addJid).toHaveBeenCalledWith('shk', '5511@s.whatsapp.net');
    expect(projection.project).toHaveBeenCalledWith('shk', '5511@s.whatsapp.net');
  });

  it('does NOT downgrade a permanent AI-OFF when the operator sends a message', async () => {
    // Regressão: o Switch OFF permanente grava 4102444800000. Enviar uma mensagem
    // pelo painel NÃO pode rebaixar isso para uma pausa curta (que expira e
    // reativa a IA) — a causa raiz do "desliguei no botão e a IA continua".
    const calls: any = { set: [] };
    const redis = {
      get: vi.fn(async (key: string) =>
        String(key).endsWith(':humanControlUntil') ? '4102444800000' : null,
      ),
      set: vi.fn(async (...a: any[]) => { calls.set.push(a); return 'OK'; }),
      rpush: vi.fn(async () => 1),
      del: vi.fn(async () => 1),
    } as any;
    const evolution = { sendTextMessage: vi.fn(async () => undefined) } as any;
    const index = { addJid: vi.fn(async () => undefined), listJids: vi.fn() } as any;
    const projection = { list: vi.fn(), project: vi.fn(async () => undefined) } as any;
    const svc = new ConversationService({} as any, evolution, {} as any, redis, index, projection, {} as any);

    await svc.sendMessage('shk', '5511@s.whatsapp.net', 'oi');

    const controlWrite = calls.set.find((a: any[]) => String(a[0]).endsWith(':humanControlUntil'));
    expect(controlWrite).toBeDefined();
    expect(controlWrite[1]).toBe('4102444800000'); // preserva o OFF permanente
    expect(controlWrite[2]).toBe('EX'); // com TTL, nunca uma chave sem expiração
  });

  it('sets a 30min human-takeover floor (with TTL) when the AI is on', async () => {
    const calls: any = { set: [] };
    const redis = {
      get: vi.fn(async () => null), // sem OFF prévio e sem rawjid @lid
      set: vi.fn(async (...a: any[]) => { calls.set.push(a); return 'OK'; }),
      rpush: vi.fn(async () => 1),
      del: vi.fn(async () => 1),
    } as any;
    const evolution = { sendTextMessage: vi.fn(async () => undefined) } as any;
    const index = { addJid: vi.fn(async () => undefined), listJids: vi.fn() } as any;
    const projection = { list: vi.fn(), project: vi.fn(async () => undefined) } as any;
    const svc = new ConversationService({} as any, evolution, {} as any, redis, index, projection, {} as any);

    await svc.sendMessage('shk', '5511@s.whatsapp.net', 'oi');

    const controlWrite = calls.set.find((a: any[]) => String(a[0]).endsWith(':humanControlUntil'));
    expect(controlWrite).toBeDefined();
    const until = Number(controlWrite[1]);
    expect(until).toBeGreaterThan(Date.now() + 29 * 60 * 1000);
    expect(until).toBeLessThan(Date.now() + 31 * 60 * 1000);
    expect(controlWrite[2]).toBe('EX');
    expect(controlWrite[3]).toBe(31_536_000);
  });

  it('normalizes a bare phone to the canonical jid when updating stage', async () => {
    const calls: any = { set: [] };
    const redis = {
      set: vi.fn(async (...a: any[]) => { calls.set.push(a); return 'OK'; }),
    } as any;
    const index = { addJid: vi.fn(async () => undefined) } as any;
    const publisher = { publish: vi.fn(async () => undefined) } as any;
    const projection = { list: vi.fn(), project: vi.fn(async () => undefined) } as any;
    // updateStage agora valida o key contra funnel_stages do tenant (funil
    // dinâmico). Stub retorna true para o caminho feliz deste teste de Redis.
    const funnelStages = { keyExists: vi.fn(async () => true) } as any;
    const svc = new ConversationService({} as any, {} as any, publisher, redis, index, projection, funnelStages);

    await svc.updateStage('shk', '5511952480228', 'S3');

    // followup_step key uses the canonical jid, not the bare phone
    expect(calls.set[0][0]).toBe('chat:shk:5511952480228@s.whatsapp.net:followup_step');
    expect(index.addJid).toHaveBeenCalledWith('shk', '5511952480228@s.whatsapp.net');
    expect(projection.project).toHaveBeenCalledWith('shk', '5511952480228@s.whatsapp.net');
    expect(publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'funnel.changed', jid: '5511952480228@s.whatsapp.net', payload: { stage: 'S3' } }),
    );
  });

  // ── sendQuickReply ──────────────────────────────────────────────────────────

  function makeQrSvc(row: Record<string, unknown>) {
    return { getOwned: vi.fn(async () => row) } as any;
  }

  function makeEvolution() {
    return {
      sendTextMessage: vi.fn(async () => ({ key: { id: 'msg-txt' } })),
      sendMedia: vi.fn(async () => ({ key: { id: 'msg-media' } })),
    } as any;
  }

  function makeRedisForSend() {
    return {
      get: vi.fn(async () => null),
      set: vi.fn(async () => 'OK'),
      rpush: vi.fn(async () => 1),
      del: vi.fn(async () => 1),
      pipeline: () => ({ get: vi.fn(), exec: vi.fn(async () => []) }),
    } as any;
  }

  function makeConfig(secret = 'testsecret', base = 'https://app.example.com') {
    return {
      getOrThrow: vi.fn((key: string) => {
        if (key === 'MEDIA_SIGN_SECRET') return secret;
        throw new Error(`unknown key ${key}`);
      }),
      get: vi.fn((key: string, def: string) => {
        if (key === 'APP_BASE_URL') return base;
        return def;
      }),
    } as any;
  }

  it('sendQuickReply — vídeo >16MB → sendMedia chamado com mediatype:document', async () => {
    const evolution = makeEvolution();
    const redis = makeRedisForSend();
    const index = { addJid: vi.fn(async () => undefined) } as any;
    const projection = { list: vi.fn(), project: vi.fn(async () => undefined) } as any;
    const qrSvc = makeQrSvc({
      id: 'qr1', instancia: 'shk', content: 'confira o vídeo',
      mediaId: 'mid1', mediaType: 'video', mediaMimetype: 'video/mp4',
      mediaFilename: 'video.mp4', mediaSize: 20 * 1024 * 1024,
    });
    const config = makeConfig();
    const svc = new ConversationService({} as any, evolution, {} as any, redis, index, projection, {} as any, qrSvc, config);

    await svc.sendQuickReply('shk', '5511@s.whatsapp.net', 'qr1');

    expect(evolution.sendMedia).toHaveBeenCalledWith(
      'shk', '5511@s.whatsapp.net',
      expect.objectContaining({ mediatype: 'document', fileName: 'video.mp4' }),
    );
  });

  it('sendQuickReply — vídeo <16MB → sendMedia chamado com mediatype:video', async () => {
    const evolution = makeEvolution();
    const redis = makeRedisForSend();
    const index = { addJid: vi.fn(async () => undefined) } as any;
    const projection = { list: vi.fn(), project: vi.fn(async () => undefined) } as any;
    const qrSvc = makeQrSvc({
      id: 'qr2', instancia: 'shk', content: 'vídeo pequeno',
      mediaId: 'mid2', mediaType: 'video', mediaMimetype: 'video/mp4',
      mediaFilename: 'small.mp4', mediaSize: 5 * 1024 * 1024,
    });
    const config = makeConfig();
    const svc = new ConversationService({} as any, evolution, {} as any, redis, index, projection, {} as any, qrSvc, config);

    await svc.sendQuickReply('shk', '5511@s.whatsapp.net', 'qr2');

    expect(evolution.sendMedia).toHaveBeenCalledWith(
      'shk', '5511@s.whatsapp.net',
      expect.objectContaining({ mediatype: 'video' }),
    );
  });

  it('sendQuickReply — imagem → sendMedia chamado com mediatype:image', async () => {
    const evolution = makeEvolution();
    const redis = makeRedisForSend();
    const index = { addJid: vi.fn(async () => undefined) } as any;
    const projection = { list: vi.fn(), project: vi.fn(async () => undefined) } as any;
    const qrSvc = makeQrSvc({
      id: 'qr3', instancia: 'shk', content: 'olha essa imagem',
      mediaId: 'mid3', mediaType: 'image', mediaMimetype: 'image/jpeg',
      mediaFilename: 'foto.jpg', mediaSize: 200 * 1024,
    });
    const config = makeConfig();
    const svc = new ConversationService({} as any, evolution, {} as any, redis, index, projection, {} as any, qrSvc, config);

    await svc.sendQuickReply('shk', '5511@s.whatsapp.net', 'qr3');

    expect(evolution.sendMedia).toHaveBeenCalledWith(
      'shk', '5511@s.whatsapp.net',
      expect.objectContaining({ mediatype: 'image' }),
    );
  });

  it('sendQuickReply — media field é URL assinada contendo sig=, exp=, inst=', async () => {
    const evolution = makeEvolution();
    const redis = makeRedisForSend();
    const index = { addJid: vi.fn(async () => undefined) } as any;
    const projection = { list: vi.fn(), project: vi.fn(async () => undefined) } as any;
    const qrSvc = makeQrSvc({
      id: 'qr4', instancia: 'shk', content: 'caption',
      mediaId: 'mid4', mediaType: 'image', mediaMimetype: 'image/png',
      mediaFilename: 'img.png', mediaSize: 100 * 1024,
    });
    const config = makeConfig('mysecret', 'https://app.example.com');
    const svc = new ConversationService({} as any, evolution, {} as any, redis, index, projection, {} as any, qrSvc, config);

    await svc.sendQuickReply('shk', '5511@s.whatsapp.net', 'qr4');

    const call = evolution.sendMedia.mock.calls[0][2] as { media: string; caption?: string };
    expect(call.media).toMatch(/^https:\/\/app\.example\.com\/api\/v1\/public\/qr-media\/mid4/);
    expect(call.media).toContain('sig=');
    expect(call.media).toContain('exp=');
    expect(call.media).toContain('inst=shk');
    expect(call.caption).toBe('caption');
  });

  it('sendQuickReply — sem mídia → envia como texto, não chama sendMedia', async () => {
    const evolution = makeEvolution();
    const redis = makeRedisForSend();
    const index = { addJid: vi.fn(async () => undefined) } as any;
    const projection = { list: vi.fn(), project: vi.fn(async () => undefined) } as any;
    const qrSvc = makeQrSvc({
      id: 'qr5', instancia: 'shk', content: 'só texto aqui',
      mediaId: null, mediaType: null, mediaMimetype: null,
      mediaFilename: null, mediaSize: null,
    });
    const config = makeConfig();
    const svc = new ConversationService({} as any, evolution, {} as any, redis, index, projection, {} as any, qrSvc, config);

    const result = await svc.sendQuickReply('shk', '5511@s.whatsapp.net', 'qr5');

    expect(evolution.sendMedia).not.toHaveBeenCalled();
    expect(evolution.sendTextMessage).toHaveBeenCalledWith('shk', '5511@s.whatsapp.net', 'só texto aqui', undefined);
    expect(result.message).toBe('Mensagem enviada');
  });

  it('rejects updateStage (400) when the key is not a stage of the tenant (dynamic funnel)', async () => {
    // O funil é dinâmico por-tenant: um key que não existe em funnel_stages do
    // tenant deve ser rejeitado ANTES de tocar o Redis — senão gravaria um
    // followup_step órfão que nenhuma coluna renderiza.
    const { BadRequestException } = await import('@nestjs/common');
    const redis = { set: vi.fn(async () => 'OK') } as any;
    const index = { addJid: vi.fn(async () => undefined) } as any;
    const publisher = { publish: vi.fn(async () => undefined) } as any;
    const projection = { list: vi.fn(), project: vi.fn(async () => undefined) } as any;
    const funnelStages = { keyExists: vi.fn(async () => false) } as any;
    const svc = new ConversationService({} as any, {} as any, publisher, redis, index, projection, funnelStages);

    await expect(svc.updateStage('shk', '5511952480228', 'inexistente')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    // Nada é gravado nem publicado quando o key é inválido.
    expect(redis.set).not.toHaveBeenCalled();
    expect(index.addJid).not.toHaveBeenCalled();
    expect(publisher.publish).not.toHaveBeenCalled();
    expect(funnelStages.keyExists).toHaveBeenCalledWith('shk', 'inexistente');
  });
});
