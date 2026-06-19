import { describe, it, expect, vi } from 'vitest';
import { EventTranslator } from './event.translator';

const redis = { get: vi.fn(async (k: string) => (k.endsWith('followup_step') ? 'S3' : null)) } as any;

describe('EventTranslator', () => {
  const t = new EventTranslator(redis);

  it('maps chathistory rpush to message.received with derived legacy jid', async () => {
    const e = await t.translate('__keyspace@0__:chathistory:shk-5511952480228', 'rpush');
    expect(e).toMatchObject({ type: 'message.received', instancia: 'shk', jid: '5511952480228@s.whatsapp.net' });
  });

  it('derives @lid jid for opaque ids', async () => {
    const e = await t.translate('__keyspace@0__:chathistory:shk-262246475239430@lid', 'rpush');
    expect(e?.jid).toBe('262246475239430@lid');
  });

  it('enriches funnel.changed with the new stage value', async () => {
    const e = await t.translate('__keyspace@0__:chat:shk:5511@s.whatsapp.net:followup_step', 'set');
    expect(e).toMatchObject({ type: 'funnel.changed', payload: { stage: 'S3' } });
  });
});
