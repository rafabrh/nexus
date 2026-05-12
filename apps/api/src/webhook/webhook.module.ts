import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';

@Module({
  imports: [RealtimeModule],
  controllers: [WebhookController],
  providers: [WebhookService],
})
export class WebhookModule {}
