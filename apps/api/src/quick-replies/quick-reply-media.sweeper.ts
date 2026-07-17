import { Injectable, Inject, Logger } from '@nestjs/common';
import { isNotNull, eq } from 'drizzle-orm';
import { MEDIA_STORAGE, type MediaStorage } from '../media/media-storage.interface';
import { DB, type Database } from '../core/db/db.module';
import { quickReplies } from '../core/db/schema';

/**
 * Varre o armazenamento de mídia e remove arquivos órfãos de quick-replies.
 *
 * Um arquivo é considerado órfão quando não há linha em `quick_replies` com o
 * mesmo `media_id` para a instância. Arquivos criados há menos de TTL_MS não
 * são apagados para proteger uploads em andamento.
 *
 * **Agendamento:** @nestjs/schedule não está no projeto. Exponha `sweep()` e
 * chame-o manualmente (endpoint admin, cron externo, etc.) até que o módulo de
 * schedule seja adicionado. Quando isso ocorrer, adicione `@Interval('qr-media-sweep', 6*60*60*1000)`
 * sobre o método.
 */
@Injectable()
export class QuickReplyMediaSweeper {
  private readonly logger = new Logger(QuickReplyMediaSweeper.name);

  /** Arquivos mais novos que isso são poupados (upload em andamento). */
  static readonly TTL_MS = 24 * 60 * 60 * 1000;

  constructor(
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
    @Inject(DB) private readonly db: Database,
  ) {}

  async sweep(): Promise<{ scanned: number; deleted: number }> {
    const tenants = await this.storage.listTenants();
    let scanned = 0;
    let deleted = 0;
    const cutoff = Date.now() - QuickReplyMediaSweeper.TTL_MS;

    for (const inst of tenants) {
      const files = await this.storage.listMediaIds(inst);
      scanned += files.length;
      if (files.length === 0) continue;

      // Busca todos os media_ids em uso para este tenant
      const rows = await this.db
        .select({ mediaId: quickReplies.mediaId })
        .from(quickReplies)
        .where(eq(quickReplies.instancia, inst));

      const inUse = new Set(rows.map((r) => r.mediaId).filter(Boolean) as string[]);

      for (const file of files) {
        if (inUse.has(file.id)) continue;
        if (file.mtimeMs > cutoff) continue; // arquivo recente, pode ser upload em andamento

        try {
          await this.storage.delete(inst, file.id);
          deleted++;
          this.logger.debug(`Órfão removido: ${inst}/${file.id}`);
        } catch (err) {
          this.logger.warn(`Falha ao remover órfão ${inst}/${file.id}: ${err}`);
        }
      }
    }

    this.logger.log(`Sweep concluído: scanned=${scanned} deleted=${deleted}`);
    return { scanned, deleted };
  }
}
