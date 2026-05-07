import { Module } from '@nestjs/common';
import { LeadController } from './lead.controller';
import { LeadService } from './lead.service';
import { SheetsClient } from './sheets.client';

@Module({
  controllers: [LeadController],
  providers: [LeadService, SheetsClient],
  exports: [LeadService, SheetsClient],
})
export class LeadModule {}
