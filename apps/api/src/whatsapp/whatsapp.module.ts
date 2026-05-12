import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';
import { EvolutionClient } from './evolution.client';

@Module({
  imports: [AuthModule],
  controllers: [WhatsAppController],
  providers: [WhatsAppService, EvolutionClient],
  exports: [WhatsAppService, EvolutionClient],
})
export class WhatsAppModule {}
