import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';

/**
 * Regression for the destructive create bug: a transient Evolution error made
 * `createInstance` treat a LIVE instance as gone and recreate it — dropping the
 * WhatsApp session and overwriting the N8N webhook. Recreation must only happen
 * when Evolution explicitly confirms (404) the instance is absent.
 */
function build(opts: {
  connState?: () => Promise<unknown>;
  redisState?: string | null;
}) {
  const redisStore: Record<string, string | null> = {
    'instanceState:nexusdev': opts.redisState ?? null,
    'tenant:registry': null,
  };
  const redis = {
    get: vi.fn(async (k: string) => redisStore[k] ?? null),
    set: vi.fn(async () => 'OK'),
    del: vi.fn(async () => 1),
  };
  const evolution = {
    getConnectionState: vi.fn(opts.connState ?? (async () => ({ instance: { state: 'open' } }))),
    createInstance: vi.fn(async () => ({})),
  };
  const config = { get: vi.fn((_k: string, d?: string) => d ?? 'http://localhost:4000') };
  const sync = { syncAll: vi.fn() };
  const tenants = { updateState: vi.fn(async () => undefined) };
  const service = new OnboardingService(
    redis as never,
    evolution as never,
    config as never,
    sync as never,
    tenants as never,
  );
  return { service, evolution, redis };
}

const err404 = () => Promise.reject(new Error('Evolution API 404: instance does not exist'));
const errTimeout = () => Promise.reject(new Error('fetch failed: ETIMEDOUT'));

describe('OnboardingService.createInstance', () => {
  it('REFUSES to recreate when Evolution is unreachable and local state exists (fail-safe)', async () => {
    const { service, evolution } = build({ connState: errTimeout, redisState: 'open' });
    await expect(service.createInstance('nexusdev')).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(evolution.createInstance).not.toHaveBeenCalled(); // never touched the live instance
  });

  it('rejects with 409 when the instance already exists (panel-owned)', async () => {
    const { service, evolution } = build({
      connState: async () => ({ instance: { state: 'open' } }),
      redisState: 'open',
    });
    await expect(service.createInstance('nexusdev')).rejects.toBeInstanceOf(ConflictException);
    expect(evolution.createInstance).not.toHaveBeenCalled();
  });

  it('rejects foreign instance (exists on Evolution but not created by this panel)', async () => {
    const { service } = build({
      connState: async () => ({ instance: { state: 'open' } }),
      redisState: null,
    });
    await expect(service.createInstance('nexusdev')).rejects.toBeInstanceOf(ConflictException);
  });

  it('recreates only when Evolution confirms 404 absent + stale local state', async () => {
    const { service, evolution, redis } = build({ connState: err404, redisState: 'open' });
    const res = await service.createInstance('nexusdev');
    expect(evolution.createInstance).toHaveBeenCalledOnce();
    expect(redis.del).toHaveBeenCalled(); // cleaned the stale state
    expect(res.state).toBe('created');
  });

  it('creates a brand-new instance when absent and no local state', async () => {
    const { service, evolution } = build({ connState: err404, redisState: null });
    const res = await service.createInstance('nexusdev');
    expect(evolution.createInstance).toHaveBeenCalledOnce();
    expect(res.instanceName).toBe('nexusdev');
  });
});
