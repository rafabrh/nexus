import { Global, Module } from '@nestjs/common';
import { ConversationRepository } from './conversation.repository';
import { ConversationIndexService } from './conversation-index.service';
import { ConversationProjectionService } from './conversation-projection.service';
import { MessageArchiveRepository } from './message-archive.repository';
import { MessageArchiveService } from './message-archive.service';
import { ChathistoryBackfillCommand } from './chathistory-backfill.command';

/**
 * Módulo global de dados de conversa. Expõe:
 *  - ConversationRepository — leitura do estado operacional no Redis
 *  - ConversationIndexService — índice de descoberta por tenant no Redis
 *  - ConversationProjectionService — projeção durável no Postgres
 *  - MessageArchiveRepository — persistência do archive de chathistory no Postgres
 *  - MessageArchiveService — write-behind coalescido do chathistory (tiering)
 *
 * Tudo aqui depende apenas de providers globais (Redis, DB, TenantRepository), o
 * que evita o ciclo Conversation↔Realtime e permite que a projeção dependa do
 * índice (direção correta) sem acoplar os módulos de feature. Consumido pelo
 * KeyspaceListener (realtime), ConversationService, WebhookService, SyncService e
 * DashboardService.
 */
@Global()
@Module({
  providers: [
    ConversationRepository,
    ConversationIndexService,
    ConversationProjectionService,
    MessageArchiveRepository,
    MessageArchiveService,
    ChathistoryBackfillCommand,
  ],
  exports: [
    ConversationRepository,
    ConversationIndexService,
    ConversationProjectionService,
    MessageArchiveRepository,
    MessageArchiveService,
  ],
})
export class ConversationDataModule {}
