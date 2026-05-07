import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Lead } from '@nexus/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Tenant } from '../auth/decorators/tenant.decorator';
import { LeadService } from './lead.service';

@Controller('leads')
@UseGuards(JwtAuthGuard)
@ApiTags('Leads')
@ApiBearerAuth()
export class LeadController {
  constructor(private readonly service: LeadService) {}

  @Get()
  @ApiOperation({ summary: 'Listar leads do Google Sheets' })
  async getLeads(@Tenant() instancia: string): Promise<Lead[]> {
    return this.service.getLeads(instancia);
  }
}
