import { Module } from '@nestjs/common';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';
import { EvolutionClient } from './evolution.client';

@Module({
  controllers: [WhatsAppController],
  providers: [WhatsAppService, EvolutionClient],
  exports: [WhatsAppService, EvolutionClient],
})
export class WhatsAppModule {}
