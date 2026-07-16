import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { QuickRepliesService } from './quick-replies.service';
import type { MediaRef } from './quick-replies.service';

/**
 * Stub do DB no estilo dos outros specs. Captura valores de insert/update/select/delete.
 * O select retorna rows configuráveis via `rows`.
 */
function makeDb(rows: any[] = []) {
  const captured: { insert?: any; set?: any; deleteWhere?: any } = {};

  const whereResult = {
    orderBy: vi.fn(async () => rows),
    // make it thenable so `await db.select().from().where()` also resolves
    then: (resolve: any) => Promise.resolve(rows).then(resolve),
  };
  const selectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn(() => whereResult),
  };

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
          returning: vi.fn(async () => [{ id: 'qr1', instancia: 'shk', name: 'n', content: 'c', shortcut: null, mediaId: null, mediaType: null, mediaMimetype: null, mediaFilename: null, mediaSize: null, ...s }]),
        })),
      };
    }),
  }));

  const del = vi.fn(() => ({
    where: vi.fn((cond: any) => {
      captured.deleteWhere = cond;
      return { returning: vi.fn(async () => rows.length > 0 ? rows : [{ id: 'qr1' }]) };
    }),
  }));

  const select = vi.fn(() => selectChain);

  return { db: { insert, update, delete: del, select } as any, captured, selectChain };
}

function makeStorage(existsResult = true) {
  return {
    exists: vi.fn(async () => existsResult),
    delete: vi.fn(async () => {}),
    put: vi.fn(),
    createReadStream: vi.fn(),
    stat: vi.fn(),
  };
}

const MEDIA_REF: MediaRef = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  type: 'image',
  mimetype: 'image/jpeg',
  filename: 'photo.jpg',
  size: 12345,
};

describe('QuickRepliesService — referencia de midia', () => {
  describe('create', () => {
    it('grava colunas media quando mediaId existe no storage', async () => {
      const { db, captured } = makeDb();
      const storage = makeStorage(true);
      const svc = new QuickRepliesService(db, storage as any);

      const result = await svc.create('shk', 'Catalogo', 'Segue o catalogo', undefined, MEDIA_REF);

      expect(storage.exists).toHaveBeenCalledWith('shk', MEDIA_REF.id);
      expect(captured.insert.mediaId).toBe(MEDIA_REF.id);
      expect(captured.insert.mediaType).toBe('image');
      expect(captured.insert.mediaMimetype).toBe('image/jpeg');
      expect(captured.insert.mediaFilename).toBe('photo.jpg');
      expect(captured.insert.mediaSize).toBe(12345);
      expect(result.media).toEqual({ id: MEDIA_REF.id, type: 'image', mimetype: 'image/jpeg', filename: 'photo.jpg', size: 12345 });
    });

    it('lanca BadRequestException quando mediaId nao existe no storage', async () => {
      const { db } = makeDb();
      const storage = makeStorage(false);
      const svc = new QuickRepliesService(db, storage as any);

      await expect(svc.create('shk', 'Catalogo', 'texto', undefined, MEDIA_REF)).rejects.toThrow(BadRequestException);
    });

    it('create sem media — media undefined no DTO resultado', async () => {
      const { db, captured } = makeDb();
      const storage = makeStorage(true);
      const svc = new QuickRepliesService(db, storage as any);

      const result = await svc.create('shk', 'Sem midia', 'apenas texto');

      expect(storage.exists).not.toHaveBeenCalled();
      expect(captured.insert.mediaId).toBeNull();
      expect(result.media).toBeUndefined();
    });
  });

  describe('update', () => {
    it('troca a midia: valida exists, grava nova, apaga a antiga', async () => {
      const oldRow = {
        id: 'qr1', instancia: 'shk', name: 'n', content: 'c', shortcut: null,
        mediaId: 'old-id-0000-0000-0000-000000000000',
        mediaType: 'image', mediaMimetype: 'image/png', mediaFilename: 'old.png', mediaSize: 999,
      };
      const { db } = makeDb([oldRow]);
      const storage = makeStorage(true);
      const svc = new QuickRepliesService(db, storage as any);

      await svc.update('shk', 'qr1', { media: MEDIA_REF });

      expect(storage.exists).toHaveBeenCalledWith('shk', MEDIA_REF.id);
      expect(storage.delete).toHaveBeenCalledWith('shk', oldRow.mediaId);
    });

    it('media: null — limpa colunas e apaga arquivo antigo', async () => {
      const oldRow = {
        id: 'qr1', instancia: 'shk', name: 'n', content: 'c', shortcut: null,
        mediaId: 'old-id-0000-0000-0000-000000000000',
        mediaType: 'image', mediaMimetype: 'image/png', mediaFilename: 'old.png', mediaSize: 999,
      };
      const { db, captured } = makeDb([oldRow]);
      const storage = makeStorage(true);
      const svc = new QuickRepliesService(db, storage as any);

      await svc.update('shk', 'qr1', { media: null });

      expect(captured.set.mediaId).toBeNull();
      expect(captured.set.mediaType).toBeNull();
      expect(captured.set.mediaMimetype).toBeNull();
      expect(storage.delete).toHaveBeenCalledWith('shk', oldRow.mediaId);
    });

    it('media undefined — nao mexe nas colunas de midia', async () => {
      const { db, captured } = makeDb([{ id: 'qr1', instancia: 'shk', name: 'n', content: 'c', shortcut: null, mediaId: null, mediaType: null, mediaMimetype: null, mediaFilename: null, mediaSize: null }]);
      const storage = makeStorage(true);
      const svc = new QuickRepliesService(db, storage as any);

      await svc.update('shk', 'qr1', { name: 'Novo nome' });

      expect(captured.set).not.toHaveProperty('mediaId');
      expect(storage.exists).not.toHaveBeenCalled();
      expect(storage.delete).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('chama storage.delete com o mediaId da linha antes de deletar', async () => {
      const row = {
        id: 'qr1', instancia: 'shk', name: 'n', content: 'c', shortcut: null,
        mediaId: 'mid-1111-2222-3333-444444444444',
        mediaType: 'image', mediaMimetype: 'image/jpeg', mediaFilename: 'f.jpg', mediaSize: 100,
      };
      const { db } = makeDb([row]);
      const storage = makeStorage(true);
      const svc = new QuickRepliesService(db, storage as any);

      await svc.remove('shk', 'qr1');

      expect(storage.delete).toHaveBeenCalledWith('shk', row.mediaId);
    });

    it('nao chama storage.delete se a linha nao tem mediaId', async () => {
      const row = { id: 'qr1', instancia: 'shk', name: 'n', content: 'c', shortcut: null, mediaId: null, mediaType: null, mediaMimetype: null, mediaFilename: null, mediaSize: null };
      const { db } = makeDb([row]);
      const storage = makeStorage(true);
      const svc = new QuickRepliesService(db, storage as any);

      await svc.remove('shk', 'qr1');

      expect(storage.delete).not.toHaveBeenCalled();
    });
  });

  describe('toDto', () => {
    it('serializa media quando mediaId presente', async () => {
      const row = {
        id: 'qr1', instancia: 'shk', name: 'n', content: 'c', shortcut: null,
        mediaId: MEDIA_REF.id, mediaType: 'image', mediaMimetype: 'image/jpeg', mediaFilename: 'photo.jpg', mediaSize: 12345,
      };
      const { db } = makeDb([row]);
      const storage = makeStorage(true);
      const svc = new QuickRepliesService(db, storage as any);

      const list = await svc.list('shk');

      expect(list[0].media).toEqual({ id: MEDIA_REF.id, type: 'image', mimetype: 'image/jpeg', filename: 'photo.jpg', size: 12345 });
    });

    it('media undefined quando mediaId ausente', async () => {
      const row = { id: 'qr1', instancia: 'shk', name: 'n', content: 'c', shortcut: null, mediaId: null, mediaType: null, mediaMimetype: null, mediaFilename: null, mediaSize: null };
      const { db } = makeDb([row]);
      const storage = makeStorage(true);
      const svc = new QuickRepliesService(db, storage as any);

      const list = await svc.list('shk');

      expect(list[0].media).toBeUndefined();
    });
  });
});
