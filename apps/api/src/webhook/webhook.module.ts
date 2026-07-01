import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { ConversationModule } from '../conversation/conversation.module';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { N8nForwarderService } from './n8n-forwarder.service';

@Module({
  imports: [RealtimeModule, ConversationModule],
  controllers: [WebhookController],
  providers: [WebhookService, N8nForwarderService],
})
export class WebhookModule {}
