import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KeyspaceConfigService } from './keyspace-config.service';

function makeRedis(getReturn = 'notify-keyspace-events\nKEA') {
  return {
    config: vi.fn(async (op: string) => {
      if (op === 'SET') return 'OK';
      return ['notify-keyspace-events', getReturn.split('\n')[1] ?? 'KEA'];
    }),
  } as any;
}

describe('KeyspaceConfigService', () => {
  let redis: any;
  beforeEach(() => { redis = makeRedis(); });

  it('sets notify-keyspace-events to KEA on bootstrap', async () => {
    const svc = new KeyspaceConfigService(redis);
    await svc.onApplicationBootstrap();
    expect(redis.config).toHaveBeenCalledWith('SET', 'notify-keyspace-events', 'KEA');
  });

  it('reports ready=true when validation shows keyspace classes', async () => {
    const svc = new KeyspaceConfigService(redis);
    await svc.onApplicationBootstrap();
    expect(svc.isReady()).toBe(true);
  });

  it('does not throw and reports ready=false when CONFIG SET fails', async () => {
    redis.config = vi.fn(async () => { throw new Error('CONFIG disabled'); });
    const svc = new KeyspaceConfigService(redis);
    await expect(svc.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(svc.isReady()).toBe(false);
  });
});
