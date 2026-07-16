import type { Readable } from 'stream';

export const MEDIA_STORAGE = Symbol('MEDIA_STORAGE');

export interface StoredMedia {
  id: string;
  mimetype: string;
  size: number;
  filename: string;
}

export interface MediaStorage {
  put(instancia: string, stream: Readable, meta: { mimetype: string; filename: string }): Promise<StoredMedia>;
  createReadStream(instancia: string, mediaId: string): Readable;
  stat(instancia: string, mediaId: string): Promise<{ size: number } | null>;
  delete(instancia: string, mediaId: string): Promise<void>;
  exists(instancia: string, mediaId: string): Promise<boolean>;
}
