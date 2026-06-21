import {
  Controller,
  Get,
  Post,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Tenant } from '../auth/decorators/tenant.decorator';
import { OnboardingService } from './onboarding.service';
import type { OnboardingState } from './onboarding.service';
import type { SyncResponseDto } from './dto/sync-response.dto';

@Controller('onboarding')
@ApiTags('Onboarding')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class OnboardingController {
  constructor(private readonly service: OnboardingService) {}

  @Get('state')
  @ApiOperation({ summary: 'Estado atual da instancia (conexao + sync)' })
  async getState(@Tenant() instancia: string): Promise<OnboardingState> {
    return this.service.getState(instancia);
  }

  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60000, limit: 12 } })
  @ApiOperation({ summary: 'Forcar revalidacao imediata da conexao (ignora o throttle)' })
  async refresh(@Tenant() instancia: string): Promise<OnboardingState> {
    return this.service.refreshConnection(instancia);
  }

  @Post('instance')
  @Roles('admin')
  @HttpCode(201)
  @Throttle({ default: { ttl: 3600000, limit: 3 } })
  @ApiOperation({ summary: 'Criar instancia na Evolution API' })
  async createInstance(
    @Tenant() instancia: string,
  ): Promise<{ instanceName: string; state: string }> {
    return this.service.createInstance(instancia);
  }

  @Get('qr')
  @Roles('admin')
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  @ApiOperation({ summary: 'Gerar/retornar QR code da instancia' })
  async getQrCode(
    @Tenant() instancia: string,
  ): Promise<{ qrCode: string; expiresIn: number }> {
    return this.service.getQrCode(instancia);
  }

  @Post('sync')
  @Roles('admin')
  @HttpCode(200)
  @Throttle({ default: { ttl: 3600000, limit: 1 } })
  @ApiOperation({ summary: 'Disparar sync inicial de chats e mensagens' })
  async startSync(@Tenant() instancia: string): Promise<SyncResponseDto> {
    return this.service.startSync(instancia);
  }

  @Post('retry-sync')
  @Roles('admin')
  @HttpCode(200)
  @Throttle({ default: { ttl: 3600000, limit: 3 } })
  @ApiOperation({ summary: 'Re-executar sync em caso de erro' })
  async retrySync(@Tenant() instancia: string): Promise<SyncResponseDto> {
    return this.service.startSync(instancia);
  }
}
