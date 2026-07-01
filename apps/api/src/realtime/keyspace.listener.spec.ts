import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KeyspaceListener } from './keyspace.listener';
import { EventTranslator } from './event.translator';

/**
 * Integration test for the N8N -> panel realtime bridge.
 *
 * The panel is a READER: the Evolution webhook goes to N8N, N8N writes Redis
 * (chathistory:*, chat:*:followup_step, ...), and the ONLY thing that turns
 * those writes into live UI updates is this listener reacting to Redis keyspace
 * notifications. If this bridge breaks (or keyspace events are off), the
 * operator sees a frozen panel even though the bot is working — exactly the
 * "prod is failing" class of symptom. These tests exercise the real
 * EventTranslator so a regression in either half is caught.
 */

function makeRedis(db = 0) {
  const handlers: Record<string, (...args: any[]) => unknown> = {};
  const subscriber = {
    psubscribe: vi.fn(async () => undefined),
    on: vi.fn((event: string, cb: (...args: any[]) => unknown) => {
      handlers[event] = cb;
    }),
    punsubscribe: vi.fn(async () => undefined),
    quit: vi.fn(async () => undefined),
  };
  const redis = {
    options: { db },
    duplicate: vi.fn(() => subscriber),
    get: vi.fn(async () => null),
    sadd: vi.fn(async () => 1),
  };
  return { redis, subscriber, handlers };
}

/** Fires one keyspace notification through the subscriber's pmessage handler. */
async function emit(
  handlers: Record<string, (...args: any[]) => unknown>,
  key: string,
  operation: string,
  db = 0,
): Promise<void> {
  const channel = `__keyspace@${db}__:${key}`;
  await handlers['pmessage'](`__keyspace@${db}__:*`, channel, operation);
}

beforeEach(() => vi.clearAllMocks());

describe('KeyspaceListener — N8N write -> live UI event', () => {
  it('turns a chathistory rpush into a message.received, self-heals the index and projects', async () => {
    const { redis, handlers } = makeRedis();
    const publisher = { publish: vi.fn(async () => undefined) } as any;
    const projection = { project: vi.fn(async () => undefined) } as any;
    const listener = new KeyspaceListener(
      redis as any,
      new EventTranslator(redis as any),
      publisher,
      projection,
    );

    await listener.onModuleInit();
    await emit(handlers, 'chathistory:shk-5511999@s.whatsapp.net', 'rpush');

    expect(publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'message.received',
        instancia: 'shk',
        jid: '5511999@s.whatsapp.net',
      }),
    );
    // Index self-heal + write-behind projection, both scoped to the tenant.
    expect(redis.sadd).toHaveBeenCalledWith('conversas:shk', '5511999@s.whatsapp.net');
    expect(projection.project).toHaveBeenCalledWith('shk', '5511999@s.whatsapp.net');
  });

  it('turns a followup_step set into funnel.changed (funnel moves reach the UI)', async () => {
    const { redis, handlers } = makeRedis();
    redis.get.mockResolvedValue('S3'); // translator reads the new stage back
    const publisher = { publish: vi.fn(async () => undefined) } as any;
    const projection = { project: vi.fn(async () => undefined) } as any;
    const listener = new KeyspaceListener(
      redis as any,
      new EventTranslator(redis as any),
      publisher,
      projection,
    );

    await listener.onModuleInit();
    await emit(handlers, 'chat:shk:5511999@s.whatsapp.net:followup_step', 'set');

    expect(publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'funnel.changed', instancia: 'shk', payload: { stage: 'S3' } }),
    );
    // Not a message => no index self-heal, but the projection still runs.
    expect(redis.sadd).not.toHaveBeenCalled();
    expect(projection.project).toHaveBeenCalledWith('shk', '5511999@s.whatsapp.net');
  });

  it('ignores operations the translator does not map (no phantom events)', async () => {
    const { redis, handlers } = makeRedis();
    const publisher = { publish: vi.fn(async () => undefined) } as any;
    const projection = { project: vi.fn(async () => undefined) } as any;
    const listener = new KeyspaceListener(
      redis as any,
      new EventTranslator(redis as any),
      publisher,
      projection,
    );

    await listener.onModuleInit();
    await emit(handlers, 'chathistory:shk-5511999@s.whatsapp.net', 'get');

    expect(publisher.publish).not.toHaveBeenCalled();
    expect(projection.project).not.toHaveBeenCalled();
  });

  it('subscribes on the connection DB index, not a hardcoded @0', async () => {
    const { redis, subscriber } = makeRedis(3);
    const listener = new KeyspaceListener(
      redis as any,
      new EventTranslator(redis as any),
      { publish: vi.fn() } as any,
      { project: vi.fn() } as any,
    );

    await listener.onModuleInit();

    const patterns = subscriber.psubscribe.mock.calls.map((c) => c[0]);
    expect(patterns).toContain('__keyspace@3__:chathistory:*');
    expect(patterns.every((p: string) => p.startsWith('__keyspace@3__:'))).toBe(true);
  });
});
