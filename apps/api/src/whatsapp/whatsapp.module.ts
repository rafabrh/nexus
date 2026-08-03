import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TenantConfigModule } from '../tenant-config/tenant-config.module';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';
import { EvolutionClient } from './evolution.client';
import { EvolutionNodeAdapter } from './evolution-node.adapter';
import { EvolutionGoAdapter } from './evolution-go.adapter';
import { EVOLUTION_GATEWAY_NODE, EVOLUTION_GATEWAY_GO } from './evolution-gateway.port';

@Module({
  imports: [AuthModule, TenantConfigModule],
  controllers: [WhatsAppController],
  providers: [
    WhatsAppService,
    EvolutionNodeAdapter,
    EvolutionGoAdapter,
    { provide: EVOLUTION_GATEWAY_NODE, useExisting: EvolutionNodeAdapter },
    { provide: EVOLUTION_GATEWAY_GO, useExisting: EvolutionGoAdapter },
    EvolutionClient,
  ],
  exports: [WhatsAppService, EvolutionClient],
})
export class WhatsAppModule {}
