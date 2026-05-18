import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { SyncService } from './sync.service';

@Module({
  imports: [AuthModule, WhatsAppModule],
  controllers: [OnboardingController],
  providers: [OnboardingService, SyncService],
  exports: [OnboardingService],
})
export class OnboardingModule {}
