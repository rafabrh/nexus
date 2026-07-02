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
    const svc = new ConversationService({} as any, {} as any, {} as any, redis, {} as any, projection);

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
    const svc = new ConversationService({} as any, {} as any, {} as any, redis, {} as any, projection);

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
    const svc = new ConversationService({} as any, {} as any, {} as any, redis, {} as any, projection);

    const result = await svc.listConversations('shk', {});
    expect(result[0].contactName).toBe('Maria Antiga');
  });

  it('marks a conversation as read: clears unread and publishes conversation.read', async () => {
    const redis = { del: vi.fn(async () => 1) } as any;
    const publisher = { publish: vi.fn(async () => undefined) } as any;
    const projection = { list: vi.fn(), project: vi.fn() } as any;
    const svc = new ConversationService({} as any, {} as any, publisher, redis, {} as any, projection);

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
    const svc = new ConversationService({} as any, {} as any, {} as any, redis, {} as any, projection);

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
    const svc = new ConversationService({} as any, {} as any, {} as any, redis, {} as any, projection);

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
    const svc = new ConversationService({} as any, evolution, {} as any, redis, index, projection);

    await svc.sendMessage('shk', '5511@s.whatsapp.net', 'oi');

    expect(evolution.sendTextMessage).toHaveBeenCalledWith('shk', '5511@s.whatsapp.net', 'oi');
    expect(calls.rpush[0][0]).toBe('chathistory:shk-5511'); // history key
    expect(JSON.parse(calls.rpush[0][1]).data.content).toBe('oi');
    expect(redis.set).toHaveBeenCalled(); // humanControlUntil
    expect(index.addJid).toHaveBeenCalledWith('shk', '5511@s.whatsapp.net');
    expect(projection.project).toHaveBeenCalledWith('shk', '5511@s.whatsapp.net');
  });

  it('normalizes a bare phone to the canonical jid when updating stage', async () => {
    const calls: any = { set: [] };
    const redis = {
      set: vi.fn(async (...a: any[]) => { calls.set.push(a); return 'OK'; }),
    } as any;
    const index = { addJid: vi.fn(async () => undefined) } as any;
    const publisher = { publish: vi.fn(async () => undefined) } as any;
    const projection = { list: vi.fn(), project: vi.fn(async () => undefined) } as any;
    const svc = new ConversationService({} as any, {} as any, publisher, redis, index, projection);

    await svc.updateStage('shk', '5511952480228', 'S3');

    // followup_step key uses the canonical jid, not the bare phone
    expect(calls.set[0][0]).toBe('chat:shk:5511952480228@s.whatsapp.net:followup_step');
    expect(index.addJid).toHaveBeenCalledWith('shk', '5511952480228@s.whatsapp.net');
    expect(projection.project).toHaveBeenCalledWith('shk', '5511952480228@s.whatsapp.net');
    expect(publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'funnel.changed', jid: '5511952480228@s.whatsapp.net', payload: { stage: 'S3' } }),
    );
  });
});
