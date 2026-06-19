import { describe, it, expect, vi } from 'vitest';
import { ConversationService } from './conversation.service';

describe('ConversationService', () => {
  it('lists conversations from the index, not a global scan', async () => {
    const repo = {
      buildListItem: vi.fn(async (_i: string, jid: string) => ({
        jid, lastActivity: new Date().toISOString(), stage: 'S0', aiState: 'ON',
      })),
    } as any;
    const index = { listJids: vi.fn(async () => ['a@s.whatsapp.net', 'b@lid']) } as any;
    const redis = { get: vi.fn(async () => null), set: vi.fn(async () => 'OK') } as any;
    const svc = new ConversationService(repo, {} as any, {} as any, redis, index);

    const result = await svc.listConversations('shk', {});
    expect(index.listJids).toHaveBeenCalledWith('shk');
    expect(result).toHaveLength(2);
  });

  it('persists the outbound message, pauses AI, and indexes the jid', async () => {
    const calls: any = { rpush: [], set: [] };
    const redis = {
      get: vi.fn(async () => null),
      set: vi.fn(async (...a: any[]) => { calls.set.push(a); return 'OK'; }),
      rpush: vi.fn(async (...a: any[]) => { calls.rpush.push(a); return 1; }),
      del: vi.fn(async () => 1),
    } as any;
    const evolution = { sendTextMessage: vi.fn(async () => undefined) } as any;
    const index = { addJid: vi.fn(async () => undefined), listJids: vi.fn() } as any;
    const svc = new ConversationService({} as any, evolution, {} as any, redis, index);

    await svc.sendMessage('shk', '5511@s.whatsapp.net', 'oi');

    expect(evolution.sendTextMessage).toHaveBeenCalledWith('shk', '5511@s.whatsapp.net', 'oi');
    expect(calls.rpush[0][0]).toBe('chathistory:shk-5511'); // history key
    expect(JSON.parse(calls.rpush[0][1]).data.content).toBe('oi');
    expect(redis.set).toHaveBeenCalled(); // humanControlUntil
    expect(index.addJid).toHaveBeenCalledWith('shk', '5511@s.whatsapp.net');
  });
});
