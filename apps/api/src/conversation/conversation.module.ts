import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversation.service';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { FunnelModule } from '../funnel/funnel.module';
import { QuickRepliesModule } from '../quick-replies/quick-replies.module';

// ConversationRepository, ConversationIndexService e ConversationProjectionService
// vêm do ConversationDataModule (@Global) — não são providos aqui para evitar
// instância duplicada e o ciclo Conversation↔Realtime.
// FunnelModule provê FunnelStagesService para validar o key do updateStage.
// QuickRepliesModule provê QuickRepliesService para sendQuickReply.
@Module({
  imports: [AuthModule, WhatsAppModule, RealtimeModule, FunnelModule, QuickRepliesModule],
  controllers: [ConversationController],
  providers: [ConversationService],
  exports: [ConversationService],
})
export class ConversationModule {}
