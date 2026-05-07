import { Module } from '@nestjs/common';
import { AiControlController } from './ai-control.controller';
import { AiControlService } from './ai-control.service';

@Module({
  controllers: [AiControlController],
  providers: [AiControlService],
  exports: [AiControlService],
})
export class AiControlModule {}
