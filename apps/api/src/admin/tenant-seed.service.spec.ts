import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { TenantSeedService } from './tenant-seed.service';
import type { TenantService } from './tenant.service';

function makeTenants(existing: unknown[] = []) {
  return {
    listTenants: vi.fn(async () => existing),
    registerTenant: vi.fn(async () => ({})),
  };
}

function makeConfig(values: Record<string, string | undefined>) {
  return { get: vi.fn((key: string) => values[key]) };
}

describe('TenantSeedService', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    delete process.env.NODE_ENV; // dev by default
  });
  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('seeds an admin tenant when the registry is empty (dev, opt-in)', async () => {
    const tenants = makeTenants([]);
    const config = makeConfig({
      SEED_INSTANCE: 'nexusdev',
      SEED_ADMIN_EMAIL: 'dev@example.com',
    });
    const service = new TenantSeedService(config as never, tenants as unknown as TenantService);

    await service.onApplicationBootstrap();

    expect(tenants.registerTenant).toHaveBeenCalledWith('nexusdev', 'dev@example.com');
  });

  it('falls back to ADMIN_EMAIL when SEED_ADMIN_EMAIL is absent', async () => {
    const tenants = makeTenants([]);
    const config = makeConfig({ SEED_INSTANCE: 'nexusdev', ADMIN_EMAIL: 'admin@shk.com' });
    const service = new TenantSeedService(config as never, tenants as unknown as TenantService);

    await service.onApplicationBootstrap();

    expect(tenants.registerTenant).toHaveBeenCalledWith('nexusdev', 'admin@shk.com');
  });

  it('never runs in production', async () => {
    process.env.NODE_ENV = 'production';
    const tenants = makeTenants([]);
    const config = makeConfig({ SEED_INSTANCE: 'nexusdev', SEED_ADMIN_EMAIL: 'dev@example.com' });
    const service = new TenantSeedService(config as never, tenants as unknown as TenantService);

    await service.onApplicationBootstrap();

    expect(tenants.listTenants).not.toHaveBeenCalled();
    expect(tenants.registerTenant).not.toHaveBeenCalled();
  });

  it('is disabled when SEED_INSTANCE is not configured', async () => {
    const tenants = makeTenants([]);
    const config = makeConfig({ SEED_ADMIN_EMAIL: 'dev@example.com' });
    const service = new TenantSeedService(config as never, tenants as unknown as TenantService);

    await service.onApplicationBootstrap();

    expect(tenants.registerTenant).not.toHaveBeenCalled();
  });

  it('never overwrites a populated registry', async () => {
    const tenants = makeTenants([{ instancia: 'other' }]);
    const config = makeConfig({ SEED_INSTANCE: 'nexusdev', SEED_ADMIN_EMAIL: 'dev@example.com' });
    const service = new TenantSeedService(config as never, tenants as unknown as TenantService);

    await service.onApplicationBootstrap();

    expect(tenants.registerTenant).not.toHaveBeenCalled();
  });

  it('swallows errors so a seed failure cannot block startup', async () => {
    const tenants = makeTenants([]);
    tenants.listTenants.mockRejectedValueOnce(new Error('redis down'));
    const config = makeConfig({ SEED_INSTANCE: 'nexusdev', SEED_ADMIN_EMAIL: 'dev@example.com' });
    const service = new TenantSeedService(config as never, tenants as unknown as TenantService);

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
  });
});
