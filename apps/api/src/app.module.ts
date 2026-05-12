import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { CoreModule } from './core/core.module';
import { AuthModule } from './auth/auth.module';
import { ConversationModule } from './conversation/conversation.module';
import { AiControlModule } from './ai-control/ai-control.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { LeadModule } from './lead/lead.module';
import { WhatsAppModule } from './whatsapp/whatsapp.module';
import { WebhookModule } from './webhook/webhook.module';
import { RealtimeModule } from './realtime/realtime.module';
import { AdminModule } from './admin/admin.module';
import { RemindersModule } from './reminders/reminders.module';
import { QuickRepliesModule } from './quick-replies/quick-replies.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      expandVariables: true,
      envFilePath: ['.env', '../../.env'],
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000,
        limit: 60,
      },
    ]),
    CoreModule,
    AuthModule,
    ConversationModule,
    AiControlModule,
    DashboardModule,
    LeadModule,
    WhatsAppModule,
    WebhookModule,
    RealtimeModule,
    AdminModule,
    RemindersModule,
    QuickRepliesModule,
  ],
})
export class AppModule {}
