import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { createReadStream, createWriteStream } from 'fs';
import { mkdir, stat as fsStat, unlink, access } from 'fs/promises';
import { join } from 'path';
import { pipeline } from 'stream/promises';
import type { Readable } from 'stream';
import type { MediaStorage, StoredMedia } from './media-storage.interface';

const INSTANCIA_RE = /^[A-Za-z0-9_-]+$/;
const MEDIA_ID_RE = /^[0-9a-f-]{36}$/;

@Injectable()
export class DiskMediaStorage implements MediaStorage {
  private readonly root: string;

  constructor(private readonly config: ConfigService) {
    this.root = this.config.get<string>('MEDIA_ROOT', '/data/media');
  }

  private validateInstancia(instancia: string): void {
    if (!INSTANCIA_RE.test(instancia)) {
      throw new BadRequestException(`Invalid instancia: ${instancia}`);
    }
  }

  private validateMediaId(mediaId: string): void {
    if (!MEDIA_ID_RE.test(mediaId)) {
      throw new BadRequestException(`Invalid mediaId: ${mediaId}`);
    }
  }

  private dir(instancia: string): string {
    return join(this.root, instancia, 'quick-replies');
  }

  private filePath(instancia: string, mediaId: string): string {
    return join(this.dir(instancia), mediaId);
  }

  async put(instancia: string, stream: Readable, meta: { mimetype: string; filename: string }): Promise<StoredMedia> {
    this.validateInstancia(instancia);
    const id = randomUUID();
    const dir = this.dir(instancia);
    await mkdir(dir, { recursive: true });
    const dest = this.filePath(instancia, id);
    await pipeline(stream, createWriteStream(dest));
    const { size } = await fsStat(dest);
    return { id, mimetype: meta.mimetype, size, filename: meta.filename };
  }

  createReadStream(instancia: string, mediaId: string): Readable {
    this.validateInstancia(instancia);
    this.validateMediaId(mediaId);
    return createReadStream(this.filePath(instancia, mediaId));
  }

  async stat(instancia: string, mediaId: string): Promise<{ size: number } | null> {
    this.validateInstancia(instancia);
    this.validateMediaId(mediaId);
    try {
      const s = await fsStat(this.filePath(instancia, mediaId));
      return { size: s.size };
    } catch {
      return null;
    }
  }

  async delete(instancia: string, mediaId: string): Promise<void> {
    this.validateInstancia(instancia);
    this.validateMediaId(mediaId);
    await unlink(this.filePath(instancia, mediaId));
  }

  async exists(instancia: string, mediaId: string): Promise<boolean> {
    this.validateInstancia(instancia);
    this.validateMediaId(mediaId);
    try {
      await access(this.filePath(instancia, mediaId));
      return true;
    } catch {
      return false;
    }
  }
}
