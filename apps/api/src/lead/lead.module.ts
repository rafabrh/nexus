import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LeadController } from './lead.controller';
import { LeadService } from './lead.service';
import { SheetsClient } from './sheets.client';

@Module({
  imports: [AuthModule],
  controllers: [LeadController],
  providers: [LeadService, SheetsClient],
  exports: [LeadService, SheetsClient],
})
export class LeadModule {}
