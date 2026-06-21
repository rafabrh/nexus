import { describe, it, expect, vi } from 'vitest';
import { ConversationService } from './conversation.service';

describe('ConversationService', () => {
  it('lists conversations from the durable Postgres projection, not a Redis fan-out', async () => {
    const items = [
      { jid: 'a@s.whatsapp.net', stage: 'S0', aiState: 'ON' },
      { jid: 'b@lid', stage: 'S0', aiState: 'ON' },
    ];
    const projection = { list: vi.fn(async () => items), project: vi.fn() } as any;
    const svc = new ConversationService({} as any, {} as any, {} as any, {} as any, {} as any, projection);

    const result = await svc.listConversations('shk', { stage: 'S0' });
    expect(projection.list).toHaveBeenCalledWith('shk', { stage: 'S0' });
    expect(result).toHaveLength(2);
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
