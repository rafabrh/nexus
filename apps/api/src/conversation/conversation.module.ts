import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversation.service';
import { ConversationRepository } from './conversation.repository';
import { ConversationIndexService } from './conversation-index.service';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [AuthModule, WhatsAppModule, RealtimeModule],
  controllers: [ConversationController],
  providers: [ConversationService, ConversationRepository, ConversationIndexService],
  exports: [ConversationService, ConversationRepository, ConversationIndexService],
})
export class ConversationModule {}
