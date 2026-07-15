import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { DB, type Database } from '../core/db/db.module';
import { funnelStages, conversations } from '../core/db/schema';
import type { FunnelStageDto } from '@nexus/shared';
import type { FunnelStageRow } from '../core/db/schema';

@Injectable()
export class FunnelStagesService {
  private readonly logger = new Logger(FunnelStagesService.name);

  constructor(@Inject(DB) private readonly db: Database) {}

  private toDto(row: FunnelStageRow): FunnelStageDto {
    return {
      id: row.id,
      key: row.key,
      label: row.label,
      color: row.color,
      order: row.order,
    };
  }

  /**
   * Slug kebab-case do rótulo. Base para o `key` estável de uma coluna nova.
   * Remove acentos, colapsa não-alfanuméricos em `-` e apara as bordas. Vazio
   * (rótulo só com símbolos) cai em `stage` para nunca gerar key em branco.
   */
  private slugify(label: string): string {
    // NFD decompõe acentos (á -> a + marca combinante); o filtro ASCII abaixo
    // descarta as marcas combinantes junto com qualquer outro não-alfanumérico,
    // então não é preciso um character-class de marcas combinantes explícito.
    const base = label
      .normalize('NFD')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return base || 'stage';
  }

  /**
   * Gera um `key` único por-tenant a partir do rótulo. Se o slug já existe para
   * o tenant, sufixa `-2`, `-3`, … até achar um livre. O unique `(instancia,key)`
   * no banco é a barreira final; isto evita a colisão antes do INSERT.
   */
  private async uniqueKey(instancia: string, label: string): Promise<string> {
    const base = this.slugify(label);
    const existing = await this.db
      .select({ key: funnelStages.key })
      .from(funnelStages)
      .where(eq(funnelStages.instancia, instancia));
    const taken = new Set(existing.map((r) => r.key));
    if (!taken.has(base)) return base;
    let n = 2;
    while (taken.has(`${base}-${n}`)) n += 1;
    return `${base}-${n}`;
  }

  async list(instancia: string): Promise<FunnelStageDto[]> {
    const rows = await this.db
      .select()
      .from(funnelStages)
      .where(eq(funnelStages.instancia, instancia))
      .orderBy(funnelStages.order);
    return rows.map((r) => this.toDto(r));
  }

  async create(
    instancia: string,
    input: { label: string; color: string },
  ): Promise<FunnelStageDto> {
    const key = await this.uniqueKey(instancia, input.label);
    // order = max+1 do tenant (nova coluna vai pro fim). COALESCE cobre o tenant
    // sem estágios (max NULL) => começa em 0.
    const [{ nextOrder }] = await this.db
      .select({
        nextOrder: sql<number>`COALESCE(MAX(${funnelStages.order}), -1) + 1`,
      })
      .from(funnelStages)
      .where(eq(funnelStages.instancia, instancia));

    const id = randomUUID();
    const [row] = await this.db
      .insert(funnelStages)
      .values({
        id,
        instancia,
        key,
        label: input.label,
        color: input.color,
        order: nextOrder,
      })
      .returning();
    this.logger.log(`Funnel stage created: ${id} (${key}) for ${instancia}`);
    return this.toDto(row);
  }

  async update(
    instancia: string,
    id: string,
    updates: { label?: string; color?: string; order?: number },
  ): Promise<FunnelStageDto> {
    // `key` NUNCA muda no update — renomear altera só o `label`, preservando o
    // vínculo com `conversations.stage` e o Redis `followup_step`.
    const set: Partial<FunnelStageRow> = {};
    if (updates.label !== undefined) set.label = updates.label;
    if (updates.color !== undefined) set.color = updates.color;
    if (updates.order !== undefined) set.order = updates.order;

    if (Object.keys(set).length === 0) {
      throw new BadRequestException('Nada para atualizar');
    }

    const [row] = await this.db
      .update(funnelStages)
      .set(set)
      .where(and(eq(funnelStages.id, id), eq(funnelStages.instancia, instancia)))
      .returning();
    if (!row) {
      throw new NotFoundException(`Estágio ${id} não encontrado`);
    }
    this.logger.log(`Funnel stage updated: ${id} for ${instancia}`);
    return this.toDto(row);
  }

  /**
   * Exclui um estágio — bloqueando (D4) se houver QUALQUER conversa parada nele.
   * `conversations.stage` guarda o `key`, então contamos por `(instancia, key)`.
   * count > 0 → 409 `{ message, count }`; o cliente move os cards antes.
   */
  async remove(instancia: string, id: string): Promise<void> {
    const [stage] = await this.db
      .select({ key: funnelStages.key })
      .from(funnelStages)
      .where(and(eq(funnelStages.id, id), eq(funnelStages.instancia, instancia)));
    if (!stage) {
      throw new NotFoundException(`Estágio ${id} não encontrado`);
    }

    const [{ count }] = await this.db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(conversations)
      .where(
        and(
          eq(conversations.instancia, instancia),
          eq(conversations.stage, stage.key),
        ),
      );

    if (count > 0) {
      throw new ConflictException({
        message: `Existem ${count} conversa(s) nesta coluna. Mova-as antes de excluir.`,
        count,
      });
    }

    await this.db
      .delete(funnelStages)
      .where(and(eq(funnelStages.id, id), eq(funnelStages.instancia, instancia)));
    this.logger.log(`Funnel stage deleted: ${id} (${stage.key}) for ${instancia}`);
  }

  /**
   * Reordena os estágios em lote, transacionalmente. Recebe os ids na ordem
   * desejada; grava `order = índice`. Valida que todos os ids pertencem ao
   * tenant (rejeita id estranho/de outro tenant) para não reordenar parcial nem
   * vazar entre tenants. Retorna a lista já reordenada.
   */
  async reorder(instancia: string, ids: string[]): Promise<FunnelStageDto[]> {
    const unique = new Set(ids);
    if (unique.size !== ids.length) {
      throw new BadRequestException('IDs duplicados em reorder');
    }

    return this.db.transaction(async (tx) => {
      const owned = await tx
        .select({ id: funnelStages.id })
        .from(funnelStages)
        .where(
          and(
            eq(funnelStages.instancia, instancia),
            inArray(funnelStages.id, ids),
          ),
        );
      if (owned.length !== ids.length) {
        throw new BadRequestException(
          'Lista de reorder não corresponde aos estágios do tenant',
        );
      }

      for (let i = 0; i < ids.length; i += 1) {
        await tx
          .update(funnelStages)
          .set({ order: i })
          .where(
            and(
              eq(funnelStages.id, ids[i]),
              eq(funnelStages.instancia, instancia),
            ),
          );
      }

      const rows = await tx
        .select()
        .from(funnelStages)
        .where(eq(funnelStages.instancia, instancia))
        .orderBy(funnelStages.order);
      this.logger.log(`Funnel stages reordered (${ids.length}) for ${instancia}`);
      return rows.map((r) => this.toDto(r));
    });
  }

  /**
   * Verifica se um `key` de estágio pertence ao tenant. Usado pela validação em
   * runtime do `updateStage` (o funil agora é dinâmico; não há mais enum fixo).
   */
  async keyExists(instancia: string, key: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: funnelStages.id })
      .from(funnelStages)
      .where(and(eq(funnelStages.instancia, instancia), eq(funnelStages.key, key)))
      .limit(1);
    return !!row;
  }
}
