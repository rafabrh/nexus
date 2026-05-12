import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { ConversationModule } from '../conversation/conversation.module';
import { LeadModule } from '../lead/lead.module';

@Module({
  imports: [AuthModule, ConversationModule, LeadModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
