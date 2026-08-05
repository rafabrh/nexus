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
  gateway?: 'node' | 'go';
  goCreds?: { instanceId?: string; token?: string };
  createResult?: Record<string, unknown>;
  createImpl?: () => Promise<Record<string, unknown>>;
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
    createInstance: vi.fn(opts.createImpl ?? (async () => opts.createResult ?? {})),
  };
  const config = { get: vi.fn((_k: string, d?: string) => d ?? 'http://localhost:4000') };
  const sync = { syncAll: vi.fn() };
  const tenants = { updateState: vi.fn(async () => undefined) };
  // Store do gateway (D7): `gatewayFor` roteia Node|GO; default 'node' preserva
  // 100% do caminho Node existente. `goCredentials` diz se a instância GO já foi
  // provisionada por este painel.
  const store = {
    gatewayFor: vi.fn(() => opts.gateway ?? 'node'),
    goCredentials: vi.fn(() => opts.goCreds),
  };
  const tenantConfig = { setGoCredentials: vi.fn(async () => undefined) };
  const service = new OnboardingService(
    redis as never,
    evolution as never,
    config as never,
    sync as never,
    tenants as never,
    store as never,
    tenantConfig as never,
  );
  return { service, evolution, redis, store, tenantConfig };
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

describe('OnboardingService.createInstance — gateway GO (Rota B, self-service pelo painel)', () => {
  it('provisiona no GO (create → persiste creds) SEM abortar no probe unknown', async () => {
    // GO recém-marcado gateway='go', ainda SEM creds → o probe GO degrada p/
    // unknown (esperado, não é o perigo do Node). Deve criar e persistir, não abortar.
    const { service, evolution, tenantConfig } = build({
      gateway: 'go',
      goCreds: undefined,
      probe: probeUnknown,
      createResult: { instanceId: 'uuid-go', token: 'GOTOK' },
    });
    const res = await service.createInstance('nexus_teste');
    expect(evolution.createInstance).toHaveBeenCalledOnce();
    expect(tenantConfig.setGoCredentials).toHaveBeenCalledWith('nexus_teste', {
      instanceId: 'uuid-go',
      token: 'GOTOK',
    });
    expect(res.instanceName).toBe('nexus_teste');
    expect(res.state).toBe('created');
  });

  it('recusa (409) quando a instância GO já foi provisionada por este painel (tem token)', async () => {
    const { service, evolution } = build({
      gateway: 'go',
      goCreds: { instanceId: 'uuid-go', token: 'GOTOK' },
    });
    await expect(service.createInstance('nexus_teste')).rejects.toBeInstanceOf(ConflictException);
    expect(evolution.createInstance).not.toHaveBeenCalled();
  });

  it('NÃO persiste creds se o create GO falhar (propaga o erro)', async () => {
    const { service, tenantConfig } = build({
      gateway: 'go',
      goCreds: undefined,
      createImpl: async () => {
        throw new Error('GO 500');
      },
    });
    await expect(service.createInstance('nexus_teste')).rejects.toThrow(/GO 500/);
    expect(tenantConfig.setGoCredentials).not.toHaveBeenCalled();
  });

  it('create GO sem retornar creds → erro claro (não persiste lixo)', async () => {
    const { service, tenantConfig } = build({
      gateway: 'go',
      goCreds: undefined,
      createResult: {}, // sem instanceId/token
    });
    await expect(service.createInstance('nexus_teste')).rejects.toThrow(/creds/i);
    expect(tenantConfig.setGoCredentials).not.toHaveBeenCalled();
  });
});
