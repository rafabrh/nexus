import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { DashboardData } from '@nexus/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Tenant } from '../auth/decorators/tenant.decorator';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
@ApiTags('Dashboard')
@ApiBearerAuth()
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get()
  @ApiOperation({ summary: 'Dados agregados do dashboard' })
  async getDashboard(@Tenant() instancia: string): Promise<DashboardData> {
    return this.service.getDashboard(instancia);
  }
}
