import { Injectable, Inject, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { DB, type Database } from '../core/db/db.module';
import { quickReplies } from '../core/db/schema';
import type { QuickReplyRow } from '../core/db/schema';
import type { QuickReply } from '@nexus/shared';
import { MEDIA_STORAGE, type MediaStorage } from '../media/media-storage.interface';

export interface MediaRef {
  id: string;
  type: 'image' | 'video';
  mimetype: string;
  filename: string;
  size: number;
}

@Injectable()
export class QuickRepliesService {
  private readonly logger = new Logger(QuickRepliesService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
  ) {}

  private toDto(row: QuickReplyRow): QuickReply {
    return {
      id: row.id,
      name: row.name,
      content: row.content,
      shortcut: row.shortcut ?? undefined,
      media:
        row.mediaId && row.mediaType && row.mediaMimetype
          ? {
              id: row.mediaId,
              type: row.mediaType as 'image' | 'video',
              mimetype: row.mediaMimetype,
              filename: row.mediaFilename ?? '',
              size: row.mediaSize ?? 0,
            }
          : undefined,
    };
  }

  async list(instancia: string): Promise<QuickReply[]> {
    const rows = await this.db
      .select()
      .from(quickReplies)
      .where(eq(quickReplies.instancia, instancia))
      .orderBy(quickReplies.name);
    return rows.map((r) => this.toDto(r));
  }

  /** SELECT where instancia + id; throws NotFoundException if missing. */
  async getOwned(instancia: string, id: string): Promise<QuickReplyRow> {
    const rows = await this.db
      .select()
      .from(quickReplies)
      .where(and(eq(quickReplies.id, id), eq(quickReplies.instancia, instancia)));
    if (!rows[0]) throw new NotFoundException(`Quick reply ${id} not found`);
    return rows[0];
  }

  /** SELECT where instancia + media_id — used by upload endpoint to validate ownership. */
  async findByMediaId(instancia: string, mediaId: string): Promise<QuickReplyRow | null> {
    const rows = await this.db
      .select()
      .from(quickReplies)
      .where(and(eq(quickReplies.mediaId, mediaId), eq(quickReplies.instancia, instancia)));
    return rows[0] ?? null;
  }

  async create(
    instancia: string,
    name: string,
    content: string,
    shortcut?: string,
    media?: MediaRef,
  ): Promise<QuickReply> {
    if (media) {
      const found = await this.storage.exists(instancia, media.id);
      if (!found) {
        throw new BadRequestException(`Media ${media.id} not found in storage`);
      }
    }

    const id = randomUUID();
    const [row] = await this.db
      .insert(quickReplies)
      .values({
        id,
        instancia,
        name,
        content,
        shortcut: shortcut ?? null,
        mediaId: media?.id ?? null,
        mediaType: media?.type ?? null,
        mediaMimetype: media?.mimetype ?? null,
        mediaFilename: media?.filename ?? null,
        mediaSize: media?.size ?? null,
      })
      .returning();
    this.logger.log(`Quick reply created: ${id} for ${instancia}`);
    return this.toDto(row);
  }

  async update(
    instancia: string,
    id: string,
    updates: {
      name?: string;
      content?: string;
      shortcut?: string;
      media?: MediaRef | null;
    },
  ): Promise<QuickReply> {
    const set: Partial<QuickReplyRow> = {};
    if (updates.name !== undefined) set.name = updates.name;
    if (updates.content !== undefined) set.content = updates.content;
    if (updates.shortcut !== undefined) set.shortcut = updates.shortcut;

    if (updates.media !== undefined) {
      if (updates.media === null) {
        // Limpar mídia: busca linha atual para saber o mediaId a deletar
        const current = await this.getOwned(instancia, id);
        set.mediaId = null;
        set.mediaType = null;
        set.mediaMimetype = null;
        set.mediaFilename = null;
        set.mediaSize = null;
        if (current.mediaId) {
          await this.storage.delete(instancia, current.mediaId).catch((e) =>
            this.logger.warn(`Falha ao deletar arquivo de midia ${current.mediaId}: ${e}`),
          );
        }
      } else {
        // Trocar mídia
        const found = await this.storage.exists(instancia, updates.media.id);
        if (!found) {
          throw new BadRequestException(`Media ${updates.media.id} not found in storage`);
        }
        const current = await this.getOwned(instancia, id);
        set.mediaId = updates.media.id;
        set.mediaType = updates.media.type;
        set.mediaMimetype = updates.media.mimetype;
        set.mediaFilename = updates.media.filename;
        set.mediaSize = updates.media.size;
        if (current.mediaId && current.mediaId !== updates.media.id) {
          await this.storage.delete(instancia, current.mediaId).catch((e) =>
            this.logger.warn(`Falha ao deletar arquivo de midia anterior ${current.mediaId}: ${e}`),
          );
        }
      }
    }

    const [row] = await this.db
      .update(quickReplies)
      .set(set)
      .where(and(eq(quickReplies.id, id), eq(quickReplies.instancia, instancia)))
      .returning();
    if (!row) {
      throw new NotFoundException(`Quick reply ${id} not found`);
    }
    this.logger.log(`Quick reply updated: ${id} for ${instancia}`);
    return this.toDto(row);
  }

  async remove(instancia: string, id: string): Promise<void> {
    // Busca a linha antes de deletar para obter mediaId
    const current = await this.getOwned(instancia, id);

    const deleted = await this.db
      .delete(quickReplies)
      .where(and(eq(quickReplies.id, id), eq(quickReplies.instancia, instancia)))
      .returning({ id: quickReplies.id });
    if (deleted.length === 0) {
      throw new NotFoundException(`Quick reply ${id} not found`);
    }

    if (current.mediaId) {
      await this.storage.delete(instancia, current.mediaId).catch((e) =>
        this.logger.warn(`Falha ao deletar arquivo de midia ${current.mediaId} ao remover quick reply: ${e}`),
      );
    }

    this.logger.log(`Quick reply deleted: ${id} for ${instancia}`);
  }
}
