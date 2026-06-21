import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversation.service';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { RealtimeModule } from '../realtime/realtime.module';

// ConversationRepository, ConversationIndexService e ConversationProjectionService
// vêm do ConversationDataModule (@Global) — não são providos aqui para evitar
// instância duplicada e o ciclo Conversation↔Realtime.
@Module({
  imports: [AuthModule, WhatsAppModule, RealtimeModule],
  controllers: [ConversationController],
  providers: [ConversationService],
  exports: [ConversationService],
})
export class ConversationModule {}
