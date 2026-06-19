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
});
