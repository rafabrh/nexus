import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RedisKeys } from '@nexus/shared';
import { TenantConfigService } from './tenant-config.service';
import type { TenantEngineConfigRepository } from './tenant-engine-config.repository';
import type { InMemoryGatewayConfigStore } from './in-memory-gateway-config.store';
import type { ConfigService } from '@nestjs/config';

const ROWS = [
  { instancia: 'Shkgroup', gateway: 'go', config: { instanceId: 'uuid-1', ownerJid: '55@x' } },
  { instancia: 'Geotech', gateway: 'node', config: { instanceId: 'uuid-2' } },
];

function make(opts: { list?: any[]; listImpl?: () => Promise<any[]>; reconcileSec?: number } = {}) {
  const repo = {
    upsert: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    listWithGateway: vi.fn(opts.listImpl ?? (async () => opts.list ?? ROWS)),
  } as unknown as TenantEngineConfigRepository;
  const redis = { set: vi.fn().mockResolvedValue('OK') };
  const store = { hydrate: vi.fn() } as unknown as InMemoryGatewayConfigStore;
  const config = { get: vi.fn(() => opts.reconcileSec ?? 60) } as unknown as ConfigService;
  const service = new TenantConfigService(repo, redis as never, store, config);
  return { service, repo, redis, store, config };
}

describe('TenantConfigService', () => {
  afterEach(() => vi.useRealTimers());

  describe('upsert', () => {
    it('grava no Postgres, espelha no Redis (write-through) e re-hidrata o snapshot', async () => {
      const { service, repo, redis, store } = make();
      const cfg = { instanceId: 'uuid-9', ownerJid: '99@x' };
      await service.upsert('Shkgroup', cfg);
      expect(repo.upsert).toHaveBeenCalledWith('Shkgroup', cfg);
      expect(redis.set).toHaveBeenCalledWith(RedisKeys.tenantCfg('Shkgroup'), JSON.stringify(cfg));
      expect(store.hydrate).toHaveBeenCalled(); // rehydrate
    });
  });

  describe('setGoCredentials (Rota B — onboarding GO pelo painel)', () => {
    it('funde instanceId+instanceToken na config existente (preserva ownerJid) e re-hidrata', async () => {
      const { service, repo, store } = make();
      (repo.get as any).mockResolvedValue({ config: { ownerJid: '55@x' } });
      await service.setGoCredentials('Shkgroup', { instanceId: 'uuid-novo', token: 'TOK' });
      // Funde — NÃO apaga o ownerJid já seedado.
      expect(repo.upsert).toHaveBeenCalledWith('Shkgroup', {
        ownerJid: '55@x',
        instanceId: 'uuid-novo',
        instanceToken: 'TOK',
      });
      // Rehidrata pra o getQrCode seguinte já enxergar o token (senão instanceKey lança).
      expect(store.hydrate).toHaveBeenCalled();
    });

    it('sem config prévia → cria só com as creds GO', async () => {
      const { service, repo } = make();
      (repo.get as any).mockResolvedValue(null);
      await service.setGoCredentials('Nova', { instanceId: 'u', token: 't' });
      expect(repo.upsert).toHaveBeenCalledWith('Nova', { instanceId: 'u', instanceToken: 't' });
    });
  });

  describe('reconcile (boot/full)', () => {
    it('escreve TODAS as configs no Redis e hidrata o snapshot', async () => {
      const { service, redis, store } = make();
      await service.reconcile();
      expect(redis.set).toHaveBeenCalledWith(RedisKeys.tenantCfg('Shkgroup'), JSON.stringify(ROWS[0].config));
      expect(redis.set).toHaveBeenCalledWith(RedisKeys.tenantCfg('Geotech'), JSON.stringify(ROWS[1].config));
      expect(store.hydrate).toHaveBeenCalledWith(ROWS);
    });
  });

  describe('rehydrate (tick periódico)', () => {
    it('só re-hidrata o snapshot em memória — NÃO reescreve o Redis', async () => {
      const { service, redis, store } = make();
      await service.rehydrate();
      expect(store.hydrate).toHaveBeenCalledWith(ROWS);
      expect(redis.set).not.toHaveBeenCalled();
    });
  });

  describe('ciclo de vida', () => {
    it('boot: reconcilia uma vez e agenda o tick; destroy limpa o timer', async () => {
      vi.useFakeTimers();
      const { service, store } = make({ reconcileSec: 30 });
      await service.onApplicationBootstrap();
      expect(store.hydrate).toHaveBeenCalledTimes(1); // reconcile no boot
      await vi.advanceTimersByTimeAsync(30_000);
      expect(store.hydrate).toHaveBeenCalledTimes(2); // 1º tick (rehydrate)
      service.onModuleDestroy();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(store.hydrate).toHaveBeenCalledTimes(2); // timer limpo → sem novos ticks
    });

    it('best-effort: falha do reconcile no boot NÃO derruba o startup', async () => {
      const { service } = make({ listImpl: async () => { throw new Error('pg down'); } });
      await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
      service.onModuleDestroy();
    });
  });
});
