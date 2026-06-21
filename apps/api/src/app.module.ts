import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { CoreModule } from './core/core.module';
import { AuthModule } from './auth/auth.module';
import { ConversationModule } from './conversation/conversation.module';
import { ConversationDataModule } from './conversation/conversation-data.module';
import { AiControlModule } from './ai-control/ai-control.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { LeadModule } from './lead/lead.module';
import { WhatsAppModule } from './whatsapp/whatsapp.module';
import { WebhookModule } from './webhook/webhook.module';
import { RealtimeModule } from './realtime/realtime.module';
import { AdminModule } from './admin/admin.module';
import { TenantModule } from './admin/tenant.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { RemindersModule } from './reminders/reminders.module';
import { QuickRepliesModule } from './quick-replies/quick-replies.module';
import { validate } from './core/config/app.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      expandVariables: true,
      envFilePath: ['.env', '../../.env'],
      validate,
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000,
        limit: 60,
      },
    ]),
    CoreModule,
    TenantModule,
    ConversationDataModule,
    AuthModule,
    ConversationModule,
    AiControlModule,
    DashboardModule,
    LeadModule,
    WhatsAppModule,
    WebhookModule,
    RealtimeModule,
    AdminModule,
    OnboardingModule,
    RemindersModule,
    QuickRepliesModule,
  ],
})
export class AppModule {}
