import { Global, Module } from '@nestjs/common';
import { ConversationRepository } from './conversation.repository';
import { ConversationIndexService } from './conversation-index.service';
import { ConversationProjectionService } from './conversation-projection.service';

/**
 * Módulo global de dados de conversa. Expõe:
 *  - ConversationRepository — leitura do estado operacional no Redis
 *  - ConversationIndexService — índice de descoberta por tenant no Redis
 *  - ConversationProjectionService — projeção durável no Postgres
 *
 * Tudo aqui depende apenas de providers globais (Redis, DB, TenantRepository), o
 * que evita o ciclo Conversation↔Realtime e permite que a projeção dependa do
 * índice (direção correta) sem acoplar os módulos de feature. Consumido pelo
 * KeyspaceListener (realtime), ConversationService, WebhookService, SyncService e
 * DashboardService.
 */
@Global()
@Module({
  providers: [ConversationRepository, ConversationIndexService, ConversationProjectionService],
  exports: [ConversationRepository, ConversationIndexService, ConversationProjectionService],
})
export class ConversationDataModule {}
