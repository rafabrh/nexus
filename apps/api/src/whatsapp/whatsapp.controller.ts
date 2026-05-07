import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WhatsAppService } from './whatsapp.service';
import type { WhatsAppInstance, ConnectionState, IntegrationStatus } from './whatsapp.service';

@Controller()
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WhatsAppController {
  constructor(private readonly service: WhatsAppService) {}

  @Get('whatsapp/instances')
  @ApiTags('WhatsApp')
  @ApiOperation({ summary: 'Listar instancias da Evolution API' })
  async getInstances(): Promise<WhatsAppInstance[]> {
    return this.service.getInstances();
  }

  @Get('whatsapp/instances/:name/state')
  @ApiTags('WhatsApp')
  @ApiOperation({ summary: 'Estado de conexao de uma instancia' })
  async getConnectionState(
    @Param('name') name: string,
  ): Promise<ConnectionState> {
    return this.service.getConnectionState(name);
  }

  @Get('integrations/status')
  @ApiTags('Integrations')
  @ApiOperation({ summary: 'Status das integracoes (Evolution, N8N)' })
  async getIntegrationStatus(): Promise<IntegrationStatus> {
    return this.service.getIntegrationStatus();
  }
}
