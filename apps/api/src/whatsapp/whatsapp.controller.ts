import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Tenant } from '../auth/decorators/tenant.decorator';
import { WhatsAppService } from './whatsapp.service';
import type { WhatsAppInstance, ConnectionState, IntegrationStatus } from './whatsapp.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class WhatsAppController {
  constructor(private readonly service: WhatsAppService) {}

  // CROSS-TENANT: fetchInstances() usa a apikey global da Evolution e devolve
  // TODAS as instâncias de TODOS os clientes. É operação de plataforma —
  // restrita ao superadmin. Um assinante NUNCA pode enumerar a base de clientes.
  @Get('whatsapp/instances')
  @Roles('superadmin')
  @ApiTags('WhatsApp')
  @ApiOperation({ summary: 'Listar instancias da Evolution API (somente superadmin)' })
  async getInstances(): Promise<WhatsAppInstance[]> {
    return this.service.getInstances();
  }

  // O estado de conexão é SEMPRE o da instância do próprio tenant (vinda do JWT).
  // Antes recebia o nome por :name na URL — input do usuário — o que permitia
  // sondar a conexão de qualquer instância alheia. Agora é escopado ao tenant.
  @Get('whatsapp/state')
  @ApiTags('WhatsApp')
  @ApiOperation({ summary: 'Estado de conexao da instancia do tenant' })
  async getConnectionState(
    @Tenant() instancia: string,
  ): Promise<ConnectionState> {
    return this.service.getConnectionState(instancia);
  }

  @Get('integrations/status')
  @ApiTags('Integrations')
  @ApiOperation({ summary: 'Status das integracoes (Evolution, N8N)' })
  async getIntegrationStatus(): Promise<IntegrationStatus> {
    return this.service.getIntegrationStatus();
  }
}
