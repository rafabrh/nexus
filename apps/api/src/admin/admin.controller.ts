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
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import type { TenantEntry } from '@nexus/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { TenantService } from './tenant.service';
import { RegisterTenantDto } from './dto/register-tenant.dto';
import { ToggleTenantDto } from './dto/toggle-tenant.dto';
import { AddUserDto } from './dto/add-user.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly tenants: TenantService) {}

  @Get('tenants')
  @ApiOperation({ summary: 'Listar todos os tenants' })
  async listTenants(): Promise<TenantEntry[]> {
    return this.tenants.listTenants();
  }

  @Get('tenants/:instancia')
  @ApiOperation({ summary: 'Detalhes de um tenant' })
  async getTenant(@Param('instancia') instancia: string): Promise<TenantEntry | null> {
    return this.tenants.getTenant(instancia);
  }

  @Post('tenants')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Registrar novo tenant' })
  async registerTenant(
    @Body() dto: RegisterTenantDto,
  ): Promise<TenantEntry> {
    return this.tenants.registerTenant(dto.instancia, dto.adminEmail);
  }

  @Patch('tenants/:instancia')
  @ApiOperation({ summary: 'Ativar/desativar tenant' })
  async toggleTenant(
    @Param('instancia') instancia: string,
    @Body() dto: ToggleTenantDto,
  ): Promise<TenantEntry | null> {
    return this.tenants.toggleTenant(instancia, dto.active);
  }

  @Post('tenants/:instancia/users')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Adicionar usuario ao tenant' })
  async addUser(
    @Param('instancia') instancia: string,
    @Body() dto: AddUserDto,
  ): Promise<TenantEntry | null> {
    return this.tenants.addUser(instancia, dto);
  }
}
