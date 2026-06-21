import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { DB, type Database } from '../core/db/db.module';
import { quickReplies } from '../core/db/schema';
import type { QuickReply } from '@nexus/shared';
import type { QuickReplyRow } from '../core/db/schema';

@Injectable()
export class QuickRepliesService {
  private readonly logger = new Logger(QuickRepliesService.name);

  constructor(@Inject(DB) private readonly db: Database) {}

  private toDto(row: QuickReplyRow): QuickReply {
    return {
      id: row.id,
      name: row.name,
      content: row.content,
      shortcut: row.shortcut ?? undefined,
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

  async create(
    instancia: string,
    name: string,
    content: string,
    shortcut?: string,
  ): Promise<QuickReply> {
    const id = randomUUID();
    const [row] = await this.db
      .insert(quickReplies)
      .values({ id, instancia, name, content, shortcut: shortcut ?? null })
      .returning();
    this.logger.log(`Quick reply created: ${id} for ${instancia}`);
    return this.toDto(row);
  }

  async update(
    instancia: string,
    id: string,
    updates: { name?: string; content?: string; shortcut?: string },
  ): Promise<QuickReply> {
    const set: Partial<QuickReplyRow> = {};
    if (updates.name !== undefined) set.name = updates.name;
    if (updates.content !== undefined) set.content = updates.content;
    if (updates.shortcut !== undefined) set.shortcut = updates.shortcut;

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
    const deleted = await this.db
      .delete(quickReplies)
      .where(and(eq(quickReplies.id, id), eq(quickReplies.instancia, instancia)))
      .returning({ id: quickReplies.id });
    if (deleted.length === 0) {
      throw new NotFoundException(`Quick reply ${id} not found`);
    }
    this.logger.log(`Quick reply deleted: ${id} for ${instancia}`);
  }
}
