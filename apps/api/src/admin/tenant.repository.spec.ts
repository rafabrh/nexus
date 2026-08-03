import { describe, it, expect, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { TenantRepository } from './tenant.repository';

/**
 * Testes da lógica de segurança do registro de tenants (Postgres): a guarda
 * "um e-mail = uma instância" (barrar) e a troca de e-mail de acesso (que mata o
 * acesso do antigo). Usa um stub encadeável do Drizzle no estilo do
 * conversation-projection/funnel spec.
 */

/** Linha de tenant completa (o `toEntry` acessa createdAt/connectedAt). */
const TENANT = (instancia: string) => ({
  instancia,
  name: instancia,
  active: true,
  connectionState: null,
  syncStatus: null,
  connectedAt: null,
  n8nWebhookUrl: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
});

/** Resultado awaitable que também expõe orderBy/limit/returning (todos → rows). */
function result(rows: any[]) {
  const r: any = {
    orderBy: () => r,
    limit: async () => rows,
    returning: async () => rows,
    then: (res: any, rej: any) => Promise.resolve(rows).then(res, rej),
  };
  return r;
}

/**
 * Constrói o repo com um Drizzle stub. `selects` é uma FILA: cada
 * `select().from().where()` consome o próximo lote, na ordem em que os métodos os
 * disparam (lembre: `get()` faz 2 selects — tenant + usuários). `updateRow` é o
 * retorno de `update().set().where().returning()`. Captura inserts/updates.
 */
function makeRepo(opts: { selects?: any[][]; updateRow?: any[] } = {}) {
  const selects = [...(opts.selects ?? [])];
  const state = { inserted: [] as any[], updatedSet: null as any };

  const select = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => result(selects.length ? selects.shift()! : [])),
    })),
  }));
  const insert = vi.fn(() => ({
    values: vi.fn((v: any) => {
      state.inserted.push(v);
      return { onConflictDoNothing: vi.fn(async () => undefined) };
    }),
  }));
  const update = vi.fn(() => ({
    set: vi.fn((s: any) => {
      state.updatedSet = s;
      return { where: vi.fn(() => result(opts.updateRow ?? [])) };
    }),
  }));
  const del = vi.fn(() => ({ where: vi.fn(async () => undefined) }));
  const transaction = vi.fn(async (cb: any) =>
    cb({ insert, update, delete: del, select }),
  );

  const db = { select, insert, update, delete: del, transaction } as any;
  return { repo: new TenantRepository(db), state };
}

describe('TenantRepository.userExists', () => {
  it('[+] true quando o e-mail é membro da instância', async () => {
    const { repo } = makeRepo({ selects: [[{ id: 'u1' }]] });
    expect(await repo.userExists('shk', 'a@x.com')).toBe(true);
  });

  it('[-] false quando não é membro (base do "matar acesso" no refresh)', async () => {
    const { repo } = makeRepo({ selects: [[]] });
    expect(await repo.userExists('shk', 'ghost@x.com')).toBe(false);
  });
});

describe('TenantRepository.addUser (barrar: um e-mail = uma instância)', () => {
  it('[-] recusa e-mail que já pertence a OUTRA instância', async () => {
    const { repo, state } = makeRepo({
      selects: [
        [TENANT('shk')], // get: tenant
        [{ email: 'admin@shk.com', role: 'admin' }], // get: usuários
        [{ instancia: 'outra' }], // emailTakenElsewhere → em outra instância
      ],
    });
    await expect(
      repo.addUser('shk', { email: 'dup@x.com', role: 'operator' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(state.inserted).toHaveLength(0); // nunca inseriu
  });

  it('[+] insere quando o e-mail está livre, preservando o papel', async () => {
    const { repo, state } = makeRepo({
      selects: [
        [TENANT('shk')],
        [], // get: sem usuários ainda
        [], // emailTakenElsewhere → livre
        [TENANT('shk')],
        [{ email: 'new@x.com', role: 'operator' }], // get final
      ],
    });
    const res = await repo.addUser('shk', { email: 'new@x.com', role: 'operator' });
    expect(state.inserted).toHaveLength(1);
    expect(state.inserted[0]).toMatchObject({
      instancia: 'shk',
      email: 'new@x.com',
      role: 'operator',
    });
    expect(res?.users.some((u) => u.email === 'new@x.com')).toBe(true);
  });
});

describe('TenantRepository.register (barrar)', () => {
  it('[-] recusa e-mail que já pertence a OUTRA instância', async () => {
    const { repo } = makeRepo({ selects: [[{ instancia: 'outra' }]] });
    await expect(repo.register('shk', 'dup@x.com')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

describe('TenantRepository.changeUserEmail (trocar e-mail de acesso)', () => {
  it('[+] troca o e-mail preservando o papel; o antigo sai', async () => {
    const { repo, state } = makeRepo({
      selects: [
        [TENANT('shk')],
        [{ email: 'old@x.com', role: 'admin' }], // get inicial
        [], // emailTakenElsewhere(novo) → livre
        [TENANT('shk')],
        [{ email: 'new@x.com', role: 'admin' }], // get final
      ],
      updateRow: [{ id: 'u1' }], // update achou o antigo
    });
    const res = await repo.changeUserEmail('shk', 'old@x.com', 'new@x.com');
    expect(state.updatedSet).toEqual({ email: 'new@x.com' });
    expect(res?.users).toEqual([{ email: 'new@x.com', role: 'admin' }]);
  });

  it('[-] recusa novo e-mail que pertence a OUTRA instância', async () => {
    const { repo } = makeRepo({
      selects: [
        [TENANT('shk')],
        [{ email: 'old@x.com', role: 'admin' }],
        [{ instancia: 'outra' }], // emailTakenElsewhere(novo) → em outra
      ],
    });
    await expect(
      repo.changeUserEmail('shk', 'old@x.com', 'tomado@x.com'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('[-] recusa quando o novo e-mail já existe na MESMA instância', async () => {
    const { repo } = makeRepo({
      selects: [
        [TENANT('shk')],
        [
          { email: 'old@x.com', role: 'admin' },
          { email: 'busy@x.com', role: 'operator' },
        ],
        [{ instancia: 'shk' }], // emailTakenElsewhere exclui a própria → null
      ],
    });
    await expect(
      repo.changeUserEmail('shk', 'old@x.com', 'busy@x.com'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('[-] NotFound quando o e-mail antigo não existe na instância', async () => {
    const { repo } = makeRepo({
      selects: [
        [TENANT('shk')],
        [{ email: 'someone@x.com', role: 'admin' }],
        [], // emailTakenElsewhere(novo) → livre
      ],
      updateRow: [], // update não achou o antigo → 0 linhas
    });
    await expect(
      repo.changeUserEmail('shk', 'ghost@x.com', 'new@x.com'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
