import { describe, it, expect, vi } from 'vitest';
import { EventTranslator } from './event.translator';

const redis = {
  get: vi.fn(async (k: string) => {
    if (k.endsWith('followup_step')) return 'S3';
    if (k.endsWith('humanControlUntil')) return '1893456000000';
    return null;
  }),
} as any;

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

  it('emits ai.toggled OFF with the until timestamp when humanControlUntil is set', async () => {
    const e = await t.translate('__keyspace@0__:chat:shk:5511@s.whatsapp.net:humanControlUntil', 'set');
    expect(e).toMatchObject({ type: 'ai.toggled', payload: { state: 'OFF', until: 1893456000000 } });
  });

  it('emits ai.toggled ON when humanControlUntil is deleted or expires', async () => {
    const del = await t.translate('__keyspace@0__:chat:shk:5511@s.whatsapp.net:humanControlUntil', 'del');
    expect(del).toMatchObject({ type: 'ai.toggled', payload: { state: 'ON' } });
    const exp = await t.translate('__keyspace@0__:chat:shk:5511@s.whatsapp.net:humanControlUntil', 'expired');
    expect(exp).toMatchObject({ type: 'ai.toggled', payload: { state: 'ON' } });
  });

  it('works with a non-zero keyspace db index in the channel', async () => {
    const e = await t.translate('__keyspace@3__:chathistory:shk-5511952480228', 'rpush');
    expect(e).toMatchObject({ type: 'message.received', instancia: 'shk', jid: '5511952480228@s.whatsapp.net' });
  });

  it('ignores irrelevant operations and unknown keys', async () => {
    expect(await t.translate('__keyspace@0__:chathistory:shk-5511', 'del')).toBeNull();
    expect(await t.translate('__keyspace@0__:chat:shk:5511@s.whatsapp.net:processing', 'lpush')).toBeNull();
    expect(await t.translate('__keyspace@0__:randomkey', 'set')).toBeNull();
  });
});
