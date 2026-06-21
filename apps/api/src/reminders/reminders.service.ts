import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { and, asc, eq, lte } from 'drizzle-orm';
import { DB, type Database } from '../core/db/db.module';
import { reminders } from '../core/db/schema';
import type { Reminder, ReminderStatus } from '@nexus/shared';
import type { ReminderRow } from '../core/db/schema';
import { EventPublisher } from '../realtime/event.publisher';

@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly publisher: EventPublisher,
  ) {}

  private toDto(row: ReminderRow): Reminder {
    return {
      id: row.id,
      instancia: row.instancia,
      jid: row.jid,
      text: row.text,
      triggerAt: row.triggerAt.getTime(),
      createdBy: row.createdBy,
      status: row.status as ReminderStatus,
    };
  }

  async create(
    instancia: string,
    jid: string,
    text: string,
    triggerAt: number,
    createdBy: string,
  ): Promise<Reminder> {
    const id = randomUUID();
    const [row] = await this.db
      .insert(reminders)
      .values({
        id,
        instancia,
        jid,
        text,
        triggerAt: new Date(triggerAt),
        createdBy,
        status: 'pending',
      })
      .returning();
    this.logger.log(
      `Reminder created: ${id} for ${instancia}/${jid} at ${new Date(triggerAt).toISOString()}`,
    );
    return this.toDto(row);
  }

  async list(instancia: string, status?: ReminderStatus): Promise<Reminder[]> {
    const where = status
      ? and(eq(reminders.instancia, instancia), eq(reminders.status, status))
      : eq(reminders.instancia, instancia);
    const rows = await this.db
      .select()
      .from(reminders)
      .where(where)
      .orderBy(asc(reminders.triggerAt));
    return rows.map((r) => this.toDto(r));
  }

  async update(
    instancia: string,
    id: string,
    updates: { text?: string; triggerAt?: number; status?: ReminderStatus },
  ): Promise<Reminder> {
    const set: Partial<ReminderRow> = {};
    if (updates.text !== undefined) set.text = updates.text;
    if (updates.status !== undefined) set.status = updates.status;
    if (updates.triggerAt !== undefined) set.triggerAt = new Date(updates.triggerAt);

    const [row] = await this.db
      .update(reminders)
      .set(set)
      .where(and(eq(reminders.id, id), eq(reminders.instancia, instancia)))
      .returning();
    if (!row) {
      throw new NotFoundException(`Reminder ${id} not found`);
    }
    this.logger.log(`Reminder updated: ${id} for ${instancia}`);
    return this.toDto(row);
  }

  async remove(instancia: string, id: string): Promise<void> {
    const deleted = await this.db
      .delete(reminders)
      .where(and(eq(reminders.id, id), eq(reminders.instancia, instancia)))
      .returning({ id: reminders.id });
    if (deleted.length === 0) {
      throw new NotFoundException(`Reminder ${id} not found`);
    }
    this.logger.log(`Reminder deleted: ${id} for ${instancia}`);
  }

  /**
   * Dispara lembretes vencidos. Antes varria todas as sorted sets `reminders:*`
   * (O(keyspace)); agora é uma única query indexada por (status, trigger_at).
   */
  async processDueReminders(): Promise<void> {
    const due = await this.db
      .select()
      .from(reminders)
      .where(and(eq(reminders.status, 'pending'), lte(reminders.triggerAt, new Date())));

    for (const row of due) {
      try {
        // Marca como triggered de forma condicional — se outra réplica já pegou,
        // o WHERE status='pending' garante que só uma dispara o evento.
        const claimed = await this.db
          .update(reminders)
          .set({ status: 'triggered' })
          .where(and(eq(reminders.id, row.id), eq(reminders.status, 'pending')))
          .returning({ id: reminders.id });
        if (claimed.length === 0) continue;

        await this.publisher.publish({
          type: 'note.added', // Reaproveita note.added para a notificação de lembrete
          instancia: row.instancia,
          jid: row.jid,
          ts: Date.now(),
          payload: {
            reminderId: row.id,
            text: row.text,
            reminderTriggered: true,
          },
        });

        this.logger.log(`Reminder triggered: ${row.id} for ${row.instancia}/${row.jid}`);
      } catch (err: any) {
        this.logger.warn(`Failed to process reminder ${row.id}: ${err.message}`);
      }
    }
  }
}
