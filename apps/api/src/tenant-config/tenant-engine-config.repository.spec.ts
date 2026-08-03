import { describe, it, expect, vi } from 'vitest';
import { TenantEngineConfigRepository } from './tenant-engine-config.repository';

// Drizzle stub: `from(table)` é thenable (list = await direto) E expõe `where`
// (get). Captura o insert/upsert para asserção.
function makeRepo(opts: { rows?: any[] } = {}) {
  const rows = opts.rows ?? [];
  const state = { insertValues: null as any, conflict: null as any };
  const thenable = (data: any[]) => ({
    where: () => Promise.resolve(data),
    then: (res: any, rej: any) => Promise.resolve(data).then(res, rej),
  });
  const select = vi.fn(() => ({ from: vi.fn(() => thenable(rows)) }));
  const insert = vi.fn(() => ({
    values: vi.fn((v: any) => {
      state.insertValues = v;
      return {
        onConflictDoUpdate: vi.fn(async (c: any) => {
          state.conflict = c;
        }),
      };
    }),
  }));
  const db = { select, insert } as any;
  return { repo: new TenantEngineConfigRepository(db), state };
}

const ROW = {
  instancia: 'Shkgroup',
  config: { instanceId: 'uuid-1', ownerJid: '55@s.whatsapp.net' },
  cfgVersion: 2,
  updatedAt: new Date('2026-08-01T00:00:00Z'),
};

describe('TenantEngineConfigRepository', () => {
  it('get devolve a linha da instância', async () => {
    const { repo } = makeRepo({ rows: [ROW] });
    expect(await repo.get('Shkgroup')).toEqual(ROW);
  });

  it('get devolve null quando não há config', async () => {
    const { repo } = makeRepo({ rows: [] });
    expect(await repo.get('desconhecida')).toBeNull();
  });

  it('list devolve todas as configs (fonte da hidratação do store)', async () => {
    const { repo } = makeRepo({ rows: [ROW, { ...ROW, instancia: 'Geotech' }] });
    const all = await repo.list();
    expect(all).toHaveLength(2);
    expect(all[0].instancia).toBe('Shkgroup');
  });

  it('upsert insere com cfg_version=1 e, no conflito, funde config + bumpa versão', async () => {
    const { repo, state } = makeRepo();
    const cfg = { instanceId: 'uuid-9', ownerJid: '99@s.whatsapp.net' };
    await repo.upsert('Shkgroup', cfg);
    expect(state.insertValues).toMatchObject({ instancia: 'Shkgroup', config: cfg, cfgVersion: 1 });
    expect(state.conflict.set.config).toEqual(cfg);
    expect(state.conflict.set.cfgVersion).toBeDefined(); // sql`cfg_version + 1`
    expect(state.conflict.set.updatedAt).toBeInstanceOf(Date);
  });
});
