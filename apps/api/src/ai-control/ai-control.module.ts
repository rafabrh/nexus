import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { AiControlController } from './ai-control.controller';
import { AiControlService } from './ai-control.service';

@Module({
  imports: [AuthModule, RealtimeModule],
  controllers: [AiControlController],
  providers: [AiControlService],
  exports: [AiControlService],
})
export class AiControlModule {}
