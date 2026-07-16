import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { Readable } from 'stream';
import { DiskMediaStorage } from './disk-media.storage';

function makeStorage(root: string) {
  const configService = { get: (key: string, def?: string) => (key === 'MEDIA_ROOT' ? root : def) } as any;
  return new DiskMediaStorage(configService);
}

describe('DiskMediaStorage', () => {
  let root: string;
  let storage: DiskMediaStorage;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'media-'));
    storage = makeStorage(root);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('put grava arquivo e devolve id uuid e size correto', async () => {
    const content = 'hello media';
    const stream = Readable.from([content]);
    const result = await storage.put('inst1', stream, { mimetype: 'image/jpeg', filename: 'test.jpg' });

    expect(result.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.size).toBe(Buffer.byteLength(content));
    expect(result.mimetype).toBe('image/jpeg');
    expect(result.filename).toBe('test.jpg');
    expect(await storage.exists('inst1', result.id)).toBe(true);
  });

  it('isolamento por tenant: exists em outro tenant retorna false', async () => {
    const stream = Readable.from(['data']);
    const result = await storage.put('inst1', stream, { mimetype: 'image/png', filename: 'a.png' });
    expect(await storage.exists('outro', result.id)).toBe(false);
  });

  it('delete remove o arquivo (exists false depois)', async () => {
    const stream = Readable.from(['data']);
    const result = await storage.put('inst1', stream, { mimetype: 'image/png', filename: 'b.png' });
    await storage.delete('inst1', result.id);
    expect(await storage.exists('inst1', result.id)).toBe(false);
  });

  it('rejeita mediaId com path traversal', async () => {
    await expect(storage.exists('inst1', '../../etc/passwd')).rejects.toThrow();
    await expect(storage.delete('inst1', '../../etc/passwd')).rejects.toThrow();
    await expect(storage.stat('inst1', '../../etc/passwd')).rejects.toThrow();
  });
});
