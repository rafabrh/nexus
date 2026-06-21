import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';

/**
 * Regression for the destructive create bug: a transient Evolution error made
 * `createInstance` treat a LIVE instance as gone and recreate it — dropping the
 * WhatsApp session and overwriting the N8N webhook. Recreation must only happen
 * when Evolution explicitly confirms (404) the instance is absent.
 */
type Probe =
  | { status: 'exists'; state: string }
  | { status: 'absent' }
  | { status: 'unknown' };

function build(opts: {
  probe?: () => Promise<Probe>;
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
    // probeState collapses the raw Evolution call into exists/absent/unknown.
    probeState: vi.fn(opts.probe ?? (async () => ({ status: 'exists', state: 'open' }) as Probe)),
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

const probeUnknown = async (): Promise<Probe> => ({ status: 'unknown' });
const probeOpen = async (): Promise<Probe> => ({ status: 'exists', state: 'open' });
const probeAbsent = async (): Promise<Probe> => ({ status: 'absent' });

describe('OnboardingService.createInstance', () => {
  it('REFUSES to recreate when Evolution is unreachable and local state exists (fail-safe)', async () => {
    const { service, evolution } = build({ probe: probeUnknown, redisState: 'open' });
    await expect(service.createInstance('nexusdev')).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(evolution.createInstance).not.toHaveBeenCalled(); // never touched the live instance
  });

  it('rejects with 409 when the instance already exists (panel-owned)', async () => {
    const { service, evolution } = build({ probe: probeOpen, redisState: 'open' });
    await expect(service.createInstance('nexusdev')).rejects.toBeInstanceOf(ConflictException);
    expect(evolution.createInstance).not.toHaveBeenCalled();
  });

  it('rejects foreign instance (exists on Evolution but not created by this panel)', async () => {
    const { service } = build({ probe: probeOpen, redisState: null });
    await expect(service.createInstance('nexusdev')).rejects.toBeInstanceOf(ConflictException);
  });

  it('recreates only when Evolution confirms 404 absent + stale local state', async () => {
    const { service, evolution, redis } = build({ probe: probeAbsent, redisState: 'open' });
    const res = await service.createInstance('nexusdev');
    expect(evolution.createInstance).toHaveBeenCalledOnce();
    expect(redis.del).toHaveBeenCalled(); // cleaned the stale state
    expect(res.state).toBe('created');
  });

  it('creates a brand-new instance when absent and no local state', async () => {
    const { service, evolution } = build({ probe: probeAbsent, redisState: null });
    const res = await service.createInstance('nexusdev');
    expect(evolution.createInstance).toHaveBeenCalledOnce();
    expect(res.instanceName).toBe('nexusdev');
  });
});
