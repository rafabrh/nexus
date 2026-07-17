import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QuickReplyMediaSweeper } from './quick-reply-media.sweeper';
import { MEDIA_STORAGE } from '../media/media-storage.interface';
import { DB } from '../core/db/db.module';

const NOW = Date.now();
const H25 = 25 * 60 * 60 * 1000;

function makeStorage(overrides: Partial<ReturnType<typeof defaultStorage>> = {}) {
  return Object.assign(defaultStorage(), overrides);
}

function defaultStorage() {
  return {
    listTenants: vi.fn(async () => ['shk']),
    listMediaIds: vi.fn(async (_inst: string) => [
      { id: 'em-uso-uuid-1234-5678-90ab-cdef01234567', mtimeMs: NOW - H25 },
      { id: 'orfao-velho-1234-5678-90ab-cdef01234567', mtimeMs: NOW - H25 },
      { id: 'orfao-novo-12-1234-5678-90ab-cdef012345', mtimeMs: NOW - 1000 },
    ]),
    delete: vi.fn(async () => {}),
    put: vi.fn(),
    createReadStream: vi.fn(),
    stat: vi.fn(),
    exists: vi.fn(),
  };
}

function makeDb(mediaIds: string[]) {
  // Simula db.select().from().where() chainable retornando rows
  const rows = mediaIds.map((id) => ({ mediaId: id }));
  const queryChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(rows),
  };
  return {
    select: vi.fn(() => queryChain),
    _queryChain: queryChain,
  };
}

describe('QuickReplyMediaSweeper', () => {
  let storage: ReturnType<typeof makeStorage>;
  let db: ReturnType<typeof makeDb>;
  let sweeper: QuickReplyMediaSweeper;

  beforeEach(() => {
    storage = makeStorage();
    db = makeDb(['em-uso-uuid-1234-5678-90ab-cdef01234567']);
    sweeper = new QuickReplyMediaSweeper(
      storage as any,
      db as any,
    );
  });

  it('apaga somente o arquivo orfao velho, nao o em-uso nem o orfao recente', async () => {
    const result = await sweeper.sweep();

    expect(storage.delete).toHaveBeenCalledTimes(1);
    expect(storage.delete).toHaveBeenCalledWith('shk', 'orfao-velho-1234-5678-90ab-cdef01234567');
  });

  it('retorna scanned=3 e deleted=1', async () => {
    const result = await sweeper.sweep();

    expect(result.scanned).toBe(3);
    expect(result.deleted).toBe(1);
  });

  it('nao quebra quando listMediaIds retorna vazio (tenant sem arquivos)', async () => {
    storage.listMediaIds.mockResolvedValue([]);
    db = makeDb([]);
    sweeper = new QuickReplyMediaSweeper(storage as any, db as any);

    const result = await sweeper.sweep();

    expect(result.scanned).toBe(0);
    expect(result.deleted).toBe(0);
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('nao quebra quando listTenants retorna vazio (diretorio inexistente)', async () => {
    storage.listTenants.mockResolvedValue([]);
    sweeper = new QuickReplyMediaSweeper(storage as any, db as any);

    const result = await sweeper.sweep();

    expect(result.scanned).toBe(0);
    expect(result.deleted).toBe(0);
  });
});
