import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FunnelController } from './funnel.controller';
import { FunnelStagesService } from './funnel-stages.service';

@Module({
  imports: [AuthModule],
  controllers: [FunnelController],
  providers: [FunnelStagesService],
  // Exportado para o ConversationModule validar, em runtime, que o `key` de
  // um updateStage pertence a `funnel_stages` do tenant.
  exports: [FunnelStagesService],
})
export class FunnelModule {}
