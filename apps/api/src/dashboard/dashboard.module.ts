import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { ConversationModule } from '../conversation/conversation.module';
import { LeadModule } from '../lead/lead.module';

@Module({
  imports: [ConversationModule, LeadModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
