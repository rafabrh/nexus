import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { TenantService } from './tenant.service';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly tenants: TenantService) {}

  @Get('tenants')
  async listTenants() {
    return this.tenants.listTenants();
  }

  @Get('tenants/:instancia')
  async getTenant(@Param('instancia') instancia: string) {
    return this.tenants.getTenant(instancia);
  }

  @Post('tenants')
  @HttpCode(HttpStatus.CREATED)
  async registerTenant(
    @Body() body: { instancia: string; adminEmail: string },
  ) {
    return this.tenants.registerTenant(body.instancia, body.adminEmail);
  }

  @Patch('tenants/:instancia')
  async toggleTenant(
    @Param('instancia') instancia: string,
    @Body() body: { active: boolean },
  ) {
    return this.tenants.toggleTenant(instancia, body.active);
  }
}
