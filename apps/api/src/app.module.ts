import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { CoreModule } from './core/core.module';
import { RedisThrottlerStorage } from './core/throttler/redis-throttler.storage';
import { TenantThrottlerGuard } from './core/throttler/tenant-throttler.guard';
import { REDIS_CLIENT } from './core/redis/redis.module';
import type Redis from 'ioredis';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
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
    // Redis-backed so counters are shared across replicas (in-memory would let
    // each replica grant the full quota). Limits unchanged: 60 req / 60s.
    ThrottlerModule.forRootAsync({
      inject: [REDIS_CLIENT],
      useFactory: (redis: Redis) => ({
        throttlers: [{ name: 'default', ttl: 60000, limit: 60 }],
        storage: new RedisThrottlerStorage(redis),
      }),
    }),
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
  providers: [
    // Global rate limiting. Without this guard the @Throttle decorators (e.g.
    // magic-link 5/h) are silently ignored. Default: 60 req / 60s per IP.
    // Redis-backed + tenant/user-aware tracker (see TenantThrottlerGuard).
    { provide: APP_GUARD, useClass: TenantThrottlerGuard },
    // Deny-by-default authentication. Every route requires a valid access token
    // unless explicitly marked @Public(). A new controller is protected the
    // moment it ships — no per-controller @UseGuards needed. Runs after the
    // throttler guard (registration order = execution order).
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
