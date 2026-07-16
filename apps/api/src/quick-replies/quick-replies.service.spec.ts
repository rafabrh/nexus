import { describe, it, expect, vi } from 'vitest';
import { QuickRepliesService } from './quick-replies.service';

/**
 * Contrato de imagem no template de resposta rápida. A imagem (base64) e o
 * mimetype são um par indissociável, persistidos no Postgres para durar entre
 * logins/rebuilds. Stub do Drizzle no estilo dos outros specs: captura os
 * valores de insert()/update().set() para asserção.
 */
function makeDb() {
  const captured: { insert?: any; set?: any } = {};

  const insert = vi.fn(() => ({
    values: vi.fn((v: any) => {
      captured.insert = v;
      return { returning: vi.fn(async () => [v]) };
    }),
  }));

  const update = vi.fn(() => ({
    set: vi.fn((s: any) => {
      captured.set = s;
      return {
        where: vi.fn(() => ({
          returning: vi.fn(async () => [{ id: 'qr1', name: 'n', content: 'c', ...s }]),
        })),
      };
    }),
  }));

  return { db: { insert, update } as any, captured };
}

describe('QuickRepliesService imagem no template', () => {
  it('grava image + imageMimetype no create quando o par vem completo', async () => {
    const { db, captured } = makeDb();
    const svc = new QuickRepliesService(db);

    await svc.create('shk', 'Catalogo', 'Segue o catalogo', undefined, 'BASE64DATA', 'image/jpeg');

    expect(captured.insert.image).toBe('BASE64DATA');
    expect(captured.insert.imageMimetype).toBe('image/jpeg');
  });

  it('NAO grava imagem no create quando falta o mimetype (par incompleto)', async () => {
    const { db, captured } = makeDb();
    const svc = new QuickRepliesService(db);

    await svc.create('shk', 'Catalogo', 'texto', undefined, 'BASE64DATA', undefined);

    expect(captured.insert.image).toBeNull();
    expect(captured.insert.imageMimetype).toBeNull();
  });

  it('remove a imagem no update quando image === "" (limpa o par)', async () => {
    const { db, captured } = makeDb();
    const svc = new QuickRepliesService(db);

    await svc.update('shk', 'qr1', { image: '', imageMimetype: '' });

    expect(captured.set.image).toBeNull();
    expect(captured.set.imageMimetype).toBeNull();
  });

  it('nao toca na imagem no update quando o campo image nao vem', async () => {
    const { db, captured } = makeDb();
    const svc = new QuickRepliesService(db);

    await svc.update('shk', 'qr1', { name: 'Novo nome' });

    expect(captured.set).not.toHaveProperty('image');
    expect(captured.set).not.toHaveProperty('imageMimetype');
  });
});
